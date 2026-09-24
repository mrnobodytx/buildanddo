# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/government_fixture.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN, C-ONE (migration order)
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/pocketbase/pb_migrations/1791200000_government_membership.js
# EnumType:    Test
# EnumEdges:   VALIDATES apps/pocketbase/pb_migrations/1791200000_government_membership.js
# Intent:      Install real membership policy with synthetic receipts only in disposable native test databases.
# ───────────────────────────────────────────────────────────────

"""Prepare local fixture migrations; never provision a real membership."""

import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]


def membership_seed(users: tuple[str, ...]) -> str:
    """Return test-only native writes for known synthetic accounts."""
    return """migrate((app) => {
    for (const id of __USERS__) {
        const record = new Record(app.findCollectionByNameOrId('government_memberships'));
        for (const [key, value] of Object.entries({ user: id, tier: 'government', status: 'active', amount_cents: 10000,
            currency: 'USD', interval: 'month', payment_reference: 'synthetic-invoice', approved_by: 'synthetic-operator',
            approved_at: '2026-01-01T00:00:00Z', starts_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', protocol_version: 1 })) record.set(key, value);
        app.save(record);
    }
}, () => {});
""".replace("__USERS__", json.dumps(users))


def install_suite_membership(root: Path) -> None:
    """Place the membership prerequisite before the existing suite rollback target.

    PocketBase orders migrations by filename bytes, so "2_..." sorts AFTER "1790300000_mission_suite.js"
    and the suite's one-step rollback reverted a fixture instead of the suite. Zero-padded names sort
    before every timestamped migration, after the zero-padded base fixture, which is what "before"
    has to mean here.
    """
    migrations = root / "migrations"
    (migrations / "0000000002_government_lesson_fixture.js").write_text(
        """migrate((app) => {
        app.save(new Collection({ name: 'tutorials', type: 'base', fields: [{ name: 'category', type: 'text' }],
            listRule: "@request.auth.id != ''", viewRule: "@request.auth.id != ''", createRule: null, updateRule: null, deleteRule: null }));
    }, () => {});""",
        encoding="utf-8",
    )
    shutil.copyfile(
        ROOT / "apps/pocketbase/pb_migrations/1791200000_government_membership.js",
        migrations / "0000000003_government_membership.js",
    )
    (migrations / "0000000004_government_receipts_fixture.js").write_text(
        membership_seed(("accountalice001", "accountbravo001", "accountviewer01")),
        encoding="utf-8",
    )
