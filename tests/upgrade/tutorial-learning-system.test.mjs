// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/tutorial-learning-system.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     tests/upgrade/tutorial-learning-fixture.mjs, apps/pocketbase/pb_hooks/tutorial-learning.pb.js, apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/tutorial-learning-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/tutorial-learning.pb.js; VALIDATES apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
// DAG Node:    none
// Intent:      Prevent unearned certificates, duplicate credit, cross-account reads and partial completion receipts.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { plain, source } from './admin-fixture.mjs';
import { learningFixture, MIGRATION } from './tutorial-learning-fixture.mjs';

test('reading does not enroll; checkpoints, practice and correct answer award one durable completion', () => {
    const f = learningFixture();
    assert.equal(f.detail().enrollment, null);
    assert.equal(f.list().points, 0);
    assert.equal(f.data.tutorial_learning.length, 0);
    const first = f.command('start');
    assert.equal(first.enrollment.next_section, 0);
    f.command('section', { index: 0 });
    assert.equal(f.detail().enrollment.next_section, 1);
    assert.equal(f.list().points, 0);
    const result = f.finish();
    assert.equal(result.enrollment.status, 'completed');
    assert.equal(result.enrollment.progress, 100);
    assert.equal(result.enrollment.points, 100);
    assert.equal(result.enrollment.certificate.learner, 'Test Learner');
    assert.equal(result.enrollment.certificate.title, f.lessons[0].title);
    assert.equal(result.enrollment.certificate.content_digest, first.tutorial.content_digest);
    assert.equal(result.enrollment.certificate.issuer, 'BuildAndDo · Citadel Nexus Inc.');
    assert.equal(f.data.tutorial_progress.length, 1);
    assert.equal(f.data.tutorial_progress[0].status, 'completed');
    assert.equal(f.list().completed, 1);
    assert.equal(f.list().points, 100);
    assert.equal(f.list().level.name, 'Practitioner');
    assert.equal(f.list().milestones[0].earned, true);
    assert.deepEqual(f.detail().enrollment.certificate, result.enrollment.certificate);
});

test('cannot skip sections, practice, or the server-checked answer', () => {
    const f = learningFixture();
    assert.throws(() => f.command('answer', { choice: f.lessons[0].lesson.check.answer }), /Start/);
    f.command('start');
    assert.throws(() => f.command('section', { index: 1 }), /order/);
    assert.throws(() => f.command('practice', { checks: [true] }), /sections/);
    assert.throws(() => f.command('answer', { choice: f.lessons[0].lesson.check.answer }), /practice/);
    for (let index = 0; index < f.lessons[0].lesson.sections.length; index++) f.command('section', { index });
    assert.throws(() => f.command('practice', { checks: [true] }), /checklist/);
    const checks = f.lessons[0].lesson.exercise.checklist.map(() => true);
    assert.throws(() => f.command('practice', { checks: checks.map(() => false) }), /checklist/);
    f.command('practice', { checks });
    const wrong = f.command('answer', { choice: (f.lessons[0].lesson.check.answer + 1) % 3 });
    assert.equal(wrong.feedback.correct, false);
    assert.equal(wrong.enrollment.certificate, null);
    assert.equal(wrong.enrollment.points, 0);
    assert.equal(f.data.tutorial_progress[0].status, 'in_progress');
    assert.equal(f.list().completed, 0);
    assert.equal(f.command('answer', { choice: f.lessons[0].lesson.check.answer }).feedback.correct, true);
});

test('retries, replay after completion and repeated enrollment cannot farm points or replace a certificate', () => {
    const f = learningFixture();
    const first = f.finish();
    const persisted = JSON.stringify(f.data);
    for (let i = 0; i < 3; i++) assert.deepEqual(f.finish().enrollment, first.enrollment);
    assert.equal(f.command('section', { index: 0 }).replayed, true);
    assert.equal(JSON.stringify(f.data), persisted);
    assert.equal(f.list().points, 100);
    assert.equal(f.data.tutorial_learning.length, 1);
});

test('enrollment freezes content and records the original version even if the catalogue changes', () => {
    const f = learningFixture();
    const first = f.command('start');
    const stored = f.data.tutorials.find((row) => row.id === f.lessons[0].id);
    stored.title = 'Edited title';
    stored.lesson.check.answer = 0;
    stored.curriculum_version = 'next';
    assert.equal(f.detail().tutorial.title, first.tutorial.title);
    assert.equal(f.detail().tutorial.lesson.check.answer, first.tutorial.lesson.check.answer);
    assert.equal(f.finish().enrollment.certificate.curriculum_version, first.tutorial.curriculum_version);
    assert.equal(f.list().certificates.items[0].certificate.title, first.tutorial.title);
});

test('starting stale or unsupported catalogue content fails before creating learning records', () => {
    const f = learningFixture();
    const digest = f.detail().tutorial.content_digest;
    const stored = f.data.tutorials.find((row) => row.id === f.lessons[0].id);
    stored.lesson.why = 'Changed explanation';
    assert.throws(() => f.command('start', {}, { digest }), /changed/);
    f.data.tutorials.find((row) => row.id === f.lessons[0].id).lesson.schema_version = 99;
    assert.throws(() => f.detail(), /supported/);
    assert.equal(f.data.tutorial_learning.length, 0);
});

test('native authentication, current account and lesson visibility are checked on every operation', () => {
    const f = learningFixture();
    f.finish();
    for (const operation of [() => f.detail(undefined, ''), () => f.list(''), () => f.command('start', {}, { actor: '' })])
        assert.throws(operation, /Sign in/);
    assert.equal(f.detail(undefined, 'otherowner').enrollment, null);
    assert.equal(f.list('otherowner').points, 0);
    f.finish({ actor: 'otherowner' });
    assert.equal(f.data.tutorial_learning.length, 2);
    assert.notEqual(f.detail().enrollment.certificate.id, f.detail(undefined, 'otherowner').enrollment.certificate.id);
    f.denied.add(f.lessons[0].id);
    assert.throws(() => f.detail(), /readable/);
    assert.throws(() => f.command('start', {}, { digest: 'a'.repeat(64) }), /readable/);
    assert.equal(f.list().certificates.items.length, 1, 'own earned certificate remains in personal history');
});

test('no supplied owner, point, certificate, unknown action or malformed checkpoint can be trusted', () => {
    const f = learningFixture();
    const id = f.lessons[0].id;
    const digest = f.detail().tutorial.content_digest;
    const bad = [
        { action: 'start', payload: {}, content_digest: digest, owner: 'otherowner' },
        { action: 'start', payload: { points: 100 }, content_digest: digest },
        { action: 'complete', payload: {}, content_digest: digest },
        { action: 'start', payload: {}, content_digest: 'invalid' },
        { action: 'start', payload: [], content_digest: digest },
    ];
    for (const body of bad) assert.throws(() => f.service.command(f.event('owner', body, { id })));
    f.command('start');
    for (const index of [-1, 0.5, '0', 100, null]) assert.throws(() => f.command('section', { index }));
    for (const choice of [-1, '1', 9, null]) assert.throws(() => f.command('answer', { choice }));
    assert.equal(f.list().points, 0);
});

test('completion and its legacy progress projection roll back together on storage failure', () => {
    const f = learningFixture();
    f.command('start');
    for (let index = 0; index < f.lessons[0].lesson.sections.length; index++) f.command('section', { index });
    f.command('practice', { checks: f.lessons[0].lesson.exercise.checklist.map(() => true) });
    const before = plain(f.data);
    const save = f.app.save;
    f.app.save = function (record) { if (record.collection?.().name === 'tutorial_progress') throw new Error('storage unavailable'); return save.call(this, record); };
    assert.throws(() => f.command('answer', { choice: f.lessons[0].lesson.check.answer }), /storage unavailable/);
    assert.deepEqual(f.data, before);
    f.app.save = save;
    assert.equal(f.finish().enrollment.points, 100);
});

test('legacy completed progress is retained without creating retroactive credit', () => {
    const f = learningFixture();
    f.seed('tutorial_progress', { id: 'legacyone', tutorial: f.lessons[0].id, owner: 'owner', status: 'completed', progress: 100 });
    f.seed('tutorial_progress', { id: 'legacytwo', tutorial: f.lessons[0].id, owner: 'owner', status: 'in_progress', progress: 50 });
    assert.equal(f.list().points, 0);
    f.command('start');
    f.command('section', { index: 0 });
    assert.equal(f.data.tutorial_progress[0].status, 'completed');
    assert.equal(f.data.tutorial_progress[1].progress, 50);
    f.finish();
    assert.equal(f.data.tutorial_progress.length, 2);
    assert.equal(f.list().points, 100);
});

test('growth milestones derive from distinct completions and certificate pages do not truncate totals', () => {
    const f = learningFixture();
    for (const lesson of f.lessons.slice(0, 6)) f.finish({ id: lesson.id });
    const result = f.list();
    assert.equal(result.points, 600);
    assert.equal(result.completed, 6);
    assert.equal(result.level.name, 'Builder');
    assert.equal(result.milestones[1].earned, true);
    assert.equal(result.milestones[2].earned, false);
    assert.equal(result.certificates.items.length, 5);
    assert.equal(result.certificates.has_more, true);
    assert.equal(f.list('owner', { page: '2' }).certificates.items.length, 1);
    assert.throws(() => f.list('owner', { page: '0' }));
});

test('migration replays, keeps API writes locked and disables commands on down without deleting history', () => {
    const f = learningFixture();
    f.finish();
    const original = plain(f.data.tutorial_learning);
    f.migration(MIGRATION).up();
    const collection = f.collections.tutorial_learning;
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(collection[key], null);
    assert.ok(collection.indexes.some((index) => /unique.*owner, tutorial/i.test(index)));
    f.migration(MIGRATION).down();
    assert.throws(() => f.list(), /installed|upgrade/);
    assert.deepEqual(f.data.tutorial_learning, original);
    f.migration(MIGRATION).up();
    assert.deepEqual(f.detail().enrollment.certificate, original[0].certificate);
    collection.updateRule = '';
    assert.throws(() => f.list(), /review/);
    assert.throws(() => f.migration(MIGRATION).up(), /Review/);
});

test('missing installation, identity constraints and corrupt checkpoints fail closed', () => {
    const f = learningFixture();
    const find = f.app.findCollectionByNameOrId;
    f.app.findCollectionByNameOrId = function (name) {
        if (name === 'tutorial_learning') throw new Error('sql: no rows in result set');
        return find.call(this, name);
    };
    assert.throws(() => f.list(), /not installed/);
    f.app.findCollectionByNameOrId = find;
    const indexes = f.collections.tutorial_learning.indexes;
    f.collections.tutorial_learning.indexes = [];
    assert.throws(() => f.command('start'), /identity constraints/);
    f.collections.tutorial_learning.indexes = indexes;
    f.command('start');
    f.data.tutorial_learning[0].practiced = true;
    assert.throws(() => f.detail(), /checkpoints/);
    f.data.tutorial_learning[0].practiced = false;
    f.data.tutorial_learning[0].snapshot.title = 'Altered snapshot';
    assert.throws(() => f.detail(), /saved lesson/);
});

test('routes require native users auth and keep responses uncached with bounded command bodies', () => {
    const routes = [];
    const auth = { native: 'users' };
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/tutorial-learning.pb.js'), {
        __hooks: '/hooks', routerAdd: (...args) => routes.push(args),
        $apis: { requireAuth: (collection) => { assert.equal(collection, 'users'); return auth; }, bodyLimit: (bytes) => ({ bytes }) },
        require: () => ({ list: () => 'list', detail: () => 'detail', command: () => 'command' }),
    }, { filename: new URL('../../apps/pocketbase/pb_hooks/tutorial-learning.pb.js', import.meta.url).href });
    assert.equal(routes.length, 3);
    for (const [verb, path, handler, middleware, limit] of routes) {
        assert.equal(middleware, auth); assert.match(path, /^\/api\/buildanddo\/learning/);
        const headers = {};
        handler({ response: { header: () => ({ set: (key, value) => { headers[key] = value; } }) }, json: (status) => assert.equal(status, 200) });
        assert.equal(headers['Cache-Control'], 'no-store');
        if (verb === 'POST') assert.equal(limit.bytes, 4000);
    }
});
