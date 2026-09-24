// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/SprintJourney.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/components/workspace/SourceCapture.jsx, apps/web/src/components/workspace/ConnectorBinding.jsx, apps/web/src/components/workspace/EvidenceInspector.jsx, apps/web/src/components/workspace/MissionReplayCapture.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/SourceCapture.jsx; VALIDATES apps/web/src/components/workspace/ConnectorBinding.jsx; VALIDATES apps/web/src/components/workspace/EvidenceInspector.jsx; VALIDATES apps/web/src/components/workspace/MissionReplayCapture.jsx
// Intent:      Exercise visible capture recovery, expiring connections, retained review inspection and truthful mission exports with explicit transport fixtures.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import SourceCapture from '@/components/workspace/SourceCapture';
import EvidenceInspector from '@/components/workspace/EvidenceInspector';
import MissionReplayCapture from '@/components/workspace/MissionReplayCapture';

const state = vi.hoisted(() => ({ integrations: null, api: { command: vi.fn(), read: vi.fn(), captureMission: vi.fn() } }));
vi.mock('@/hooks/useBusinessExecution', () => ({ useBusinessExecution: () => ({ api: state.api, scope: 'owner:ws1:false', demo: false }) }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => ({ data: { can_write: true } }) }));
vi.mock('@/hooks/useWorkspaceControl', () => ({ useWorkspaceControl: () => state.integrations }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: () => ({ records: [{ id: 'mission1', workspace: 'ws1', title: 'Customer follow-up' }], loading: false, degraded: false }) }));

beforeEach(() => {
    for (const method of Object.values(state.api)) method.mockReset();
    state.integrations = { loading: false, error: '', refresh: vi.fn(), data: { items: [{ id: 'firecrawl', provider: 'firecrawl',
        desired_enabled: true, configuration: { mode: 'read', binding: 'public-read' },
        observation: { current: true, state: 'healthy', at: new Date().toISOString(), receipt_ref: 'synthetic-probe' } }] } };
});
afterEach(() => { vi.useRealTimers(); });

it('recovers a lost capture reply with unchanged source, binding and request identity', async () => {
    const user = setupUser();
    state.api.command.mockResolvedValueOnce({ ok: false, reason: 'uncertain', error: 'Response lost' })
        .mockResolvedValueOnce({ ok: true, data: { id: 'job1', workspace: 'ws1', status: 'queued', revision: 1 } });
    renderWithProviders(<SourceCapture onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText('Source URL'), 'https://example.org/source');
    await user.selectOptions(screen.getByLabelText('Registered firecrawl connection'), 'public-read');
    await user.click(screen.getByRole('button', { name: 'Request capture' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Response lost');
    expect(screen.getByLabelText('Source URL')).toBeDisabled();
    expect(screen.getByLabelText('Registered firecrawl connection')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Recover capture request' }));
    await screen.findByText('Capture job1: queued');
    expect(state.api.command.mock.calls[1][0]).toEqual(state.api.command.mock.calls[0][0]);
    expect(screen.getByRole('link', { name: 'View this receipt' })).toHaveAttribute('href', '/app/replay?action=job1');
});

it('stops offering a new capture when the observed connection expires without another read', () => {
    vi.useFakeTimers();
    renderWithProviders(<SourceCapture onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Registered firecrawl connection'), { target: { value: 'public-read' } });
    expect(screen.getByRole('button', { name: 'Request capture' })).toBeEnabled();
    act(() => { vi.advanceTimersByTime(16 * 60_000); });
    expect(screen.getByRole('button', { name: 'Request capture' })).toBeDisabled();
    expect(screen.getByText(/fresh health check/)).toBeVisible();
    expect(state.api.command).not.toHaveBeenCalled();
});

it('opens retained review bytes and leaves an unsafe evidence URL inert', () => {
    const record = { id: 'evidence1', workspace: 'ws1', mission: 'mission1', owner: 'owner', title: 'Measured outcome', source: 'Local log', content: 'Changed observation', url: 'javascript:alert(1)' };
    const mission = { id: 'mission1', workspace: 'ws1', title: 'Follow-up', status: 'verified', mission_reviewed_by: 'reviewer',
        mission_review: { evidence_snapshot: [{ ...record, content: 'Reviewed observation' }] } };
    renderWithProviders(<EvidenceInspector id={record.id} workspace="ws1" records={[record]} missions={[mission]} onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('differs from the reviewed snapshot');
    expect(screen.queryByRole('link', { name: 'Open source' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Exact reviewed observation'));
    expect(screen.getByText(/"content": "Reviewed observation"/)).toBeVisible();
});

it('makes unavailable evidence explicit without rendering a previous scope', () => {
    renderWithProviders(<EvidenceInspector id="foreign" workspace="ws1" records={[{ id: 'foreign', workspace: 'ws2', content: 'Foreign observation' }]} missions={[]} onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable in the current workspace');
    expect(screen.queryByText('Foreign observation')).not.toBeInTheDocument();
});

it('retains capture gaps and does not present a downloadable history after a failed read', async () => {
    state.api.captureMission.mockResolvedValue({ ok: false, error: 'History exceeds the bounded export limit' });
    renderWithProviders(<MissionReplayCapture api={state.api} demo={false} />, { route: '/app/replay?mission=mission1' });
    expect(await screen.findByRole('alert')).toHaveTextContent('bounded export limit');
    expect(screen.queryByRole('button', { name: 'Export complete mission history' })).not.toBeInTheDocument();
    await waitFor(() => expect(state.api.captureMission).toHaveBeenCalledWith('mission1'));
});
