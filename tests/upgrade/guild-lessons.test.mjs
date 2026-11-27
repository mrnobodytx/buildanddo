// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/guild-lessons.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     tests/upgrade/classroom-fixture.mjs, tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/guild-lessons.js, apps/pocketbase/pb_hooks/guild-lessons.pb.js, apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/guild-publishing.js, apps/pocketbase/pb_migrations/1792400000_guild_publications.js, apps/pocketbase/pb_migrations/1792400002_guild_lessons.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/classroom-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/guild-lessons.js; VALIDATES apps/pocketbase/pb_hooks/guild-lessons.pb.js; VALIDATES apps/pocketbase/pb_hooks/classrooms.js; CONSUMES apps/pocketbase/pb_hooks/guild-publishing.js; VALIDATES apps/pocketbase/pb_migrations/1792400002_guild_lessons.js
// Intent:      Prove guild lessons are keyless guildmaster-authored class material that a host can share and start without a tutorial.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { classroomFixture } from './classroom-fixture.mjs';
import { plain, source } from './admin-fixture.mjs';

const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);
const PUBLICATIONS = 'apps/pocketbase/pb_migrations/1792400000_guild_publications.js';
const LESSONS = 'apps/pocketbase/pb_migrations/1792400002_guild_lessons.js';
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

function lessonFixture({ migrated = true } = {}) {
    const f = classroomFixture({ runtime });
    if (migrated) { f.migration(PUBLICATIONS).up(); f.migration(LESSONS).up(); }
    const seat = (id, local, role) => {
        f.seed('users', { id, name: `OCN seat: ${local}`, email: `${local}@ocn.buildanddo.invalid`, verified: true, ocn_seat: true });
        f.seed('workspace_members', { id: `${id}member`, workspace: 'ws1', user: id, role });
    };
    seat('forgeseat', 'forge', 'editor'); seat('directorseat', 'director', 'editor'); seat('museviewer', 'muse', 'viewer');
    f.seed('users', { id: 'foreignseat', email: 'oracle@ocn.buildanddo.invalid', verified: true, ocn_seat: true });
    f.seed('workspace_members', { id: 'foreignseatmember', workspace: 'ws2', user: 'foreignseat', role: 'editor' });
    let sequence = 0;
    f.lesson = (action, payload, { actor = 'forgeseat', revision = 0, workspace = 'ws1', key } = {}) =>
        plain(f.load('guild-lessons.js').command(f.event(actor, { action, revision, request_key: key || `guild_lesson_request_${++sequence}`, payload }, { workspace })));
    f.save = (values = {}, options = {}) => f.lesson('lesson.save', { id: '', title: 'Evidence before action', summary: 'A short guild class.', lesson: material, ...values }, options);
    f.publish = (id, options = {}) => f.lesson('lesson.publish', { id }, { revision: 1, ...options });
    f.guildLessons = (actor = 'forgeseat', workspace = 'ws1') => plain(f.load('guild-lessons.js').list(f.event(actor, {}, { workspace })));
    return f;
}

test('class material refuses answer keys, checks, exercises, explanations, unknown keys and oversized bodies', () => {
    const f = lessonFixture();
    const { body } = f.load('guild-lessons.js');
    assert.deepEqual(plain(body(material)), material);
    const before = plain(f.data);
    for (const extra of [{ check: { question: 'Which?', choices: ['A', 'B'], answer: 0 } }, { answer: 1 }, { exercise: { prompt: 'Do it' } },
        { explanation: 'Because' }, { why: 'Context' }, { preparation: ['Read'] }]) {
        assert.throws(() => body({ ...material, ...extra }), /no answer key or check/);
        denied(() => f.save({ lesson: { ...material, ...extra } }), 400);
    }
    for (const section of [{ heading: 'Quiz', paragraphs: ['Q'], answer: 'A' }, { heading: 'Quiz', check: {} }, { heading: 'Quiz', explanation: 'x' }])
        assert.throws(() => body({ ...material, sections: [section] }), /no answer key or check/);
    for (const broken of [{ ...material, schema_version: 2 }, { ...material, sections: [] }, { ...material, sections: Array(21).fill(material.sections[0]) },
        { ...material, outcomes: Array(11).fill('x') }, { ...material, references: [{ label: 'Plain', url: 'http://example.test' }] },
        { ...material, references: [{ label: 'Credentials', url: 'https://user:secret@example.test' }] },
        { ...material, sections: [{ heading: '', paragraphs: ['x'] }] }, { ...material, sections: [{ heading: 'x', paragraphs: ['y'.repeat(2001)] }] }, null, []])
        denied(() => f.save({ lesson: broken }), 400);
    const oversized = { schema_version: 1, sections: [{ heading: 'Long', paragraphs: Array(13).fill('z'.repeat(1900)) }] };
    assert.throws(() => body(oversized), /within 24000 characters/);
    denied(() => f.save({ lesson: oversized }), 400);
    assert.deepEqual(f.data, before);
});

test('class material is measured as PocketBase stores it, so escaped and non-ASCII text cannot pass the validator and fail at save', () => {
    const f = lessonFixture();
    const { body } = f.load('guild-lessons.js');
    const of = (text, count) => ({ schema_version: 1, sections: [{ heading: 'Markup', paragraphs: Array(count).fill(text) }] });
    // Go's encoding/json writes <, > and & as six-byte \u escapes, U+2028 and U+2029 too, and other
    // text as UTF-8. Each body below is far inside 24000 characters but over the field's 30000 bytes.
    const sample = 'if [ -f a ] && [ -f b ]; then echo \'<div class="x">a &amp; b</div>\' > out.html; fi ';
    const code = (count) => of(sample.repeat(23).slice(0, 1990).trim(), count);
    const before = plain(f.data);
    for (const [label, oversized] of [['&', of('&'.repeat(2000), 3)], ['<', of('<'.repeat(1000), 5)], ['code', code(11)],
        ['CJK', of('中'.repeat(2000), 6)], ['emoji', of('\u{1F9F1}'.repeat(1000), 8)], ['separator', of('a '.repeat(1000), 6)]]) {
        assert.ok(JSON.stringify(oversized).length < 24000, label);
        assert.throws(() => body(oversized), /Keep class material within 30000 stored bytes/, label);
        denied(() => f.save({ lesson: oversized }), 400);
    }
    assert.deepEqual(f.data, before);
    // The same kinds of text that fit the stored size are kept unchanged.
    for (const fitting of [of('<'.repeat(1000), 4), code(6), of('中'.repeat(2000), 4), of('\u{1F9F1}'.repeat(1000), 7)]) {
        assert.deepEqual(plain(body(fitting)), fitting);
        assert.equal(f.save({ lesson: fitting }).status, 'draft');
    }
    // The character limit still applies to plain text that would fit the field.
    assert.throws(() => body(of('z'.repeat(1990), 13)), /within 24000 characters/);
});

test('only a guildmaster seat with editor role authors guild lessons, edits only its own drafts and publishes once', () => {
    const f = lessonFixture();
    const tutorials = plain(f.data.tutorials);
    for (const actor of ['editor', 'admin', 'owner', 'museviewer', 'viewer', 'outsider', 'foreignseat']) denied(() => f.save({}, { actor }));
    // A seat of another workspace authors there, and its lesson never appears here.
    assert.equal(f.save({}, { actor: 'foreignseat', workspace: 'ws2' }).lesson.persona, 'oracle');
    const draft = f.save();
    assert.deepEqual([draft.status, draft.revision, draft.lesson.owner, draft.lesson.persona, draft.lesson.status], ['draft', 1, 'forgeseat', 'forge', 'draft']);
    denied(() => f.lesson('lesson.save', { id: draft.id, title: 'Theirs', summary: '', lesson: material }, { actor: 'directorseat', revision: 1 }));
    denied(() => f.lesson('lesson.publish', { id: draft.id }, { actor: 'directorseat', revision: 1 }));
    denied(() => f.lesson('lesson.save', { id: draft.id, title: 'Stale', summary: '', lesson: material }, { revision: 0 }), 409);
    const revised = f.lesson('lesson.save', { id: draft.id, title: 'Evidence first', summary: 'Revised.', lesson: material }, { revision: 1 });
    assert.equal(revised.revision, 2);
    denied(() => f.lesson('lesson.publish', { id: draft.id }, { revision: 1 }), 409);
    assert.equal(f.data.guild_publications.length, 0);
    const published = f.lesson('lesson.publish', { id: draft.id }, { revision: 2, key: 'guild_lesson_publish_01' });
    assert.deepEqual([published.status, published.revision], ['published', 3]);
    assert.ok(Date.parse(f.data.guild_lessons.find((row) => row.id === draft.id).published_at));
    assert.equal(f.lesson('lesson.publish', { id: draft.id }, { revision: 2, key: 'guild_lesson_publish_01' }).replayed, true);
    assert.equal(f.data.guild_publications.length, 1);
    const [row] = f.data.guild_publications;
    assert.deepEqual([row.kind, row.target, row.persona, row.actor_seat, row.title, row.action], ['guild_lesson', draft.id, 'forge', 'forge', 'Evidence first', 'published']);
    assert.match(row.content_digest, /^[0-9a-f]{64}$/);
    denied(() => f.lesson('lesson.save', { id: draft.id, title: 'After publication', summary: '', lesson: material }, { revision: 3 }), 400);
    denied(() => f.lesson('lesson.publish', { id: draft.id }, { revision: 3 }), 400);
    denied(() => f.lesson('lesson.unpublish', { id: draft.id }, { revision: 3 }), 400);
    denied(() => f.lesson('lesson.save', { id: draft.id, title: 'x', summary: '', lesson: material, status: 'published' }, { revision: 3 }), 400);
    // The seat loses its role: authority is rechecked before a replay is returned.
    f.seed('workspace_members', { id: 'forgeseatmember', workspace: 'ws1', user: 'forgeseat', role: 'viewer' });
    denied(() => f.lesson('lesson.publish', { id: draft.id }, { revision: 2, key: 'guild_lesson_publish_01' }));
    assert.deepEqual(f.data.tutorials, tutorials);
});

test('members read published lessons, authors their own drafts and admins every lesson, with only validated keys', () => {
    const f = lessonFixture();
    const tutorials = plain(f.data.tutorials);
    const published = f.save({ title: 'Published class' });
    f.publish(published.id);
    const forgeDraft = f.save({ title: 'Forge draft' });
    const directorDraft = f.save({ title: 'Director draft' }, { actor: 'directorseat' });
    const titles = (actor) => f.guildLessons(actor).items.map((item) => item.title).sort();
    assert.deepEqual(titles('viewer'), ['Published class']);
    assert.deepEqual(titles('editor'), ['Published class']);
    assert.deepEqual(titles('forgeseat'), ['Forge draft', 'Published class']);
    assert.deepEqual(titles('directorseat'), ['Director draft', 'Published class']);
    assert.deepEqual(titles('admin'), ['Director draft', 'Forge draft', 'Published class']);
    denied(() => f.guildLessons('outsider'));
    assert.equal(f.guildLessons('forgeseat').can_author, true); assert.equal(f.guildLessons('editor').can_author, false); assert.equal(f.guildLessons('museviewer').can_author, false);
    // A hand-edited stored body never leaks an extra key through the read.
    const stored = f.data.guild_lessons.find((row) => row.id === forgeDraft.id);
    f.seed('guild_lessons', { ...stored, lesson: { ...material, check: { answer: 1 } } });
    assert.equal(f.guildLessons('forgeseat').items.find((item) => item.id === forgeDraft.id).lesson, null);
    assert.doesNotMatch(JSON.stringify(f.guildLessons('admin')), /"answer"|"check"|@|buildanddo\.invalid/);
    assert.ok(directorDraft.id);
    assert.deepEqual(f.data.tutorials, tutorials);
});

test('a host shares a published guild lesson into a class with room.material and starts it without a tutorial', () => {
    const f = lessonFixture();
    const tutorials = plain(f.data.tutorials);
    const lesson = f.save(); f.publish(lesson.id);
    const room = f.create({ actor: 'forgeseat' });
    const shared = f.command('room.material', { id: room.id, material: lesson.id, section: 1 }, { actor: 'forgeseat', key: 'room_material_retry_01' });
    assert.equal(shared.revision, 2);
    assert.equal(f.command('room.material', { id: room.id, material: lesson.id, section: 1 }, { actor: 'forgeseat', key: 'room_material_retry_01', revision: 1 }).replayed, true);
    let saved = f.data.classroom_rooms.find((row) => row.id === room.id);
    assert.deepEqual([saved.material, saved.tutorial, saved.section, saved.status], [lesson.id, '', 1, 'scheduled']);
    f.command('room.start', { id: room.id }, { actor: 'forgeseat' });
    saved = f.data.classroom_rooms.find((row) => row.id === room.id);
    assert.deepEqual([saved.status, saved.tutorial], ['live', '']);
    f.command('room.join', { id: room.id }, { actor: 'viewer' });
    const view = f.detail(room.id, 'viewer');
    assert.equal(view.room.material, lesson.id); assert.equal(view.room.tutorial, '');
    assert.deepEqual([view.lesson.id, view.lesson.source, view.lesson.category, view.lesson.persona], [lesson.id, 'guild_lesson', 'Guild lesson', 'forge']);
    assert.deepEqual(view.lesson.lesson.sections, material.sections);
    assert.doesNotMatch(JSON.stringify(view.lesson), /answer|check/);
    // The host may move to another section of the same material while live.
    f.command('room.material', { id: room.id, material: lesson.id, section: 0 }, { actor: 'forgeseat' });
    assert.equal(f.detail(room.id, 'viewer').room.section, 0);
    // room.lesson restores a tutorial and clears the material.
    f.command('room.lesson', { id: room.id, tutorial: f.lessons[1].id, section: 1 }, { actor: 'forgeseat' });
    saved = f.data.classroom_rooms.find((row) => row.id === room.id);
    assert.deepEqual([saved.material, saved.tutorial], ['', f.lessons[1].id]);
    assert.equal(f.detail(room.id, 'viewer').lesson.id, f.lessons[1].id);
    // An administrator may share material into a class it does not host; room.update clears it again.
    const other = f.create({ actor: 'editor' });
    f.command('room.material', { id: other.id, material: lesson.id, section: 0 }, { actor: 'admin' });
    f.command('room.update', { id: other.id, title: 'Rescheduled', description: '', tutorial: f.lessons[0].id, starts_at: '' }, { actor: 'editor' });
    assert.deepEqual([f.data.classroom_rooms.find((row) => row.id === other.id).material, f.data.classroom_rooms.find((row) => row.id === other.id).tutorial], ['', f.lessons[0].id]);
    f.command('room.end', { id: room.id }, { actor: 'forgeseat' });
    denied(() => f.command('room.material', { id: room.id, material: lesson.id, section: 0 }, { actor: 'forgeseat' }), 409);
    assert.deepEqual(f.data.tutorials, tutorials);
});

test('draft, foreign and withdrawn material is refused or read as no lesson; only the host or an admin shares it', () => {
    const f = lessonFixture();
    const published = f.save(); f.publish(published.id);
    const draft = f.save({ title: 'Unpublished' });
    const room = f.create({ actor: 'forgeseat' });
    denied(() => f.command('room.material', { id: room.id, material: draft.id, section: 0 }, { actor: 'forgeseat' }), 400);
    denied(() => f.command('room.material', { id: room.id, material: 'missinglesson', section: 0 }, { actor: 'forgeseat' }), 404);
    f.seed('guild_lessons', { id: 'foreignlesson', workspace: 'ws2', owner: 'foreignseat', title: 'Foreign', status: 'published', lesson: material, revision: 2 });
    denied(() => f.command('room.material', { id: room.id, material: 'foreignlesson', section: 0 }, { actor: 'forgeseat' }), 404);
    for (const section of [-1, 2, 1.5, '1']) denied(() => f.command('room.material', { id: room.id, material: published.id, section }, { actor: 'forgeseat' }), 400);
    denied(() => f.command('room.material', { id: room.id, material: published.id, section: 0, tutorial: '' }, { actor: 'forgeseat' }), 400);
    denied(() => f.command('room.material', { id: room.id, material: published.id, section: 0 }, { actor: 'editor' }));
    denied(() => f.command('room.material', { id: room.id, material: published.id, section: 0 }, { actor: 'viewer' }));
    const chat = f.command('room.chat', { title: 'Open discussion', description: '' }, { actor: 'forgeseat' });
    denied(() => f.command('room.material', { id: chat.id, material: published.id, section: 0 }, { actor: 'forgeseat' }), 400);
    assert.equal(f.data.classroom_rooms.find((row) => row.id === room.id).material ?? '', '');
    f.command('room.material', { id: room.id, material: published.id, section: 0 }, { actor: 'forgeseat' });
    // An owner withdraws the lesson: the class can no longer start with it and reads no lesson.
    f.load('guild-publishing.js').command(f.event('owner', { action: 'publication.withdraw', revision: 2, request_key: 'withdraw_guild_lesson_1',
        payload: { kind: 'guild_lesson', target: published.id, note: 'Withdrawn for review.' } }));
    assert.equal(f.data.guild_lessons.find((row) => row.id === published.id).status, 'withdrawn');
    assert.equal(f.detail(room.id, 'viewer').lesson, null);
    denied(() => f.command('room.start', { id: room.id }, { actor: 'forgeseat' }), 400);
    denied(() => f.command('room.material', { id: room.id, material: published.id, section: 0 }, { actor: 'forgeseat' }), 400);
    assert.equal(f.data.classroom_rooms.find((row) => row.id === room.id).status, 'scheduled');
});

test('owners and admins withdraw a published guild lesson with a note; editors and guildmasters cannot, and it stays retained', () => {
    const f = lessonFixture();
    const lesson = f.save(); f.publish(lesson.id);
    const withdraw = (actor, revision, note = 'Withdrawn after owner review.', key) => plain(f.load('guild-publishing.js').command(f.event(actor,
        { action: 'publication.withdraw', revision, request_key: key || `withdraw_lesson_${actor}_${revision}_x`, payload: { kind: 'guild_lesson', target: lesson.id, note } })));
    for (const actor of ['editor', 'forgeseat', 'directorseat', 'viewer', 'outsider']) denied(() => withdraw(actor, 2));
    denied(() => withdraw('admin', 1), 409);
    denied(() => withdraw('admin', 2, ' '), 400);
    const draft = f.save({ title: 'Never published' });
    denied(() => plain(f.load('guild-publishing.js').command(f.event('admin', { action: 'publication.withdraw', revision: 1, request_key: 'withdraw_lesson_draft_01',
        payload: { kind: 'guild_lesson', target: draft.id, note: 'No publication.' } }))), 404);
    const result = withdraw('admin', 2, 'Withdrawn after owner review.', 'withdraw_lesson_retry_01');
    assert.deepEqual([result.status, result.revision, result.replayed], ['withdrawn', 3, false]);
    assert.equal(withdraw('admin', 2, 'Withdrawn after owner review.', 'withdraw_lesson_retry_01').replayed, true);
    const saved = f.data.guild_lessons.find((row) => row.id === lesson.id);
    assert.deepEqual([saved.status, saved.revision], ['withdrawn', 3]);
    assert.deepEqual(f.data.guild_publications.map((row) => [row.action, row.kind, row.target, row.persona, row.actor, row.actor_seat, row.note]), [
        ['published', 'guild_lesson', lesson.id, 'forge', 'forgeseat', 'forge', ''],
        ['withdrawn', 'guild_lesson', lesson.id, 'forge', 'admin', '', 'Withdrawn after owner review.']]);
    denied(() => withdraw('admin', 3), 409);
    denied(() => f.lesson('lesson.publish', { id: lesson.id }, { revision: 3 }), 400);
    denied(() => f.lesson('lesson.save', { id: lesson.id, title: 'Revived', summary: '', lesson: material }, { revision: 3 }), 400);
    assert.deepEqual(f.guildLessons('viewer').items, []);
    assert.equal(f.guildLessons('forgeseat').items.find((item) => item.id === lesson.id).status, 'withdrawn');
});

test('without the guild lesson migration room.material answers 503 and every other classroom action is unchanged', () => {
    const f = lessonFixture({ migrated: false });
    const room = f.create({ actor: 'editor' });
    const before = plain(f.data);
    denied(() => f.command('room.material', { id: room.id, material: 'anylesson00001', section: 0 }, { actor: 'editor' }), 503);
    assert.deepEqual(f.data, before);
    denied(() => f.guildLessons('forgeseat'), 503);
    denied(() => f.save(), 503);
    f.command('room.start', { id: room.id }, { actor: 'editor' });
    f.command('room.join', { id: room.id }, { actor: 'viewer' });
    f.command('room.lesson', { id: room.id, tutorial: f.lessons[1].id, section: 1 }, { actor: 'editor' });
    const view = f.detail(room.id, 'viewer');
    assert.deepEqual([view.lesson.id, view.room.material, view.room.section], [f.lessons[1].id, '', 1]);
    assert.equal(Object.hasOwn(f.data.classroom_rooms[0], 'material'), false);
    // Lessons installed but the room field missing: sharing still fails closed and nothing is written.
    const partial = lessonFixture();
    const shared = partial.save(); partial.publish(shared.id);
    partial.collections.classroom_rooms.fields.removeByName('material');
    const scheduled = partial.create({ actor: 'forgeseat' });
    const unchanged = plain(partial.data);
    denied(() => partial.command('room.material', { id: scheduled.id, material: shared.id, section: 0 }, { actor: 'forgeseat' }), 503);
    assert.deepEqual(partial.data, unchanged);
    // The guild lesson migration on a backend without guild publications installs lessons, but publishing fails closed.
    const g = classroomFixture({ runtime });
    g.migration(LESSONS).up();
    g.seed('users', { id: 'forgeseat', email: 'forge@ocn.buildanddo.invalid', verified: true, ocn_seat: true });
    g.seed('workspace_members', { id: 'forgeseatmember', workspace: 'ws1', user: 'forgeseat', role: 'editor' });
    const draft = plain(g.load('guild-lessons.js').command(g.event('forgeseat', { action: 'lesson.save', revision: 0, request_key: 'guild_lesson_nopub_01',
        payload: { id: '', title: 'Class', summary: '', lesson: material } })));
    denied(() => g.load('guild-lessons.js').command(g.event('forgeseat', { action: 'lesson.publish', revision: 1, request_key: 'guild_lesson_nopub_02',
        payload: { id: draft.id } })), 503);
    assert.equal(g.data.guild_lessons[0].status, 'draft');
});

test('the guild lesson migration is idempotent, adds an optional non-cascading room field and refuses rollback while used', () => {
    const f = lessonFixture();
    const lessons = plain(f.collections.guild_lessons), rooms = plain(f.collections.classroom_rooms);
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(lessons[key], null);
    assert.deepEqual(plain(f.collections.classroom_rooms.fields.getByName('material')),
        { name: 'material', type: 'relation', collectionId: 'guild_lessons', required: false, cascadeDelete: false, maxSelect: 1 });
    f.migration(LESSONS).up();
    assert.deepEqual(plain(f.collections.guild_lessons), lessons); assert.deepEqual(plain(f.collections.classroom_rooms), rooms);
    for (const corrupt of [(g) => { g.collections.guild_lessons.createRule = ''; }, (g) => { g.collections.guild_lessons.fields.getByName('lesson').maxSize = 999999; },
        (g) => { g.collections.classroom_rooms.fields.getByName('material').cascadeDelete = true; }, (g) => { g.collections.guild_lessons.indexes = []; }]) {
        const g = lessonFixture(); corrupt(g);
        assert.throws(g.migration(LESSONS).up, /Review/);
    }
    const used = lessonFixture();
    const lesson = used.save();
    assert.throws(used.migration(LESSONS).down, /guild_lessons before rollback/);
    used.app.delete(used.app.findRecordById('guild_lessons', lesson.id));
    const room = used.create({ actor: 'editor' });
    used.seed('classroom_rooms', { ...used.data.classroom_rooms.find((row) => row.id === room.id), material: 'somelesson0001' });
    assert.throws(used.migration(LESSONS).down, /classroom_rooms\.material before rollback/);
    const empty = lessonFixture();
    empty.migration(LESSONS).down(); empty.migration(LESSONS).down();
    assert.equal(empty.collections.guild_lessons, undefined);
    assert.equal(empty.collections.classroom_rooms.fields.getByName('material'), undefined);
});

test('the guild lesson routes require users authentication, a body limit and no-store responses', () => {
    const routes = [];
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/guild-lessons.pb.js'), {
        __hooks: '/hooks', routerAdd: (method, path, handler, ...middleware) => routes.push({ method, path, handler, middleware }),
        $apis: { requireAuth: (...collections) => ({ auth: collections }), bodyLimit: (limit) => ({ limit }) },
        require: () => ({ list: () => ({}), command: () => ({}) }),
    });
    assert.deepEqual(routes.map((route) => `${route.method} ${route.path}`), [
        'GET /api/buildanddo/workspaces/{workspace}/guild-lessons', 'POST /api/buildanddo/workspaces/{workspace}/guild-lessons']);
    assert.deepEqual(plain(routes[1].middleware), [{ auth: ['users'] }, { limit: 30000 }]);
    for (const route of routes) {
        const headers = {};
        route.handler({ response: { header: () => ({ set: (name, value) => { headers[name] = value; } }) }, json: (status, body) => ({ status, body }) });
        assert.equal(headers['Cache-Control'], 'no-store');
    }
});
