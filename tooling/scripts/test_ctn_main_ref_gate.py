import json
import contextlib
import io
import importlib.util
import os
import shlex
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path


SCRIPT = Path(__file__).with_name("ctn_main_ref_gate.py")


class MainRefGateTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.repo = Path(self.directory.name)
        self.git("init", "-q")
        self.git("symbolic-ref", "HEAD", "refs/heads/main")
        self.git("config", "user.name", "Gate Test")
        self.git("config", "user.email", "gate@example.invalid")
        self.git("commit", "--allow-empty", "-qm", "initial")
        self.original = self.oid("refs/heads/main")
        hook = self.repo / ".git" / "hooks" / "reference-transaction"
        hook.write_text(
            "#!/bin/sh\nexec "
            + shlex.quote(sys.executable)
            + " "
            + shlex.quote(str(SCRIPT))
            + ' "$@"\n'
        )
        hook.chmod(0o755)

    def git(self, *args, check=True, input=None, env=None):
        return subprocess.run(
            ["git", *args],
            cwd=self.repo,
            input=input,
            text=True,
            capture_output=True,
            check=check,
            env={**os.environ, **env} if env else None,
        )

    def oid(self, ref):
        return self.git("rev-parse", "--verify", ref).stdout.strip()

    def backups(self):
        refs = self.git(
            "for-each-ref", "--format=%(refname) %(objectname)",
            "refs/heads/backup",
        ).stdout.splitlines()
        return [line for line in refs if line.startswith("refs/heads/backup/pre-merge-")]

    def next_commit(self):
        self.git("checkout", "-q", "-b", "feature")
        self.git("commit", "--allow-empty", "-qm", "feature")
        new = self.oid("HEAD")
        self.git("checkout", "-q", "main")
        return new

    def invoke(self, phase, old, new, ref="refs/heads/main"):
        return subprocess.run(
            [sys.executable, str(SCRIPT), phase],
            cwd=self.repo,
            input=f"{old} {new} {ref}\n",
            text=True,
            capture_output=True,
        )

    def test_fast_forward_preserves_exact_old_commit_before_main_moves(self):
        new = self.next_commit()
        self.git("merge", "--ff-only", "feature")
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual(self.oid("refs/heads/feature"), new)
        backups = self.backups()
        self.assertEqual(len(backups), 1)
        ref, saved = backups[0].split()
        self.assertTrue(ref.startswith("refs/heads/backup/pre-merge-"))
        self.assertEqual(saved, self.original)

    def test_squash_commit_preserves_exact_old_before_main_moves(self):
        self.git("checkout", "-q", "-b", "feature")
        (self.repo / "payload.txt").write_text("change\n")
        self.git("add", "payload.txt")
        self.git("commit", "-qm", "feature")
        self.git("checkout", "-q", "main")
        self.git("merge", "--squash", "feature")
        self.git("commit", "-qm", "squashed feature")
        self.assertNotEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(
            [line.split()[1] for line in self.backups()], [self.original],
        )

    def test_update_ref_preserves_exact_old_commit(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual([line.split()[1] for line in self.backups()], [self.original])

    def test_linked_clean_room_update_ref_uses_common_gate_and_backup(self):
        new = self.next_commit()
        with tempfile.TemporaryDirectory() as directory:
            clean_room = Path(directory) / "merge-room"
            self.git("worktree", "add", "--detach", str(clean_room), self.original)
            try:
                subprocess.run(
                    ["git", "update-ref", "refs/heads/main", new, self.original],
                    cwd=clean_room, check=True, capture_output=True, text=True,
                )
            finally:
                self.git("worktree", "remove", "--force", str(clean_room))
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual([line.split()[1] for line in self.backups()], [self.original])

    def test_repeated_updates_keep_distinct_immutable_backups(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        self.git("checkout", "-q", "feature")
        self.git("commit", "--allow-empty", "-qm", "second feature")
        second = self.oid("HEAD")
        self.git("checkout", "-q", "main")
        self.git("update-ref", "refs/heads/main", second, new)
        self.assertEqual(self.oid("refs/heads/main"), second)
        backups = self.backups()
        self.assertEqual(len(backups), 2)
        self.assertEqual(
            sorted(line.split()[1] for line in backups),
            sorted((self.original, new)),
        )

    def test_reservation_precedes_candidate_and_prevents_second_backup(self):
        reserved = subprocess.run(
            [sys.executable, str(SCRIPT), "reserve", self.original],
            cwd=self.repo, capture_output=True, text=True, check=True,
        ).stdout.strip()
        self.assertTrue(reserved.startswith("refs/heads/backup/pre-merge-"))
        self.assertEqual(self.oid(reserved), self.original)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(len(self.backups()), 1)
        new = self.next_commit()
        self.git(
            "update-ref", "refs/heads/main", new, self.original,
            env={"CTN_MAIN_RESERVATION_REF": reserved},
        )
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual(self.backups(), [f"{reserved} {self.original}"])

    def test_reserved_backup_mismatch_refuses_main_without_fallback(self):
        reserved = subprocess.run(
            [sys.executable, str(SCRIPT), "reserve", self.original],
            cwd=self.repo, capture_output=True, text=True, check=True,
        ).stdout.strip()
        new = self.next_commit()
        denied = self.git(
            "update-ref", "refs/heads/main", new, self.original, check=False,
            env={"CTN_MAIN_RESERVATION_REF": "refs/heads/feature"},
        )
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.backups(), [f"{reserved} {self.original}"])

    def test_stale_reservation_cannot_cover_a_new_main_old(self):
        reserved = subprocess.run(
            [sys.executable, str(SCRIPT), "reserve", self.original],
            cwd=self.repo, capture_output=True, text=True, check=True,
        ).stdout.strip()
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        self.git("checkout", "-q", "feature")
        self.git("commit", "--allow-empty", "-qm", "second")
        second = self.oid("HEAD")
        self.git("checkout", "-q", "main")
        denied = self.git(
            "update-ref", "refs/heads/main", second, new, check=False,
            env={"CTN_MAIN_RESERVATION_REF": reserved},
        )
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual([line.split()[1] for line in self.backups()], [self.original, self.original])

    def restore(self, backup, expected, check=True):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "restore", backup, expected],
            cwd=self.repo, capture_output=True, text=True, check=check,
        )

    def test_restore_retains_current_tip_and_preserves_dirty_files(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        original_backup = self.backups()[0].split()[0]
        dirty = self.repo / "user-owned.txt"
        dirty.write_text("keep this work\n")
        status = self.git("status", "--porcelain=v1", "--untracked-files=all").stdout
        result = self.restore(original_backup, new)
        report = json.loads(result.stdout)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.oid(original_backup), self.original)
        self.assertEqual(self.oid(report["current_backup"]), new)
        self.assertNotEqual(report["current_backup"], original_backup)
        self.assertEqual(len(self.backups()), 2)
        self.assertEqual(dirty.read_text(), "keep this work\n")
        self.assertEqual(
            self.git("status", "--porcelain=v1", "--untracked-files=all").stdout,
            status,
        )

    def test_restore_report_preserves_porcelain_index_and_worktree_columns(self):
        tracked = self.repo / "a-tracked.bin"
        tracked.write_bytes(b"base\x00\n")
        self.git("add", tracked.name)
        self.git("commit", "-qm", "tracked baseline")
        old = self.oid("refs/heads/main")
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, old)
        backup = next(
            ref for ref, oid in (line.split() for line in self.backups())
            if oid == old
        )
        tracked.write_bytes(b"dirty\xff\n")
        staged = self.repo / "b-staged.txt"
        staged.write_text("staged\n")
        self.git("add", staged.name)
        staged.write_text("staged plus worktree\n")
        untracked = self.repo / "c-untracked.bin"
        untracked.write_bytes(b"untracked\x00\xff\n")
        expected = " M a-tracked.bin\nAM b-staged.txt\n?? c-untracked.bin"
        self.assertEqual(
            self.git("status", "--porcelain=v1", "--untracked-files=all")
            .stdout.rstrip("\n"),
            expected,
        )
        report = json.loads(self.restore(backup, new).stdout)
        self.assertEqual(report["worktree_before"], expected)
        self.assertEqual(report["worktree_after"], expected)
        self.assertEqual(tracked.read_bytes(), b"dirty\xff\n")
        self.assertEqual(staged.read_text(), "staged plus worktree\n")
        self.assertEqual(untracked.read_bytes(), b"untracked\x00\xff\n")
        self.assertEqual(
            self.git("show", f":{staged.name}").stdout, "staged\n"
        )

    def test_restore_stale_expected_tip_stops_and_retains_backup(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backups = self.backups()
        denied = self.restore(backups[0].split()[0], self.original, check=False)
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual(self.backups(), backups)

    def test_restore_rejects_non_backup_reference(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backups = self.backups()
        denied = self.restore("refs/heads/feature", new, check=False)
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual(self.backups(), backups)

    def test_restore_hook_rejects_backup_target_mismatch(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backups = self.backups()
        snapshot = "refs/backup/origin-main-snapshot-test"
        self.git("update-ref", snapshot, new, "0" * len(new))
        denied = self.git(
            "update-ref", "refs/heads/main", self.original, new, check=False,
            env={"CTN_MAIN_RESTORE_REF": snapshot},
        )
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual(self.oid(snapshot), new)
        self.assertEqual(self.backups(), backups)



    def test_restore_missing_backup_stops_without_changing_main(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backups = self.backups()
        denied = self.restore("refs/backup/missing", new, check=False)
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual(self.backups(), backups)

    def test_restore_backup_creation_failure_preserves_original_backup(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backups = self.backups()
        original_backup = backups[0].split()[0]
        blocker = self.repo / ".git" / "refs" / "heads" / "backup" / "pre-merge-blocked.lock"
        blocker.write_text("block backup creation\n")
        spec = importlib.util.spec_from_file_location("main_ref_gate", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        def in_repo(*args, env=None):
            if args == ("rev-parse", "--git-common-dir"):
                return str(self.repo / ".git")
            if "update-ref" in args:
                index = args.index("update-ref")
                if args[index + 1].startswith("refs/heads/backup/pre-merge-"):
                    args = (*args[:index + 1], "refs/heads/backup/pre-merge-blocked", *args[index + 2:])
            return self.git(*args, env=env).stdout.strip()

        with mock.patch.object(module, "git", side_effect=in_repo):
            with self.assertRaises(subprocess.CalledProcessError):
                module.restore_main(original_backup, new)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual(self.oid(original_backup), self.original)
        self.assertEqual(self.backups(), backups)

    def test_symbolic_main_is_refused_before_reservation_or_restore(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backup = self.backups()[0].split()[0]
        self.git("-c", "core.hooksPath=/dev/null", "symbolic-ref",
                 "refs/heads/main", "refs/heads/feature")
        before = self.backups()
        dirty = self.repo / "user-owned.bin"
        dirty.write_bytes(b"\x00keep\xff\n")
        reserve = subprocess.run(
            [sys.executable, str(SCRIPT), "reserve", new],
            cwd=self.repo, capture_output=True, text=True,
        )
        restore = self.restore(backup, new, check=False)
        self.assertNotEqual(reserve.returncode, 0)
        self.assertNotEqual(restore.returncode, 0)
        self.assertEqual(
            self.git("symbolic-ref", "refs/heads/main").stdout.strip(),
            "refs/heads/feature",
        )
        self.assertEqual(self.oid("refs/heads/feature"), new)
        self.assertEqual(self.oid(backup), self.original)
        self.assertEqual(self.backups(), before)
        self.assertEqual(dirty.read_bytes(), b"\x00keep\xff\n")

    def test_symbolic_backup_is_refused_by_restore_and_prepared_hook(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        direct_backup = self.backups()[0].split()[0]
        before = self.backups()
        for alias in ("refs/backup/alias", "refs/heads/backup/alias"):
            with self.subTest(alias=alias):
                self.git("symbolic-ref", alias, direct_backup)
                denied = self.restore(alias, new, check=False)
                hook = self.git(
                    "update-ref", "refs/heads/main", self.original, new,
                    check=False, env={"CTN_MAIN_RESTORE_REF": alias},
                )
                self.assertNotEqual(denied.returncode, 0)
                self.assertNotEqual(hook.returncode, 0)
                self.assertEqual(self.oid("refs/heads/main"), new)
                self.assertEqual(self.oid(direct_backup), self.original)
                self.assertEqual(self.backups(), before)
                self.assertEqual(
                    self.git("symbolic-ref", alias).stdout.strip(), direct_backup,
                )

    def test_restore_refuses_interposed_symbolic_main_identity_without_hook(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backup = self.backups()[0].split()[0]
        (self.repo / ".git" / "hooks" / "reference-transaction").unlink()
        dirty = self.repo / "user-owned.bin"
        dirty.write_bytes(b"\x00unchanged\xff")
        spec = importlib.util.spec_from_file_location("main_ref_gate", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        real_popen = subprocess.Popen

        def in_repo(*args, env=None):
            if args == ("rev-parse", "--git-common-dir"):
                return str(self.repo / ".git")
            return self.git(*args, env=env).stdout.strip()

        def interpose(*args, **kwargs):
            if "--stdin" in args[0]:
                self.git("symbolic-ref", "refs/heads/main", "refs/heads/feature")
            return real_popen(*args, **{**kwargs, "cwd": self.repo})

        with mock.patch.object(module, "git", side_effect=in_repo), mock.patch.object(
            module.subprocess, "Popen", side_effect=interpose,
        ):
            with self.assertRaises(ValueError):
                module.restore_main(backup, new)
        self.assertEqual(
            self.git("symbolic-ref", "refs/heads/main").stdout.strip(),
            "refs/heads/feature",
        )
        self.assertEqual(self.oid("refs/heads/feature"), new)
        self.assertEqual(self.oid(backup), self.original)
        self.assertEqual(
            sorted(line.split()[1] for line in self.backups()),
            sorted((self.original, new)),
        )
        self.assertEqual(dirty.read_bytes(), b"\x00unchanged\xff")
        self.assertFalse((self.repo / ".git" / "refs" / "heads" / "main.lock").exists())

    def test_prepared_restore_locks_main_and_both_retained_snapshots(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backup = self.backups()[0].split()[0]
        spec = importlib.util.spec_from_file_location("main_ref_gate", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        real_direct = module.direct_commit
        real_popen = subprocess.Popen
        attempted = []

        def in_repo(*args, env=None):
            if args == ("rev-parse", "--git-common-dir"):
                return str(self.repo / ".git")
            return self.git(*args, env=env).stdout.strip()

        def in_repo_popen(*args, **kwargs):
            return real_popen(*args, **{**kwargs, "cwd": self.repo})

        def contend(ref):
            lock = self.repo / ".git" / "refs" / "heads" / "main.lock"
            if ref == "refs/heads/main" and lock.exists():
                refs = ["refs/heads/main", backup]
                refs.extend(line.split()[0] for line in self.backups() if line.split()[0] != backup)
                for locked_ref in refs:
                    result = self.git(
                        "symbolic-ref", locked_ref, "refs/heads/feature", check=False,
                    )
                    self.assertNotEqual(result.returncode, 0)
                    attempted.append(locked_ref)
            return real_direct(ref)

        output = io.StringIO()
        with mock.patch.object(module, "git", side_effect=in_repo), mock.patch.object(
            module.subprocess, "Popen", side_effect=in_repo_popen,
        ), mock.patch.object(module, "direct_commit", side_effect=contend), \
                contextlib.redirect_stdout(output):
            module.restore_main(backup, new)
        report = json.loads(output.getvalue())
        self.assertEqual(set(attempted), {"refs/heads/main", backup, report["current_backup"]})
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.oid("refs/heads/feature"), new)
        self.assertEqual(self.oid(backup), self.original)
        self.assertEqual(self.oid(report["current_backup"]), new)
        self.assertFalse((self.repo / ".git" / "refs" / "heads" / "main.lock").exists())

    def test_prepare_ack_timeout_aborts_actual_transaction_and_reaps(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        backup = self.backups()[0].split()[0]
        dirty = self.repo / "user-owned.bin"
        dirty.write_bytes(b"\x00preserve\xff")
        spec = importlib.util.spec_from_file_location("main_ref_gate", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        real_popen = subprocess.Popen
        real_select = module.select.select
        transactions = []
        waits = 0

        def in_repo(*args, env=None):
            if args == ("rev-parse", "--git-common-dir"):
                return str(self.repo / ".git")
            return self.git(*args, env=env).stdout.strip()

        def in_repo_popen(*args, **kwargs):
            process = real_popen(*args, **{**kwargs, "cwd": self.repo})
            if "update-ref" in args[0] and "--stdin" in args[0]:
                transactions.append(process)
            return process

        def time_out_prepare(readers, writers, errors, timeout):
            nonlocal waits
            if transactions and transactions[-1].stdout in readers:
                waits += 1
                if waits == 2:
                    return [], [], []
            return real_select(readers, writers, errors, timeout)

        with mock.patch.object(module, "git", side_effect=in_repo), mock.patch.object(
            module.subprocess, "Popen", side_effect=in_repo_popen,
        ), mock.patch.object(module.select, "select", side_effect=time_out_prepare):
            with self.assertRaises(subprocess.TimeoutExpired):
                module.restore_main(backup, new)
        self.assertEqual(len(transactions), 1)
        self.assertIsNotNone(transactions[0].returncode)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual(self.oid("refs/heads/feature"), new)
        self.assertEqual(self.oid(backup), self.original)
        self.assertEqual(
            sorted(line.split()[1] for line in self.backups()),
            sorted((self.original, new)),
        )
        self.assertEqual(dirty.read_bytes(), b"\x00preserve\xff")
        self.assertEqual(list((self.repo / ".git" / "refs").rglob("*.lock")), [])

    def test_restore_rejects_cas_drift_after_retaining_current_tip(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        original_backup = self.backups()[0].split()[0]
        self.git("checkout", "-q", "feature")
        self.git("commit", "--allow-empty", "-qm", "contender")
        contender = self.oid("HEAD")
        self.git("checkout", "-q", "main")
        spec = importlib.util.spec_from_file_location("main_ref_gate", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        def in_repo(*args, env=None):
            if args == ("rev-parse", "--git-common-dir"):
                return str(self.repo / ".git")
            return self.git(*args, env=env).stdout.strip()

        real_popen = subprocess.Popen

        def interpose(*args, **kwargs):
            if "--stdin" in args[0]:
                self.git("update-ref", "refs/heads/main", contender, new)
            return real_popen(*args, **{**kwargs, "cwd": self.repo})

        with mock.patch.object(module, "git", side_effect=in_repo), mock.patch.object(
            module.subprocess, "Popen", side_effect=interpose,
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                module.restore_main(original_backup, new)
        self.assertEqual(self.oid("refs/heads/main"), contender)
        self.assertEqual(self.oid(original_backup), self.original)
        self.assertEqual(
            sorted(line.split()[1] for line in self.backups()),
            sorted((self.original, new, new)),
        )

    def test_restore_accepts_retained_upstream_snapshot(self):
        snapshot = "refs/backup/origin-main-snapshot-test"
        self.git("update-ref", snapshot, self.original, "0" * len(self.original))
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        result = self.restore(snapshot, new)
        current_backup = json.loads(result.stdout)["current_backup"]
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.oid(snapshot), self.original)
        self.assertEqual(self.oid(current_backup), new)

    def test_non_descendant_candidate_denied_with_original_main_intact(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/main", new, self.original)
        denied = self.git(
            "update-ref", "refs/heads/main", self.original, new, check=False,
        )
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), new)
        self.assertEqual([line.split()[1] for line in self.backups()], [self.original])

    def test_updating_other_refs_does_not_create_backup(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/topic", new)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.oid("refs/heads/topic"), new)
        self.assertEqual(self.backups(), [])

    def test_pack_refs_preserves_main_without_creating_backup(self):
        self.git("pack-refs", "--all")
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.backups(), [])

        self.git("commit", "--allow-empty", "-qm", "after packing")
        self.assertEqual([line.split()[1] for line in self.backups()], [self.original])

    def test_deleting_packed_main_is_still_denied(self):
        self.git("pack-refs", "--all")
        denied = self.git(
            "update-ref", "-d", "refs/heads/main", self.original, check=False,
        )
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.backups(), [])

    def test_backup_creation_failure_denies_git_transaction(self):
        new = self.next_commit()
        self.git("update-ref", "refs/heads/backup", self.original)
        denied = self.git(
            "update-ref", "refs/heads/main", new, self.original, check=False,
        )
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.oid("refs/heads/backup"), self.original)
        self.assertEqual(self.backups(), [])

    def test_wrong_old_denies_prepared_phase_without_backup(self):
        new = self.next_commit()
        denied = self.invoke("prepared", new, new)
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.backups(), [])

    def test_missing_commit_denies_prepared_phase_without_backup(self):
        missing = "f" * len(self.original)
        denied = self.invoke("prepared", self.original, missing)
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.backups(), [])

    def test_non_commit_object_denies_prepared_phase(self):
        blob = self.git("hash-object", "-w", "--stdin", input="payload").stdout.strip()
        denied = self.invoke("prepared", self.original, blob)
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.backups(), [])

    def test_deletion_denies_prepared_phase_without_backup(self):
        deleted = "0" * len(self.original)
        denied = self.invoke("prepared", self.original, deleted)
        self.assertNotEqual(denied.returncode, 0)
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.backups(), [])

    def test_non_prepared_phases_do_not_create_backup(self):
        new = self.next_commit()
        for phase in ("preparing", "committed", "aborted"):
            self.assertEqual(
                self.invoke(phase, self.original, new).returncode, 0,
            )
        self.assertEqual(self.oid("refs/heads/main"), self.original)
        self.assertEqual(self.backups(), [])

    def test_sha256_repository_preserves_full_old_oid(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            initialized = subprocess.run(
                ["git", "init", "-q", "--object-format=sha256", str(repo)],
                capture_output=True,
                text=True,
            )
            if initialized.returncode:
                self.skipTest("installed Git does not support SHA-256 repositories")
            git = lambda *args: subprocess.run(
                ["git", *args], cwd=repo, check=True, capture_output=True, text=True,
            ).stdout.strip()
            git("symbolic-ref", "HEAD", "refs/heads/main")
            git("config", "user.name", "Gate Test")
            git("config", "user.email", "gate@example.invalid")
            git("commit", "--allow-empty", "-qm", "initial")
            old = git("rev-parse", "HEAD")
            git("commit", "--allow-empty", "-qm", "second")
            new = git("rev-parse", "HEAD")
            git("update-ref", "refs/heads/main", old, new)
            hook = repo / ".git" / "hooks" / "reference-transaction"
            hook.write_text(
                "#!/bin/sh\nexec " + shlex.quote(sys.executable) + " "
                + shlex.quote(str(SCRIPT)) + ' "$@"\n'
            )
            hook.chmod(0o755)
            git("update-ref", "refs/heads/main", new, old)
            saved = [
                line.split()[1]
                for line in git(
                    "for-each-ref", "--format=%(refname) %(objectname)",
                    "refs/heads/backup",
                ).splitlines()
                if line.startswith("refs/heads/backup/pre-merge-")
            ]
            self.assertEqual(len(old), 64)
            self.assertEqual(saved, [old])


if __name__ == "__main__":
    unittest.main()
