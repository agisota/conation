#!/usr/bin/env python3
"""Generate a read-only metadata index for repository image assets."""

from __future__ import annotations

import hashlib
import re
import struct
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/assets/ASSET_MACHINE_INDEX.tsv"
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


def main() -> None:
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
    # final newline. The script reads assets but never modifies them.
    OUTPUT.write_text(header + "\n" + "\n".join(rows) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
