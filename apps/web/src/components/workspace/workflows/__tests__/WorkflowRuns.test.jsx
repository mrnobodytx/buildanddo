// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/__tests__/WorkflowRuns.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx, apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx, apps/web/src/components/workspace/workflows/StartWorkflowRun.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx; VALIDATES apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx; VALIDATES apps/web/src/components/workspace/workflows/StartWorkflowRun.jsx
// DAG Node:    none
// Intent:      Exercise workflow history, safe retries, approval consent, evidence recording and scope changes through the real workspace UI.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = Object.assign(createMockPocketBase(), { send: vi.fn() });
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_collection, _verb, operation) => operation() }));

import pb from '@/lib/pocketbaseClient';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import WorkflowsPage from '@/pages/workspace/WorkflowsPage';
import WorkflowRunsPanel from '@/components/workspace/workflows/WorkflowRunsPanel';
import WorkflowRunReview from '@/components/workspace/workflows/WorkflowRunReview';
import { setDemoMode } from '@/lib/demoWorkspace';
import { act, createAuthValue, createMockWorkspace, createWorkspaceValue, renderWithProviders,
    screen, setupUser, waitFor, within } from '@/test/utils';

const steps = [{ id: 'step1', name: 'Inspect the result', kind: 'read', detail: 'Use the saved evidence' }];
const workflow = { id: 'workflow1', name: 'Weekly check', description: 'Review a measured result.',
    status: 'active', steps, workspace: 'ws_test', owner: 'user_test' };
const savedRun = (overrides = {}) => ({ id: 'run1', workspace: 'ws_test', owner: 'user_test', workflow: workflow.id,
    status: 'running', next_step: 0, revision: 1, started_at: new Date().toISOString(),
    snapshot: { version: 1, name: 'Original saved procedure', description: 'The saved description.', steps, mission_id: '', mission_title: '' },
    events: [], ...overrides });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const panel = (props = {}) => <WorkflowRunsPanel workflows={[workflow]} workspaceId="ws_test" accountId="user_test" {...props} />;

beforeEach(() => { pb.__reset(); pb.send.mockReset(); setDemoMode(false); });
afterEach(() => { setDemoMode(false); });

describe('workflow run history and start', () => {
    it('opens a linked run beyond the first page by reading its current revision', async () => {
        const record = savedRun({ id: 'older-run', revision: 8, snapshot: { ...savedRun().snapshot, name: 'Current revision eight' } });
        pb.__setRecords('workflow_runs', Array.from({ length: 21 }, (_, index) => savedRun({ id: `recent${index}` })).concat(record));
        renderWithProviders(panel(), { route: '/app/workflows?run=older-run' });
        expect(await screen.findByRole('heading', { name: 'Current revision eight' })).toBeVisible();
        expect(pb.__collection('workflow_runs').getOne).toHaveBeenCalledWith('older-run', expect.any(Object));
        expect(pb.send).not.toHaveBeenCalled();
    });
    it('does not open a linked run from another workspace', async () => {
        pb.__collection('workflow_runs').getOne.mockResolvedValueOnce(savedRun({ workspace: 'foreign' }));
        renderWithProviders(panel(), { route: '/app/workflows?run=run1' });
        expect(await screen.findByRole('alert')).toHaveTextContent('unavailable in the current workspace');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(pb.send).not.toHaveBeenCalled();
    });
    it('updates the workflow card previous-work receipt after a successful start', async () => {
        const user = setupUser();
        pb.__setRecords('workflows', [workflow]);
        pb.send.mockImplementation(async () => {
            const record = savedRun();
            pb.__setRecords('workflow_runs', [record]);
            return { record };
        });
        renderWithProviders(<WorkflowsPage />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start a run' })).toBeEnabled());
        expect(screen.queryByText(/1 recorded workflow run/)).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Start a run' }));
        await user.selectOptions(screen.getByLabelText('Saved workflow'), 'workflow1');
        await user.click(screen.getByRole('button', { name: 'Start recorded run' }));
        expect(await screen.findByText(/1 recorded workflow run/)).toHaveTextContent('Latest run: In progress');
    });

    it('separates unavailable history from an empty history and enables retry', async () => {
        const user = setupUser();
        pb.__collection('workflow_runs').getList.mockRejectedValueOnce(new Error('offline'));
        renderWithProviders(panel());
        expect(await screen.findByRole('alert')).toHaveTextContent('Run history is unavailable');
        expect(screen.getByRole('button', { name: 'Start a run' })).toBeDisabled();
        expect(screen.queryByText('No recorded runs match this view.')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Refresh runs' }));
        expect(await screen.findByText('No recorded runs match this view.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start a run' })).toBeEnabled();
    });

    it('paginates history and sends a bounded approval filter back to the backend', async () => {
        const user = setupUser();
        pb.__setRecords('workflow_runs', Array.from({ length: 21 }, (_, i) => savedRun({ id: `run${i}` })));
        renderWithProviders(panel());
        expect(await screen.findByRole('button', { name: 'Open run run0' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Open run run20' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Next runs' }));
        expect(await screen.findByRole('button', { name: 'Open run run20' })).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Run status'), 'awaiting_approval');
        await waitFor(() => expect(pb.__collection('workflow_runs').getList).toHaveBeenLastCalledWith(1, 20,
            expect.objectContaining({ filter: expect.stringContaining('status = "awaiting_approval"') })));
        await user.selectOptions(screen.getByLabelText('Workflow history'), 'workflow1');
        await waitFor(() => expect(pb.__collection('workflow_runs').getList).toHaveBeenLastCalledWith(1, 20,
            expect.objectContaining({ filter: expect.stringContaining('workflow = "workflow1"') })));
    });

    it('ignores an old history response after the filter has changed', async () => {
        const user = setupUser(); const slow = deferred();
        pb.__collection('workflow_runs').getList.mockImplementationOnce(() => slow.promise)
            .mockResolvedValueOnce({ items: [savedRun({ id: 'new-run' })], page: 1, totalItems: 1, totalPages: 1 });
        renderWithProviders(panel());
        await user.selectOptions(screen.getByLabelText('Run status'), 'running');
        await screen.findByRole('button', { name: 'Open run new-run' });
        await act(async () => slow.resolve({ items: [savedRun({ id: 'old-run' })], page: 1, totalItems: 1, totalPages: 1 }));
        expect(screen.queryByRole('button', { name: 'Open run old-run' })).not.toBeInTheDocument();
    });

    it('starts a saved workflow and opens the server snapshot with a mission link', async () => {
        const user = setupUser();
        const onRecordsChanged = vi.fn();
        const record = savedRun({ snapshot: { ...savedRun().snapshot, mission_id: 'mission1', mission_title: 'Measured mission' } });
        pb.__setRecords('missions', [{ id: 'mission1', title: 'Measured mission', status: 'running',
            mission_approved_at: '2026-09-15', mission_approved_by: 'user_test', workspace: 'ws_test' },
        { id: 'draft1', title: 'Unapproved proposal', status: 'proposed' }]);
        pb.send.mockResolvedValue({ record });
        pb.__collection('workflow_runs').getOne.mockResolvedValue(record);
        renderWithProviders(panel({ onRecordsChanged }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start a run' })).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'Start a run' }));
        const dialog = within(screen.getByRole('dialog'));
        await user.selectOptions(dialog.getByLabelText('Saved workflow'), 'workflow1');
        await waitFor(() => expect(dialog.getByLabelText('Mission for evidence (optional)')).toBeEnabled());
        expect(dialog.queryByRole('option', { name: 'Unapproved proposal' })).not.toBeInTheDocument();
        await user.selectOptions(dialog.getByLabelText('Mission for evidence (optional)'), 'mission1');
        await user.click(dialog.getByRole('button', { name: 'Start recorded run' }));
        await waitFor(() => expect(pb.send).toHaveBeenCalledWith('/api/buildanddo/workflow-runs', expect.objectContaining({
            method: 'POST', body: { workspace: 'ws_test', workflow: 'workflow1', mission: 'mission1', request_key: expect.any(String) } })));
        expect(await screen.findByRole('heading', { name: 'Original saved procedure' })).toBeInTheDocument();
        expect(screen.getByText(/Mission: Measured mission/)).toBeInTheDocument();
        expect(onRecordsChanged).toHaveBeenCalledTimes(1);
    });

    it('retains selection and the same request key after a response is lost', async () => {
        const user = setupUser();
        const onRecordsChanged = vi.fn();
        pb.send.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ record: savedRun(), replayed: true });
        pb.__collection('workflow_runs').getOne.mockResolvedValue(savedRun());
        renderWithProviders(panel({ onRecordsChanged }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start a run' })).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'Start a run' }));
        await user.selectOptions(screen.getByLabelText('Saved workflow'), 'workflow1');
        await user.click(screen.getByRole('button', { name: 'Start recorded run' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('confirm the saved result');
        expect(onRecordsChanged).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Saved workflow')).toHaveValue('workflow1');
        await user.click(screen.getByRole('button', { name: 'Start recorded run' }));
        await screen.findByRole('heading', { name: 'Original saved procedure' });
        expect(pb.send.mock.calls[0][1].body.request_key).toBe(pb.send.mock.calls[1][1].body.request_key);
        expect(onRecordsChanged).toHaveBeenCalledTimes(1);
    });

    it('blocks all run reads and writes in demo mode', async () => {
        renderWithProviders(panel({ demo: true }));
        expect(screen.getByRole('button', { name: 'Start a run' })).toBeDisabled();
        expect(await screen.findByText(/Demo mode does not create workflow runs/)).toBeInTheDocument();
        expect(pb.__collection('workflow_runs').getList).not.toHaveBeenCalled();
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('closes private drafts and ignores a late start when the account and workspace change', async () => {
        const user = setupUser(); const pending = deferred();
        pb.__setRecords('workflows', [workflow]); pb.send.mockImplementation(() => pending.promise);
        const view = renderWithProviders(<WorkflowsPage />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start a run' })).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'Start a run' }));
        await user.selectOptions(screen.getByLabelText('Saved workflow'), 'workflow1');
        await user.click(screen.getByRole('button', { name: 'Start recorded run' }));
        pb.__setAuth({ record: { id: 'second-user' }, isValid: true });
        pb.__setRecords('workflows', []); pb.__setRecords('workflow_runs', []);
        view.rerender(<AuthContext.Provider value={createAuthValue({ user: { id: 'second-user' } })}>
            <WorkspaceContext.Provider value={createWorkspaceValue({ active: createMockWorkspace({ id: 'second-workspace' }) })}>
                <WorkflowsPage />
            </WorkspaceContext.Provider></AuthContext.Provider>);
        await act(async () => pending.resolve({ record: savedRun() }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText('Original saved procedure')).not.toBeInTheDocument();
    });
});

describe('workflow outcome and approval forms', () => {
    const renderReview = (run = savedRun(), response = { ok: true, record: savedRun({ status: 'completed', revision: 2 }) }) => {
        const api = { decide: vi.fn().mockResolvedValue(response), read: vi.fn() };
        const onSaved = vi.fn(); const onBusy = vi.fn();
        renderWithProviders(<WorkflowRunReview run={run} api={api} onSaved={onSaved} onBusy={onBusy} />);
        return { api, onSaved, onBusy };
    };

    it('requires an observation, source and explicit confirmation before recording a completed step', async () => {
        const user = setupUser(); const { api, onSaved } = renderReview();
        expect(screen.getByRole('button', { name: 'Record completed step' })).toBeDisabled();
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: 'Record completed step' }));
        expect(screen.getByRole('alert')).toHaveTextContent('observation and its source');
        await user.type(screen.getByLabelText('Observed result'), 'Three rows matched.');
        await user.type(screen.getByLabelText('Observation source'), 'Saved query output');
        await user.click(screen.getByRole('button', { name: 'Record completed step' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(api.decide).toHaveBeenCalledWith('run1', expect.objectContaining({ revision: 1, action: 'step',
            step_id: 'step1', outcome: 'passed', observation: 'Three rows matched.', source: 'Saved query output' }));
    });

    it('keeps rejected observations, uses the same retry key and allows explicit reload after a stale decision', async () => {
        const user = setupUser();
        const { api, onSaved } = renderReview(savedRun(), { ok: false, reason: 'conflict', error: 'Reload the latest run.' });
        await user.type(screen.getByLabelText('Observed result'), 'Observed failure');
        await user.type(screen.getByLabelText('Observation source'), 'Error log');
        await user.click(screen.getByRole('button', { name: 'Record failure' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Reload the latest run');
        expect(screen.getByLabelText('Observed result')).toHaveValue('Observed failure');
        await user.click(screen.getByRole('button', { name: 'Record failure' }));
        expect(api.decide.mock.calls[0][1].request_key).toBe(api.decide.mock.calls[1][1].request_key);
        api.read.mockResolvedValue({ ok: true, record: savedRun({ revision: 2 }) });
        await user.click(screen.getByRole('button', { name: 'Reload latest run' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 })));
    });

    it('requires deliberate approval and shows a backend permission rejection without losing the rationale', async () => {
        const user = setupUser();
        const run = savedRun({ status: 'awaiting_approval', snapshot: { ...savedRun().snapshot, steps: [{ ...steps[0], kind: 'approval' }] } });
        const { api } = renderReview(run, { ok: false, error: 'A workspace owner or admin must decide this approval.' });
        expect(screen.getByRole('button', { name: 'Record approval' })).toBeDisabled();
        expect(screen.queryByLabelText('Observation source')).not.toBeInTheDocument();
        await user.type(screen.getByLabelText('Decision rationale'), 'The saved scope is acceptable.');
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: 'Record approval' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('owner or admin');
        expect(screen.getByLabelText('Decision rationale')).toHaveValue('The saved scope is acceptable.');
        expect(api.decide).toHaveBeenCalledWith('run1', expect.objectContaining({ outcome: 'approved', source: '' }));
    });

    it('records cancellation only after a reason and explicit confirmation', async () => {
        const user = setupUser(); const { api } = renderReview();
        await user.click(screen.getByRole('button', { name: 'Cancel run' }));
        expect(api.decide).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
        await user.type(screen.getByLabelText('Cancellation reason'), 'The input is no longer available.');
        await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
        await waitFor(() => expect(api.decide).toHaveBeenCalledWith('run1', expect.objectContaining({ action: 'cancel',
            step_id: '', outcome: '', source: '', observation: 'The input is no longer available.' })));
    });

    it('renders finished receipts from the saved snapshot and offers no status rewrite', () => {
        const run = savedRun({ status: 'completed', next_step: 1, events: [{ actor: 'user_test', at: '2026-09-15T03:00:00Z',
            evidence: 'receipt1', command: { request_key: 'request1', step_id: 'step1', action: 'step', outcome: 'passed',
                source: 'Saved output', observation: 'Three rows matched.' } }] });
        renderReview(run);
        expect(screen.getByText('Three rows matched.')).toBeInTheDocument();
        expect(screen.getByText(/Evidence receipt: receipt1/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Record completed step' })).not.toBeInTheDocument();
    });
});
