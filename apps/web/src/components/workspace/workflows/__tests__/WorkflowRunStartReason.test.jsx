// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/__tests__/WorkflowRunStartReason.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx
// DAG Node:    none
// Intent:      Hold the disabled primary verb to giving its reason, and to giving it only when that reason is the true one.
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
import WorkflowRunsPanel from '@/components/workspace/workflows/WorkflowRunsPanel';
import { setDemoMode } from '@/lib/demoWorkspace';
import { renderWithProviders, screen, waitFor } from '@/test/utils';

const steps = [{ id: 'step1', name: 'Inspect the result', kind: 'read', detail: 'Use the saved evidence' }];
const saved = (overrides = {}) => ({ id: 'workflow1', name: 'Weekly check', description: 'Review a measured result.',
    status: 'draft', steps, workspace: 'ws_test', owner: 'user_test', ...overrides });
const panel = (props = {}) => <WorkflowRunsPanel workflows={[saved()]} workspaceId="ws_test" accountId="user_test" {...props} />;

beforeEach(() => { pb.__reset(); pb.send.mockReset(); setDemoMode(false); });

describe('why "Start a run" is unavailable', () => {
    // A new workspace's workflows are all drafts, so this is the first screen a
    // person sees - the greyed-out primary verb has to say what to do about it.
    it('names activation as the reason and binds the sentence to the button', async () => {
        renderWithProviders(panel());
        expect(await screen.findByText('No recorded runs match this view.')).toBeInTheDocument();
        const start = screen.getByRole('button', { name: 'Start a run' });
        expect(start).toBeDisabled();
        expect(start).toHaveAccessibleDescription(expect.stringMatching(/activat/i));
    });

    // The control: same component, one field changed. If the sentence survives an
    // active workflow it is decoration, not an explanation of this button's state.
    it('says nothing once a workflow is active', async () => {
        renderWithProviders(panel({ workflows: [saved({ status: 'active' })] }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start a run' })).toBeEnabled());
        expect(screen.queryByText(/activat/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start a run' })).toHaveAccessibleDescription('');
    });

    // Demo mode already prints its own reason below. Naming activation there would
    // send the person to fix a workflow that was never the thing in the way.
    it('does not blame activation when demo mode is what stops the run', async () => {
        renderWithProviders(panel({ demo: true }));
        expect(await screen.findByText(/Demo mode does not create workflow runs/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start a run' })).toHaveAccessibleDescription('');
    });
});
