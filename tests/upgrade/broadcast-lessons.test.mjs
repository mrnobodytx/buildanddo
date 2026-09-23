// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/broadcast-lessons.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js, apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json, apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES apps/pocketbase/pb_hooks/tutorial-learning.js; VALIDATES apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js; VALIDATES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json; CONSUMES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Exercise real lesson creation and native learning source validation without fabricating evidence or replacing history.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fixture, plain, source } from './admin-fixture.mjs';
import { lessonLink, mergeTutorials, validLesson } from '../../apps/web/src/lib/tutorialCurriculum.js';

const DATA = 'apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json';
const MIGRATION = 'apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js';
const bundle = JSON.parse(source(DATA));
const seed = bundle.lessons[0];
const starter = JSON.parse(source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'));

function installed(data = bundle) {
    const f = fixture({ runtime: {
        toString: String,
        $security: { sha256: (text) => createHash('sha256').update(text).digest('hex') },
        $os: { readFile: (path) => {
            if (path === '/pb_migrations/data/broadcast-classroom-lessons.json') return JSON.stringify(data);
            assert.equal(path, '/pb_migrations/data/starter-tutorials.json');
            return source('apps/pocketbase/pb_migrations/data/starter-tutorials.json');
        } },
    } });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    f.migration('apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js').up();
    f.migration('apps/pocketbase/pb_migrations/1791500000_tutorial_answer_wait.js').up();
    f.app.countRecords = (name, filter, params) => f.app.findRecordsByFilter(name, filter, '', 0, 0, params).length;
    return f;
}

test('one versioned public lesson extends, rather than changes, the fixed 25-lesson starter contract', () => {
    assert.equal(starter.version, '2026.09.1');
    assert.equal(starter.lessons.length, 25);
    assert.equal(bundle.version, '2026.09.broadcast.1');
    assert.equal(bundle.lessons.length, 1);
    assert.match(seed.id, /^[a-z0-9]{15}$/);
    assert.equal(seed.slug, 'broadcast-classroom-repair');
    assert.equal(seed.category, 'Source case studies');
    assert.equal(validLesson(seed.lesson), true);
    assert.ok(Buffer.byteLength(JSON.stringify(seed.lesson)) < 65536);
    assert.ok(seed.lesson.sections.length >= 4);
    assert.ok(seed.lesson.exercise.checklist.length >= 4);
    const lessons = [...starter.lessons, ...JSON.parse(source('apps/pocketbase/pb_migrations/data/government-submissions.json')).lessons, seed];
    for (const field of ['id', 'slug']) assert.equal(new Set(lessons.map((row) => row[field])).size, lessons.length);
    assert.doesNotMatch(source(DATA), /[^\x00-\x7f]/);
    assert.match(source(`${DATA}.cgrf.yaml`), /SRS-BUILDANDDO-UPGRADE-001/);
    assert.match(source(`${DATA}.cgrf.yaml`), /VCC-BUILDANDDO-UPGRADE-001/);
});

test('source references are safe public inspected-revision links and the evidence route stays local', () => {
    const references = seed.lesson.references;
    assert.ok(references.some((reference) => reference.url === '/app/evidence'));
    assert.ok(references.some((reference) => reference.url.includes('/tests/upgrade/')));
    for (const reference of references) {
        assert.equal(lessonLink(reference.url), reference.url);
        if (reference.url === '/app/evidence' || reference.url === '/broadcast-repairs-source.txt') continue;
        const prefix = 'https://github.com/mrnobodytx/buildanddo/blob/ce1ce50fe408100bc617b33b5fed277efde64648/';
        assert.ok(reference.url.startsWith(prefix));
        assert.ok(source(reference.url.slice(prefix.length)).length > 0, reference.label);
        assert.match(reference.label, /inspected revision/);
    }
    for (const invalid of ['//foreign.invalid', 'javascript:alert(1)', '/\\foreign.invalid', 'https://user:pass@example.invalid']) {
        assert.equal(validLesson({ ...seed.lesson, references: [{ label: 'Invalid reference', url: invalid }] }), false);
    }
});

test('recorded source evidence binds its stated file scope without upgrading blocked native or rendered checks', () => {
    assert.equal(bundle.source_evidence.boundary, 'source regression evidence; hosted media/native/rendered status require recorded results');
    const checks = bundle.source_evidence.validation;
    assert.deepEqual(checks.map((check) => check.label), ['Source regression', 'Rendered UI', 'Native PocketBase', 'Hosted media']);
    for (const check of checks) {
        assert.ok(['recorded source pass', 'blocked', 'unmeasured'].includes(check.status));
        assert.deepEqual(Object.keys(check).sort(), ['commands', 'description', 'label', 'status']);
        assert.ok(check.description.length > 40);
        assert.ok(check.commands.every((command) => typeof command === 'string' && command.length > 0));
    }
    assert.match(checks[0].commands[0], /^node --test tests\/upgrade\/broadcast-lessons\.test\.mjs /);
    assert.match(checks[1].commands[0], /^npm run test --prefix apps\/web -- /);
    assert.equal(checks[2].commands.length, 4);
    assert.deepEqual(checks[3].commands, [], 'the source lesson cannot authorize hosted provider effects');
    assert.deepEqual(checks.map((check) => check.status), ['recorded source pass', 'blocked', 'blocked', 'unmeasured']);
    const observation = bundle.source_evidence.observation;
    assert.equal(observation.kind, 'local_source_regression');
    assert.ok(Number.isFinite(Date.parse(observation.observed_at)));
    assert.equal(observation.exit_code, 0);
    assert.equal(observation.counts.tests, observation.counts.pass);
    assert.ok(observation.counts.tests > 0);
    assert.equal(observation.counts.fail, 0); assert.equal(observation.counts.skipped, 0);
    assert.match(observation.output_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(observation.source_files, [...new Set(observation.source_files)].sort());
    const digest = createHash('sha256');
    for (const path of observation.source_files) {
        assert.match(path, /^(apps|tests)\/[a-zA-Z0-9/_.-]+$/);
        assert.equal(path.includes('..'), false);
        digest.update(path + '\0').update(createHash('sha256').update(source(path)).digest());
    }
    assert.equal(digest.digest('hex'), observation.source_sha256, 'Refresh observed evidence only after rerunning changed source, not by relabeling it.');
    const artifact = bundle.source_evidence.artifact;
    assert.equal(artifact.url, '/broadcast-repairs-source.txt');
    const captured = source('apps/web/public' + artifact.url);
    assert.equal(createHash('sha256').update(captured).digest('hex'), artifact.sha256);
    const raw = captured.slice(captured.indexOf('TAP version 13\n'));
    assert.equal(createHash('sha256').update(raw).digest('hex'), observation.output_sha256);
    for (const [name, value] of Object.entries(observation.counts))
        assert.match(raw, new RegExp('^# ' + name + ' ' + value + '$', 'm'));
    const text = JSON.stringify(seed.lesson);
    for (const term of ['foreign', 'ended', 'stale', 'left', 'revoked', 'unknown session', 'another room', 'late', 'markup', 'positive control']) assert.ok(text.includes(term), term);
    assert.match(seed.lesson.check.choices[seed.lesson.check.answer], /acceptance remain unmeasured/);
});

test('migration creates a truly missing tutorial, changes no rules, and writes no evidence or learner state', () => {
    const f = installed();
    assert.equal(f.data.tutorials.some((row) => row.id === seed.id), false);
    const before = plain(f.data), schemas = plain(f.collections), writes = [];
    const save = f.app.save;
    f.app.save = function (record) { writes.push(record.collection().name); return save.call(this, record); };
    f.migration(MIGRATION).up();
    assert.deepEqual(writes, ['tutorials']);
    assert.equal(f.data.tutorials.length, 26);
    const saved = f.data.tutorials.find((row) => row.id === seed.id);
    for (const field of Object.keys(seed)) assert.deepEqual(saved[field], seed[field], field);
    assert.equal(saved.curriculum_version, bundle.version);
    assert.equal(saved.source_evidence, undefined, 'the validation plan is not a workspace evidence receipt');
    assert.deepEqual(f.data.tutorials.filter((row) => row.id !== seed.id), before.tutorials);
    for (const name of Object.keys(before).filter((name) => name !== 'tutorials')) assert.deepEqual(f.data[name], before[name], name);
    assert.deepEqual(plain(f.collections), schemas);
});

test('the actual native learning validator accepts the new lesson without enrolling or awarding points on read', () => {
    const f = installed(); f.migration(MIGRATION).up();
    const before = plain(f.data), learning = f.load('tutorial-learning.js');
    const result = plain(learning.detail(f.event('owner', {}, { id: seed.id })));
    const { answer: _answer, ...check } = seed.lesson.check;
    assert.deepEqual(result.tutorial.lesson, { ...seed.lesson, check }, 'the answer is withheld until it is earned');
    assert.equal(result.tutorial.curriculum_version, bundle.version);
    assert.equal(result.enrollment, null);
    assert.equal(learning.list(f.event('owner')).points, 0);
    assert.deepEqual(f.data, before);
    const record = f.app.findRecordById('tutorials', seed.id);
    record.set('lesson', { ...seed.lesson, check: { ...seed.lesson.check, answer: 99 } }); f.app.save(record);
    assert.throws(() => learning.detail(f.event('owner', {}, { id: seed.id })), /supported lesson/);
    assert.equal(f.data.tutorial_learning.length, 0);
});

test('replay and data-only down preserve operator edits, frozen snapshots, certificates and existing evidence', () => {
    const f = installed(); f.migration(MIGRATION).up();
    const learning = f.load('tutorial-learning.js');
    const detail = () => plain(learning.detail(f.event('owner', {}, { id: seed.id })));
    const digest = detail().tutorial.content_digest;
    const command = (action, payload = {}) => learning.command(f.event('owner', { action, payload, content_digest: digest }, { id: seed.id }));
    command('start');
    seed.lesson.sections.forEach((_section, index) => command('section', { index }));
    command('practice', { checks: seed.lesson.exercise.checklist.map(() => true) });
    command('answer', { choice: seed.lesson.check.answer });
    const snapshot = detail();
    const record = f.app.findRecordById('tutorials', seed.id);
    record.set('title', 'Operator revision'); record.set('curriculum_version', 'operator.2');
    record.set('lesson', { ...seed.lesson, why: 'An operator clarified the repair.' }); f.app.save(record);
    f.seed('evidence', { id: 'retainedrecord1', workspace: 'ws1', type: 'observed', content: 'Synthetic pre-existing fixture record.' });
    const before = plain(f.data), schemas = plain(f.collections);
    f.migration(MIGRATION).up(); f.migration(MIGRATION).down(); f.migration(MIGRATION).up();
    assert.deepEqual(f.data, before);
    assert.deepEqual(plain(f.collections), schemas);
    assert.deepEqual(detail(), snapshot, 'the learner keeps the originally enrolled content and certificate');
    assert.equal(learning.list(f.event('owner')).points, 100, 'explicit test completion is retained, never multiplied by migration replay');
});

for (const [name, rows] of [
    ['ID occupied by another slug', [{ id: seed.id, slug: 'operator-lesson' }]],
    ['slug occupied by another ID', [{ id: 'operatorlesson1', slug: seed.slug }]],
    ['two matching identities', [{ id: seed.id, slug: seed.slug }, { id: 'operatorlesson1', slug: seed.slug }]],
]) test(`identity collision refuses ${name} without replacing any record`, () => {
    const f = installed();
    rows.forEach((row) => f.seed('tutorials', { ...seed, ...row, title: 'Retained operator lesson' }));
    const before = plain(f.data);
    assert.throws(() => f.migration(MIGRATION).up(), /identity collision/);
    assert.deepEqual(f.data, before);
});

test('wrong bundle versions, identities and missing schema fail without seeding partial state', () => {
    for (const invalid of [null, {}, { ...bundle, version: 'future' }, { ...bundle, lessons: [] },
        { ...bundle, lessons: [seed, seed] }, { ...bundle, lessons: [null] },
        { ...bundle, lessons: [{ ...seed, id: 'anotherlesson01' }] }, { ...bundle, lessons: [{ ...seed, slug: 'another-lesson' }] }]) {
        const f = installed(invalid), before = plain(f.data);
        assert.throws(() => f.migration(MIGRATION).up(), /missing or invalid/);
        assert.deepEqual(f.data, before);
    }
    for (const field of ['slug', 'curriculum_version', 'lesson']) {
        const f = installed(); f.collections.tutorials.fields.removeByName(field);
        const before = plain(f.data);
        assert.throws(() => f.migration(MIGRATION).up(), /schema first/);
        assert.deepEqual(f.data, before);
    }
});

test('a save failure leaves no partially installed lesson and a later retry creates it once', () => {
    const f = installed(), before = plain(f.data), save = f.app.save;
    f.app.save = () => { throw new Error('fixture storage unavailable'); };
    assert.throws(() => f.migration(MIGRATION).up(), /storage unavailable/);
    assert.deepEqual(f.data, before);
    f.app.save = save;
    f.migration(MIGRATION).up(); f.migration(MIGRATION).up();
    assert.equal(f.data.tutorials.filter((row) => row.id === seed.id).length, 1);
});

test('catalogue merges the public case by slug without duplicating persisted identities or replacing edits', () => {
    const lessons = [...starter.lessons, seed];
    const preview = mergeTutorials([], lessons).find((row) => row.catalogueKey === seed.slug);
    assert.equal(preview.persistedId, '');
    assert.equal(`/app/tutorials?lesson=${encodeURIComponent(preview.catalogueKey)}`, '/app/tutorials?lesson=broadcast-classroom-repair');
    const edited = { ...seed, title: 'Operator revision', lesson: { schema_version: 99 } };
    const merged = mergeTutorials([edited], lessons);
    assert.equal(merged.length, 26);
    assert.equal(merged.filter((row) => row.persistedId === seed.id).length, 1);
    assert.equal(merged.find((row) => row.catalogueKey === seed.slug).title, edited.title);
    assert.equal(validLesson(merged.find((row) => row.catalogueKey === seed.slug).lesson), false);
});
