#!/usr/bin/env python3
"""Reference-transaction gate for updates to refs/heads/main.

Install as a reference-transaction hook; only the prepared phase may create a
backup. Git, not this hook, performs the enclosing main-ref update and its CAS.
"""

import fcntl
import os
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


def gate():
    if len(sys.argv) != 2 or sys.argv[1] not in (
        "preparing", "prepared", "committed", "aborted",
    ):
        raise ValueError("expected a reference-transaction phase")
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
        if old == b"0" * len(old) or new == b"0" * len(new):
            raise ValueError("main creation or deletion is not permitted")
        main_update = (old.decode("ascii"), new.decode("ascii"))

    if main_update is None:
        return

    old, new = main_update
    common_dir = Path(git("rev-parse", "--git-common-dir")).resolve()
    lock_path = common_dir / "ctn-main-ref-gate.lock"
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
    lock_fd = os.open(lock_path, flags, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        if git("rev-parse", "--verify", "refs/heads/main") != old:
            raise ValueError("main no longer points at the expected old commit")
        if git("cat-file", "-t", old) != "commit":
            raise ValueError("old main object is not a commit")
        if git("cat-file", "-t", new) != "commit":
            raise ValueError("new main object is not a commit")

        try:
            git("merge-base", "--is-ancestor", old, new)
        except subprocess.CalledProcessError as exc:
            raise ValueError("candidate must descend from old main") from exc
        backup = (
            "refs/heads/backup/pre-merge-"
            f"{time.time_ns():x}-{secrets.token_hex(12)}"
        )
        # A zero expected OID makes this a create-only update; never replace an
        # existing backup. On macOS Git defaults to writeout-only; force an
        # actual fsync before the enclosing main transaction can commit.
        git(
            "-c", "core.fsync=reference", "-c", "core.fsyncMethod=fsync",
            "update-ref", backup, old,
            "0" * len(old),
        )
        if git("rev-parse", "--verify", backup) != old:
            raise ValueError("backup readback differs from old main")
        if git("rev-parse", "--verify", "refs/heads/main") != old:
            raise ValueError("main changed after backup; retry from its new tip")
    finally:
        os.close(lock_fd)


if __name__ == "__main__":
    try:
        gate()
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"main ref gate: {exc}", file=sys.stderr)
        sys.exit(1)
