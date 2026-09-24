// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/workspaceKnowledge.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/workspaceKnowledge.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workspaceKnowledge.js
// Intent:      Prove a refused request and an unmatched request are told apart in
//              the sentence the reader sees, so nobody is sent to an administrator
//              over a deployment that is short a route.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { createKnowledgeClient } from '@/lib/workspaceKnowledge';

const ACCOUNT = 'acc_reader';
const WORKSPACE = 'ws_atlas';

function knowledge(status) {
    const client = {
        authStore: { record: { id: ACCOUNT } },
        send: vi.fn().mockRejectedValue(Object.assign(new Error('refused'), { status })),
    };
    return createKnowledgeClient({ client, accountId: ACCOUNT, workspaceId: WORKSPACE, isCurrent: () => true });
}

describe('createKnowledgeClient assemble failures', () => {
    it('does not blame the account when the request matched nothing', async () => {
        const result = await knowledge(404).assemble();

        expect(result.ok).toBe(false);
        // The entitlement sentence is the wrong errand: it sends the reader to an
        // administrator who finds their access intact.
        expect(result.error).not.toMatch(/available to your account/i);
        expect(result.error).toMatch(/knowledge route/i);
        expect(result.reason).not.toBe('forbidden');
    });

    it.each([401, 403])('still says a %s refusal is about the account', async (status) => {
        const result = await knowledge(status).assemble();

        expect(result).toMatchObject({ ok: false, reason: 'forbidden' });
        expect(result.error).toBe('This workspace or mission is no longer available to your account.');
    });

    it('keeps the retry sentence for a server fault', async () => {
        const result = await knowledge(500).assemble();

        expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(result.error).toMatch(/Knowledge is unavailable/);
    });
});
