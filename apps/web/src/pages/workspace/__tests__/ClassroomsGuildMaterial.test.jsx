// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/ClassroomsGuildMaterial.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/web/src/pages/workspace/ClassroomsPage.jsx, apps/web/src/lib/classrooms.js, tests/upgrade/classroom-fixture.mjs, apps/pocketbase/pb_hooks/guild-lessons.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/ClassroomsPage.jsx; VALIDATES apps/web/src/lib/classrooms.js; CONSUMES tests/upgrade/classroom-fixture.mjs; CONSUMES apps/pocketbase/pb_hooks/guild-lessons.js
// DAG Node:    none
// Intent:      Prove a class sharing guild material can be started, followed, joined and ended from the web page against the real backend policies.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { classroomFixture } from '../../../../../../tests/upgrade/classroom-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import ClassroomsPage from '@/pages/workspace/ClassroomsPage';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'owner' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
vi.mock('@/lib/seatComms', () => ({ recentSeatEvents: async () => [], subscribeSeatEvents: () => () => {}, connectSeatComms: async () => () => {},
    disconnectSeatComms: async () => {}, isSeatCommsConnected: () => false }));

const runtime = { $security: { sha256: (value) => createHash('sha256').update(String(value)).digest('hex') } };
const material = {
    schema_version: 1,
    outcomes: ['Name the four parts of the work loop.'],
    sections: [
        { heading: 'Observe first', paragraphs: ['Record what the source returned, in its own words.'] },
        { heading: 'Then act', steps: ['Choose one bounded step.', 'Record what happened.'] },
    ],
    references: [{ label: 'Workspace guide', url: 'https://example.test/guide' }],
};
let backend, lessonId;

// The rota's host: the forge seat publishes a guild lesson and shares it into a scheduled class.
function guildBackend() {
    const f = classroomFixture({ runtime });
    f.migration('apps/pocketbase/pb_migrations/1792400000_guild_publications.js').up();
    f.migration('apps/pocketbase/pb_migrations/1792400002_guild_lessons.js').up();
    f.seed('users', { id: 'forgeseat', name: 'Forge', email: 'forge@ocn.buildanddo.invalid', verified: true, ocn_seat: true });
    f.seed('workspace_members', { id: 'forgeseatmember', workspace: 'ws1', user: 'forgeseat', role: 'editor' });
    const lessons = f.load('guild-lessons.js');
    const lesson = (action, payload, revision) => plain(lessons.command(f.event('forgeseat',
        { action, payload, revision, request_key: `guild_lesson_${action.replace('.', '_')}_${revision}` }, { workspace: 'ws1' })));
    lessonId = lesson('lesson.save', { id: '', title: 'Evidence before action', summary: 'A short guild class.', lesson: material }, 0).id;
    lesson('lesson.publish', { id: lessonId }, 1);
    return f;
}
const scheduled = () => {
    const room = backend.create({ actor: 'forgeseat' });
    backend.command('room.material', { id: room.id, material: lessonId, section: 0 }, { actor: 'forgeseat' });
    return room.id;
};
const started = () => { const id = scheduled(); backend.command('room.start', { id }, { actor: 'forgeseat' }); return id; };
function send(path, options) {
    const parts = path.split('/');
    const e = backend.event(pb.authStore.record.id, options.body || {}, { workspace: parts[4], id: parts[6], query: options.query || {} });
    try {
        return plain(options.method === 'POST' ? path.endsWith('/presence') ? backend.service.heartbeat(e) : backend.service.command(e) : path.endsWith('/record') ? backend.service.record(e) : parts[6] ? backend.service.detail(e) : backend.service.list(e));
    } catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
}
function renderRoom(id, actor) {
    pb.authStore.record = { id: actor };
    return renderWithProviders(<Routes><Route path="/app/classrooms/:roomId" element={<ClassroomsPage />} /></Routes>,
        { route: `/app/classrooms/${id}`, auth: { user: { id: actor }, isAuthed: true }, workspace: { active: { id: 'ws1', owner: 'owner' } } });
}
beforeEach(() => { backend = guildBackend(); pb.send.mockReset(); pb.send.mockImplementation(async (...args) => send(...args)); setDemoMode(false); });
afterEach(() => { setDemoMode(false); vi.restoreAllMocks(); });

describe('a class that shares guild material', () => {
    it('lets the host start it, shows the material without an exercise and moves it with room.material', async () => {
        const id = scheduled(); const user = setupUser(); renderRoom(id, 'forgeseat');
        expect(await screen.findByRole('heading', { name: 'Observe first' })).toBeVisible();
        expect(screen.getByText('Guild lesson')).toBeVisible();
        expect(screen.getByText('Name the four parts of the work loop.')).toBeVisible();
        expect(screen.getByRole('link', { name: 'Workspace guide' })).toHaveAttribute('href', 'https://example.test/guide');
        expect(screen.queryByText('Practice exercise')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Read the full lesson/ })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Start lesson session' }));
        expect(await screen.findByText('You are attending')).toBeVisible();
        expect(backend.data.classroom_rooms[0]).toMatchObject({ status: 'live', tutorial: '', material: lessonId });
        expect(screen.getByLabelText('Class lesson')).toHaveDisplayValue('Guild material: Evidence before action');
        await user.click(screen.getByRole('button', { name: 'Next section' }));
        expect(await screen.findByRole('heading', { name: 'Then act' })).toBeVisible();
        expect(screen.getByText('Choose one bounded step.')).toBeVisible();
        expect(backend.data.classroom_rooms[0]).toMatchObject({ section: 1, material: lessonId, tutorial: '' });
        expect(screen.getByRole('button', { name: 'Next section' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Previous section' }));
        expect(await screen.findByRole('heading', { name: 'Observe first' })).toBeVisible();
    });

    it('lets a member join and follow it and the host end it', async () => {
        const id = started(); const user = setupUser(); const view = renderRoom(id, 'viewer');
        expect(await screen.findByRole('heading', { name: 'Observe first' })).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Next section' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Join class' }));
        expect(await screen.findByText('You are attending')).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Attending (2)' })).toBeVisible();
        view.unmount();
        renderRoom(id, 'forgeseat');
        await user.click(await screen.findByRole('button', { name: 'End class' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm end' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(backend.data.classroom_rooms[0].status).toBe('ended');
        expect(screen.getByRole('heading', { name: 'Observe first' })).toBeVisible();
    });

    it('keeps the room usable when its material is withdrawn', async () => {
        const id = started();
        backend.data.guild_lessons.find((row) => row.id === lessonId).status = 'withdrawn';
        renderRoom(id, 'forgeseat');
        expect(await screen.findByText(/The shared guild material is unavailable/)).toBeVisible();
        expect(screen.getByRole('button', { name: 'End class' })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'Next section' })).not.toBeInTheDocument();
    });
});
