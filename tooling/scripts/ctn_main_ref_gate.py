#!/usr/bin/env python3
"""Reference-transaction gate and pre-candidate reservation for main.

Both entry points use the same durable, create-only backup writer. Git performs
the enclosing main-ref update and its old-OID compare-and-swap.
"""

import fcntl
import os
import shlex
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path


MAIN = b"refs/heads/main"
OID = re.compile(rb"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")


def git(*args):
    return subprocess.run(
        ("git", *args), check=True, capture_output=True, text=True,
    ).stdout.strip()


def is_pack_refs_rewrite(old, new, common_dir):
    """Accept Git's physical loose/packed rewrite only when main stays intact."""
    command = subprocess.run(
        ("ps", "-p", str(os.getppid()), "-o", "args="),
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    argv = shlex.split(command)
    if len(argv) < 2 or Path(argv[0]).name != "git" or argv[1] != "pack-refs":
        return False

    loose_ref = common_dir / "refs" / "heads" / "main"
    if not loose_ref.is_file():
        return False
    loose = loose_ref.read_text().strip()
    current = git("rev-parse", "--verify", "refs/heads/main")
    if not OID.fullmatch(loose.encode("ascii")) or len(loose) != len(old):
        return False

    zero = "0" * len(old)
    if old == zero:
        return new == loose == current

    if new != zero:
        return False
    try:
        packed_lines = (common_dir / "packed-refs").read_text().splitlines()
    except FileNotFoundError:
        return False
    packed = next(
        (oid for line in packed_lines
         for oid, separator, ref in [line.partition(" ")]
         if separator and ref == "refs/heads/main"),
        None,
    )
    return old == loose == current == packed


def retain_old(old, common_dir, new=None, reserved=None):
    """Return a durable backup of the current old main under the shared lock."""
    lock_path = common_dir / "ctn-main-ref-gate.lock"
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
    lock_fd = os.open(lock_path, flags, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        if git("rev-parse", "--verify", "refs/heads/main") != old:
            raise ValueError("main no longer points at the expected old commit")
        if git("cat-file", "-t", old) != "commit":
            raise ValueError("old main object is not a commit")
        if new is not None:
            if git("cat-file", "-t", new) != "commit":
                raise ValueError("new main object is not a commit")
            try:
                git("merge-base", "--is-ancestor", old, new)
            except subprocess.CalledProcessError as exc:
                raise ValueError("candidate must descend from old main") from exc

        if reserved:
            if not re.fullmatch(
                r"refs/heads/backup/pre-merge-[0-9a-f]+-[0-9a-f]{24}",
                reserved,
            ):
                raise ValueError("invalid reserved backup reference")
            backup = reserved
        else:
            backup = (
                "refs/heads/backup/pre-merge-"
                f"{time.time_ns():x}-{secrets.token_hex(12)}"
            )
            # Git defaults to writeout-only on macOS; force reference fsync.
            git(
                "-c", "core.fsync=reference", "-c", "core.fsyncMethod=fsync",
                "update-ref", backup, old, "0" * len(old),
            )
        if git("rev-parse", "--verify", backup) != old:
            raise ValueError("backup readback differs from old main")
        if git("rev-parse", "--verify", "refs/heads/main") != old:
            raise ValueError("main changed after backup; retry from its new tip")
        return backup
    finally:
        os.close(lock_fd)


def gate():
    if len(sys.argv) == 3 and sys.argv[1] == "reserve":
        old = sys.argv[2]
        if not OID.fullmatch(old.encode("ascii")):
            raise ValueError("invalid old main object ID")
        common_dir = Path(git("rev-parse", "--git-common-dir")).resolve()
        print(retain_old(old, common_dir))
        return
    if len(sys.argv) != 2 or sys.argv[1] not in (
        "preparing", "prepared", "committed", "aborted",
    ):
        raise ValueError("expected reserve <old OID> or a reference-transaction phase")
    if sys.argv[1] != "prepared":
        return

    main_update = None
    for line in sys.stdin.buffer:
        fields = line.rstrip(b"\n").split(b" ")
        if len(fields) != 3 or not all(fields):
            raise ValueError("malformed reference transaction")
        old, new, ref = fields
        if ref != MAIN:
            continue
        if main_update is not None:
            raise ValueError("multiple main updates in one transaction")
        if not OID.fullmatch(old) or not OID.fullmatch(new) or len(old) != len(new):
            raise ValueError("invalid main object ID")
        main_update = (old.decode("ascii"), new.decode("ascii"))

    if main_update is None:
        return

    old, new = main_update
    common_dir = Path(git("rev-parse", "--git-common-dir")).resolve()
    if old == "0" * len(old) or new == "0" * len(new):
        if is_pack_refs_rewrite(old, new, common_dir):
            return
        raise ValueError("main creation or deletion is not permitted")
    retain_old(
        old, common_dir, new=new,
        reserved=os.environ.get("CTN_MAIN_RESERVATION_REF"),
    )


if __name__ == "__main__":
    try:
        gate()
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"main ref gate: {exc}", file=sys.stderr)
        sys.exit(1)
