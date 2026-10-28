// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/__tests__/BusinessActionReview.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/workspace/workflows/BusinessActionReview.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/workflows/BusinessActionReview.jsx
// DAG Node:    none
// Intent:      Hold approved-step execution to showing retained receipts, uncertain outcomes and failures, and to dispatching only when receipts are loaded and the operator may write.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = Object.assign(createMockPocketBase(), { send: vi.fn() });
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_collection, _verb, operation) => operation() }));

import pb from '@/lib/pocketbaseClient';
import WorkspaceAccessContext from '@/contexts/WorkspaceAccessContext';
import BusinessActionReview from '@/components/workspace/workflows/BusinessActionReview';
import { setDemoMode } from '@/lib/demoWorkspace';
import { mockPocketBaseError, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

const step = { id: 'execute1', name: 'Create the approved task', kind: 'execute', action: { provider: 'erp', parameters: { title: 'Reconcile invoices' } } };
const run = { id: 'run1', workspace: 'ws_test', revision: 3 };
const job = (overrides = {}) => ({ id: 'job1', workspace: 'ws_test', run: run.id, step_id: step.id, status: 'succeeded', ...overrides });
const receipts = (...items) => ({ workspace: 'ws_test', items });
const writable = { data: { can_write: true }, loading: false, error: '' };

const renderReview = ({ access = writable, runApi = { read: vi.fn() } } = {}) => {
    const onSaved = vi.fn(), onBusy = vi.fn();
    renderWithProviders(<WorkspaceAccessContext.Provider value={access}>
        <BusinessActionReview run={run} step={step} runApi={runApi} onSaved={onSaved} onBusy={onBusy} />
    </WorkspaceAccessContext.Provider>);
    return { onSaved, onBusy, runApi };
};
const executeButton = () => screen.getByRole('button', { name: 'Execute approved step' });

beforeEach(() => { pb.__reset(); pb.send.mockReset(); setDemoMode(false); });

describe('retained action receipts', () => {
    it('shows the frozen action and a finished receipt with its evidence, and hands back the newer run revision', async () => {
        pb.send.mockResolvedValue(receipts(job({ evidence: 'ev1' })));
        const newer = { id: 'run1', workspace: 'ws_test', revision: 4 };
        const { onSaved, runApi } = renderReview({ runApi: { read: vi.fn().mockResolvedValue({ ok: true, record: newer }) } });
        expect(screen.getByText(/"title": "Reconcile invoices"/)).toBeInTheDocument();
        expect(await screen.findByText('Action: succeeded')).toBeInTheDocument();
        expect(screen.getByText('Receipt job1 · Evidence ev1')).toBeInTheDocument();
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(newer));
        expect(runApi.read).toHaveBeenCalledWith('run1');
        expect(pb.send).toHaveBeenCalledWith('/api/buildanddo/workspaces/ws_test/business',
            expect.objectContaining({ method: 'GET', query: { run: 'run1' } }));
        expect(executeButton()).toBeDisabled();
        expect(screen.queryByText(/Outcome may be uncertain/)).not.toBeInTheDocument();
    });

    it('does not replace the run when the reloaded revision is not newer', async () => {
        pb.send.mockResolvedValue(receipts(job({ status: 'failed' })));
        const runApi = { read: vi.fn().mockResolvedValue({ ok: true, record: { ...run } }) };
        const { onSaved } = renderReview({ runApi });
        expect(await screen.findByText('Action: failed')).toBeInTheDocument();
        await waitFor(() => expect(runApi.read).toHaveBeenCalled());
        expect(screen.getByText('Receipt job1')).toBeInTheDocument();
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('warns that a dispatched action may be uncertain and will not be repeated', async () => {
        pb.send.mockResolvedValue(receipts(job({ status: 'dispatched' })));
        const { runApi } = renderReview();
        expect(await screen.findByText(/Outcome may be uncertain/)).toBeInTheDocument();
        expect(executeButton()).toBeDisabled();
        expect(runApi.read).not.toHaveBeenCalled();
    });

    it('ignores receipts that belong to another step of the run', async () => {
        pb.send.mockResolvedValue(receipts(job({ step_id: 'other-step' })));
        renderReview();
        await waitFor(() => expect(executeButton()).toBeEnabled());
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('blocks dispatch until receipts load, and lets the operator reload them after a failure', async () => {
        const user = setupUser();
        pb.send.mockRejectedValueOnce(mockPocketBaseError('', 503)).mockResolvedValue(receipts());
        renderReview();
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not load these action receipts');
        expect(executeButton()).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Reload action receipt' }));
        await waitFor(() => expect(executeButton()).toBeEnabled());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('asks for a reload before dispatching when the finished run cannot be re-read', async () => {
        pb.send.mockResolvedValue(receipts(job()));
        renderReview({ runApi: { read: vi.fn().mockRejectedValue(new Error('offline')) } });
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not load action receipts. Reload before dispatching.');
    });
});

describe('dispatching the approved step', () => {
    it('shows a rejected dispatch and requires a receipt reload before another attempt', async () => {
        const user = setupUser();
        pb.send.mockImplementation(async (_path, options) => {
            if (options.method === 'POST') throw mockPocketBaseError('The connector is not healthy.', 422);
            return receipts();
        });
        const { onBusy } = renderReview();
        await waitFor(() => expect(executeButton()).toBeEnabled());
        await user.click(executeButton());
        expect(await screen.findByRole('alert')).toHaveTextContent('The connector is not healthy.');
        expect(pb.send).toHaveBeenCalledWith('/api/buildanddo/workspaces/ws_test/business', expect.objectContaining({
            method: 'POST', body: expect.objectContaining({ action: 'action.enqueue', revision: 3,
                payload: { run: 'run1', step_id: 'execute1' }, request_key: expect.any(String) }) }));
        expect(onBusy).toHaveBeenCalledWith(true);
        await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
        expect(executeButton()).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Reload action receipt' }));
        await waitFor(() => expect(executeButton()).toBeEnabled());
    });

    it('never dispatches for a read-only member', async () => {
        pb.send.mockResolvedValue(receipts());
        renderReview({ access: { data: { can_write: false }, loading: false, error: '' } });
        await waitFor(() => expect(pb.send).toHaveBeenCalled());
        expect(executeButton()).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Reload action receipt' })).toBeEnabled();
    });

    it('reads and dispatches nothing in demo mode', async () => {
        setDemoMode(true);
        renderReview();
        expect(executeButton()).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Reload action receipt' })).toBeDisabled();
        expect(screen.getByRole('link', { name: 'Execution replay' })).toHaveAttribute('href', '/app/replay');
        await waitFor(() => expect(pb.send).not.toHaveBeenCalled());
    });
});
