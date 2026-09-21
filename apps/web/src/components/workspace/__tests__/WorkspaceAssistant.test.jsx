// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/__tests__/WorkspaceAssistant.test.jsx
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-21
// Depends:      apps/web/src/components/workspace/WorkspaceAssistant.jsx, tests/upgrade/assistant-fixture.mjs
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/web/src/components/workspace/WorkspaceAssistant.jsx; DEPENDS_ON tests/upgrade/assistant-fixture.mjs
// DAG Node:     none
// Intent:       Require rendered conversation recovery, reviewed form effects, current-account isolation and honest unavailable-provider states.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assistantFixture } from '../../../../../../tests/upgrade/assistant-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import WorkspaceAssistant from '@/components/workspace/WorkspaceAssistant';
import pb from '@/lib/pocketbaseClient';
const scope = vi.hoisted(() => ({ user: { id: 'editor' }, active: { id: 'ws1' }, demo: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: scope.user, isAuthed: true }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ active: scope.active }) }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => ({ data: { can_write: true } }) }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ demo: scope.demo }) }));
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: null }, send: vi.fn() } }));
let backend, loseChat, loseStart, delay;
beforeEach(() => {
    scope.user = { id: 'editor' }; scope.active = { id: 'ws1' }; scope.demo = false; pb.authStore.record = scope.user;
    backend = assistantFixture(); loseChat = false; loseStart = false; delay = null;
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{ width: 100, height: 20 }]);
    pb.send.mockReset().mockImplementation(async (path, options) => {
        const event = backend.event(pb.authStore.record.id, options.body || {}, { query: options.query || {}, workspace: path.split('/')[4] });
        const result = plain(path.endsWith('/chat') ? backend.service.chat(event) : options.method === 'GET' ? backend.service.snapshot(event) : backend.service.command(event));
        if (delay && path.endsWith('/chat')) await delay;
        if (loseChat && path.endsWith('/chat')) { loseChat = false; throw new Error('Synthetic lost reply'); }
        if (loseStart && options.body?.action === 'session.start') { loseStart = false; throw new Error('Synthetic lost session start'); }
        return result;
    });
});
afterEach(() => { vi.restoreAllMocks(); });
function Page() {
    const [title, setTitle] = useState('');
    return <MemoryRouter initialEntries={['/app/erp']}><main data-assistant-surface><label>Task title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label></main><WorkspaceAssistant /></MemoryRouter>;
}
async function compose(user) {
    await user.click(screen.getByRole('button', { name: 'Assistant', exact: true }));
    await user.type(screen.getByLabelText('What would you like to do?'), 'Help me with the customer task');
}
it('keeps inference separate from reviewed form interaction and retains personal patterns afterward', async () => {
    const user = userEvent.setup(); render(<Page />); await compose(user);
    await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await screen.findByRole('region', { name: 'Proposed actions' });
    expect(screen.getByLabelText('Task title')).toHaveValue(''); expect(backend.data.assistant_patterns).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Apply reviewed steps' }));
    await waitFor(() => expect(backend.data.assistant_patterns).toHaveLength(1));
    expect(screen.getByLabelText('Task title')).toHaveValue('Customer follow-up');
    expect(backend.data.assistant_patterns[0].owner).toBe('editor');
});
it('recovers a lost inferred response without another provider call', async () => {
    const user = userEvent.setup(); render(<Page />); await compose(user); loseChat = true;
    await user.click(screen.getByRole('button', { name: 'Ask assistant' })); await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Retry message' })); await screen.findByRole('region', { name: 'Proposed actions' });
    expect(backend.agentConfig.calls).toHaveLength(1); expect(backend.data.assistant_turns).toHaveLength(1);
});
it('recovers the original session start even if the user edits the first message after response loss', async () => {
    const user = userEvent.setup(); render(<Page />); await compose(user); loseStart = true;
    await user.click(screen.getByRole('button', { name: 'Ask assistant' })); await screen.findByRole('alert');
    await user.type(screen.getByLabelText('What would you like to do?'), ' with a due date');
    await user.click(screen.getByRole('button', { name: 'Ask assistant' })); await screen.findByRole('region', { name: 'Proposed actions' });
    expect(backend.data.assistant_sessions).toHaveLength(1);
});
it('discards delayed replies and private history when the account changes', async () => {
    let release; delay = new Promise((resolve) => { release = resolve; }); const user = userEvent.setup(), view = render(<Page />);
    await compose(user); await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await waitFor(() => expect(backend.agentConfig.calls).toHaveLength(1));
    scope.user = { id: 'owner' }; pb.authStore.record = scope.user; view.rerender(<Page />);
    await act(async () => { release(); });
    await user.click(screen.getByRole('button', { name: 'Assistant', exact: true }));
    expect(screen.queryByRole('region', { name: 'Proposed actions' })).not.toBeInTheDocument();
    expect(screen.queryByText('Review a proposed task title.')).not.toBeInTheDocument();
});
it('demo mode makes no native or model requests', async () => {
    scope.demo = true; const user = userEvent.setup(); render(<Page />); await user.click(screen.getByRole('button', { name: 'Assistant', exact: true }));
    expect(screen.getByText(/Sign in to use saved assistant sessions/)).toBeInTheDocument(); expect(pb.send).not.toHaveBeenCalled();
});
it('shows unavailable inference without fabricating proposed actions', async () => {
    backend.agentConfig.enabled = false; const user = userEvent.setup(); render(<Page />); await compose(user);
    expect(await screen.findByText(/provider is not connected yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await screen.findByText(/message is retained for retry/); expect(screen.queryByRole('region', { name: 'Proposed actions' })).not.toBeInTheDocument();
});
