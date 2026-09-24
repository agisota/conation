import shlex
import subprocess
import sys
import tempfile
import unittest
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

    def git(self, *args, check=True, input=None):
        return subprocess.run(
            ["git", *args],
            cwd=self.repo,
            input=input,
            text=True,
            capture_output=True,
            check=check,
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
