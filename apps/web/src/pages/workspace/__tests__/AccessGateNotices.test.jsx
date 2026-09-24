// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/AccessGateNotices.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/hooks/useWorkspaceControl.js,
//              apps/web/src/contexts/WorkspaceAccessContext.jsx,
//              apps/web/src/pages/workspace/OperationsPage.jsx,
//              apps/web/src/pages/workspace/SpecialistWorkPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useWorkspaceControl.js;
//              VALIDATES apps/web/src/pages/workspace/OperationsPage.jsx;
//              VALIDATES apps/web/src/pages/workspace/SpecialistWorkPage.jsx
// DAG Node:    none
// Intent:      Hold the three access outcomes apart on screen, because a control
//              that only greys out reads as a refusal even when the check never
//              answered.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceAccessProvider } from '@/contexts/WorkspaceAccessContext';
import pb from '@/lib/pocketbaseClient';
import OperationsPage from '@/pages/workspace/OperationsPage';
import SpecialistWorkPage from '@/pages/workspace/SpecialistWorkPage';
import {
    createMockMission,
    mockPocketBaseError,
    renderWithProviders,
    screen,
    waitFor,
} from '@/test/utils';

// The real provider is used on purpose: the defect is that the hook hands the
// page the same `data: null` for "still checking" and "never answered", so a
// test that stubs the context would be asserting against its own stub.
vi.mock('@/lib/pocketbaseClient', async () => {
    const { vi: vitest } = await import('vitest');
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    client.send = vitest.fn();
    return { default: client, pocketbaseClient: client };
});

const accessResponse = (role = 'owner') => ({
    workspace: 'ws_test',
    role,
    settings: { revision: 0, description: '', wiki_enabled: true, forum_enabled: true, forum_moderation: true },
    can_admin: ['owner', 'admin'].includes(role),
    can_write: role !== 'viewer',
    can_grant_admin: role === 'owner',
});

const gated = (page) => <WorkspaceAccessProvider>{page}</WorkspaceAccessProvider>;

beforeEach(() => {
    pb.__reset();
    pb.send.mockReset();
    pb.send.mockResolvedValue(accessResponse('owner'));
});

describe('a control disabled by an access result says which access result', () => {
    it('names a rejected access check on the operations desk', async () => {
        pb.send.mockRejectedValue(mockPocketBaseError('Access check failed', 503));
        renderWithProviders(gated(<OperationsPage />));
        await waitFor(() =>
            expect((screen.getAllByRole('button', { name: /Add an? operation/ }))[0]).toBeDisabled(),
        );
        expect(
            screen.getAllByText(/could not confirm what you are allowed to do/i)[0],
        ).toBeVisible();
    });

    it('does not call a refusal a failure on the operations desk', async () => {
        pb.send.mockResolvedValue(accessResponse('viewer'));
        renderWithProviders(gated(<OperationsPage />));
        await waitFor(() =>
            expect((screen.getAllByRole('button', { name: /Add an? operation/ }))[0]).toBeDisabled(),
        );
        expect(screen.getAllByText(/read-only/i)[0]).toBeVisible();
        expect(screen.queryByText(/could not confirm what you are allowed to do/i)).toBeNull();
    });

    it('says the check is still running while it is still running', async () => {
        pb.send.mockReturnValue(new Promise(() => {}));
        renderWithProviders(gated(<OperationsPage />));
        expect(
            (await screen.findAllByText(/Checking what you are allowed to do/i))[0],
        ).toBeVisible();
        expect(screen.queryByText(/could not confirm what you are allowed to do/i)).toBeNull();
    });

    it('names a rejected access check on the specialist desks', async () => {
        pb.send.mockRejectedValue(mockPocketBaseError('Access check failed', 503));
        renderWithProviders(gated(<SpecialistWorkPage />));
        await waitFor(() =>
            expect((screen.getAllByRole('button', { name: 'Edit scope' }))[0]).toBeDisabled(),
        );
        expect(
            screen.getAllByText(/could not confirm what you are allowed to do/i)[0],
        ).toBeVisible();
    });
});

describe('the specialist missions panel', () => {
    it('says so when no mission needs attention', async () => {
        renderWithProviders(gated(<SpecialistWorkPage />));
        expect(await screen.findByText(/No mission is flagged for attention/i)).toBeVisible();
    });

    it('still lists the missions that do need attention', async () => {
        pb.__setRecords('missions', [createMockMission({ status: 'failed', title: 'Restore the nightly export' })]);
        renderWithProviders(gated(<SpecialistWorkPage />));
        expect(await screen.findByText('Restore the nightly export')).toBeVisible();
        expect(screen.queryByText(/No mission is flagged for attention/i)).toBeNull();
    });
});
