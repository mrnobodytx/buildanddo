// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/pages/workspace/__tests__/ExecutionReplayPage.test.jsx
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         C-ONE
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-23
// Depends:      apps/web/src/pages/workspace/ExecutionReplayPage.jsx, apps/web/src/test/utils.jsx
// EnumType:     Test
// EnumEdges:    VALIDATES apps/web/src/pages/workspace/ExecutionReplayPage.jsx; CONSUMES apps/web/src/test/utils.jsx
// DAG Node:     none
// Intent:       Hold the replay page to the answer it already has: a read the scope guard discarded must end the loading claim and say what happened.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = Object.assign(createMockPocketBase(), { send: vi.fn() });
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import ExecutionReplayPage from '@/pages/workspace/ExecutionReplayPage';
import { setDemoMode } from '@/lib/demoWorkspace';
import { renderWithProviders, screen } from '@/test/utils';

const receipt = { id: 'job1', workspace: 'ws_test', owner: 'user_test', provider: 'erp', status: 'succeeded',
    created: '2026-09-20T10:00:00Z', started_at: '2026-09-20T10:00:30Z', finished_at: '2026-09-20T10:01:00Z',
    worker: 'user_test', evidence: '' };
const listPage = { workspace: 'ws_test', page: 1, has_more: false, items: [receipt] };

beforeEach(() => { pb.__reset(); pb.send.mockReset(); setDemoMode(false); });
afterEach(() => { setDemoMode(false); });

describe('ExecutionReplayPage', () => {
    it('stops claiming it is loading when the read is discarded as out of scope', async () => {
        // The signed-in record no longer matches the account this page is bound to, which is the
        // condition the execution client answers with { stale: true } before it sends anything.
        pb.__setAuth({ record: { id: 'another_account', collectionName: 'users' }, isValid: true });

        renderWithProviders(<ExecutionReplayPage />);

        expect(await screen.findByText(/Receipts were not loaded/)).toBeInTheDocument();
        expect(screen.queryByText(/Loading retained receipts/)).not.toBeInTheDocument();
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('still renders retained receipts when the read belongs to the open workspace', async () => {
        pb.send.mockResolvedValue(listPage);

        renderWithProviders(<ExecutionReplayPage />);

        expect(await screen.findByText(/1 succeeded/)).toBeInTheDocument();
        expect(screen.queryByText(/Receipts were not loaded/)).not.toBeInTheDocument();
    });
});
