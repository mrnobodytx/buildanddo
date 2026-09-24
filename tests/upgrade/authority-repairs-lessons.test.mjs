// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/authority-repairs-lessons.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1791500002_authority_repair_lessons.js, apps/pocketbase/pb_migrations/data/authority-repairs-lessons.json, apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES apps/pocketbase/pb_hooks/tutorial-learning.js; VALIDATES apps/pocketbase/pb_migrations/1791500002_authority_repair_lessons.js; VALIDATES apps/pocketbase/pb_migrations/data/authority-repairs-lessons.json; CONSUMES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Validate one source-only lesson and additive migration while preserving prior lessons, snapshots and evidence.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fixture, plain, repoPath, source } from './admin-fixture.mjs';
import { DBX, faithfulCountRecords } from './tutorial-learning-fixture.mjs';
import { lessonLink, mergeTutorials, validLesson } from '../../apps/web/src/lib/tutorialCurriculum.js';

const DATA = 'apps/pocketbase/pb_migrations/data/authority-repairs-lessons.json';
const MIGRATION = 'apps/pocketbase/pb_migrations/1791500002_authority_repair_lessons.js';
const BROADCAST_MIGRATION = 'apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js';
const bundle = JSON.parse(source(DATA)), seed = bundle.lessons[0];
const starter = JSON.parse(source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'));
const broadcast = JSON.parse(source('apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json'));

function installed(data = bundle) {
    const f = fixture({ runtime: {
        toString: String,
        $dbx: DBX,
        $security: { sha256: (text) => createHash('sha256').update(text).digest('hex') },
        $os: { readFile: (path) => {
            if (path === '/pb_migrations/data/authority-repairs-lessons.json') return JSON.stringify(data);
            assert.ok(['/pb_migrations/data/starter-tutorials.json', '/pb_migrations/data/broadcast-classroom-lessons.json'].includes(path));
            return source('apps/pocketbase' + path);
        } },
    } });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    f.migration('apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js').up();
    f.migration(BROADCAST_MIGRATION).up();
    f.migration('apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js').up();
    // PocketBase's countRecords takes dbx expressions only; a filter-string double would accept the call
    // shape PocketBase refuses (see tutorial-learning-fixture.mjs).
    faithfulCountRecords(f.app);
    return f;
}

test('one complete public authority lesson extends the existing catalogues with a stable unique identity', () => {
    assert.equal(bundle.version, '2026.09.authority.1');
    assert.equal(bundle.lessons.length, 1);
    assert.match(seed.id, /^[a-z0-9]{15}$/);
    assert.equal(seed.slug, 'test-isolation-and-claim-authority');
    assert.equal(seed.category, 'Source case studies');
    assert.equal(seed.order, 27);
    assert.equal(validLesson(seed.lesson), true);
    assert.ok(Buffer.byteLength(JSON.stringify(seed.lesson)) < 65536);
    const all = [...starter.lessons, ...broadcast.lessons,
        ...JSON.parse(source('apps/pocketbase/pb_migrations/data/government-submissions.json')).lessons, seed];
    for (const field of ['id', 'slug']) assert.equal(new Set(all.map((row) => row[field])).size, all.length);
    for (const path of [DATA, `${DATA}.cgrf.yaml`, MIGRATION, 'tests/upgrade/authority-repairs-lessons.test.mjs'])
        assert.doesNotMatch(source(path), /[^\x00-\x7f]/);
    assert.match(source(`${DATA}.cgrf.yaml`), /SRS-BUILDANDDO-UPGRADE-001/);
    assert.match(source(`${DATA}.cgrf.yaml`), /VCC-BUILDANDDO-UPGRADE-001/);
});

test('references use existing pre-repair public source and new candidate files remain plain paths', () => {
    const prefix = 'https://github.com/mrnobodytx/buildanddo/blob/8794db89880a7d5b644fe9b3da5f5b1ab47244ad/';
    assert.ok(seed.lesson.references.some((reference) => reference.url === '/app/evidence'));
    for (const reference of seed.lesson.references) {
        assert.equal(lessonLink(reference.url), reference.url);
        if (['/app/evidence', '/authority-repairs-source.txt', '/authority-repairs-final-source.txt', '/authority-repairs-recovery-source.txt'].includes(reference.url)) continue;
        assert.ok(reference.url.startsWith(prefix));
        assert.match(reference.label, /inspected pre-repair revision/);
        assert.ok(source(reference.url.slice(prefix.length)).length > 0);
    }
    for (const path of ['services/praxis_evidence/isolated_test.py', 'apps/pocketbase/pb_hooks/workspace-claims.js', MIGRATION,
        'tests/upgrade/authority-repairs-lessons.test.mjs']) {
        assert.ok(seed.lesson.preparation.some((line) => line.includes(path)));
        assert.equal(seed.lesson.references.some((reference) => reference.url.endsWith(path)), false);
    }
    for (const invalid of ['//foreign.invalid', 'javascript:alert(1)', '/\\foreign.invalid', 'https://user:pass@example.invalid'])
        assert.equal(validLesson({ ...seed.lesson, references: [{ label: 'Invalid', url: invalid }] }), false);
});

test('the lesson distinguishes claim authorities and binds only the recorded source run', () => {
    const text = JSON.stringify(seed.lesson);
    for (const term of ['report', 'ordered open-book', 'independent review', 'payment observation', 'OSS', 'secure exam',
        'runner-owned', 'loopback', 'PB_API_URL', 'before authentication or writes', 'Raw progress writes are locked',
        'Missions already produce scoped observations', 'historical artifact', 'not this repair',
        'support_sources', 'corrections', 'daily_editions', 'specialist_desks', 'social_content', 'social_channels', 'seat_events'])
        assert.ok(text.includes(term), term);
    assert.match(seed.lesson.check.choices[seed.lesson.check.answer], /independent review and payment remain unverified/);
    const evidence = bundle.source_evidence;
    assert.ok(text.includes(evidence.boundary));
    assert.deepEqual(evidence.validation.map((check) => check.status), ['recorded source pass', 'blocked', 'blocked', 'unmeasured']);
    const observation = evidence.observation;
    assert.equal(observation.kind, 'local_source_regression');
    assert.ok(Number.isFinite(Date.parse(observation.observed_at)));
    assert.equal(observation.exit_code, 0);
    assert.equal(observation.counts.tests, observation.counts.pass);
    assert.ok(observation.counts.tests > 0);
    assert.equal(observation.counts.fail, 0); assert.equal(observation.counts.skipped, 0);
    assert.deepEqual(observation.source_files, [...new Set(observation.source_files)].sort());
    const digest = createHash('sha256');
    const revision = evidence.source_revision;
    assert.match(revision, /^[a-f0-9]{40}$/);
    for (const path of observation.source_files) {
        assert.ok(path === '.gitlab-ci.yml' || /^(apps|services|tests)\/[a-zA-Z0-9/_.-]+$/.test(path));
        assert.equal(path.includes('..'), false);
        const capturedSource = execFileSync('git', ['show', `${revision}:${path}`], { cwd: repoPath('.'),
            env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } });
        digest.update(path + '\0').update(createHash('sha256').update(capturedSource).digest());
    }
    assert.equal(digest.digest('hex'), observation.source_sha256, 'Historical results bind their recorded revision, never newer source.');
    assert.equal(evidence.artifact.url, '/authority-repairs-recovery-source.txt');
    const capture = source('apps/web/public' + evidence.artifact.url);
    assert.equal(createHash('sha256').update(capture).digest('hex'), evidence.artifact.sha256);
    const raw = capture.slice(capture.indexOf('COMMAND: '));
    assert.equal(createHash('sha256').update(raw).digest('hex'), observation.output_sha256);
    assert.match(raw, /# tests 99\n/); assert.match(raw, /# fail 0\n/); assert.match(raw, /# skipped 0\n/);
    assert.match(raw, /Ran 36 tests in /); assert.match(raw, /\nOK\n/);
    assert.deepEqual(evidence.previous_artifacts.map((entry) => entry.url), ['/authority-repairs-source.txt', '/authority-repairs-final-source.txt']);
    for (const previous of evidence.previous_artifacts)
        assert.equal(createHash('sha256').update(source('apps/web/public' + previous.url)).digest('hex'), previous.sha256);
    for (const check of evidence.validation) {
        assert.deepEqual(Object.keys(check).sort(), ['commands', 'description', 'label', 'status']);
        assert.ok(check.description.length > 40);
        assert.ok(check.commands.every((command) => typeof command === 'string' && command.length > 0));
    }
    assert.deepEqual(evidence.validation[0].commands.slice(0, 2), observation.command.split('\n'));
    assert.equal(evidence.validation[0].commands[2], 'node --test tests/upgrade/authority-repairs-lessons.test.mjs tests/upgrade/broadcast-lessons.test.mjs');
    assert.equal(evidence.validation[2].commands.length, 6);
    assert.deepEqual(evidence.validation[3].commands, []);
    assert.doesNotMatch(JSON.stringify(evidence.validation), /PB_API_URL=|--provision/);
});

test('migration creates only the missing tutorial, preserving the prior broadcast lesson and every other collection', () => {
    const f = installed(), before = plain(f.data), schemas = plain(f.collections), writes = [];
    const save = f.app.save;
    f.app.save = function (record) { writes.push(record.collection().name); return save.call(this, record); };
    f.migration(MIGRATION).up();
    assert.deepEqual(writes, ['tutorials']);
    assert.equal(f.data.tutorials.length, 27);
    const saved = f.data.tutorials.find((row) => row.id === seed.id);
    for (const field of Object.keys(seed)) assert.deepEqual(saved[field], seed[field], field);
    assert.equal(saved.curriculum_version, bundle.version);
    assert.equal(saved.source_evidence, undefined);
    assert.deepEqual(f.data.tutorials.filter((row) => row.id !== seed.id), before.tutorials);
    for (const name of Object.keys(before).filter((name) => name !== 'tutorials')) assert.deepEqual(f.data[name], before[name], name);
    assert.deepEqual(plain(f.collections), schemas);
});

test('the production learning source accepts the authored lesson without enrolling or writing on read', () => {
    const f = installed(); f.migration(MIGRATION).up();
    const before = plain(f.data), learning = f.load('tutorial-learning.js');
    const result = plain(learning.detail(f.event('owner', {}, { id: seed.id })));
    assert.deepEqual(result.tutorial.lesson, { ...seed.lesson,
        check: { question: seed.lesson.check.question, choices: seed.lesson.check.choices } });
    assert.equal(result.tutorial.curriculum_version, bundle.version);
    assert.equal(result.enrollment, null);
    assert.equal(learning.list(f.event('owner')).points, 0);
    assert.deepEqual(f.data, before, 'reads retain full authored content and leave evidence, progress and points unchanged');
});

test('up/down replay preserves operator edits, completed snapshots, certificates and historical records', () => {
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
    assert.ok(snapshot.enrollment.certificate);
    const record = f.app.findRecordById('tutorials', seed.id);
    record.set('title', 'Operator clarification'); record.set('curriculum_version', 'operator.2');
    record.set('lesson', { ...seed.lesson, why: 'Keep this operator-authored clarification.' }); f.app.save(record);
    f.seed('tutorial_progress', { id: 'legacyreading01', owner: 'owner', tutorial: seed.id, status: 'completed', progress: 100 });
    f.seed('evidence', { id: 'historicalnote1', workspace: 'ws1', type: 'observed', content: 'Synthetic pre-existing report.' });
    const before = plain(f.data), schemas = plain(f.collections), points = learning.list(f.event('owner')).points;
    f.migration(MIGRATION).up(); f.migration(MIGRATION).down(); f.migration(MIGRATION).up();
    f.migration(BROADCAST_MIGRATION).up();
    assert.deepEqual(f.data, before);
    assert.deepEqual(plain(f.collections), schemas);
    assert.deepEqual(detail(), snapshot);
    assert.equal(learning.list(f.event('owner')).points, points);
});

for (const [name, rows] of [
    ['ID occupied by another slug', [{ id: seed.id, slug: 'operator-lesson' }]],
    ['slug occupied by another ID', [{ id: 'operatorlesson1', slug: seed.slug }]],
    ['two matching identities', [{ id: seed.id, slug: seed.slug }, { id: 'operatorlesson1', slug: seed.slug }]],
]) test(`identity collision refuses ${name} without replacing records`, () => {
    const f = installed();
    rows.forEach((row) => f.seed('tutorials', { ...seed, ...row, title: 'Retained operator lesson' }));
    const before = plain(f.data);
    assert.throws(() => f.migration(MIGRATION).up(), /identity collision/);
    assert.deepEqual(f.data, before);
});

test('invalid bundle identities and missing schema fail without partial seeding', () => {
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

test('save failure rolls back the data addition and retry installs the lesson only once', () => {
    const f = installed(), before = plain(f.data), save = f.app.save;
    f.app.save = () => { throw new Error('fixture storage unavailable'); };
    assert.throws(() => f.migration(MIGRATION).up(), /storage unavailable/);
    assert.deepEqual(f.data, before);
    f.app.save = save;
    f.migration(MIGRATION).up(); f.migration(MIGRATION).up();
    assert.equal(f.data.tutorials.filter((row) => row.id === seed.id).length, 1);
});

test('both source cases merge once while persisted operator content remains authoritative', () => {
    const lessons = [...starter.lessons, ...broadcast.lessons, seed];
    const preview = mergeTutorials([], lessons).find((row) => row.catalogueKey === seed.slug);
    assert.equal(preview.persistedId, '');
    assert.equal(validLesson(preview.lesson), true);
    const edited = { ...seed, title: 'Operator revision', lesson: { schema_version: 99 } };
    const merged = mergeTutorials([edited, broadcast.lessons[0]], lessons);
    assert.equal(merged.length, 27);
    assert.equal(merged.filter((row) => row.persistedId === seed.id).length, 1);
    assert.equal(merged.filter((row) => row.persistedId === broadcast.lessons[0].id).length, 1);
    assert.equal(merged.find((row) => row.catalogueKey === seed.slug).title, edited.title);
    assert.equal(validLesson(merged.find((row) => row.catalogueKey === seed.slug).lesson), false);
});
