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
// Depends:     tests/upgrade/tutorial-learning-fixture.mjs, apps/pocketbase/pb_hooks/tutorial-learning.pb.js, apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js, apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/tutorial-learning-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/tutorial-learning.pb.js; VALIDATES apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js; VALIDATES apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js
// DAG Node:    none
// Intent:      Prevent unearned certificates, duplicate credit, cross-account reads and partial completion receipts.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { plain, source } from './admin-fixture.mjs';
import { learningFixture, MIGRATION, PROGRESS_MIGRATION } from './tutorial-learning-fixture.mjs';

function nativeProgressShape(f, { rules = true, fields = true } = {}) {
    const collection = f.collections.tutorial_progress;
    if (rules) for (const name of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[name] !== null) collection[name] = new String(collection[name]);
    if (fields) for (const name of ['owner', 'tutorial', 'status', 'progress']) {
        const field = collection.fields.getByName(name), type = field.type;
        field.type = function () { assert.equal(this, field); return new String(type); };
        for (const key of ['required', 'cascadeDelete'])
            if (typeof field[key] === 'boolean') field[key] = new Boolean(field[key]);
    }
    return collection;
}

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
    assert.equal(f.data.tutorial_progress.length, 0, 'guided commands do not overwrite historical reading records');
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
    assert.equal(f.data.tutorial_progress.length, 0);
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
    assert.deepEqual(f.detail().tutorial.lesson.check, first.tutorial.lesson.check);
    assert.equal(f.data.tutorial_learning[0].snapshot.lesson.check.answer, f.lessons[0].lesson.check.answer);
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
    assert.throws(() => f.list(), /readable/, 'history bytes remain saved but revoked lesson context is not disclosed');
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

test('completion checkpoints and certificate roll back together on storage failure', () => {
    const f = learningFixture();
    f.command('start');
    for (let index = 0; index < f.lessons[0].lesson.sections.length; index++) f.command('section', { index });
    f.command('practice', { checks: f.lessons[0].lesson.exercise.checklist.map(() => true) });
    const before = plain(f.data);
    const save = f.app.save;
    f.app.save = function (record) { save.call(this, record); throw new Error('storage unavailable'); };
    assert.throws(() => f.command('answer', { choice: f.lessons[0].lesson.check.answer }), /storage unavailable/);
    assert.deepEqual(f.data, before);
    f.app.save = save;
    assert.equal(f.finish().enrollment.points, 100);
});

test('legacy completed progress is retained without creating retroactive credit', () => {
    const f = learningFixture();
    f.seed('tutorial_progress', { id: 'legacyone', tutorial: f.lessons[0].id, owner: 'owner', status: 'completed', progress: 100 });
    f.seed('tutorial_progress', { id: 'legacytwo', tutorial: f.lessons[0].id, owner: 'owner', status: 'in_progress', progress: 50 });
    const history = plain(f.data.tutorial_progress);
    assert.equal(f.list().points, 0);
    f.command('start');
    f.command('section', { index: 0 });
    assert.equal(f.data.tutorial_progress[0].status, 'completed');
    assert.equal(f.data.tutorial_progress[1].progress, 50);
    f.finish();
    assert.equal(f.data.tutorial_progress.length, 2);
    assert.equal(f.list().points, 100);
    assert.deepEqual(f.data.tutorial_progress, history, 'all duplicate history bytes survive real guided completion');
});

test('learner detail and command responses are keyless while frozen snapshots and grading stay full', () => {
    const f = learningFixture();
    const check = f.lessons[0].lesson.check;
    const keyless = (value) => {
        assert.deepEqual(value.tutorial.lesson.check, { question: check.question, choices: check.choices });
        assert.equal(JSON.stringify(value.tutorial).includes(check.explanation), false);
    };
    const initial = f.detail(); keyless(initial);
    const started = f.command('start'); keyless(started);
    const snapshot = plain(f.data.tutorial_learning[0].snapshot);
    assert.deepEqual(snapshot.lesson, f.lessons[0].lesson);
    assert.equal(started.tutorial.content_digest, initial.tutorial.content_digest);
    for (let index = 0; index < f.lessons[0].lesson.sections.length; index++) keyless(f.command('section', { index }));
    keyless(f.command('practice', { checks: f.lessons[0].lesson.exercise.checklist.map(() => true) }));
    const wrong = f.command('answer', { choice: (check.answer + 1) % check.choices.length }); keyless(wrong);
    assert.deepEqual(wrong.feedback, { correct: false, explanation: check.explanation });
    const finished = f.command('answer', { choice: check.answer }); keyless(finished); keyless(f.detail());
    assert.deepEqual(finished.feedback, { correct: true, explanation: check.explanation });
    assert.match(finished.enrollment.certificate.scope, /open-book tutorial completion; practice self-reported/);
    assert.deepEqual(f.data.tutorial_learning[0].snapshot, snapshot);
    assert.equal(f.data.tutorial_learning[0].content_digest, initial.tutorial.content_digest);
    assert.equal(f.command('answer', { choice: check.answer }).replayed, true);
    assert.deepEqual(f.detail().enrollment.certificate, finished.enrollment.certificate);
});

test('canonical state pages include active learning and completions beyond the certificate page without legacy claims', () => {
    const f = learningFixture();
    for (const lesson of f.lessons.slice(0, 6)) f.finish({ id: lesson.id });
    for (const lesson of f.lessons.slice(6)) f.command('start', {}, { id: lesson.id });
    f.finish({ actor: 'otherowner' });
    f.seed('tutorial_progress', { id: 'legacyclaim', owner: 'owner', tutorial: f.lessons[6].id, status: 'completed', progress: 100 });
    const read = (actor = 'owner', page = '1') => plain(f.service.states(f.event(actor, {}, { query: { page } })));
    const first = read(), second = read('owner', '2');
    assert.equal(first.account_id, 'owner'); assert.equal(first.schema_version, 1);
    assert.equal(first.page, 1); assert.equal(first.has_more, true); assert.equal(first.items.length, 20);
    assert.equal(second.page, 2); assert.equal(second.has_more, false); assert.equal(second.items.length, 5);
    const items = [...first.items, ...second.items];
    assert.equal(new Set(items.map((row) => row.tutorial)).size, 25);
    assert.equal(items.filter((row) => row.status === 'completed').length, 6);
    assert.equal(items.find((row) => row.tutorial === f.lessons[6].id).status, 'in_progress');
    assert.ok(items.every((row) => row.owner === 'owner' && !('snapshot' in row)));
    assert.equal(read('otherowner').items.length, 1);
    assert.equal(read('outsider').items.length, 0);
    assert.throws(() => read('', '1'), /Sign in/);
    for (const page of ['0', '-1', '10000', '1.5']) assert.throws(() => read('owner', page), /page/);
});

test('state pages fail closed on revoked, missing or corrupt current lesson context without rewriting history', () => {
    for (const failure of ['revoked', 'missing', 'snapshot', 'digest', 'checkpoint', 'account']) {
        const f = learningFixture(); f.finish();
        const event = f.event('owner');
        if (failure === 'revoked') f.denied.add(f.lessons[0].id);
        if (failure === 'missing') f.app.delete(f.app.findRecordById('tutorials', f.lessons[0].id));
        if (failure === 'snapshot') f.data.tutorial_learning[0].snapshot.lesson = {};
        if (failure === 'digest') f.data.tutorial_learning[0].content_digest = 'b'.repeat(64);
        if (failure === 'checkpoint') f.data.tutorial_learning[0].next_section = 99;
        if (failure === 'account') f.app.delete(f.app.findRecordById('users', 'owner'));
        const before = plain(f.data);
        assert.throws(() => f.service.states(event), (error) => [403, 404, 503].includes(error.status), failure);
        assert.deepEqual(f.data, before);
    }
});

test('progress authority migration locks raw writes, preserves owner reads and all duplicate history on replay and down', () => {
    const f = learningFixture({ progressAuthority: false }); f.finish();
    f.data.tutorial_learning[0].certificate.achievement = 'Completed lesson sections, recorded the practice checklist and passed the knowledge check.';
    f.data.tutorial_learning[0].certificate.scope = 'Course completion. No external accreditation or professional qualification.';
    for (const status of ['completed', 'in_progress']) f.seed('tutorial_progress', {
        owner: 'owner', tutorial: f.lessons[0].id, status, progress: status === 'completed' ? 100 : 50,
    });
    const before = plain(f.data), collection = f.collections.tutorial_progress;
    const fields = plain(collection.fields), indexes = plain(collection.indexes);
    const rules = { listRule: collection.listRule, viewRule: collection.viewRule };
    const migration = f.migration(PROGRESS_MIGRATION);
    for (const action of ['up', 'up', 'down', 'down', 'up']) {
        migration[action]();
        assert.deepEqual(f.data, before);
        assert.deepEqual(plain(collection.fields), fields); assert.deepEqual(plain(collection.indexes), indexes);
        for (const [key, rule] of Object.entries(rules)) assert.equal(collection[key], rule);
        for (const key of ['createRule', 'updateRule', 'deleteRule']) assert.equal(collection[key], null);
    }
    assert.deepEqual(f.detail().enrollment.certificate, before.tutorial_learning[0].certificate);
    assert.equal(f.finish().replayed, true);
    assert.deepEqual(f.data, before, 'historical certificate wording and all saved bytes survive reads and command replay');
});

test('progress migration accepts boxed native rules without changing owner reads, fields or history', () => {
    const f = learningFixture({ progressAuthority: false }); f.finish();
    f.seed('tutorial_progress', { owner: 'owner', tutorial: f.lessons[0].id, status: 'completed', progress: 100 });
    const collection = nativeProgressShape(f, { fields: false });
    const before = plain(f.data), fields = plain(collection.fields), readRule = collection.listRule;
    let saves = 0; const save = f.app.save;
    f.app.save = (value) => { saves++; return save.call(f.app, value); };
    const migration = f.migration(PROGRESS_MIGRATION);
    migration.up(); migration.up(); migration.down(); migration.up();
    assert.equal(saves, 1);
    assert.equal(collection.listRule, readRule);
    assert.equal(String(collection.viewRule), String(readRule));
    for (const name of ['createRule', 'updateRule', 'deleteRule']) assert.equal(collection[name], null);
    assert.deepEqual(plain(collection.fields), fields); assert.deepEqual(f.data, before);
});

test('progress rollback accepts boxed native read rules while keeping null write rules locked', () => {
    const f = learningFixture();
    const collection = nativeProgressShape(f, { fields: false });
    const before = plain(f.collections), data = plain(f.data);
    f.migration(PROGRESS_MIGRATION).down();
    assert.deepEqual(plain(f.collections), before); assert.deepEqual(f.data, data);
    for (const name of ['createRule', 'updateRule', 'deleteRule']) assert.equal(collection[name], null);
});

test('progress migration accepts method-valued native field types and boxed booleans without weakening the schema', () => {
    const f = learningFixture({ progressAuthority: false }); f.finish();
    const collection = nativeProgressShape(f, { rules: false }), before = plain(f.data);
    const types = ['owner', 'tutorial', 'status', 'progress'].map((name) => collection.fields.getByName(name).type);
    const migration = f.migration(PROGRESS_MIGRATION);
    migration.up(); migration.up(); migration.down(); migration.up();
    assert.deepEqual(f.data, before);
    assert.deepEqual(['owner', 'tutorial', 'status', 'progress'].map((name) => collection.fields.getByName(name).type), types);
    assert.equal(JSON.stringify(collection.fields.getByName('owner').required), 'true');
    assert.equal(JSON.stringify(collection.fields.getByName('owner').cascadeDelete), 'true');
});

test('native rule and field representations still reject exact-policy and schema drift before any save', () => {
    for (const [name, mutate] of [
        ...['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].map((name) => [name, (c) => { c[name] = new String('owner = @request.auth.id'); }]),
        ['listRule', (c) => { c.listRule = null; }],
        ['createRule', (c) => { c.createRule = undefined; }],
        ['createRule', (c) => { c.createRule = new String('null'); }],
        ...['owner', 'tutorial', 'status', 'progress'].map((name) => [name, (c) => { c.fields.getByName(name).type = () => 'json'; }]),
        ['owner', (c) => { c.fields.getByName('owner').required = new Boolean(false); }],
        ['owner', (c) => { c.fields.getByName('owner').required = 'true'; }],
        ['owner', (c) => { c.fields.getByName('owner').cascadeDelete = new Boolean(false); }],
        ['owner', (c) => { c.fields.getByName('owner').collectionId = 'foreign'; }],
        ['tutorial', (c) => { c.fields.getByName('tutorial').maxSelect = '1'; }],
        ['status', (c) => { c.fields.getByName('status').values.push('verified'); }],
        ['progress', (c) => { c.fields.getByName('progress').max = 101; }],
    ]) {
        const f = learningFixture({ progressAuthority: false });
        mutate(nativeProgressShape(f));
        const before = plain(f.collections), data = plain(f.data);
        let saves = 0; f.app.save = () => { saves++; };
        assert.throws(() => f.migration(PROGRESS_MIGRATION).up(), new RegExp(`Review custom tutorial_progress\\.${name}\\.`));
        assert.equal(saves, 0, name);
        assert.deepEqual(plain(f.collections), before); assert.deepEqual(f.data, data);
    }
    for (const name of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
        const f = learningFixture(), collection = nativeProgressShape(f);
        collection[name] = new String('');
        assert.throws(() => f.migration(PROGRESS_MIGRATION).down(), new RegExp(`Review custom tutorial_progress\\.${name} before rollback`));
    }
});

test('progress authority migration refuses custom rules or owner/schema changes before mutating anything', () => {
    for (const change of [
        (c) => { c.type = 'view'; },
        (c) => { c.listRule = ''; }, (c) => { c.viewRule = ''; }, (c) => { c.createRule = ''; },
        (c) => { c.updateRule = '@request.auth.id != ""'; }, (c) => { c.deleteRule = ''; },
        (c) => { c.fields.getByName('owner').collectionId = 'foreign'; },
        (c) => { c.fields.getByName('tutorial').maxSelect = 2; },
        (c) => { c.fields.getByName('status').values.push('verified'); },
        (c) => { c.fields.removeByName('progress'); },
    ]) {
        const f = learningFixture(); change(f.collections.tutorial_progress);
        const before = plain(f.collections), data = plain(f.data);
        assert.throws(() => f.migration(PROGRESS_MIGRATION).up(), /Review/);
        assert.deepEqual(plain(f.collections), before); assert.deepEqual(f.data, data);
    }
});

test('progress rollback refuses custom access without reopening manual writes', () => {
    for (const field of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
        const f = learningFixture(); f.collections.tutorial_progress[field] = 'custom';
        const before = plain(f.collections);
        assert.throws(() => f.migration(PROGRESS_MIGRATION).down(), /Review/);
        assert.deepEqual(plain(f.collections), before);
    }
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
    // Native field removal/re-add restores the marker with its default, not the old row value.
    f.data.tutorial_learning[0].protocol_version = 0;
    assert.deepEqual(f.detail().enrollment.certificate, original[0].certificate);
    collection.updateRule = '';
    assert.throws(() => f.list(), /review/);
    assert.throws(() => f.migration(MIGRATION).up(), /Review/);
});

test('learning migration accepts native-normalized index DDL while retaining completion', () => {
    const f = learningFixture(); f.finish();
    const before = plain(f.data.tutorial_learning);
    f.collections.tutorial_learning.indexes = [
        'CREATE UNIQUE INDEX `idx_tutorial_learning_identity` ON `tutorial_learning` (`owner`,`tutorial`)',
        ' CREATE INDEX "idx_tutorial_learning_history" ON "tutorial_learning" ( "owner" , "completed_at" , "updated" DESC , "id" ) ',
    ];
    f.migration(MIGRATION).up(); f.migration(MIGRATION).down(); f.migration(MIGRATION).up();
    assert.deepEqual(plain(f.data.tutorial_learning), before);
});

test('learning hooks read completed snapshots with equivalent native identity indexes', () => {
    const f = learningFixture(), result = f.finish();
    const identity = f.collections.tutorial_learning.indexes[0];
    for (const quote of [['`', '`'], ['"', '"'], ['[', ']']]) {
        f.collections.tutorial_learning.indexes[0] = identity.replace(/\b[a-z_]+\b/g,
            (word) => ['create', 'unique', 'index', 'on'].includes(word) ? word.toUpperCase() : quote[0] + word + quote[1])
            .replace(/\s+/g, '\n ').replace(/,/g, ' , ');
        assert.deepEqual(f.detail().enrollment.certificate, result.enrollment.certificate);
        assert.equal(f.list().points, 100);
    }
});

test('learning index normalization still refuses weakened identity and altered field or rule contracts', () => {
    for (const change of [
        (index) => index.replace('unique ', ''),
        (index) => index.replace('idx_tutorial_learning_identity', 'idx_other_identity'),
        (index) => index.replace('on tutorial_learning', 'on tutorial_progress'),
        (index) => index.replace('(owner, tutorial)', '(tutorial, owner)'),
        (index) => index.replace('(owner, tutorial)', '(owner, content_digest)'),
        (index) => index + ' where completed_at != ""',
    ]) {
        const f = learningFixture();
        f.collections.tutorial_learning.indexes[0] = change(f.collections.tutorial_learning.indexes[0]);
        assert.throws(() => f.detail(), /identity constraints/);
        assert.throws(() => f.migration(MIGRATION).up(), /indexes/);
        assert.equal(f.data.tutorial_learning.length, 0);
    }
    for (const change of [
        (collection) => { collection.fields.getByName('owner').collectionId = 'foreign'; },
        (collection) => { collection.viewRule = ''; },
    ]) {
        const f = learningFixture(); change(f.collections.tutorial_learning);
        assert.throws(() => f.migration(MIGRATION).up(), /custom/);
    }
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
        require: () => ({ list: () => 'list', states: () => 'states', detail: () => 'detail', command: () => 'command' }),
    }, { filename: new URL('../../apps/pocketbase/pb_hooks/tutorial-learning.pb.js', import.meta.url).href });
    assert.equal(routes.length, 4);
    assert.ok(routes.findIndex((row) => row[1] === '/api/buildanddo/learning/states') <
        routes.findIndex((row) => row[1] === '/api/buildanddo/learning/{id}'));
    for (const [verb, path, handler, middleware, limit] of routes) {
        assert.equal(middleware, auth); assert.match(path, /^\/api\/buildanddo\/learning/);
        const headers = {};
        handler({ response: { header: () => ({ set: (key, value) => { headers[key] = value; } }) }, json: (status) => assert.equal(status, 200) });
        assert.equal(headers['Cache-Control'], 'no-store');
        if (verb === 'POST') assert.equal(limit.bytes, 4000);
    }
});
