// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/agent-mail-intake-lessons.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-CN-GM-MAIL-INTAKE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-11-21
// Depends:     tests/upgrade/admin-fixture.mjs, tests/upgrade/lesson-keys-fixture.mjs, tests/upgrade/tutorial-learning-fixture.mjs, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1792200000_agent_mail_intake_lessons.js, apps/pocketbase/pb_migrations/data/agent-mail-intake-lessons.json, apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/lesson-keys-fixture.mjs; CONSUMES apps/pocketbase/pb_hooks/tutorial-learning.js; VALIDATES apps/pocketbase/pb_migrations/1792200000_agent_mail_intake_lessons.js; VALIDATES apps/pocketbase/pb_migrations/data/agent-mail-intake-lessons.json; CONSUMES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Validate one public AI-agent mail-intake lesson and its additive migration, and keep internal topology out of it.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fixture, plain, source } from './admin-fixture.mjs';
import { KEY_PATH, lessonKeyServer } from './lesson-keys-fixture.mjs';
import { DBX, faithfulCountRecords } from './tutorial-learning-fixture.mjs';
import { lessonLink, publicLesson, validLesson } from '../../apps/web/src/lib/tutorialCurriculum.js';

const DATA = 'apps/pocketbase/pb_migrations/data/agent-mail-intake-lessons.json';
const MIGRATION = 'apps/pocketbase/pb_migrations/1792200000_agent_mail_intake_lessons.js';
const BROADCAST_MIGRATION = 'apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js';
const bundle = JSON.parse(source(DATA)), seed = bundle.lessons[0];
const others = ['starter-tutorials.json', 'broadcast-classroom-lessons.json', 'government-submissions.json',
    'authority-repairs-lessons.json'].flatMap((name) => JSON.parse(source(`apps/pocketbase/pb_migrations/data/${name}`)).lessons);
// Synthetic grading keys generated at test time from public lesson text, served as the private key file.
const keys = lessonKeyServer();

function installed(data = bundle) {
    const served = lessonKeyServer();
    const f = fixture({ runtime: {
        ...served.runtime,
        $dbx: DBX,
        $security: { sha256: (text) => createHash('sha256').update(text).digest('hex') },
        $os: { ...served.runtime.$os, readFile: (path) => {
            if (path === KEY_PATH) return served.runtime.$os.readFile(path);
            if (path === '/pb_migrations/data/agent-mail-intake-lessons.json') return JSON.stringify(data);
            assert.ok(['/pb_migrations/data/starter-tutorials.json', '/pb_migrations/data/broadcast-classroom-lessons.json'].includes(path));
            return source('apps/pocketbase' + path);
        } },
    } });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    f.migration('apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js').up();
    f.migration(BROADCAST_MIGRATION).up();
    f.migration('apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js').up();
    faithfulCountRecords(f.app);
    served.attach(f.app);
    return f;
}

test('one complete public lesson with a stable identity that collides with no other lesson', () => {
    assert.equal(bundle.version, '2026.11.mailintake.1');
    assert.equal(bundle.lessons.length, 1);
    assert.match(seed.id, /^[a-z0-9]{15}$/);
    assert.equal(seed.slug, 'agent-mail-intake-and-sender-proof');
    assert.equal(seed.category, 'AI agent operations');
    assert.equal(validLesson(seed.lesson), true);
    assert.ok(Buffer.byteLength(JSON.stringify(seed.lesson)) < 65536);
    const all = [...others, seed];
    for (const field of ['id', 'slug']) assert.equal(new Set(all.map((row) => row[field])).size, all.length, field);
    const answer = keys.answerFor(seed.slug);
    assert.ok(Number.isInteger(answer) && answer >= 0 && answer < seed.lesson.check.choices.length, 'the synthetic key indexes a listed choice');
    assert.deepEqual(publicLesson(seed.lesson).check, { question: seed.lesson.check.question, choices: seed.lesson.check.choices });
    for (const path of [DATA, `${DATA}.cgrf.yaml`, MIGRATION, 'tests/upgrade/agent-mail-intake-lessons.test.mjs'])
        assert.doesNotMatch(source(path), /[^\x00-\x7f]/, path);
});

test('the public lesson carries no internal topology, credentials or private addresses', () => {
    const text = JSON.stringify(bundle);
    assert.doesNotMatch(text, /\b\d{1,3}(\.\d{1,3}){3}\b/, 'no IP addresses');
    assert.doesNotMatch(text, /\b(ray-tor\d|mesh-[a-z]+|rig\d|vps|hub)\b/i, 'no machine names');
    assert.doesNotMatch(text, /citadel-nexus\.com|@citadel|supabase|postgrest|email_inbound_log|cf_worker_meta|raw_headers/i,
        'no internal hostnames, mailboxes or table names');
    assert.doesNotMatch(text, /[A-Z][A-Z0-9]+_(KEY|TOKEN|SECRET|PASS)\b/, 'no credential variable names');
    for (const reference of seed.lesson.references) {
        assert.equal(lessonLink(reference.url), reference.url);
        assert.ok(reference.url.startsWith('https://'));
    }
});

test('the lesson teaches every rule the case study measured', () => {
    const text = JSON.stringify(seed.lesson);
    for (const term of ['first Authentication-Results header', 'outside quoted strings', 'fail closed', 'last copy',
        'vendor.example.attacker.test', 'envelope sender', 'falsifiable', 'never from the email', 'human challenge',
        'one of eight', 'cursor', 'idempotency key', 'no consumer', 'did not exist'])
        assert.ok(text.includes(term), term);
    // The correct choice is private golden data (SRS-BUILDANDDO-CURRICULUM-PRIVATE-001): the public check carries its
    // question and choices only, and the key that grades it is generated synthetically for this suite.
    assert.deepEqual(Object.keys(seed.lesson.check).sort(), ['choices', 'question']);
});

test('migration creates only the missing tutorial and leaves every other record and schema alone', () => {
    const f = installed(), before = plain(f.data), schemas = plain(f.collections), writes = [];
    const save = f.app.save;
    f.app.save = function (record) { writes.push(record.collection().name); return save.call(this, record); };
    f.migration(MIGRATION).up();
    assert.deepEqual(writes, ['tutorials']);
    assert.equal(f.data.tutorials.length, before.tutorials.length + 1);
    const saved = f.data.tutorials.find((row) => row.id === seed.id);
    for (const field of Object.keys(seed)) assert.deepEqual(saved[field], seed[field], field);
    assert.equal(saved.curriculum_version, bundle.version);
    assert.deepEqual(f.data.tutorials.filter((row) => row.id !== seed.id), before.tutorials);
    for (const name of Object.keys(before).filter((name) => name !== 'tutorials')) assert.deepEqual(f.data[name], before[name], name);
    assert.deepEqual(plain(f.collections), schemas);
});

test('a learner can complete the lesson through the production learning source and earn its certificate', () => {
    const f = installed(); f.migration(MIGRATION).up();
    const learning = f.load('tutorial-learning.js');
    const detail = () => plain(learning.detail(f.event('owner', {}, { id: seed.id })));
    const first = detail();
    assert.deepEqual(first.tutorial.lesson.check, { question: seed.lesson.check.question, choices: seed.lesson.check.choices });
    assert.equal(first.enrollment, null);
    const digest = first.tutorial.content_digest;
    const command = (action, payload = {}) => learning.command(f.event('owner', { action, payload, content_digest: digest }, { id: seed.id }));
    command('start');
    seed.lesson.sections.forEach((_section, index) => command('section', { index }));
    command('practice', { checks: seed.lesson.exercise.checklist.map(() => true) });
    command('answer', { choice: keys.answerFor(seed.slug) });
    assert.ok(detail().enrollment.certificate);
});

test('replaying the migration preserves operator edits; identity collisions refuse without writing', () => {
    const f = installed(); f.migration(MIGRATION).up();
    const record = f.app.findRecordById('tutorials', seed.id);
    record.set('title', 'Operator clarification'); f.app.save(record);
    const before = plain(f.data);
    f.migration(MIGRATION).up(); f.migration(MIGRATION).down(); f.migration(MIGRATION).up();
    assert.deepEqual(f.data, before);
    for (const rows of [[{ id: seed.id, slug: 'operator-lesson' }], [{ id: 'operatorlesson1', slug: seed.slug }]]) {
        const g = installed();
        rows.forEach((row) => g.seed('tutorials', { ...seed, ...row, title: 'Retained operator lesson' }));
        const kept = plain(g.data);
        assert.throws(() => g.migration(MIGRATION).up(), /identity collision/);
        assert.deepEqual(g.data, kept);
    }
    for (const invalid of [null, {}, { ...bundle, version: 'future' }, { ...bundle, lessons: [] }, { ...bundle, lessons: [seed, seed] }]) {
        const g = installed(invalid), kept = plain(g.data);
        assert.throws(() => g.migration(MIGRATION).up(), /missing or invalid/);
        assert.deepEqual(g.data, kept);
    }
});
