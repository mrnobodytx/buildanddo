// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/ClassroomsFlow.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/pages/workspace/ClassroomsPage.jsx, tests/upgrade/classroom-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/ClassroomsPage.jsx; CONSUMES tests/upgrade/classroom-fixture.mjs
// DAG Node:    none
// Intent:      Verify the rendered classroom controls and navigation against the real browser adapter and backend policies.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { classroomFixture } from '../../../../../../tests/upgrade/classroom-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import ClassroomsPage from '@/pages/workspace/ClassroomsPage';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { act, renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'owner' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
let backend;
function send(path, options) {
    const parts = path.split('/');
    const e = backend.event(pb.authStore.record.id, options.body || {}, { workspace: parts[4], id: parts[6], query: options.query || {} });
    try {
        return plain(options.method === 'POST' ? path.endsWith('/presence') ? backend.service.heartbeat(e) : backend.service.command(e) : parts[6] ? backend.service.detail(e) : backend.service.list(e));
    } catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
}
function renderRoom(id = '', actor = 'owner', route = '') {
    pb.authStore.record = { id: actor };
    return renderWithProviders(<Routes>
        <Route path="/app/classrooms" element={<ClassroomsPage />} /><Route path="/app/classrooms/:roomId" element={<ClassroomsPage />} />
        <Route path="/app/tutorials" element={<p>Personal Field Manual</p>} />
    </Routes>, { route: route || `/app/classrooms${id ? '/' + id : ''}`, auth: { user: { id: actor }, isAuthed: true }, workspace: { active: { id: 'ws1', owner: 'owner' } } });
}
const started = () => { const room = backend.create(); backend.command('room.start', { id: room.id }); return room.id; };
beforeEach(() => { backend = classroomFixture(); pb.send.mockReset(); pb.send.mockImplementation(async (...args) => send(...args)); setDemoMode(false); });
afterEach(() => { setDemoMode(false); vi.restoreAllMocks(); });

describe('classroom website flow', () => {
    it('schedules from the room list, opens the saved room and starts an actual lesson session', async () => {
        const user = setupUser(); renderRoom();
        await user.click(await screen.findByRole('button', { name: 'Schedule a class' }));
        const dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Class title'), 'Evidence reading group');
        await user.type(dialog.getByLabelText('What will you work on?'), 'Work through the first example.');
        await user.click(dialog.getByRole('button', { name: 'Schedule class' }));
        expect(await screen.findByRole('heading', { name: 'Evidence reading group' })).toBeVisible();
        expect(backend.data.classroom_rooms[0].status).toBe('scheduled');
        await user.click(await screen.findByRole('button', { name: 'Start lesson session' }));
        expect(await screen.findByText('You are attending')).toBeVisible();
        expect(backend.data.classroom_rooms[0].status).toBe('live');
        expect(screen.getByRole('heading', { name: 'Attending (1)' })).toBeVisible();
        expect(screen.getByText(/Voice and video are not connected/)).toBeVisible();
    });

    it('allows a viewer to join and leave while reserving discussion and host controls for writers', async () => {
        const id = started(); const user = setupUser(); renderRoom(id, 'viewer');
        await user.click(await screen.findByRole('button', { name: 'Join class' }));
        expect(await screen.findByText('You are attending')).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Attending (2)' })).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Post to class' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'End class' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave class' }));
        expect(await screen.findByRole('button', { name: 'Join class' })).toBeEnabled();
    });

    it('keeps an interrupted discussion save and recovers exactly one message', async () => {
        const id = started(); const user = setupUser(); renderRoom(id);
        await user.type(await screen.findByLabelText('Question or note'), 'Where is the measurement?');
        let lost = true;
        pb.send.mockImplementation(async (...args) => { const value = send(...args); if (args[1].body?.action === 'room.message' && lost) { lost = false; throw new Error('Accepted response lost'); } return value; });
        await user.click(screen.getByRole('button', { name: 'Post to class' }));
        expect(await screen.findByRole('button', { name: 'Retry previous save' })).toBeEnabled();
        expect(screen.getByLabelText('Question or note')).toHaveValue('Where is the measurement?');
        expect(screen.getByLabelText('Question or note')).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Retry previous save' }));
        const discussion = within(await screen.findByRole('list', { name: 'Class messages' }));
        expect(discussion.getAllByText('Where is the measurement?')).toHaveLength(1);
        expect(backend.data.classroom_messages).toHaveLength(1);
        expect(screen.getByLabelText('Question or note')).toHaveValue('');
    });

    it('follows a changed lesson section, links personal study and keeps ended discussion readable', async () => {
        const id = started(); backend.command('room.message', { id, body: 'An observation to revisit.' });
        const user = setupUser(); renderRoom(id, 'editor');
        expect(await screen.findByText(backend.lessons[0].lesson.sections[0].heading)).toBeVisible();
        backend.command('room.lesson', { id, tutorial: backend.lessons[0].id, section: 1 });
        await user.click(screen.getByRole('button', { name: 'Refresh classrooms' }));
        expect(await screen.findByText(backend.lessons[0].lesson.sections[1].heading)).toBeVisible();
        expect(screen.getByRole('link', { name: /Read the full lesson/ })).toHaveAttribute('href', `/app/tutorials?lesson=${backend.lessons[0].id}`);
        backend.command('room.end', { id });
        await user.click(screen.getByRole('button', { name: 'Refresh classrooms' }));
        expect(await screen.findByText('Ended', { exact: true })).toBeVisible();
        expect(screen.getByText('An observation to revisit.')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Join class' })).not.toBeInTheDocument();
    });

    it('preserves a conflicting schedule draft until the host chooses the latest saved details', async () => {
        const room = backend.create(); const user = setupUser(); renderRoom(room.id);
        await user.click(await screen.findByRole('button', { name: 'Edit class details' }));
        let dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Class title'), ' My edit');
        backend.command('room.update', { id: room.id, title: 'Newer title', description: 'Other editor', tutorial: backend.lessons[0].id, starts_at: '' });
        await user.click(dialog.getByRole('button', { name: 'Save class details' }));
        expect(await dialog.findByRole('alert')).toHaveTextContent(/changed/);
        expect(dialog.getByLabelText('Class title')).toHaveValue('Evidence workshop My edit');
        await user.click(dialog.getByRole('button', { name: 'Use latest saved class details' }));
        expect(dialog.getByLabelText('Class title')).toHaveValue('Newer title');
        await user.type(dialog.getByLabelText('Class title'), ' reviewed');
        await user.click(dialog.getByRole('button', { name: 'Save class details' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'Edit class details' }));
        dialog = within(screen.getByRole('dialog'));
        expect(dialog.getByLabelText('Class title')).toHaveValue('Newer title reviewed');
    });

    it('requires a host confirmation to end the class and does not create a media connection', async () => {
        const id = started(); const user = setupUser(); renderRoom(id);
        await user.click(await screen.findByRole('button', { name: 'End class' }));
        const dialog = within(screen.getByRole('dialog'));
        expect(backend.data.classroom_rooms[0].status).toBe('live');
        await user.click(dialog.getByRole('button', { name: 'Confirm end' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByText('Ended', { exact: true })).toBeVisible();
        expect(document.querySelector('video, iframe')).toBeNull();
    });

    it('retains a draft during a transport outage but removes the room when membership is revoked', async () => {
        const id = started(); backend.command('room.join', { id }, { actor: 'editor' });
        const user = setupUser(); renderRoom(id, 'editor');
        await user.type(await screen.findByLabelText('Question or note'), 'Keep my unsent question.');
        pb.send.mockRejectedValueOnce(new Error('Disconnected'));
        await user.click(screen.getByRole('button', { name: 'Refresh classrooms' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/);
        expect(screen.getByLabelText('Question or note')).toHaveValue('Keep my unsent question.');
        expect(screen.getByRole('button', { name: 'Post to class' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Retry connection' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Post to class' })).toBeEnabled());
        backend.data.workspace_members = backend.data.workspace_members.filter((row) => row.user !== 'editor');
        await user.click(screen.getByRole('button', { name: 'Refresh classrooms' }));
        await waitFor(() => expect(screen.queryByText('Evidence workshop')).not.toBeInTheDocument());
        expect(screen.queryByLabelText('Question or note')).not.toBeInTheDocument();
    });

    it('does not query a foreign workspace link or fabricate demo classrooms', async () => {
        const view = renderRoom('roomalpha', 'owner', '/app/classrooms/roomalpha?workspace=foreign');
        expect(screen.getByRole('heading', { name: 'Classroom unavailable' })).toBeVisible();
        expect(pb.send).not.toHaveBeenCalled(); view.unmount();
        act(() => setDemoMode(true)); renderRoom();
        expect(await screen.findByRole('alert')).toHaveTextContent(/demonstration mode/);
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('paginates classes and rejects a malformed backend response instead of displaying an empty success', async () => {
        for (let index = 0; index < 21; index++) backend.create({}, { title: `Workshop ${index}` });
        const user = setupUser(); renderRoom();
        const pages = within(await screen.findByRole('navigation', { name: 'Classrooms pages' }));
        await user.click(pages.getByRole('button', { name: 'Next' }));
        expect(await screen.findByText('Page 2')).toBeVisible();
        expect(screen.getAllByRole('link', { name: /^Open Workshop/ })).toHaveLength(1);
        pb.send.mockResolvedValueOnce({});
        await user.click(screen.getByRole('button', { name: 'Refresh classrooms' }));
        expect(await screen.findByRole('alert')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Schedule a class' })).not.toBeInTheDocument();
    });
});
