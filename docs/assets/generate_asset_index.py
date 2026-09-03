#!/usr/bin/env python3
"""Generate a read-only metadata index for repository image assets."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import re
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/assets/ASSET_MACHINE_INDEX.tsv"
VISUAL_INVENTORY_BATCHES = (
    ROOT / "docs/assets/ASSET_VISUAL_INVENTORY_BATCH1.tsv",
    ROOT / "docs/assets/ASSET_VISUAL_INVENTORY_BATCH2.tsv",
    ROOT / "docs/assets/ASSET_VISUAL_INVENTORY_BATCH3.tsv",
    ROOT / "docs/assets/ASSET_VISUAL_INVENTORY_BATCH4.tsv",
)
# These rows are real repository images and stay in the technical index, but
# are deliberately outside the one-path-per-production-asset visual review.
# Keeping the boundary here makes it executable instead of prose-only.
NON_PRODUCT_ASSET_GROUPS = {
    "brand deployment artifacts": frozenset(
        {
            "apps/docs/brand/conation-app-icon-master-v1.png",
            "apps/docs/brand/conation-combined-lockup-master-v1.png",
            "apps/docs/brand/conation-favicon.png",
        }
    ),
    "email rendering test fixtures": frozenset(
        {
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/github-pr-review-macro-dark.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/github-pr-review-macro-light.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/google-calendar-invite-macro-dark.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/google-calendar-invite-macro-light.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/nested-quotes-macro-dark.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/nested-quotes-macro-light.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/styled-email-macro-dark.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/styled-email-macro-light.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/wide-table-360-macro-dark.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/wide-table-360-macro-light.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/wide-table-800-macro-dark.png",
            "apps/web/src/lib/core/email/tests/snapshots/email-rendering.pw.ts/wide-table-800-macro-light.png",
        }
    ),
}
IMAGE_SUFFIXES = {
    ".avif",
    ".bmp",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".png",
    ".svg",
    ".webp",
}


def repository_assets() -> list[Path]:
    result = subprocess.run(
        ["rg", "--files", "--null"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    paths = (ROOT / raw.decode() for raw in result.stdout.split(b"\0") if raw)
    return sorted(path for path in paths if path.suffix.lower() in IMAGE_SUFFIXES)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def skip_gif_subblocks(data: bytes, offset: int) -> int:
    while offset < len(data):
        size = data[offset]
        offset += 1
        if size == 0:
            return offset
        offset += size
    raise ValueError("truncated GIF sub-block")


def gif_metadata(data: bytes) -> tuple[int, int, int, int]:
    if len(data) < 13 or data[:6] not in (b"GIF87a", b"GIF89a"):
        raise ValueError("invalid GIF header")
    width, height = struct.unpack_from("<HH", data, 6)
    packed = data[10]
    offset = 13 + (3 * (2 ** ((packed & 0x07) + 1)) if packed & 0x80 else 0)
    frames = 0
    duration_ms = 0
    pending_delay_ms = 0

    while offset < len(data):
        marker = data[offset]
        offset += 1
        if marker == 0x3B:
            break
        if marker == 0x21:
            if offset >= len(data):
                raise ValueError("truncated GIF extension")
            label = data[offset]
            offset += 1
            if label == 0xF9:
                if offset + 6 > len(data) or data[offset] != 4:
                    raise ValueError("invalid GIF graphic-control extension")
                pending_delay_ms = struct.unpack_from("<H", data, offset + 2)[0] * 10
            offset = skip_gif_subblocks(data, offset)
            continue
        if marker != 0x2C or offset + 9 > len(data):
            raise ValueError("invalid GIF block")

        frames += 1
        duration_ms += pending_delay_ms
        pending_delay_ms = 0
        descriptor_packed = data[offset + 8]
        offset += 9
        if descriptor_packed & 0x80:
            offset += 3 * (2 ** ((descriptor_packed & 0x07) + 1))
        if offset >= len(data):
            raise ValueError("truncated GIF image data")
        offset += 1  # LZW minimum code size
        offset = skip_gif_subblocks(data, offset)

    if frames == 0:
        raise ValueError("GIF has no image frames")
    return width, height, frames, duration_ms


def png_metadata(data: bytes) -> tuple[int, int, int, str]:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("invalid PNG header")
    width, height = struct.unpack_from(">II", data, 16)
    frames = 1
    duration_ms: str | int = "n/a"
    offset = 8
    while offset + 12 <= len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        if len(chunk_data) != length:
            raise ValueError("truncated PNG chunk")
        if chunk_type == b"acTL" and length >= 8:
            frames = struct.unpack_from(">I", chunk_data, 0)[0]
            duration_ms = "unknown"
        offset += 12 + length
        if chunk_type == b"IEND":
            break
    return width, height, frames, str(duration_ms)


def jpeg_dimensions(data: bytes) -> tuple[int, int]:
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("invalid JPEG header")
    offset = 2
    sof_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while offset + 4 <= len(data):
        while offset < len(data) and data[offset] != 0xFF:
            offset += 1
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            break
        marker = data[offset]
        offset += 1
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            break
        length = struct.unpack_from(">H", data, offset)[0]
        if marker in sof_markers and offset + 7 <= len(data):
            height, width = struct.unpack_from(">HH", data, offset + 3)
            return width, height
        if length < 2:
            raise ValueError("invalid JPEG segment")
        offset += length
    raise ValueError("JPEG dimensions not found")


def webp_metadata(data: bytes) -> tuple[int, int, int]:
    if len(data) < 20 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("invalid WebP header")
    width = height = 0
    frames = 0
    offset = 12
    while offset + 8 <= len(data):
        chunk_type = data[offset : offset + 4]
        length = struct.unpack_from("<I", data, offset + 4)[0]
        chunk = data[offset + 8 : offset + 8 + length]
        if len(chunk) != length:
            raise ValueError("truncated WebP chunk")
        if chunk_type == b"VP8X" and length >= 10:
            width = 1 + int.from_bytes(chunk[4:7], "little")
            height = 1 + int.from_bytes(chunk[7:10], "little")
        elif chunk_type == b"VP8 " and length >= 10 and not width:
            signature = chunk.find(b"\x9d\x01\x2a")
            if signature >= 0 and signature + 7 <= len(chunk):
                width = struct.unpack_from("<H", chunk, signature + 3)[0] & 0x3FFF
                height = struct.unpack_from("<H", chunk, signature + 5)[0] & 0x3FFF
        elif chunk_type == b"VP8L" and length >= 5 and not width:
            packed = int.from_bytes(chunk[1:5], "little")
            width = 1 + (packed & 0x3FFF)
            height = 1 + ((packed >> 14) & 0x3FFF)
        elif chunk_type == b"ANMF":
            frames += 1
        offset += 8 + length + (length & 1)
    if not width or not height:
        raise ValueError("WebP dimensions not found")
    return width, height, frames or 1


def ico_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 6 or data[:4] != b"\x00\x00\x01\x00":
        raise ValueError("invalid ICO header")
    count = struct.unpack_from("<H", data, 4)[0]
    if len(data) < 6 + count * 16 or count == 0:
        raise ValueError("truncated ICO directory")
    widths = [data[6 + index * 16] or 256 for index in range(count)]
    heights = [data[7 + index * 16] or 256 for index in range(count)]
    return max(widths), max(heights)


def svg_dimensions(path: Path) -> tuple[str, str, str]:
    root = ET.parse(path).getroot()

    def numeric(value: str | None) -> str | None:
        if value is None:
            return None
        match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*", value)
        return match.group(1) if match else None

    width = numeric(root.attrib.get("width"))
    height = numeric(root.attrib.get("height"))
    if width is None or height is None:
        view_box = root.attrib.get("viewBox", "").replace(",", " ").split()
        if len(view_box) == 4:
            width = width or numeric(view_box[2])
            height = height or numeric(view_box[3])
    if width is None or height is None:
        raise ValueError("SVG numeric dimensions not found")
    has_animation = any(
        element.tag.rsplit("}", 1)[-1] in {"animate", "animateMotion", "animateTransform", "set"}
        for element in root.iter()
    )
    return width, height, "unknown" if has_animation else "n/a"


def metadata(path: Path) -> tuple[str, str, str, str, str, str]:
    data = path.read_bytes()
    suffix = path.suffix.lower()
    try:
        if suffix == ".png":
            width, height, frames, duration = png_metadata(data)
            return "PNG", str(width), str(height), str(frames), duration, "ok"
        if suffix == ".gif":
            width, height, frames, duration = gif_metadata(data)
            return "GIF", str(width), str(height), str(frames), str(duration), "ok"
        if suffix in {".jpg", ".jpeg"}:
            width, height = jpeg_dimensions(data)
            return "JPEG", str(width), str(height), "1", "n/a", "ok"
        if suffix == ".webp":
            width, height, frames = webp_metadata(data)
            return "WebP", str(width), str(height), str(frames), "unknown" if frames > 1 else "n/a", "ok"
        if suffix == ".ico":
            width, height = ico_dimensions(data)
            return "ICO", str(width), str(height), "n/a", "n/a", "ok"
        if suffix == ".svg":
            width, height, frames = svg_dimensions(path)
            return "SVG", width, height, frames, "n/a", "ok"
        return suffix.removeprefix(".").upper(), "unknown", "unknown", "unknown", "unknown", "parser unavailable"
    except (ET.ParseError, OSError, ValueError, struct.error) as error:
        return suffix.removeprefix(".").upper(), "unknown", "unknown", "unknown", "unknown", str(error)


def index_text() -> str:
    rows = []
    for path in repository_assets():
        asset_format, width, height, frames, duration, status = metadata(path)
        relative_path = path.relative_to(ROOT).as_posix()
        rows.append(
            "\t".join(
                [
                    relative_path,
                    asset_format,
                    str(path.stat().st_size),
                    width,
                    height,
                    frames,
                    sha256(path),
                    duration,
                    status.replace("\t", " ").replace("\n", " "),
                    "required",
                ]
            )
        )

    header = "\t".join(
        [
            "path",
            "format",
            "bytes",
            "width_px",
            "height_px",
            "animated_frame_count",
            "sha256",
            "duration_ms",
            "metadata_status",
            "human_visual_review",
        ]
    )
    # Keep the generated index deterministic: sorted paths, LF endings, and a
    # final newline. The script reads assets but never modifies them here.
    return header + "\n" + "\n".join(rows) + "\n"


def tsv_paths(text: str, *, source: Path, path_column: str) -> list[str]:
    """Return paths from a tab-separated inventory with a required header."""
    rows = text.splitlines()
    if not rows:
        raise ValueError(f"{source.relative_to(ROOT)} is empty")
    header = rows[0].split("\t")
    try:
        path_index = header.index(path_column)
    except ValueError as error:
        raise ValueError(
            f"{source.relative_to(ROOT)} has no {path_column!r} column"
        ) from error

    paths = []
    for row_number, row in enumerate(rows[1:], start=2):
        columns = row.split("\t")
        if len(columns) <= path_index:
            raise ValueError(
                f"{source.relative_to(ROOT)}:{row_number} has no path value"
            )
        paths.append(columns[path_index])
    return paths


def validate_visual_inventory(generated_index: str) -> list[str]:
    """Check that the hand-reviewed batches cover the defined asset boundary."""
    errors: list[str] = []
    index_paths = tsv_paths(generated_index, source=OUTPUT, path_column="path")
    indexed = set(index_paths)
    duplicate_index_paths = sorted(path for path, count in Counter(index_paths).items() if count > 1)
    if duplicate_index_paths:
        errors.append(f"machine index has duplicate paths: {', '.join(duplicate_index_paths)}")

    for group, paths in NON_PRODUCT_ASSET_GROUPS.items():
        missing = sorted(paths - indexed)
        if missing:
            errors.append(f"{group} missing from machine index: {', '.join(missing)}")

    excluded = set().union(*NON_PRODUCT_ASSET_GROUPS.values())
    canonical = indexed - excluded
    reviewed_paths: list[str] = []
    for batch in VISUAL_INVENTORY_BATCHES:
        try:
            reviewed_paths.extend(tsv_paths(batch.read_text(encoding="utf-8"), source=batch, path_column="path"))
        except ValueError as error:
            errors.append(str(error))

    reviewed = set(reviewed_paths)
    duplicate_reviewed_paths = sorted(
        path for path, count in Counter(reviewed_paths).items() if count > 1
    )
    if duplicate_reviewed_paths:
        errors.append(
            "visual inventory has duplicate paths: " + ", ".join(duplicate_reviewed_paths)
        )

    unexpected_reviewed = sorted(reviewed - canonical)
    if unexpected_reviewed:
        errors.append(
            "visual inventory includes excluded or unknown paths: "
            + ", ".join(unexpected_reviewed)
        )
    missing_reviewed = sorted(canonical - reviewed)
    if missing_reviewed:
        errors.append(
            "canonical paths missing from visual inventory: " + ", ".join(missing_reviewed)
        )

    if not errors:
        group_counts = ", ".join(
            f"{len(paths)} {group}" for group, paths in NON_PRODUCT_ASSET_GROUPS.items()
        )
        print(
            "Asset inventory validated: "
            f"{len(indexed)} indexed asset paths; {group_counts}; "
            f"{len(canonical)} canonical paths reviewed exactly once."
        )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the generated index and visual-review boundary without writing files",
    )
    args = parser.parse_args()
    generated_index = index_text()

    if args.check:
        errors = validate_visual_inventory(generated_index)
        try:
            current_index = OUTPUT.read_text(encoding="utf-8")
        except OSError as error:
            errors.append(f"cannot read {OUTPUT.relative_to(ROOT)}: {error}")
        else:
            if current_index != generated_index:
                errors.append(
                    f"{OUTPUT.relative_to(ROOT)} is stale; rerun "
                    "python3 docs/assets/generate_asset_index.py"
                )
        if errors:
            for error in errors:
                print(f"asset inventory check failed: {error}", file=sys.stderr)
            return 1
        return 0

    OUTPUT.write_text(generated_index, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
