// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/classrooms.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/web/src/lib/classrooms.js, tests/upgrade/classroom-fixture.mjs, apps/pocketbase/pb_hooks/guild-lessons.js, apps/pocketbase/pb_hooks/classrooms.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/classrooms.js; CONSUMES tests/upgrade/classroom-fixture.mjs; CONSUMES apps/pocketbase/pb_hooks/guild-lessons.js; CONSUMES apps/pocketbase/pb_hooks/classrooms.js
// DAG Node:    none
// Intent:      Prove the browser classroom adapter reads a class that shares keyless guild material, built from the server's own response, and still refuses a keyed or mismatched lesson.
// ───────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { classroomFixture } from '../../../../../tests/upgrade/classroom-fixture.mjs';
import { plain } from '../../../../../tests/upgrade/admin-fixture.mjs';
import { createClassroomClient } from '@/lib/classrooms';

const runtime = { $security: { sha256: (value) => createHash('sha256').update(String(value)).digest('hex') } };
const material = {
    schema_version: 1,
    outcomes: ['Name the four parts of the work loop.'],
    sections: [
        { heading: 'Observe first', paragraphs: ['Record what the source returned, in its own words.'] },
        { heading: 'Then act', steps: ['Choose one bounded step.', 'Record what happened.'] },
        { heading: 'Discuss' },
    ],
    references: [{ label: 'Workspace guide', url: 'https://example.test/guide' }],
};

// A real backend: the forge seat publishes a guild lesson, schedules a class, shares the lesson with
// room.material and starts it, exactly as the rota's host does.
function guildClass() {
    const f = classroomFixture({ runtime });
    f.migration('apps/pocketbase/pb_migrations/1792400000_guild_publications.js').up();
    f.migration('apps/pocketbase/pb_migrations/1792400002_guild_lessons.js').up();
    f.seed('users', { id: 'forgeseat', name: 'Forge', email: 'forge@ocn.buildanddo.invalid', verified: true, ocn_seat: true });
    f.seed('workspace_members', { id: 'forgeseatmember', workspace: 'ws1', user: 'forgeseat', role: 'editor' });
    const lessons = f.load('guild-lessons.js');
    const lesson = (action, payload, revision) => plain(lessons.command(f.event('forgeseat',
        { action, payload, revision, request_key: `guild_lesson_${action.replace('.', '_')}_${revision}` }, { workspace: 'ws1' })));
    const saved = lesson('lesson.save', { id: '', title: 'Evidence before action', summary: 'A short guild class.', lesson: material }, 0);
    lesson('lesson.publish', { id: saved.id }, 1);
    const room = f.create({ actor: 'forgeseat' });
    f.command('room.material', { id: room.id, material: saved.id, section: 0 }, { actor: 'forgeseat' });
    f.command('room.start', { id: room.id }, { actor: 'forgeseat' });
    return { f, room: room.id, lesson: saved.id };
}

// The classrooms.pb.js read route: detail(), then the public lesson body.
function route(f, mutate = (value) => value) {
    const policy = f.load('workflow-policy.js');
    return async (path, options) => {
        const parts = path.split('/');
        const e = f.event('forgeseat', options.body || {}, { workspace: parts[4], id: parts[6], query: options.query || {} });
        try {
            if (options.method === 'POST') return plain(f.service.command(e));
            const result = plain(f.service.detail(e));
            if (result.lesson) result.lesson = { ...result.lesson, lesson: policy.publicLesson(result.lesson.lesson) };
            return mutate(result);
        } catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
    };
}

function adapter(f, mutate) {
    let key = 0;
    return createClassroomClient({ client: { authStore: { record: { id: 'forgeseat' } }, send: route(f, mutate) },
        workspaceId: 'ws1', accountId: 'forgeseat', isCurrent: () => true, keyFactory: () => `classroom_test_key_${String(++key).padStart(4, '0')}` });
}

describe('classroom detail with shared guild material', () => {
    it('reads the server response of a class that shares a published guild lesson', async () => {
        const { f, room, lesson } = guildClass();
        const result = await adapter(f).read(room);
        expect(result.ok).toBe(true);
        expect(result.data.room).toMatchObject({ id: room, tutorial: '', material: lesson, status: 'live', section: 0 });
        expect(result.data.lesson).toMatchObject({ id: lesson, source: 'guild_lesson', category: 'Guild lesson', persona: 'forge' });
        expect(result.data.lesson.lesson).toEqual(material);
        expect(result.data.participants.map((item) => item.id)).toHaveLength(1);
    });

    it('sends room.material so the host can move the class through its sections', async () => {
        const { f, room, lesson } = guildClass();
        const client = adapter(f);
        const moved = await client.command('room.material', { id: room, material: lesson, section: 1 }, f.data.classroom_rooms[0].revision);
        expect(moved.ok).toBe(true);
        expect((await client.read(room)).data.room.section).toBe(1);
    });

    it('refuses material that carries a key, names another lesson or loses its source', async () => {
        const { f, room } = guildClass();
        const broken = [
            (value) => ({ ...value, lesson: { ...value.lesson, lesson: { ...value.lesson.lesson, check: { question: 'Which?', choices: ['A', 'B'] } } } }),
            (value) => ({ ...value, lesson: { ...value.lesson, lesson: { ...value.lesson.lesson, sections: [{ heading: 'Quiz', paragraphs: ['Q'], answer: 'A' }] } } }),
            (value) => ({ ...value, lesson: { ...value.lesson, lesson: { ...value.lesson.lesson, references: [{ label: 'Plain', url: 'http://example.test' }] } } }),
            (value) => ({ ...value, lesson: { ...value.lesson, lesson: { ...value.lesson.lesson, sections: [] } } }),
            (value) => ({ ...value, lesson: { ...value.lesson, lesson: { ...value.lesson.lesson, schema_version: 2 } } }),
            (value) => ({ ...value, lesson: { ...value.lesson, id: 'anotherlesson01' } }),
            (value) => ({ ...value, room: { ...value.room, material: '' } }),
            (value) => { const { source: _source, ...lesson } = value.lesson; return { ...value, lesson }; },
            (value) => ({ ...value, room: { ...value.room, tutorial: value.lesson.id, material: '' } }),
        ];
        for (const mutate of broken)
            expect(await adapter(f, mutate).read(room)).toEqual({ ok: false, reason: 'unavailable', error: 'Classrooms are unavailable. Retry or contact your workspace operator.' });
        expect((await adapter(f, (value) => ({ ...value, lesson: null })).read(room)).ok).toBe(true);
    });

    it('keeps reading a tutorial class and refuses a tutorial that claims to be guild material', async () => {
        const f = classroomFixture({ runtime });
        const room = f.create();
        f.command('room.start', { id: room.id });
        const client = (mutate) => createClassroomClient({ client: { authStore: { record: { id: 'owner' } }, send: async (path, options) => {
            const parts = path.split('/');
            return mutate(plain(f.service.detail(f.event('owner', {}, { workspace: parts[4], id: parts[6], query: options.query || {} }))));
        } }, workspaceId: 'ws1', accountId: 'owner', isCurrent: () => true });
        const read = await client((value) => value).read(room.id);
        expect(read.ok).toBe(true);
        expect(read.data.lesson.id).toBe(f.lessons[0].id);
        expect((await client((value) => ({ ...value, lesson: { ...value.lesson, source: 'guild_lesson' } })).read(room.id)).ok).toBe(false);
    });
});
