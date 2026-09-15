// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/__tests__/WorkspaceContext.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/contexts/WorkspaceContext.jsx
// DAG Node:    none
// Intent:      Prove workspace records are cleared across account transitions and failed loads can recover without onboarding.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
import pb from '@/lib/pocketbaseClient';
import {
    createAuthValue,
    createMockWorkspace,
    renderWithProviders,
    screen,
    setupUser,
} from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

function Probe() {
    const { active, workspaces, loading, error, refresh } = useWorkspace();
    return (
        <div>
            <p>{active?.name || 'No active workspace'}</p>
            <p>{workspaces.length} workspaces</p>
            {loading && <p role="status">Loading workspaces</p>}
            {error && <p role="alert">{error}</p>}
            <button type="button" onClick={refresh}>
                Refresh workspaces
            </button>
        </div>
    );
}
function Scene({ auth }) {
    return (
        <AuthContext.Provider value={auth}>
            <WorkspaceProvider>
                <Probe />
            </WorkspaceProvider>
        </AuthContext.Provider>
    );
}

beforeEach(() => pb.__reset());

describe('WorkspaceProvider account isolation', () => {
    it('clears the previous account synchronously while the next account loads', async () => {
        pb.__setRecords('workspaces', [
            createMockWorkspace({ name: 'Account A private workspace' }),
        ]);
        const view = renderWithProviders(<Scene auth={createAuthValue()} />);
        expect(await screen.findByText('Account A private workspace')).toBeVisible();
        let resolveNext;
        pb.__collection('workspaces').getFullList.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveNext = resolve;
                }),
        );
        const next = createAuthValue({ user: { id: 'account-b' } });
        pb.__setAuth({ record: next.user, isValid: true });
        view.rerender(<Scene auth={next} />);
        expect(screen.queryByText('Account A private workspace')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Loading workspaces');
        expect(screen.getByText('0 workspaces')).toBeVisible();
        await act(async () => {
            resolveNext([createMockWorkspace({ id: 'ws-b', name: 'Account B workspace' })]);
        });
        expect(await screen.findByText('Account B workspace')).toBeVisible();
    });

    it('ignores a workspace request that finishes after logout', async () => {
        let resolveOld;
        pb.__collection('workspaces').getFullList.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveOld = resolve;
                }),
        );
        const view = renderWithProviders(<Scene auth={createAuthValue()} />);
        pb.authStore.clear();
        view.rerender(<Scene auth={createAuthValue({ isAuthed: false, user: null })} />);
        await act(async () => {
            resolveOld([createMockWorkspace({ name: 'Late private workspace' })]);
        });
        expect(screen.queryByText('Late private workspace')).not.toBeInTheDocument();
        expect(screen.getByText('No active workspace')).toBeVisible();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(pb.__collection('workspaces').getFullList).toHaveBeenCalledTimes(1);
    });

    it('discards an older read when a refresh finishes first', async () => {
        let resolveOld;
        pb.__collection('workspaces').getFullList.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveOld = resolve;
                }),
        );
        renderWithProviders(<Scene auth={createAuthValue()} />);
        pb.__setRecords('workspaces', [createMockWorkspace({ name: 'Current workspace' })]);
        await setupUser().click(screen.getByRole('button', { name: 'Refresh workspaces' }));
        expect(await screen.findByText('Current workspace')).toBeVisible();
        await act(async () => {
            resolveOld([createMockWorkspace({ name: 'Stale workspace' })]);
        });
        expect(screen.queryByText('Stale workspace')).not.toBeInTheDocument();
    });

    it('distinguishes a failed request from an empty workspace list and retries', async () => {
        pb.__setError('workspaces');
        renderWithProviders(<Scene auth={createAuthValue()} />);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not load your workspaces',
        );
        pb.__clearError('workspaces');
        pb.__setRecords('workspaces', [createMockWorkspace({ name: 'Recovered workspace' })]);
        await setupUser().click(screen.getByRole('button', { name: 'Refresh workspaces' }));
        expect(await screen.findByText('Recovered workspace')).toBeVisible();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
