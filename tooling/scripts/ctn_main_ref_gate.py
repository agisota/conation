#!/usr/bin/env python3
"""Reference-transaction gate and pre-candidate reservation for main.

Both entry points use the same durable, create-only backup writer. Git performs
the enclosing main-ref update and its old-OID compare-and-swap.
"""

import fcntl
import json
import os
import select
import shlex
import re
import secrets
import subprocess
import sys
import time
import tempfile
from pathlib import Path


MAIN = b"refs/heads/main"
OID = re.compile(rb"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")


def git(*args, env=None):
    return subprocess.run(
        ("git", *args), check=True, capture_output=True, text=True,
        env={**os.environ, **env} if env is not None else None,
        timeout=30,
    ).stdout.rstrip("\n")


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

def direct_commit(ref):
    """Require a named direct commit ref, not a symbolic alias to one."""
    try:
        git("symbolic-ref", "--quiet", "--no-recurse", ref)
    except subprocess.CalledProcessError as exc:
        if exc.returncode != 1:
            raise
    else:
        raise ValueError(f"symbolic reference is not a direct snapshot: {ref}")
    oid = git("rev-parse", "--verify", ref)
    if not OID.fullmatch(oid.encode("ascii")) or git("cat-file", "-t", oid) != "commit":
        raise ValueError(f"reference must point directly at a commit: {ref}")
    return oid


def retained_commit(ref):
    """Resolve only a fully qualified retained backup, never a revision expression."""
    if not ref.startswith(("refs/backup/", "refs/heads/backup/")):
        raise ValueError("restore requires a retained backup reference")
    git("check-ref-format", ref)
    return direct_commit(ref)


def retain_old(old, common_dir, new=None, reserved=None, restore=None):
    """Return a durable backup of the current old main under the shared lock."""
    lock_path = common_dir / "ctn-main-ref-gate.lock"
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
    lock_fd = os.open(lock_path, flags, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        if direct_commit("refs/heads/main") != old:
            raise ValueError("main no longer points at the expected old commit")
        if git("cat-file", "-t", old) != "commit":
            raise ValueError("old main object is not a commit")
        if new is not None:
            if git("cat-file", "-t", new) != "commit":
                raise ValueError("new main object is not a commit")
            if restore is not None:
                if retained_commit(restore) != new:
                    raise ValueError("restore target differs from retained backup")
            else:
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
        if retained_commit(backup) != old:
            raise ValueError("backup readback differs from old main")
        if direct_commit("refs/heads/main") != old:
            raise ValueError("main changed after backup; retry from its new tip")
        return backup
    finally:
        os.close(lock_fd)


def restore_transaction(backup, current_backup, target, expected):
    """Prepare a no-deref CAS, validate identities under Git locks, then commit."""
    command = (
        "git", "-c", "core.fsync=reference", "-c", "core.fsyncMethod=fsync",
        "update-ref", "--stdin",
    )
    env = {
        **os.environ,
        "CTN_MAIN_RESTORE_REF": backup,
        "CTN_MAIN_RESERVATION_REF": current_backup,
    }
    # Spool stderr so a hook failure cannot fill a pipe while we await an ack.
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(
            command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=errors, env=env,
        )

        def request(payload, response, timeout=30):
            process.stdin.write(payload.encode("ascii"))
            process.stdin.flush()
            deadline = time.monotonic() + timeout
            received = b""
            while not received.endswith(b"\n"):
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not select.select([process.stdout], [], [], remaining)[0]:
                    raise subprocess.TimeoutExpired(command, timeout)
                chunk = os.read(process.stdout.fileno(), 4096)
                if not chunk:
                    code = process.wait(timeout=timeout)
                    errors.seek(0)
                    raise subprocess.CalledProcessError(
                        code or 1, command, output=received,
                        stderr=errors.read().decode("utf-8", errors="replace"),
                    )
                received += chunk
                if len(received) > 4096:
                    raise ValueError("unexpected Git transaction response")
            if received != response.encode("ascii"):
                raise ValueError("unexpected Git transaction response")

        try:
            request("start\n", "start: ok\n")
            request(
                "option no-deref\n"
                f"update refs/heads/main {target} {expected}\n"
                "option no-deref\n"
                f"verify {backup} {target}\n"
                "option no-deref\n"
                f"verify {current_backup} {expected}\n"
                "prepare\n", "prepare: ok\n",
            )
            # --no-deref alone replaces a symbolic main; refuse it while locked.
            if direct_commit("refs/heads/main") != expected:
                raise ValueError("main changed before prepared restore")
            if retained_commit(backup) != target or retained_commit(current_backup) != expected:
                raise ValueError("retained backup changed before prepared restore")
            request("commit\n", "commit: ok\n")
            process.communicate(timeout=5)
            if process.returncode:
                errors.seek(0)
                raise subprocess.CalledProcessError(
                    process.returncode, command,
                    stderr=errors.read().decode("utf-8", errors="replace"),
                )
        except BaseException:
            if process.poll() is None:
                try:
                    # Explicit `start` makes EOF abort, even with an unread ack.
                    process.stdin.close()
                    process.stdin = None
                    process.communicate(timeout=5)
                except (OSError, ValueError, subprocess.SubprocessError):
                    if process.poll() is None:
                        process.kill()
                    process.wait(timeout=5)
            raise
        finally:
            if process.stdin is not None:
                process.stdin.close()
            process.stdout.close()

def restore_main(backup, expected):
    """Restore a retained commit by CAS, leaving files and every backup intact."""
    if not OID.fullmatch(expected.encode("ascii")):
        raise ValueError("invalid expected main object ID")
    common_dir = Path(git("rev-parse", "--git-common-dir")).resolve()
    target = retained_commit(backup)
    target_tree = git("rev-parse", f"{target}^{{tree}}")
    status_before = git("status", "--porcelain=v1", "--untracked-files=all")
    if git("diff", "--name-only", "--diff-filter=U"):
        raise ValueError("unresolved worktree conflicts; stop for manual recovery")
    current_backup = retain_old(expected, common_dir)
    if retained_commit(backup) != target:
        raise ValueError("retained backup moved before restore")
    restore_transaction(backup, current_backup, target, expected)
    if direct_commit("refs/heads/main") != target:
        raise ValueError("main readback differs from restored backup; stop")
    if retained_commit(backup) != target or retained_commit(current_backup) != expected:
        raise ValueError("backup readback changed after restore; stop")
    if git("rev-parse", "refs/heads/main^{tree}") != target_tree:
        raise ValueError("restored main tree differs from backup; stop")
    print(json.dumps({
        "main": target,
        "tree": target_tree,
        "restored_from": backup,
        "current_backup": current_backup,
        "previous_main": expected,
        "worktree_before": status_before,
        "worktree_after": git("status", "--porcelain=v1", "--untracked-files=all"),
    }))


def gate():
    if len(sys.argv) == 4 and sys.argv[1] == "restore":
        restore_main(sys.argv[2], sys.argv[3])
        return
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
        raise ValueError(
            "expected reserve <old OID>, restore <backup ref> <expected main OID>, "
            "or a reference-transaction phase"
        )
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
        restore=os.environ.get("CTN_MAIN_RESTORE_REF"),
    )


if __name__ == "__main__":
    try:
        gate()
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(f"main ref gate: {exc}", file=sys.stderr)
        sys.exit(1)
