// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/__tests__/WorkflowRunReview.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx
// DAG Node:    none
// Intent:      Hold run review to refusing unreadable snapshots, rendering partial receipts honestly, recovering from failed reloads and ignoring late responses.
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
import WorkflowRunReview from '@/components/workspace/workflows/WorkflowRunReview';
import { setDemoMode } from '@/lib/demoWorkspace';
import { act, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

const readStep = { id: 'step1', name: 'Inspect the result', kind: 'read' };
const approvalStep = { id: 'gate1', name: 'Approve the scope', kind: 'approval', detail: 'Owner sign-off' };
const savedRun = (overrides = {}, snapshot = {}) => ({ id: 'run1', workspace: 'ws_test', status: 'running', next_step: 0, revision: 1,
    snapshot: { version: 1, name: 'Saved procedure', description: 'Saved description.', steps: [readStep], mission_id: '', mission_title: '', ...snapshot },
    events: [], ...overrides });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const renderReview = (run = savedRun(), api = {}, props = {}) => {
    const client = { decide: vi.fn(), read: vi.fn(), ...api };
    const onSaved = vi.fn(), onBusy = vi.fn();
    const view = renderWithProviders(<WorkflowRunReview run={run} api={client} onSaved={onSaved} onBusy={onBusy} {...props} />);
    return { api: client, onSaved, onBusy, view };
};

beforeEach(() => { pb.__reset(); pb.send.mockReset(); setDemoMode(false); });

describe('reading a saved run', () => {
    it('refuses to render a run whose saved snapshot format is unsupported', () => {
        renderReview(savedRun({}, { version: 2 }));
        expect(screen.getByRole('alert')).toHaveTextContent('This saved run format is unavailable');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('focuses the current step and shows only its kind when it has no detail', () => {
        renderReview();
        expect(screen.getByRole('heading', { name: 'Step 1: Inspect the result' })).toHaveFocus();
        expect(screen.getByText('Read data')).toBeInTheDocument();
    });

    it('renders a cancellation receipt without inventing an outcome, source or evidence', () => {
        const run = savedRun({ status: 'cancelled', events: [{ actor: 'user_test', at: '2026-10-02T00:00:00Z',
            command: { request_key: 'k1', action: 'cancel', outcome: '', source: '', observation: 'Input withdrawn.' } }] },
        { mission_title: 'Quarter close' });
        renderReview(run);
        expect(screen.getByText('Cancellation · cancelled')).toBeInTheDocument();
        expect(screen.getByText(/Operator decision · Account user_test/)).toBeInTheDocument();
        expect(screen.getByText('Evidence receipt: Not recorded')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open the Mission Desk' })).toHaveAttribute('href', '/app/missions');
        expect(screen.getByText(/This run is finished/)).toHaveFocus();
        expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
    });
});

describe('approval checkpoints', () => {
    it('records a rejection with its rationale and no source, without requiring the approval box', async () => {
        const user = setupUser();
        const run = savedRun({ status: 'awaiting_approval' }, { steps: [approvalStep] });
        const saved = savedRun({ status: 'failed', revision: 2 }, { steps: [approvalStep] });
        const { api, onSaved } = renderReview(run, { decide: vi.fn().mockResolvedValue({ ok: true, record: saved }) });
        expect(screen.getByText('Wait for approval · Owner sign-off')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Record rejection' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Add your observation');
        expect(api.decide).not.toHaveBeenCalled();
        await user.type(screen.getByLabelText('Decision rationale'), '  Out of scope.  ');
        await user.click(screen.getByRole('button', { name: 'Record rejection' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
        expect(api.decide).toHaveBeenCalledWith('run1', expect.objectContaining({ action: 'step', step_id: 'gate1',
            outcome: 'rejected', observation: 'Out of scope.', source: '' }));
    });
});

describe('recovering from refused or stale decisions', () => {
    it('explains a failed reload, using the backend reason when one is given', async () => {
        const user = setupUser();
        const { api, onSaved } = renderReview(savedRun(), {
            decide: vi.fn().mockResolvedValue({ ok: false, reason: 'conflict', error: 'The run changed.' }),
            read: vi.fn().mockResolvedValueOnce({ ok: false, error: '' }).mockResolvedValueOnce({ ok: false, error: 'Run is unavailable.' }),
        });
        await user.type(screen.getByLabelText('Observed result'), 'Nothing matched.');
        await user.type(screen.getByLabelText('Observation source'), 'Query log');
        await user.click(screen.getByRole('button', { name: 'Record failure' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('The run changed.');
        await user.click(screen.getByRole('button', { name: 'Reload latest run' }));
        expect(await screen.findByText('Could not reload this run.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Reload latest run' }));
        expect(await screen.findByText('Run is unavailable.')).toBeInTheDocument();
        expect(api.read).toHaveBeenCalledTimes(2);
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('stays quiet and keeps the draft when a decision is refused without a message', async () => {
        const user = setupUser();
        const { onSaved, onBusy } = renderReview(savedRun(), { decide: vi.fn().mockResolvedValue({ ok: false, reason: 'busy', error: '' }) });
        await user.type(screen.getByLabelText('Observed result'), 'Observed');
        await user.type(screen.getByLabelText('Observation source'), 'Log');
        await user.click(screen.getByRole('button', { name: 'Record failure' }));
        await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Observed result')).toHaveValue('Observed');
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('ignores a decision that returns after the review was closed', async () => {
        const user = setupUser(), pending = deferred();
        const { onSaved, onBusy, view } = renderReview(savedRun(), { decide: vi.fn(() => pending.promise) });
        await user.type(screen.getByLabelText('Observed result'), 'Observed');
        await user.type(screen.getByLabelText('Observation source'), 'Log');
        await user.click(screen.getByRole('button', { name: 'Record failure' }));
        expect(screen.getByText('Saving the decision and evidence…')).toBeInTheDocument();
        view.unmount();
        await act(async () => pending.resolve({ ok: true, record: savedRun({ revision: 2 }) }));
        expect(onSaved).not.toHaveBeenCalled();
        expect(onBusy).toHaveBeenLastCalledWith(true);
    });

    it('ignores a reload that returns after the review was closed', async () => {
        const user = setupUser(), pending = deferred();
        const { onSaved, view } = renderReview(savedRun(), {
            decide: vi.fn().mockResolvedValue({ ok: false, error: 'Stale revision.' }), read: vi.fn(() => pending.promise) });
        await user.click(screen.getByRole('button', { name: 'Cancel run' }));
        await user.type(screen.getByLabelText('Cancellation reason'), 'Stop.');
        await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
        await user.click(await screen.findByRole('button', { name: 'Reload latest run' }));
        view.unmount();
        await act(async () => pending.resolve({ ok: true, record: savedRun({ revision: 2 }) }));
        expect(onSaved).not.toHaveBeenCalled();
    });
});

describe('cancelling and disabled reviews', () => {
    it('lets the operator back out of a cancellation without recording anything', async () => {
        const user = setupUser(); const { api } = renderReview();
        await user.click(screen.getByRole('button', { name: 'Cancel run' }));
        expect(screen.getByLabelText('Cancellation reason')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Keep this run open' }));
        expect(screen.queryByLabelText('Cancellation reason')).not.toBeInTheDocument();
        expect(api.decide).not.toHaveBeenCalled();
    });

    it('locks every decision control when the review is disabled', () => {
        renderReview(savedRun(), {}, { disabled: true });
        expect(screen.getByLabelText('Observed result')).toBeDisabled();
        expect(screen.getByLabelText('Observation source')).toBeDisabled();
        expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Record failure' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel run' })).toBeDisabled();
    });
});
