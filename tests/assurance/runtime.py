# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/assurance/runtime.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/upgrade/test_workspace_native.py, tests/upgrade/government_fixture.py
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_workspace_native.py; CONSUMES tests/upgrade/government_fixture.py
# Intent:      Exercise full public application policies on a disposable native backend with recoverable synthetic data.
# ───────────────────────────────────────────────────────────────

"""Create isolated fixtures and restore only their own offline backups."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
from typing import Any

from tests.upgrade.government_fixture import membership_seed
from tests.upgrade.test_workspace_native import (
    WorkspaceServer,
    ROOT,
    ALICE,
    BRAVO,
    VIEWER,
)

EXTRA_HOOKS = (
    "government.pb.js",
    "government-desk.js",
    "government-access.js",
    "workspace-value.js",
    "tutorial-learning.pb.js",
    "tutorial-learning.js",
    "classrooms.pb.js",
    "classrooms.js",
    "suite.pb.js",
    "suite-policy.js",
    "mission-suite.js",
)
EXTRA_MIGRATIONS = (
    "1790400000_government_submission_learning.js",
    "1790400000_classroom_rooms.js",
    "1790600000_tutorial_learning.js",
    "1791200000_government_membership.js",
)


def tree_hashes(directory: Path) -> dict[str, str]:
    """Fingerprint a fixture tree while rejecting links and unrelated paths."""
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("Choose an existing fixture directory without symlinks.")
    result = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError("Fixture backup cannot contain symlinks.")
        if path.is_file():
            result[str(path.relative_to(directory))] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
    return result


class AssuranceServer(WorkspaceServer):
    """Extend the existing local native fixture with real learning and paid-access policy."""

    def __init__(self, binary: str) -> None:
        super().__init__(binary)
        self.sequence = 0
        try:
            self.stop()
            for name in EXTRA_HOOKS:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_hooks" / name, self.root / "hooks" / name
                )
            for name in EXTRA_MIGRATIONS:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations" / name,
                    self.root / "migrations" / name,
                )
            for name in ("government-submissions.json", "research-sprint.json"):
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations/data" / name,
                    self.root / "pb_migrations/data" / name,
                )
            (self.root / "migrations/1999999100_government_fixture.js").write_text(
                membership_seed((ALICE, BRAVO)), encoding="utf-8"
            )
            (self.root / "migrations/1999999101_learner_fixture.js").write_text(
                """migrate((app) => {
                const user = new Record(app.findCollectionByNameOrId('users'));
                user.id = 'accountlearner1'; user.set('email', 'learner@fixture.invalid');
                user.set('verified', true); user.setPassword('local-fixture-password-only'); app.save(user);
            }, () => {});""",
                encoding="utf-8",
            )
            self.migrate()
            self.start()
        except BaseException:
            self.close()
            raise

    def set_membership(self, user: str, values: dict[str, object]) -> None:
        """Apply a synthetic operator change via a fixture migration with the server stopped."""
        if user not in (ALICE, BRAVO, VIEWER) or set(values) - {
            "status",
            "expires_at",
            "approved_by",
        }:
            raise ValueError("Choose known fixture membership fields.")
        self.stop()
        self.sequence += 1
        payload = json.dumps({"user": user, "values": values})
        source = """migrate((app) => {
            const data = __DATA__;
            const row = app.findFirstRecordByFilter('government_memberships', 'user = {:user}', {user: data.user});
            for (const [key, value] of Object.entries(data.values)) row.set(key, value);
            app.save(row);
        }, () => {});""".replace("__DATA__", payload)
        (
            self.root
            / "migrations"
            / f"{1999999200 + self.sequence}_membership_fixture.js"
        ).write_text(source, encoding="utf-8")
        self.migrate()
        self.start()

    def backup(self) -> dict[str, str]:
        """Capture this disposable server's full data tree after a clean shutdown."""
        self.stop()
        destination = self.root / "backup"
        if destination.exists():
            raise ValueError("A fixture backup already exists.")
        try:
            shutil.copytree(self.root / "data", destination)
            manifest = tree_hashes(destination)
        finally:
            self.start()
        return manifest

    def restore(self, expected: dict[str, str]) -> None:
        """Validate the complete backup before restoring it inside this fixture only."""
        source = self.root / "backup"
        if not expected or tree_hashes(source) != expected:
            raise ValueError("Backup bytes changed; restoration refused.")
        self.stop()
        # Preserve the post-backup database for comparison instead of deleting it.
        data, after = self.root / "data", self.root / "after-backup"
        if after.exists():
            self.start()
            raise ValueError("This fixture was already restored.")
        data.rename(after)
        try:
            shutil.copytree(source, data)
            self.start()
        except BaseException:
            self.stop()
            if data.exists():
                data.rename(self.root / "failed-restore")
            after.rename(data)
            self.start()
            raise

    def call(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        actor: str = "alice",
    ) -> dict[str, Any]:
        """Require successful native authentication and API handling for fixture setup."""
        status, result = self.request(method, path, body, self.login(actor))
        if status not in (200, 201):
            raise AssertionError(
                f"Native fixture request failed: {method} {path} ({status})."
            )
        return result

    def lesson(self, *, actor: str = "alice") -> dict[str, Any]:
        """Resolve a real installed general lesson through its native catalogue."""
        records = self.call(
            "GET", "/api/collections/tutorials/records?perPage=100", actor=actor
        )["items"]
        return next(
            row
            for row in records
            if isinstance(row.get("lesson"), dict)
            and row["lesson"].get("schema_version") == 1
        )
