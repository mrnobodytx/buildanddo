// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/__tests__/WorkflowRunsPanel.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx
// DAG Node:    none
// Intent:      Hold run history navigation to opening, closing and paging runs through the URL and dialogs, and to dismissing an unavailable run.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = Object.assign(createMockPocketBase(), { send: vi.fn() });
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_collection, _verb, operation) => operation() }));

import pb from '@/lib/pocketbaseClient';
import WorkflowRunsPanel from '@/components/workspace/workflows/WorkflowRunsPanel';
import { setDemoMode } from '@/lib/demoWorkspace';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

const steps = [{ id: 'step1', name: 'Inspect the result', kind: 'read' }];
const workflow = { id: 'workflow1', name: 'Weekly check', status: 'active', steps, workspace: 'ws_test' };
const savedRun = (overrides = {}) => ({ id: 'run1', workspace: 'ws_test', workflow: workflow.id, status: 'running', next_step: 0,
    revision: 1, started_at: new Date().toISOString(),
    snapshot: { version: 1, name: 'Saved procedure', description: 'Saved description.', steps, mission_id: '', mission_title: '' },
    events: [], ...overrides });

function Location() { return <output data-testid="location">{useLocation().search}</output>; }
const renderPanel = (route = '/app/workflows') => renderWithProviders(<>
    <WorkflowRunsPanel workflows={[workflow]} workspaceId="ws_test" accountId="user_test" /><Location />
</>, { route });
const focusInsideDialog = () => waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement));

beforeEach(() => { pb.__reset(); pb.send.mockReset(); setDemoMode(false); });

describe('opening and closing runs', () => {
    it('opens a listed run into the review dialog and closes it with Escape, clearing the run link', async () => {
        const user = setupUser();
        pb.__setRecords('workflow_runs', [savedRun({ snapshot: { ...savedRun().snapshot, mission_title: 'Quarter close' } })]);
        renderPanel();
        expect(await screen.findByText('0 of 1 steps completed · Quarter close')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Open run run1' }));
        expect(await screen.findByRole('heading', { name: 'Saved procedure' })).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('?run=run1');
        await focusInsideDialog();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByTestId('location')).toBeEmptyDOMElement();
    });

    it('closes the start dialog with Escape without starting a run', async () => {
        const user = setupUser();
        renderPanel();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start a run' })).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'Start a run' }));
        expect(screen.getByRole('heading', { name: 'Start a recorded run' })).toBeInTheDocument();
        await focusInsideDialog();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('dismisses an unavailable linked run and removes it from the address', async () => {
        const user = setupUser();
        renderPanel('/app/workflows?run=missing');
        expect(await screen.findByText(/unavailable in the current workspace/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Close unavailable run' }));
        await waitFor(() => expect(screen.queryByText(/unavailable in the current workspace/)).not.toBeInTheDocument());
        expect(screen.getByTestId('location')).toBeEmptyDOMElement();
    });
});

describe('paging run history', () => {
    it('returns to the previous page of runs', async () => {
        const user = setupUser();
        pb.__setRecords('workflow_runs', Array.from({ length: 21 }, (_, index) => savedRun({ id: `run${index}`,
            snapshot: index === 20 ? 'unreadable' : savedRun().snapshot })));
        renderPanel();
        expect(await screen.findByText('Page 1 of 2 · 21 runs')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous runs' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Next runs' }));
        expect(await screen.findByText('Page 2 of 2 · 21 runs')).toBeInTheDocument();
        expect(screen.getByText('Saved workflow run')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next runs' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Previous runs' }));
        expect(await screen.findByText('Page 1 of 2 · 21 runs')).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: 'Open run run0' })).toBeInTheDocument();
        expect(pb.__collection('workflow_runs').getList).toHaveBeenLastCalledWith(1, 20, expect.any(Object));
    });
});
