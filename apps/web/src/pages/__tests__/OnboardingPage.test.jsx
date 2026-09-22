// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/pages/__tests__/OnboardingPage.test.jsx
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-21
// Depends:      apps/web/src/pages/OnboardingPage.jsx, apps/pocketbase/pb_hooks/workspace-onboarding.js
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/web/src/pages/OnboardingPage.jsx; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-onboarding.js
// DAG Node:     none
// Intent:       Exercise the actual onboarding page with native command fixtures, lost responses, rollback and account changes.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { fixture, plain } from '../../../../../tests/upgrade/admin-fixture.mjs';
import OnboardingPage from '@/pages/OnboardingPage';
import pb from '@/lib/pocketbaseClient';
const scope = vi.hoisted(() => ({ user: { id: 'newuser' }, refresh: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: scope.user }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ refresh: scope.refresh }) }));
vi.mock('@/components/motion/MotionPrimitives', () => ({ MotionEntrance: ({ children }) => children }));
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: null }, send: vi.fn() } }));
let backend, loseReply, delay;
beforeEach(() => {
    scope.user = { id: 'newuser' }; pb.authStore.record = scope.user; scope.refresh.mockReset().mockResolvedValue(undefined);
    backend = fixture({ runtime: { $security: { sha256: (value) => createHash('sha256').update(value).digest('hex') } } });
    backend.migration('apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js').up(); loseReply = false; delay = null;
    pb.send.mockReset().mockImplementation(async (path, { body }) => {
        expect(path).toBe('/api/buildanddo/onboarding');
        const value = plain(backend.load('workspace-onboarding.js').create(backend.event(pb.authStore.record.id, body)));
        if (delay) await delay;
        if (loseReply) { loseReply = false; throw new Error('Synthetic lost setup response'); }
        return value;
    });
});
function Page() {
    return <MemoryRouter initialEntries={[{ pathname: '/onboarding', state: { returnTo: '/app/erp' } }]}><Routes>
        <Route path="/onboarding" element={<OnboardingPage />} /><Route path="/app/erp" element={<p>Workspace ERP desk</p>} />
    </Routes></MemoryRouter>;
}
async function select(user) {
    await user.click(screen.getByRole('button', { name: 'Continue without a website' }));
    await user.type(screen.getByLabelText('Workspace name'), 'Appointment shop');
}
it('creates the complete initial workspace through native onboarding before opening the requested desk', async () => {
    const user = userEvent.setup(); render(<Page />); await select(user); await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Workspace ERP desk')).toBeVisible();
    expect(backend.data.workspace_onboarding).toHaveLength(1);
    expect(backend.data.services.filter((item) => item.workspace === backend.data.workspace_onboarding[0].workspace)).toHaveLength(7);
    expect(backend.data.services.every((item) => item.status === 'planned')).toBe(true);
    expect(scope.refresh).toHaveBeenCalledTimes(1);
    expect(scope.refresh).toHaveBeenCalledWith(backend.data.workspace_onboarding[0].workspace);
    expect(backend.data.workspaces.find((row) => row.id === backend.data.workspace_onboarding[0].workspace).name).toBe('Appointment shop');
});
it('requires an explicit name so separate website-less businesses are not collapsed into one setup', async () => {
    const user = userEvent.setup(); render(<Page />);
    await user.click(screen.getByRole('button', { name: 'Continue without a website' }));
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(screen.getByLabelText('Workspace name')).toBeInvalid();
    expect(pb.send).not.toHaveBeenCalled();
});
it('recovers a lost setup response without creating another workspace or service set', async () => {
    const user = userEvent.setup(); render(<Page />); await select(user); loseReply = true;
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Retry these same details');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Workspace ERP desk')).toBeVisible();
    expect(backend.data.workspace_onboarding).toHaveLength(1); expect(backend.data.services).toHaveLength(7);
});
it('retains the selected setup after a storage failure and rolls back partial records', async () => {
    const user = userEvent.setup(); render(<Page />); await select(user);
    const save = backend.app.save.bind(backend.app);
    backend.app.save = (record) => { if (record.getString?.('name') === 'Tutorial system') throw new Error('Synthetic unavailable store'); return save(record); };
    await user.click(screen.getByRole('button', { name: 'Create workspace' })); await screen.findByRole('alert');
    expect(backend.data.workspace_onboarding).toHaveLength(0); expect(backend.data.services).toHaveLength(0);
    backend.app.save = save; await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Workspace ERP desk')).toBeVisible();
});
it('clears selected business data and suppresses delayed navigation when the account changes', async () => {
    let release; delay = new Promise((resolve) => { release = resolve; }); const user = userEvent.setup(), view = render(<Page />);
    await select(user); await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(pb.send).toHaveBeenCalledTimes(1));
    scope.user = { id: 'owner' }; pb.authStore.record = scope.user; view.rerender(<Page />);
    await act(async () => { release(); });
    expect(screen.queryByText('Workspace ERP desk')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue without a website' })).toBeVisible();
    expect(scope.refresh).not.toHaveBeenCalled();
});
it('domain selection remains illustrative and cannot create a workspace until explicitly selected', async () => {
    const user = userEvent.setup(); render(<Page />);
    expect(screen.getByText(/no live DNS/)).toBeVisible();
    await user.type(screen.getByLabelText('Domain or business name'), 'shop.example'); await user.click(screen.getByRole('button', { name: 'Search', exact: true }));
    expect(pb.send).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Create workspace' })).not.toBeInTheDocument();
});
