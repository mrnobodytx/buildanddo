// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/business-learning.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/business-policy.js, apps/pocketbase/pb_hooks/business.pb.js, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js, apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/web/src/lib/businessPlanning.js, apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/business-policy.js; VALIDATES apps/pocketbase/pb_hooks/business.pb.js; VALIDATES apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js; VALIDATES apps/pocketbase/pb_migrations/data/starter-tutorials.json; VALIDATES apps/web/src/lib/businessPlanning.js; VALIDATES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Exercise authored lesson structure, migration retention and replay, ERP isolation and content approval against the production source contracts.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { dateInput, localDay, overdue, selectTasks, contentOutline, draftBlocks, publicationUrl, retainedFields } from '../../apps/web/src/lib/businessPlanning.js';
import { validLesson, lessonLink, mergeTutorials, lessonProgress, selectTutorials } from '../../apps/web/src/lib/tutorialCurriculum.js';

const root = new URL('../../', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');
const dataPath = 'apps/pocketbase/pb_migrations/data/starter-tutorials.json';
const migrationPath = 'apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js';
const curriculum = JSON.parse(source(dataPath));
const plain = (value) => JSON.parse(JSON.stringify(value));

test('all 25 tutorials have complete renderable instruction, distinct exercises and answer explanations', () => {
    assert.equal(curriculum.lessons.length, 25);
    assert.equal(new Set(curriculum.lessons.map((lesson) => lesson.id)).size, 25);
    assert.equal(new Set(curriculum.lessons.map((lesson) => lesson.slug)).size, 25);
    assert.equal(new Set(curriculum.lessons.map((lesson) => lesson.lesson.exercise.prompt)).size, 25);
    assert.equal(new Set(curriculum.lessons.map((lesson) => lesson.category)).size, 5);
    for (const [index, tutorial] of curriculum.lessons.entries()) {
        assert.match(tutorial.id, /^[a-z0-9]{15}$/);
        assert.equal(tutorial.order, index + 1);
        assert.ok(validLesson(tutorial.lesson), tutorial.title);
        assert.ok(tutorial.effort_minutes >= 8 && tutorial.effort_minutes <= 20);
        assert.ok(JSON.stringify(tutorial.lesson).split(/\s+/).length >= 200, tutorial.title);
        assert.equal(tutorial.lesson.sections.find((section) => section.steps).steps.length, 4);
        assert.ok(tutorial.lesson.sections.some((section) => section.heading.includes('illustrative')));
        assert.ok(JSON.stringify(tutorial.lesson).length < 65536);
    }
});

test('reader validation rejects malformed, mixed-type, future and unsafe-reference lesson bodies', () => {
    const body = curriculum.lessons[0].lesson;
    for (const invalid of [null, false, {}, { ...body, schema_version: 2 }, { ...body, outcomes: [] },
        { ...body, why: ' ' }, { ...body, preparation: [false] }, { ...body, sections: [] },
        { ...body, sections: [{ heading: 'Unsafe', paragraphs: [{ value: 'not text' }], steps: ['Valid step'] }] },
        { ...body, exercise: { prompt: 'Try', checklist: [] } },
        { ...body, check: { ...body.check, answer: 100 } },
        { ...body, check: { ...body.check, choices: ['One option'] } },
        { ...body, references: [{ label: 'Unsafe', url: 'javascript:alert(1)' }] }]) assert.equal(validLesson(invalid), false);
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//outside.example', '/\\outside', 'https://user:pass@example.com', 'https://example.com/a b', 'invalid', null])
        assert.equal(lessonLink(url), '');
    assert.equal(lessonLink('/app/erp'), '/app/erp');
    assert.equal(lessonLink('https://example.com/help'), 'https://example.com/help');
});

test('catalogue previews never invent persistence IDs and retain legacy progress identities', () => {
    const seed = curriculum.lessons[0];
    const preview = mergeTutorials([], curriculum.lessons);
    assert.equal(preview.length, 25);
    assert.ok(preview.every((item) => item.persistedId === ''));
    const legacy = { id: 'legacy1', title: seed.title, summary: seed.legacy_summary, order: seed.order };
    const merged = mergeTutorials([legacy], curriculum.lessons);
    assert.equal(merged[0].persistedId, 'legacy1');
    assert.ok(validLesson(merged[0].lesson));
    assert.equal(lessonProgress([{ id: 'progress1', tutorial: 'legacy1', status: 'completed' }], merged[0].persistedId).id, 'progress1');
    const modifiedLegacy = mergeTutorials([{ ...legacy, summary: 'An edited administrator lesson' }], curriculum.lessons);
    assert.equal(modifiedLegacy.length, 26);
    assert.equal(modifiedLegacy[0].persistedId, '');
    assert.equal(modifiedLegacy.at(-1).summary, 'An edited administrator lesson');
});

test('saved lessons are authoritative and malformed edited bodies are not silently replaced', () => {
    const seed = curriculum.lessons[0];
    const saved = { id: 'saved1', slug: seed.slug, title: 'Edited title', lesson: { schema_version: 99 } };
    const merged = mergeTutorials([saved, { id: 'custom1', title: 'An extra lesson' }], curriculum.lessons);
    assert.equal(merged.length, 26);
    assert.equal(merged[0].title, 'Edited title');
    assert.equal(validLesson(merged[0].lesson), false);
    assert.equal(merged.at(-1).persistedId, 'custom1');
    assert.equal(selectTutorials(merged, { query: 'edited TITLE' }).length, 1);
    assert.equal(selectTutorials(curriculum.lessons, { category: 'Content production' }).length, 5);
    assert.equal(selectTutorials(merged, { query: 'no match here' }).length, 0);
});

test('progress selection keeps completion even when a newer duplicate row is incomplete', () => {
    const records = [
        { id: 'old', tutorial: 'one', status: 'completed', updated: '2026-09-01' },
        { id: 'new', tutorial: 'one', status: 'in_progress', updated: '2026-09-15' },
        { id: 'foreign', tutorial: 'two', status: 'completed' },
    ];
    assert.equal(lessonProgress(records, 'one').id, 'old');
    assert.equal(lessonProgress(records, ''), undefined);
    assert.equal(lessonProgress(records, 'absent'), undefined);
    assert.equal(lessonProgress([{ id: '1', tutorial: 'one', status: 'in_progress', created: '2026-09-01' },
        { id: '2', tutorial: 'one', status: 'in_progress', created: '2026-09-02' }], 'one').id, '2');
    assert.equal(records[0].id, 'old');
});

test('ERP dates and task views distinguish overdue work from missing, malformed and completed dates', () => {
    for (const value of [null, false, '', '2026-02-30', '2025-02-29', 'not a date']) assert.equal(dateInput(value), '');
    assert.equal(dateInput('2024-02-29 12:00:00.000Z'), '2024-02-29');
    assert.equal(localDay(new Date(2026, 8, 15)), '2026-09-15');
    assert.equal(overdue({ due_date: '2026-09-14', status: 'done' }, '2026-09-15'), false);
    assert.equal(overdue({ due_date: '2026-09-15', status: 'todo' }, '2026-09-15'), false);
    assert.equal(overdue({ status: 'todo' }, '2026-09-15'), false);
    const tasks = [
        { title: 'Later', status: 'todo', priority: 'high', due_date: '2026-09-20' },
        { title: 'Earlier', status: 'in_progress', priority: 'low', due_date: '2026-09-14' },
        { title: 'No date', description: 'Collect baseline', status: 'todo' },
        { title: 'Done', status: 'done', due_date: '2026-09-01' },
    ];
    assert.equal(selectTasks(tasks, { today: '2026-09-15', status: 'overdue' })[0].title, 'Earlier');
    assert.equal(selectTasks(tasks, { priority: 'normal', query: 'BASELINE' }).length, 1);
    assert.equal(selectTasks(tasks, { status: 'todo' }).length, 2);
    assert.equal(tasks[0].title, 'Later');
});

test('content outlines use explicit inputs and previews keep markup as non-executable text', () => {
    for (const format of ['blog', 'tutorial', 'social', 'unknown']) {
        const outline = contentOutline({ format, title: 'A test lesson', audience: 'New editors', brief: 'Use a synthetic record.', call_to_action: 'Try the exercise.' });
        assert.ok(outline.includes('A test lesson'));
        assert.ok(outline.includes('New editors'));
        assert.ok(outline.includes('Try the exercise.'));
        assert.ok(outline.includes('['), 'outline prompts remain explicit');
        assert.ok(outline.length < 5000);
    }
    assert.match(contentOutline({}), /Working title/);
    const blocks = draftBlocks('# Heading\n\nA paragraph\nwith another line.\n\n- First\n- Second\n\n1. One\n2. Two\n\n<img src=x onerror=alert(1)>');
    assert.deepEqual(blocks.map((block) => block.kind), ['heading', 'paragraph', 'unordered', 'ordered', 'paragraph']);
    assert.equal(blocks.at(-1).text, '<img src=x onerror=alert(1)>');
    assert.deepEqual(draftBlocks(''), []);
    assert.equal(publicationUrl('https://example.com/article'), 'https://example.com/article');
    for (const value of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'https://example.com:99999', 'bad', 'https://example.com/a b', null]) assert.equal(publicationUrl(value), '');
});

test('form success requires returned fields, including fields an older backend might silently drop', () => {
    assert.equal(retainedFields({ id: 'record1', title: 'Plan' }, { title: 'Plan', success_metric: 'An observed target' }), false);
    assert.equal(retainedFields({ id: 'record1', title: 'Plan', success_metric: 'An observed target', due_date: '2026-09-20 12:00:00.000Z' },
        { title: 'Plan', success_metric: 'An observed target', due_date: '2026-09-20' }), true);
    assert.equal(retainedFields({ id: 'record1' }, { due_date: '' }), false);
    assert.equal(retainedFields({ id: 'record1', due_date: '' }, { due_date: '' }), true);
    assert.equal(retainedFields({}, { title: 'Plan' }), false);
});

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
class BadRequestError extends ApiError { constructor(message) { super(400, message); } }
class ForbiddenError extends ApiError { constructor(message) { super(403, message); } }
class NotFoundError extends ApiError { constructor(message) { super(404, message); } }
class Field { constructor(definition) { Object.assign(this, plain(definition)); this.id = definition.id || `field-${definition.name}`; } }
class Collection {
    constructor(name, fields) {
        this.name = name; this.id = name;
        this.listRule = 'original-list'; this.viewRule = 'original-view'; this.createRule = 'original-create'; this.updateRule = 'original-update'; this.deleteRule = 'original-delete';
        const entries = fields.map((field) => new Field(typeof field === 'string' ? { name: field } : field));
        this.fields = { entries, getByName: (name) => entries.find((field) => field.name === name),
            add: (field) => entries.push(field), removeById: (id) => { const index = entries.findIndex((field) => field.id === id); if (index >= 0) entries.splice(index, 1); } };
    }
}
class Record {
    constructor(collection, data = {}) { this.definition = collection; this.data = plain(data); this.before = plain(data); this.id = data.id || ''; }
    collection() { return this.definition; }
    getString(name) { const value = this.data[name]; return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? ''); }
    set(name, value) { this.data[name] = plain(value); if (name === 'id') this.id = value; }
    original() { return new Record(this.definition, this.before); }
}
const common = ['id', 'workspace', 'owner', 'created', 'updated'];
function fixture({ seedLegacy = false, seedCustom = false } = {}) {
    const definitions = {
        users: ['id'], workspaces: ['id', 'owner'], workspace_members: ['id', 'workspace', 'user', 'role'],
        erp_objectives: [...common, 'title', 'description', 'status'], erp_tasks: [...common, 'title', 'status', 'objective'],
        erp_contacts: [...common, 'name', 'role', 'email', 'notes'],
        social_content: [...common, 'title', 'body', 'channel', 'scheduled_for', { name: 'status', values: ['draft', 'awaiting_approval', 'scheduled', 'published', 'failed'] }],
        tutorials: ['id', 'title', 'summary', 'category', 'effort_minutes', 'prerequisites', 'order'],
        tutorial_progress: ['id', 'tutorial', 'owner', 'status', 'progress'],
    };
    const collections = new Map(Object.entries(definitions).map(([name, fields]) => [name, new Collection(name, fields)]));
    const records = Object.fromEntries(Object.keys(definitions).map((name) => [name, []]));
    const denied = new Set();
    let saves = 0, next = 1;
    const app = {
        findCollectionByNameOrId(name) { if (!collections.has(name)) throw new Error('sql: no rows in result set'); return collections.get(name); },
        findRecordById(name, id) { const row = records[name].find((row) => row.id === id); if (!row) throw new Error('sql: no rows in result set'); return new Record(collections.get(name), row); },
        findRecordsByFilter(name, filter, sort, limit, offset, params) {
            assert.equal(sort, ''); assert.equal(offset, 0);
            let rows;
            if (filter === 'slug = {:slug} || id = {:id}') rows = records[name].filter((row) => row.slug === params.slug || row.id === params.id);
            else if (filter === 'title = {:title} && summary = {:summary} && order = {:order}') rows = records[name].filter((row) => row.title === params.title && row.summary === params.summary && row.order === params.order);
            else if (filter === 'workspace = {:workspace} && user = {:user}') rows = records[name].filter((row) => row.workspace === params.workspace && row.user === params.user);
            else assert.fail(`Unexpected filter ${filter}`);
            return rows.slice(0, limit).map((row) => new Record(collections.get(name), row));
        },
        canAccessRecord(record, info, rule) { assert.ok(info.auth.id); assert.equal(rule, record.collection().viewRule); return !denied.has(record.id); },
        save(value) {
            saves += 1;
            if (value instanceof Collection) {
                for (const row of records[value.name]) for (const key of Object.keys(row)) if (!value.fields.getByName(key)) delete row[key];
                return;
            }
            if (!value.id) value.set('id', `record${next++}`);
            const rows = records[value.collection().name]; const index = rows.findIndex((row) => row.id === value.id);
            if (index < 0) rows.push(plain({ ...value.data, id: value.id })); else rows[index] = plain({ ...value.data, id: value.id });
        },
    };
    if (seedLegacy) for (const [index, seed] of curriculum.lessons.slice(0, 6).entries())
        records.tutorials.push({ id: `legacy${index}`, title: seed.title, summary: seed.legacy_summary, order: seed.order });
    if (seedCustom) records.tutorials.push({ id: 'custom1', title: 'Edited administrator lesson', summary: 'Keep this summary', order: 200 });
    let up, down;
    vm.runInNewContext(source(migrationPath), { Field, Record, __hooks: '/fixture/pb_hooks', $filepath: { join: posix.join },
        toString: String, $os: { readFile: (path) => { assert.equal(path, '/fixture/pb_migrations/data/starter-tutorials.json'); return source(dataPath); } },
        migrate: (a, b) => { up = a; down = b; } }, { filename: new URL(migrationPath, root).href });
    up(app);
    records.workspaces.push({ id: 'ws1', owner: 'owner1' }, { id: 'ws2', owner: 'other' });
    records.erp_objectives.push({ id: 'obj1', title: 'One objective', workspace: 'ws1', owner: 'owner1', status: 'active' }, { id: 'obj2', workspace: 'ws2', owner: 'other' });
    records.erp_contacts.push({ id: 'contact1', name: 'Test coordinator', workspace: 'ws1', owner: 'owner1' }, { id: 'contact2', workspace: 'ws2', owner: 'other' });
    const modules = new Map();
    const load = (name) => {
        if (modules.has(name)) return modules.get(name);
        const module = { exports: {} };
        vm.runInNewContext(source(`apps/pocketbase/pb_hooks/${name}`), { module, __hooks: '/hooks', ApiError, BadRequestError, ForbiddenError, NotFoundError,
            require: (path) => load(path.split('/').at(-1)) }, { filename: new URL(`apps/pocketbase/pb_hooks/${name}`, root).href });
        modules.set(name, module.exports); return module.exports;
    };
    const policy = load('business-policy.js');
    const auth = (id = 'owner1') => ({ id, collection: () => ({ name: 'users' }) });
    const request = (collection, data, patch = {}, account = 'owner1', creating = false, action = 'erp') => {
        const record = new Record(collections.get(collection), data);
        for (const [key, value] of Object.entries(patch)) record.set(key, value);
        let delegated = 0;
        const event = { app, record, auth: account === null ? null : auth(account), requestInfo() { return { auth: this.auth }; },
            next() { delegated += 1; app.save(record); return 'saved'; } };
        return { record, event, run: () => policy[action](event, creating), calls: () => delegated };
    };
    const draft = { id: 'content1', workspace: 'ws1', owner: 'owner1', status: 'draft', format: 'blog', title: 'Test draft', body: '# A useful heading\n\nSupported facts.', audience: 'New editors', brief: '', call_to_action: '', channel: '', objective: '' };
    const content = (patch = {}, account = 'owner1', creating = false) => request('social_content',
        records.social_content.find((row) => row.id === 'content1') || draft, patch, account, creating, 'content');
    return { app, records, collections, denied, up, down, policy, load, request, content, saves: () => saves,
        member(user, role, workspace = 'ws1') { records.workspace_members.push({ id: `${user}-${workspace}`, user, role, workspace }); } };
}
const reject = (call, status) => assert.throws(call, (error) => error.status === status);
const reviewChecks = { accuracy: true, privacy: true, rights: true, accessibility: true };
function approve(f) {
    f.content({}, 'owner1', true).run();
    f.content({ status: 'awaiting_approval' }).run();
    f.content({ status: 'approved', review_checks: reviewChecks, review_note: 'Read the sources and checked the sample.' }).run();
}

test('migration hydrates six legacy identities and adds nineteen lessons without changing access rules', () => {
    const f = fixture({ seedLegacy: true, seedCustom: true });
    assert.equal(f.records.tutorials.length, 26);
    for (let i = 0; i < 6; i += 1) {
        const row = f.records.tutorials.find((row) => row.id === `legacy${i}`);
        assert.ok(validLesson(row.lesson)); assert.equal(row.slug, curriculum.lessons[i].slug);
    }
    assert.equal(f.records.tutorials.find((row) => row.id === 'custom1').summary, 'Keep this summary');
    for (const collection of f.collections.values()) {
        assert.equal(collection.listRule, 'original-list'); assert.equal(collection.viewRule, 'original-view');
        assert.equal(collection.createRule, 'original-create'); assert.equal(collection.updateRule, 'original-update'); assert.equal(collection.deleteRule, 'original-delete');
    }
    assert.equal(f.collections.get('erp_tasks').fields.getByName('contact').collectionId, 'erp_contacts');
    assert.ok(f.collections.get('social_content').fields.getByName('status').values.includes('approved'));
});

test('migration replay preserves edited bodies; down retains tutorial IDs and all learning progress', () => {
    const f = fixture({ seedLegacy: true });
    const row = f.records.tutorials[0];
    row.lesson.why = 'An administrator deliberately revised this lesson.';
    f.records.tutorial_progress.push({ id: 'progress1', tutorial: row.id, owner: 'owner1', status: 'completed', progress: 100 });
    const before = f.saves(); f.up(f.app);
    assert.equal(f.saves(), before);
    assert.equal(f.records.tutorials.length, 25);
    assert.equal(f.records.tutorials[0].lesson.why, 'An administrator deliberately revised this lesson.');
    const ids = f.records.tutorials.map((record) => record.id);
    f.down(f.app); f.down(f.app);
    assert.deepEqual(f.records.tutorials.map((record) => record.id), ids);
    assert.equal(f.records.tutorial_progress[0].tutorial, row.id);
    assert.equal(f.collections.get('tutorials').fields.getByName('lesson'), undefined);
    assert.ok(f.collections.get('social_content').fields.getByName('status').values.includes('approved'));
    f.up(f.app); assert.equal(f.records.tutorials.length, 25);
    assert.equal(f.records.tutorial_progress[0].status, 'completed');
});

test('migration stops on ambiguous or colliding seed identities instead of overwriting content', () => {
    const f = fixture();
    const seed = curriculum.lessons[0];
    f.records.tutorials.push({ id: 'duplicate', slug: seed.slug });
    assert.throws(() => f.up(f.app), /Ambiguous/);
    f.records.tutorials.pop();
    f.records.tutorials[0].slug = 'different-lesson';
    assert.throws(() => f.up(f.app), /collision/);
});

test('ERP writes validate same-workspace readable relations and current roles', () => {
    const f = fixture();
    const task = { id: 'task1', workspace: 'ws1', owner: 'owner1', title: 'Check the baseline', status: 'todo', objective: 'obj1', contact: 'contact1' };
    const allowed = f.request('erp_tasks', task); assert.equal(allowed.run(), 'saved'); assert.equal(allowed.calls(), 1);
    assert.equal(allowed.record.getString('priority'), 'normal');
    for (const patch of [{ objective: 'obj2' }, { contact: 'contact2' }, { owner: 'other' }, { workspace: 'ws2' }, { priority: 'urgent' }, { status: 'invented' }])
        reject(f.request('erp_tasks', task, patch).run, 400);
    reject(f.request('erp_tasks', task, { objective: 'missing' }).run, 404);
    f.denied.add('obj1'); reject(f.request('erp_tasks', task).run, 403); f.denied.clear();
    f.member('viewer', 'viewer'); reject(f.request('erp_tasks', task, {}, 'viewer').run, 403);
    f.member('editor', 'editor'); assert.equal(f.request('erp_tasks', task, { status: 'in_progress' }, 'editor').run(), 'saved');
    reject(f.request('erp_tasks', task, {}, null).run, 403);
    reject(f.request('erp_tasks', task, {}, 'removed').run, 403);
    reject(f.request('erp_tasks', task, {}, 'editor', true).run, 400);
    f.collections.get('erp_tasks').fields.removeById('field-contact'); reject(f.request('erp_tasks', task).run, 503);
});

test('ERP objectives and contacts preserve original ownership and reject invalid objective states', () => {
    const f = fixture();
    const objective = f.records.erp_objectives[0];
    assert.equal(f.request('erp_objectives', objective, { status: 'achieved', success_metric: 'Observed target met.' }).run(), 'saved');
    reject(f.request('erp_objectives', objective, { status: 'done' }).run, 400);
    assert.equal(f.request('erp_contacts', f.records.erp_contacts[0], { notes: 'Coordinates a synthetic exercise.' }).run(), 'saved');
    reject(f.request('erp_contacts', f.records.erp_contacts[0], { owner: 'other' }).run, 400);
});

test('content must begin as a draft and requires an audience and body before review', () => {
    const f = fixture();
    reject(f.content({ status: 'published' }, 'owner1', true).run, 400);
    reject(f.content({ title: ' ' }, 'owner1', true).run, 400);
    reject(f.content({ format: 'execute' }, 'owner1', true).run, 400);
    reject(f.content({ objective: 'obj2' }, 'owner1', true).run, 400);
    const draft = f.content({ format: '', reviewed_by: 'forged', reviewed_at: '2099-01-01', published_url: 'https://example.com/pretend' }, 'owner1', true);
    draft.run(); assert.equal(draft.record.getString('format'), 'social'); assert.equal(draft.record.getString('reviewed_by'), ''); assert.equal(draft.record.getString('published_url'), '');
    reject(f.content({ status: 'awaiting_approval', body: '' }).run, 400);
    f.content({ body: '' }).run(); reject(f.content({ status: 'awaiting_approval' }).run, 400);
    f.content({ body: 'A useful body.', audience: '' }).run(); reject(f.content({ status: 'awaiting_approval' }).run, 400);
    f.collections.get('social_content').fields.removeById('field-reviewed_at'); reject(f.content().run, 503);
});

test('content approval requires the current approver role, four real checks and a note; receipt is server-attributed', () => {
    const f = fixture();
    f.content({}, 'owner1', true).run(); f.content({ status: 'awaiting_approval' }).run();
    const decision = { status: 'approved', review_checks: reviewChecks, review_note: 'Checked sources and synthetic examples.', reviewed_by: 'forged', reviewed_at: '2099-01-01' };
    f.member('editor', 'editor'); reject(f.content(decision, 'editor').run, 403);
    for (const checks of [{}, { ...reviewChecks, accuracy: false }, { ...reviewChecks, injected: true }, false, []])
        reject(f.content({ ...decision, review_checks: checks }).run, 400);
    reject(f.content({ ...decision, review_note: ' ' }).run, 400);
    f.member('admin', 'admin'); const approved = f.content(decision, 'admin'); approved.run();
    assert.equal(approved.record.getString('reviewed_by'), 'admin');
    assert.notEqual(approved.record.getString('reviewed_at'), '2099-01-01');
    assert.ok(Number.isFinite(Date.parse(approved.record.getString('reviewed_at'))));
});

test('approved copy cannot change silently and returning to draft clears approval and publication fields', () => {
    const f = fixture(); approve(f);
    reject(f.content({ status: 'scheduled', body: 'Changed copy', scheduled_for: '2026-09-20' }).run, 400);
    const revised = f.content({ status: 'draft', body: 'Corrected copy', published_by: 'forged' }); revised.run();
    assert.equal(revised.record.getString('body'), 'Corrected copy');
    for (const field of ['reviewed_by', 'reviewed_at', 'review_note', 'published_by', 'published_url']) assert.equal(revised.record.getString(field), '');
    assert.deepEqual(JSON.parse(revised.record.getString('review_checks')), {});
    reject(f.content({ status: 'published', published_url: 'https://example.com/result' }).run, 400);
});

test('a planned date is not publication; a checked HTTPS URL and current authority are required for a receipt', () => {
    const f = fixture(); approve(f);
    reject(f.content({ status: 'scheduled' }).run, 400);
    const plan = f.content({ status: 'scheduled', scheduled_for: '2026-09-20', published_at: '2099-01-01' }); plan.run();
    assert.equal(plan.record.getString('published_at'), '');
    f.member('editor', 'editor'); reject(f.content({ status: 'published', published_url: 'https://example.com/result' }, 'editor').run, 403);
    for (const url of ['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com:99999', 'https://example.com/a b', ''])
        reject(f.content({ status: 'published', published_url: url }).run, 400);
    const publish = f.content({ status: 'published', published_url: 'https://example.com:443/result', published_by: 'forged', published_at: '2099-01-01' }); publish.run();
    assert.equal(publish.record.getString('published_by'), 'owner1'); assert.notEqual(publish.record.getString('published_at'), '2099-01-01');
    reject(f.content({ body: 'Rewrite history' }).run, 400);
    const removal = f.request('social_content', publish.record.data, {}, 'owner1', false, 'removeContent'); reject(removal.run, 400);
});

test('legacy planned records cannot forge a review and only drafts can be deleted', () => {
    const f = fixture();
    f.content({}, 'owner1', true).run();
    const row = f.records.social_content[0]; row.status = 'scheduled';
    reject(f.content({ status: 'published', published_url: 'https://example.com/result', reviewed_by: 'owner1', reviewed_at: '2026-09-01', review_checks: reviewChecks }).run, 400);
    f.content({ status: 'draft' }).run();
    assert.equal(f.request('social_content', f.records.social_content[0], {}, 'owner1', false, 'removeContent').run(), 'saved');
    f.records.social_content[0].status = 'failed'; assert.equal(f.content({ status: 'draft' }).run(), 'saved');
});

test('progress remains with its account and lesson, and review cannot downgrade completion', () => {
    const f = fixture();
    const progress = { id: 'progress1', owner: 'owner1', tutorial: curriculum.lessons[0].id, status: 'in_progress', progress: 999 };
    const save = f.request('tutorial_progress', progress, {}, 'owner1', true, 'progress'); save.run(); assert.equal(save.record.getString('progress'), '50');
    for (const patch of [{ owner: 'other' }, { tutorial: curriculum.lessons[1].id }, { status: 'verified' }])
        reject(f.request('tutorial_progress', progress, patch, 'owner1', false, 'progress').run, 400);
    f.denied.add(progress.tutorial); reject(f.request('tutorial_progress', progress, {}, 'owner1', false, 'progress').run, 403); f.denied.clear();
    const completed = f.request('tutorial_progress', progress, { status: 'completed' }, 'owner1', false, 'progress'); completed.run(); assert.equal(completed.record.getString('progress'), '100');
    reject(f.request('tutorial_progress', completed.record.data, { status: 'in_progress' }, 'owner1', false, 'progress').run, 400);
    assert.equal(f.request('tutorial_progress', completed.record.data, {}, 'owner1', false, 'progress').run(), 'saved');
    const notStarted = f.request('tutorial_progress', progress, { status: 'not_started' }, 'owner1', true, 'progress'); notStarted.run(); assert.equal(notStarted.record.getString('progress'), '0');
});

test('native request registrations resolve their policy inside each isolated callback', () => {
    const registrations = [];
    const context = { __hooks: '/hooks', require(path) { assert.equal(path, '/hooks/business-policy.js'); return Object.fromEntries(['erp', 'content', 'removeContent', 'progress'].map((name) => [name, (event, creating) => ({ name, event, creating })])); } };
    for (const kind of ['Create', 'Update', 'Delete']) context[`onRecord${kind}Request`] = (callback, ...collections) => registrations.push({ callback, collections, kind });
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/business.pb.js'), context, { filename: new URL('apps/pocketbase/pb_hooks/business.pb.js', root).href });
    assert.equal(registrations.length, 7);
    for (const registration of registrations) {
        const result = registration.callback('event'); assert.equal(result.event, 'event');
        if (registration.kind !== 'Delete') assert.equal(result.creating, registration.kind === 'Create');
    }
    assert.deepEqual(plain(registrations[0].collections), ['erp_objectives', 'erp_tasks', 'erp_contacts']);
});
