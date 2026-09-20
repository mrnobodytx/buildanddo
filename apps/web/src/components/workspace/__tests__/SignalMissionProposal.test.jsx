// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/SignalMissionProposal.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/components/workspace/SignalMissionProposal.jsx, tests/upgrade/research-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/SignalMissionProposal.jsx; CONSUMES tests/upgrade/research-fixture.mjs
// Intent:      Require rendered explicit proposal, recovery, account isolation and read-only behavior before accepting the signal journey.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { researchFixture } from '../../../../../../tests/upgrade/research-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import SignalMissionProposal from '@/components/workspace/SignalMissionProposal';
import pb from '@/lib/pocketbaseClient';

const scope = vi.hoisted(() => ({ user: { id: 'editor' }, active: { id: 'ws1' }, demo: false, writable: true }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: scope.user, isAuthed: !!scope.user }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ active: scope.active }) }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => ({ loading: false, data: { can_write: scope.writable } }) }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ demo: scope.demo }) }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));

let backend, signal, loseNext, delay;
beforeEach(() => {
    scope.user = { id: 'editor' }; scope.active = { id: 'ws1' }; scope.demo = false; scope.writable = true;
    pb.authStore.record = scope.user; loseNext = false; delay = null;
    backend = researchFixture();
    backend.seed('signals', { id: 'signal1', workspace: 'ws1', owner: 'editor', title: 'Synthetic appointment observation',
        description: 'A fixture observation needs review.', source: 'Disposable source', type: 'fact', state: 'new' });
    signal = plain(backend.data.signals[0]);
    pb.send.mockReset().mockImplementation(async (_path, request) => {
        const result = plain(backend.service.command(backend.event(pb.authStore.record.id, request.body)));
        if (delay) await delay;
        if (loseNext) { loseNext = false; throw new Error('Synthetic accepted response loss'); }
        return result;
    });
});
afterEach(() => { vi.restoreAllMocks(); });

function view(record = signal) {
    return <MemoryRouter><SignalMissionProposal signal={record} onClose={vi.fn()} /></MemoryRouter>;
}

it('writes only after an explicit action and links to the unapproved mission', async () => {
    const user = userEvent.setup(); render(view());
    expect(pb.send).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save proposal' }));
    const link = await screen.findByRole('link', { name: 'Open mission' });
    const proposal = backend.data.missions.at(-1);
    expect(link).toHaveAttribute('href', `/app/missions?mission=${proposal.id}`);
    expect(proposal.status).toBe('proposed');
    expect(proposal.mission_plan.independent_review).toBe(true);
    expect(backend.data.signals[0].state).toBe('new');
});

it('recovers a lost save after the same signal record is refreshed', async () => {
    const user = userEvent.setup(); const rendered = render(view()); loseNext = true;
    await user.click(screen.getByRole('button', { name: 'Save proposal' }));
    await screen.findByRole('button', { name: 'Recover proposal' });
    rendered.rerender(view({ ...signal }));
    await user.click(screen.getByRole('button', { name: 'Recover proposal' }));
    await screen.findByRole('link', { name: 'Open mission' });
    expect(backend.data.evidence).toHaveLength(1);
    expect(pb.send.mock.calls[0][1].body.request_key).toBe(pb.send.mock.calls[1][1].body.request_key);
});

it('recovers the same mission after an uncertain dialog is unmounted and reopened', async () => {
    const user = userEvent.setup(); const rendered = render(view()); loseNext = true;
    await user.click(screen.getByRole('button', { name: 'Save proposal' }));
    await screen.findByRole('button', { name: 'Recover proposal' }); rendered.unmount();
    render(view()); await user.click(screen.getByRole('button', { name: 'Save proposal' }));
    await screen.findByRole('link', { name: 'Open mission' });
    expect(backend.data.evidence).toHaveLength(1);
    expect(pb.send.mock.calls[0][1].body.request_key).toBe(pb.send.mock.calls[1][1].body.request_key);
});

it('disables writes for demonstration mode and viewer access', () => {
    scope.demo = true; const rendered = render(view());
    expect(screen.getByRole('button', { name: 'Save proposal' })).toBeDisabled();
    scope.demo = false; scope.writable = false; rendered.rerender(view());
    expect(screen.getByRole('button', { name: 'Save proposal' })).toBeDisabled();
    expect(pb.send).not.toHaveBeenCalled();
});

it('discards a late response when the account and workspace change', async () => {
    let release; delay = new Promise((resolve) => { release = resolve; });
    const user = userEvent.setup(); const rendered = render(view());
    await user.click(screen.getByRole('button', { name: 'Save proposal' }));
    await waitFor(() => expect(pb.send).toHaveBeenCalledTimes(1));
    scope.user = { id: 'other-account' }; scope.active = { id: 'ws2' }; pb.authStore.record = scope.user;
    rendered.rerender(view());
    await act(async () => { release(); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open mission' })).not.toBeInTheDocument();
});

it('shows a stale source conflict without creating a mission', async () => {
    const user = userEvent.setup(); const current = backend.app.findRecordById('signals', signal.id);
    current.set('updated', '2026-09-20 23:59:59.000Z'); backend.app.save(current);
    signal.updated = '2020-01-01 00:00:00.000Z';
    render(view()); await user.click(screen.getByRole('button', { name: 'Save proposal' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('link', { name: 'Open mission' })).not.toBeInTheDocument();
    expect(backend.data.evidence).toHaveLength(0);
});
