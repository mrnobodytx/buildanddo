// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/missionSuite.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/missionSuite.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/missionSuite.js
// Intent:      Prove the crafted operator-facing sentence survives a generic
//              PocketBase body, and that a server message naming a real cause is
//              still the one the reader gets.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { createSuiteClient } from '@/lib/missionSuite';

const ACCOUNT = 'acc_pilot';
const WORKSPACE = 'ws_atlas';
const MISSION = 'msn_harbour';
const REQUEST_KEY = 'requestkey0123456789';

function suite(error) {
    const client = { authStore: { record: { id: ACCOUNT } }, send: vi.fn().mockRejectedValue(error) };
    return createSuiteClient({ client, accountId: ACCOUNT, workspaceId: WORKSPACE, missionId: MISSION,
        isCurrent: () => true, keyFactory: () => REQUEST_KEY });
}

describe('createSuiteClient failure copy', () => {
    it('prefers its own sentence over the unmatched-route body on a read', async () => {
        // PocketBase answers any unregistered route with this; it names no cause the
        // reader can act on, and it hides the one sentence that does.
        const result = await suite({ status: 404, response: { message: "The requested resource wasn't found." } }).read();

        expect(result.ok).toBe(false);
        expect(result.error).toBe('The mission suite is unavailable. Reload or ask the workspace operator to check its installed API.');
    });

    it('prefers its own sentence over the unmatched-route body on a write', async () => {
        const result = await suite({ status: 404, response: { message: "The requested resource wasn't found." } })
            .command('cancel', { id: 'run_one' }, 3);

        expect(result.ok).toBe(false);
        expect(result.error).toBe('The save was not confirmed. Recover the previous request before making another change.');
    });

    it('still shows a server message that names a real cause', async () => {
        const result = await suite({ status: 403, response: { message: 'Choose a suite run in this mission.' } }).read();

        expect(result).toMatchObject({ ok: false, reason: 'forbidden', error: 'Choose a suite run in this mission.' });
    });
});
