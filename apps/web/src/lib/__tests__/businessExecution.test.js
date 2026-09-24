// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/businessExecution.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/businessExecution.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/businessExecution.js
// Intent:      Prove a failed receipt read does not report an action the reader
//              never performed, while a failed command still does.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { createBusinessClient } from '@/lib/businessExecution';

const ACCOUNT = 'acc_owner';
const WORKSPACE = 'ws_atlas';

function business() {
    const client = {
        authStore: { record: { id: ACCOUNT } },
        send: vi.fn().mockRejectedValue(Object.assign(new Error('offline'), { status: 500 })),
    };
    return createBusinessClient({ client, workspaceId: WORKSPACE, accountId: ACCOUNT, isCurrent: () => true });
}

describe('createBusinessClient failure copy', () => {
    it('does not report an action when only the receipt list was read', async () => {
        const result = await business().list();

        expect(result.ok).toBe(false);
        // A read-only page performed nothing, so an action sentence invents one for
        // the reader to go and check.
        expect(result.error).not.toMatch(/confirm this action/i);
        expect(result.error).toMatch(/could not load/i);
    });

    it('still warns that a command may have landed', async () => {
        const result = await business().command({ provider: 'erp', binding: '' });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('Could not confirm this action. Reload its receipts before retrying.');
    });
});
