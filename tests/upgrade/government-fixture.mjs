// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/government-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_migrations/1791200000_government_membership.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_migrations/1791200000_government_membership.js
// Intent:      Install explicit synthetic membership receipts for tests without granting production accounts access.
// ───────────────────────────────────────────────────────────────

export const GOVERNMENT_MIGRATION = 'apps/pocketbase/pb_migrations/1791200000_government_membership.js';
export function installGovernment(f, users = []) {
    f.migration(GOVERNMENT_MIGRATION).up();
    for (const user of users) f.seed('government_memberships', membershipRecord(user));
    return f;
}
export function membershipRecord(user, overrides = {}) {
    return { id: `paid_${user}`, user, tier: 'government', status: 'active', amount_cents: 10000,
        currency: 'USD', interval: 'month', payment_reference: 'synthetic-invoice-only',
        approved_by: 'synthetic-independent-operator', approved_at: '2026-01-01T00:00:00Z',
        starts_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', protocol_version: 1, ...overrides };
}
