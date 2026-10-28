// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/__tests__/StartWorkflowRun.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/workspace/workflows/StartWorkflowRun.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/workflows/StartWorkflowRun.jsx
// DAG Node:    none
// Intent:      Hold execution workflows to an independently reviewed approved mission, and keep mission-load failures recoverable.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = Object.assign(createMockPocketBase(), { send: vi.fn() });
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_collection, _verb, operation) => operation() }));
vi.mock('@/lib/observability/runtime', async (importOriginal) => ({ ...await importOriginal(), readFailed: vi.fn() }));

import pb from '@/lib/pocketbaseClient';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import StartWorkflowRun from '@/components/workspace/workflows/StartWorkflowRun';
import { setDemoMode } from '@/lib/demoWorkspace';
import { createMockWorkspace, createWorkspaceValue, renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

const recorded = { id: 'recorded', name: 'Weekly check', status: 'active',
    steps: [{ id: 's1', name: 'Inspect', kind: 'read' }] };
const executing = { id: 'executing', name: 'Create ERP task', status: 'active',
    steps: JSON.stringify([{ id: 's1', name: 'Approve', kind: 'approval' }, { id: 's2', name: 'Create', kind: 'execute', action: { provider: 'erp' } }]) };
const approved = { status: 'running', mission_approved_by: 'user_test', mission_approved_at: '2026-10-01', workspace: 'ws_test' };
const missions = [
    { id: 'm-object', title: 'Reviewed (object plan)', mission_plan: { independent_review: true }, ...approved },
    { id: 'm-string', title: 'Reviewed (stored plan)', mission_plan: JSON.stringify({ independent_review: true }), ...approved },
    { id: 'm-self', title: 'Self reviewed', mission_plan: { independent_review: false }, ...approved },
    { id: 'm-corrupt', title: 'Corrupt plan', mission_plan: '{broken', ...approved },
    { id: 'm-none', title: 'No plan', ...approved },
];

const renderStart = (props = {}) => {
    const api = { start: vi.fn().mockResolvedValue({ ok: true, record: { id: 'run1' } }) };
    const onSaved = vi.fn(), onBusy = vi.fn();
    // The explicit workspace provider keeps the tree shape stable, so a rerender into another workspace updates the open form instead of remounting it.
    const ui = (workspaceId = 'ws_test') => <WorkspaceContext.Provider value={createWorkspaceValue({ active: createMockWorkspace({ id: workspaceId }) })}>
        <StartWorkflowRun workflows={[recorded, executing]} api={api} onSaved={onSaved} onBusy={onBusy} {...props} />
    </WorkspaceContext.Provider>;
    const view = renderWithProviders(ui());
    return { api, onSaved, onBusy, view, ui };
};
const missionOptions = (select) => within(select).getAllByRole('option').map((option) => option.textContent);

beforeEach(() => { pb.__reset(); pb.send.mockReset(); setDemoMode(false); pb.__setRecords('missions', missions); });

describe('starting an execution workflow', () => {
    it('offers only approved missions with independent review and requires one before starting', async () => {
        const user = setupUser(); const { api, onSaved } = renderStart();
        await user.selectOptions(screen.getByLabelText('Saved workflow'), 'executing');
        const mission = screen.getByLabelText('Approved mission with independent review (required)');
        await waitFor(() => expect(mission).toBeEnabled());
        expect(missionOptions(mission)).toEqual(['Choose an approved running mission', 'Reviewed (object plan)', 'Reviewed (stored plan)']);
        const submit = screen.getByRole('button', { name: 'Start approved execution workflow' });
        expect(submit).toBeDisabled();
        await user.selectOptions(mission, 'm-string');
        await user.click(submit);
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'run1' }));
        expect(api.start).toHaveBeenCalledWith({ workflow: 'executing', mission: 'm-string', request_key: expect.any(String) });
    });

    it('offers every approved running mission for a recorded-only workflow', async () => {
        const user = setupUser(); renderStart();
        await user.selectOptions(screen.getByLabelText('Saved workflow'), 'recorded');
        const mission = screen.getByLabelText('Mission for evidence (optional)');
        await waitFor(() => expect(mission).toBeEnabled());
        expect(missionOptions(mission)).toEqual(['No mission', ...missions.map((item) => item.title)]);
        expect(screen.getByRole('button', { name: 'Start recorded run' })).toBeEnabled();
    });

    it('starts nothing while the form is disabled by its parent', async () => {
        const user = setupUser(); const { api } = renderStart({ disabled: true });
        expect(screen.getByLabelText('Saved workflow')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Start recorded run' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Start recorded run' }));
        expect(api.start).not.toHaveBeenCalled();
    });

    it('keeps the form quiet when a start is refused without a message', async () => {
        const user = setupUser(); const { api, onSaved, onBusy } = renderStart();
        api.start.mockResolvedValue({ ok: false, reason: 'busy', error: '' });
        await user.selectOptions(screen.getByLabelText('Saved workflow'), 'recorded');
        await user.click(screen.getByRole('button', { name: 'Start recorded run' }));
        await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
        expect(onSaved).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start recorded run' })).toBeEnabled();
    });
});

describe('when missions cannot be loaded', () => {
    it('lets the operator retry loading missions', async () => {
        const user = setupUser();
        pb.__setError('missions');
        renderStart();
        expect(await screen.findByText('Could not load missions. Retry to link a mission.')).toHaveAttribute('role', 'alert');
        expect(screen.getByLabelText('Mission for evidence (optional)')).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Continue without a mission' })).not.toBeInTheDocument();
        pb.__clearError('missions');
        await user.click(screen.getByRole('button', { name: 'Retry missions' }));
        await waitFor(() => expect(screen.getByLabelText('Mission for evidence (optional)')).toBeEnabled());
        expect(screen.queryByText(/Could not load missions/)).not.toBeInTheDocument();
    });

    it('blocks a chosen mission that can no longer be verified until the operator drops it', async () => {
        const user = setupUser(); const { api, view, ui } = renderStart();
        await user.selectOptions(screen.getByLabelText('Saved workflow'), 'recorded');
        await waitFor(() => expect(screen.getByLabelText('Mission for evidence (optional)')).toBeEnabled());
        await user.selectOptions(screen.getByLabelText('Mission for evidence (optional)'), 'm-object');
        // The workspace changes under the open form and its mission list cannot be read.
        pb.__setError('missions');
        view.rerender(ui('ws_other'));
        expect(await screen.findByText(/Could not load missions/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start recorded run' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Continue without a mission' }));
        expect(screen.queryByRole('button', { name: 'Continue without a mission' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Start recorded run' }));
        await waitFor(() => expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ workflow: 'recorded', mission: '' })));
    });
});
