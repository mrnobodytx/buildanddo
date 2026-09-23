// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/classroom-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/classrooms.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/classrooms.js
// DAG Node:    none
// Intent:      Connect actual classroom command and migration sources to the existing transactional storage test fixture.
// ───────────────────────────────────────────────────────────────

import { fixture, plain, source } from './admin-fixture.mjs';
export const MIGRATION = 'apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js';
// classrooms.js SHAPES requires `kind`, so a fixture carrying only the first migration answers
// 503 "The classroom backend needs an operator review before it can be used." That is the guard
// working, not a bug - the double simply has to install the same schema the deployment does.
export const MIGRATIONS = [
    MIGRATION,
    'apps/pocketbase/pb_migrations/1791100000_room_kind.js',
];

export function classroomFixture({ runtime } = {}) {
    const f = fixture(runtime ? { runtime } : undefined);
    for (const migration of MIGRATIONS) f.migration(migration).up();
    const curriculum = JSON.parse(source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'));
    curriculum.lessons.slice(0, 2).forEach((lesson) => f.seed('tutorials', lesson));
    const service = f.load('classrooms.js');
    let sequence = 0;
    const event = (actor, body, options) => f.event(actor, body, options);
    const command = (action, payload, { actor = 'owner', workspace = 'ws1', revision, key } = {}) => {
        const room = f.data.classroom_rooms.find((row) => row.id === payload.id);
        return plain(service.command(event(actor, { action, payload, revision: revision ?? room?.revision ?? 0,
            request_key: key || `classroom_request_${++sequence}` }, { workspace })));
    };
    const create = (options = {}, values = {}) => command('room.create', { title: 'Evidence workshop', description: 'Read and discuss one example.',
        tutorial: curriculum.lessons[0].id, starts_at: '', ...values }, options);
    const detail = (id, actor = 'owner', workspace = 'ws1', query = {}) => plain(service.detail(event(actor, {}, { id, workspace, query })));
    const list = (actor = 'owner', workspace = 'ws1', query = {}) => plain(service.list(event(actor, {}, { workspace, query })));
    const heartbeat = (id, membership, actor = 'owner', workspace = 'ws1') => plain(service.heartbeat(event(actor,
        { membership: membership.id, revision: membership.revision }, { id, workspace })));
    return { ...f, get data() { return f.data; }, service, command, create, detail, list, heartbeat, event, lessons: curriculum.lessons.slice(0, 2) };
}
