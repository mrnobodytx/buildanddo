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
const scope = vi.hoisted(() => ({ user: { id: 'editor' }, active: { id: 'ws1' }, demo: false, sessionEpoch: 1,
    access: { data: { role: 'editor', can_write: true }, loading: false, error: '' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: scope.user, isAuthed: Boolean(scope.user),
    sessionEpoch: scope.sessionEpoch, isSessionCurrent: scope.isSessionCurrent }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ active: scope.active }) }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => scope.access }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ demo: scope.demo }) }));
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: null }, send: vi.fn() } }));
let backend, loseChat, loseStart, delay, commandDelay;
beforeEach(() => {
    scope.user = { id: 'editor' }; scope.active = { id: 'ws1' }; scope.demo = false; pb.authStore.record = scope.user;
    scope.sessionEpoch = 1; scope.access = { data: { role: 'editor', can_write: true }, loading: false, error: '' };
    scope.isSessionCurrent = (epoch) => Boolean(scope.user) && epoch === scope.sessionEpoch;
    backend = assistantFixture(); loseChat = false; loseStart = false; delay = null; commandDelay = null;
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{ width: 100, height: 20 }]);
    pb.send.mockReset().mockImplementation(async (path, options) => {
        const event = backend.event(pb.authStore.record.id, options.body || {}, { query: options.query || {}, workspace: path.split('/')[4] });
        const result = plain(path.endsWith('/chat') ? backend.service.chat(event) : options.method === 'GET' ? backend.service.snapshot(event) : backend.service.command(event));
        if (delay && path.endsWith('/chat')) await delay;
        if (commandDelay && commandDelay.action === options.body?.action) await commandDelay.promise;
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
it.each(['regrant', 'denial'])('withholds delayed chat content during polling before %s without an automatic resend', async (outcome) => {
    const session = backend.start('editor');
    const user = userEvent.setup(), view = render(<Page />);
    await user.click(screen.getByRole('button', { name: 'Assistant', exact: true }));
    await screen.findByRole('option', { name: /Plan a business task/ });
    await user.selectOptions(screen.getByLabelText('Resume a session'), session.id);
    await user.type(screen.getByLabelText('What would you like to do?'), 'Help with the customer task');
    let release; delay = new Promise((resolve) => { release = resolve; });
    await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await waitFor(() => expect(backend.agentConfig.calls).toHaveLength(1));
    const original = structuredClone(pb.send.mock.calls.find(([path]) => path.endsWith('/chat'))[1].body);
    const turnId = backend.data.assistant_turns[0].id;
    scope.access = { ...scope.access, loading: true }; view.rerender(<Page />);
    await act(async () => { release(); });
    expect(screen.queryByRole('region', { name: 'Proposed actions' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Review a proposed task title/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Customer follow-up/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('What would you like to do?')).toHaveValue('Help with the customer task');
    expect(screen.getByRole('button', { name: 'Retry message' })).toBeDisabled();
    expect(pb.send.mock.calls.filter(([path]) => path.endsWith('/chat'))).toHaveLength(1);
    if (outcome === 'denial') {
        backend.app.delete(backend.app.findRecordById('workspace_members', 'editormember'));
        scope.access = { data: null, loading: false, error: 'Membership revoked', accessEpoch: 1 };
        view.rerender(<Page />);
        expect(screen.queryByRole('region', { name: 'BuildAndDo assistant' })).not.toBeInTheDocument();
        expect(pb.send.mock.calls.filter(([path]) => path.endsWith('/chat'))).toHaveLength(1);
    } else {
        scope.access = { ...scope.access, loading: false }; view.rerender(<Page />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Retry message' })).toBeEnabled());
        expect(pb.send.mock.calls.filter(([path]) => path.endsWith('/chat'))).toHaveLength(1);
        expect(screen.queryByRole('region', { name: 'Proposed actions' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Retry message' }));
        await screen.findByRole('region', { name: 'Proposed actions' });
        const chats = pb.send.mock.calls.filter(([path]) => path.endsWith('/chat'));
        expect(chats).toHaveLength(2); expect(chats[1][1].body).toEqual(original);
        expect(backend.data.assistant_turns).toHaveLength(1);
        expect(backend.data.assistant_turns[0].id).toBe(turnId);
    }
    expect(backend.agentConfig.calls).toHaveLength(1);
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
it('keeps the composer and session through same-identity refreshes while pausing pending authorization', async () => {
    const user = userEvent.setup(), view = render(<Page />); await compose(user);
    await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await screen.findByRole('region', { name: 'Proposed actions' });
    const session = screen.getByLabelText('Resume a session').value;
    await user.type(screen.getByLabelText('What would you like to do?'), 'Keep this unsent follow-up');
    scope.user = { ...scope.user, name: 'Fresh native record' }; pb.authStore.record = scope.user;
    scope.active = { ...scope.active }; scope.access = { ...scope.access, loading: true }; view.rerender(<Page />);
    expect(screen.getByLabelText('What would you like to do?')).toHaveValue('Keep this unsent follow-up');
    expect(screen.getByRole('button', { name: 'Ask assistant' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply reviewed steps' })).toBeDisabled();
    const calls = pb.send.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Apply reviewed steps' }));
    expect(screen.getByLabelText('Task title')).toHaveValue(''); expect(pb.send).toHaveBeenCalledTimes(calls);
    scope.access = { data: { role: 'editor', can_write: true }, loading: false, error: '' }; view.rerender(<Page />);
    expect(screen.getByLabelText('Resume a session')).toHaveValue(session);
    expect(screen.getByLabelText('What would you like to do?')).toHaveValue('Keep this unsent follow-up');
    expect(screen.getByRole('button', { name: 'Apply reviewed steps' })).toBeEnabled();
    expect(backend.data.assistant_sessions).toHaveLength(1);
});
it('settles a persisted Forget during permission polling and can start a new conversation after recovery', async () => {
    const user = userEvent.setup(), view = render(<Page />); await compose(user);
    await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Forget session', exact: true })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Forget session', exact: true }));
    let release;
    commandDelay = { action: 'session.forget', promise: new Promise((resolve) => { release = resolve; }) };
    await user.click(screen.getByRole('button', { name: 'Confirm forget' }));
    await waitFor(() => expect(backend.data.assistant_sessions).toHaveLength(0));
    scope.access = { ...scope.access, loading: true }; view.rerender(<Page />);
    const calls = pb.send.mock.calls.length;
    await act(async () => { release(); });
    expect(screen.getByText(/This session and its personal patterns were removed/)).toBeVisible();
    expect(screen.getByLabelText('Resume a session')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Forget session', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New session', exact: true })).toBeDisabled();
    expect(pb.send).toHaveBeenCalledTimes(calls);
    scope.access = { ...scope.access, loading: false }; view.rerender(<Page />);
    await user.type(screen.getByLabelText('What would you like to do?'), 'A new conversation');
    await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await screen.findByRole('region', { name: 'Proposed actions' });
    expect(backend.data.assistant_sessions).toHaveLength(1);
    expect(pb.send.mock.calls.filter(([, options]) => options.body?.action === 'session.forget')).toHaveLength(1);
});
it('settles an applied interaction receipt during polling without offering to apply or record it again', async () => {
    const user = userEvent.setup(), view = render(<Page />); await compose(user);
    await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply reviewed steps' })).toBeEnabled());
    let release;
    commandDelay = { action: 'plan.record', promise: new Promise((resolve) => { release = resolve; }) };
    await user.click(screen.getByRole('button', { name: 'Apply reviewed steps' }));
    await waitFor(() => expect(backend.data.assistant_patterns).toHaveLength(1));
    scope.access = { ...scope.access, loading: true }; view.rerender(<Page />);
    const calls = pb.send.mock.calls.length;
    await act(async () => { release(); });
    expect(screen.getByText(/Interaction recorded in your personal knowledge/)).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Proposed actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry saving interaction record' })).not.toBeInTheDocument();
    expect(pb.send).toHaveBeenCalledTimes(calls);
    scope.access = { ...scope.access, loading: false }; view.rerender(<Page />);
    expect(screen.getByLabelText('Task title')).toHaveValue('Customer follow-up');
    expect(pb.send.mock.calls.filter(([, options]) => options.body?.action === 'plan.record')).toHaveLength(1);
});
it('does not move focus from a native field when permission polling recovers', async () => {
    const user = userEvent.setup(), view = render(<Page />);
    await user.click(screen.getByRole('button', { name: 'Assistant', exact: true }));
    expect(screen.getByLabelText('What would you like to do?')).toHaveFocus();
    const field = screen.getByLabelText('Task title');
    await user.click(field); await user.type(field, 'Keep editing the native desk');
    scope.access = { ...scope.access, loading: true }; view.rerender(<Page />);
    expect(field).toHaveFocus();
    scope.access = { ...scope.access, loading: false, data: { ...scope.access.data } }; view.rerender(<Page />);
    expect(field).toHaveFocus(); expect(field).toHaveValue('Keep editing the native desk');
    await user.click(screen.getByRole('button', { name: 'Close assistant' }));
    await user.click(screen.getByRole('button', { name: 'Assistant', exact: true }));
    expect(screen.getByLabelText('What would you like to do?')).toHaveFocus();
});
it.each(['workspace', 'session', 'revoke', 'role', 'logout'])('fences delayed replies across a %s boundary even when the original scope returns', async (boundary) => {
    let release; delay = new Promise((resolve) => { release = resolve; }); const user = userEvent.setup(), view = render(<Page />);
    await compose(user); await user.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await waitFor(() => expect(backend.agentConfig.calls).toHaveLength(1));
    if (boundary === 'workspace') scope.active = { id: 'ws2' };
    if (boundary === 'session') scope.sessionEpoch++;
    if (boundary === 'revoke') scope.access = { data: null, loading: false, error: 'Membership revoked' };
    if (boundary === 'role') scope.access = { data: { role: 'viewer', can_write: false }, loading: false, error: '' };
    if (boundary === 'logout') { scope.user = null; pb.authStore.record = null; }
    view.rerender(<Page />);
    scope.user = { id: 'editor' }; pb.authStore.record = scope.user; scope.active = { id: 'ws1' };
    scope.access = { data: { role: 'editor', can_write: true }, loading: false, error: '' }; view.rerender(<Page />);
    await act(async () => { release(); });
    await user.click(screen.getByRole('button', { name: 'Assistant', exact: true }));
    expect(screen.queryByRole('region', { name: 'Proposed actions' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('What would you like to do?')).toHaveValue('');
    expect(screen.getByLabelText('Resume a session')).toHaveValue('');
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
