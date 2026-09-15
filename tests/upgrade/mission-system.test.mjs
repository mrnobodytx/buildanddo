// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/mission-system.test.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/pocketbase/pb_hooks/mission-policy.js, apps/pocketbase/pb_hooks/missions.pb.js, apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js, apps/web/src/lib/missionLearning.js
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/mission-policy.js; DEPENDS_ON apps/pocketbase/pb_hooks/missions.pb.js; DEPENDS_ON apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js; DEPENDS_ON apps/web/src/lib/missionLearning.js
// DAG Node:     none
// Intent:       Exercise actual mission policy, migration and reward selectors across invalid transitions, permission boundaries, evidence failures and repeatable educational credit.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import {
    FRAMEWORKS,
    LESSONS,
    PLAN_FIELDS,
    TEVV,
    TRANSITIONS,
    emptyPlan,
    emptyReview,
    learningRecord,
    learningRewards,
    missionEvidence,
    planIssues,
    readPlan,
    reviewIssues,
} from '../../apps/web/src/lib/missionLearning.js';

const root = new URL('../../', import.meta.url);
const policyPath = 'apps/pocketbase/pb_hooks/mission-policy.js';
const hookPath = 'apps/pocketbase/pb_hooks/missions.pb.js';
const migrationPath = 'apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js';
const source = (path) => readFileSync(new URL(path, root), 'utf8');
const plan = () => ({
    ...emptyPlan(),
    ...Object.fromEntries(PLAN_FIELDS.map(({ id }) => [id, `Recorded method for ${id}.`])),
});
const review = (outcome = 'pass') => ({
    ...Object.fromEntries(
        TEVV.map(({ id }) => [
            id,
            { outcome, observation: `Observed ${id} result.`, evidence: 'receipt1' },
        ]),
    ),
    reflection: 'Retain the failure cases in the next mission.',
});
const answers = () => Object.fromEntries(LESSONS.map((lesson) => [lesson.id, lesson.answer]));
const mission = (overrides = {}) => ({
    id: 'mission1',
    owner: 'user1',
    workspace: 'workspace1',
    title: 'A bounded test',
    description: 'Local test only.',
    status: 'proposed',
    priority: 'normal',
    progress: 0,
    mission_plan: plan(),
    ...overrides,
});
const receipt = (overrides = {}) => ({
    id: 'receipt1',
    owner: 'user1',
    workspace: 'workspace1',
    mission: 'mission1',
    source: 'Local observation',
    content: 'Procedure and observed result.',
    ...overrides,
});
const approved = (overrides = {}) =>
    mission({
        status: 'approved',
        mission_approved_by: 'user1',
        mission_approved_at: '2026-09-15T01:00:00Z',
        ...overrides,
    });

class BadRequestError extends Error {}
class ForbiddenError extends Error {}
class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
const schemaFields = [
    'mission_plan',
    'mission_learning',
    'mission_review',
    'mission_approved_by',
    'mission_approved_at',
    'mission_reviewed_by',
    'mission_reviewed_at',
];
const jsonFields = ['mission_plan', 'mission_learning', 'mission_review'];
class Record {
    constructor(data, collection = 'missions', original = data) {
        this.data = structuredClone(data);
        this.id = data.id;
        this.originalData = structuredClone(original);
        this.collectionName = collection;
        this.fields = new Set(schemaFields);
        this.raw = {};
    }
    collection() {
        return {
            name: this.collectionName,
            viewRule: 'owner = @request.auth.id',
            fields: { getByName: (name) => (this.fields.has(name) ? { name } : null) },
        };
    }
    get(name) {
        return this.data[name];
    }
    getString(name) {
        if (Object.hasOwn(this.raw, name)) return this.raw[name];
        return jsonFields.includes(name)
            ? JSON.stringify(this.data[name] ?? null)
            : String(this.data[name] ?? '');
    }
    set(name, value) {
        this.data[name] = value;
    }
    original() {
        return new Record(this.originalData);
    }
}

// Execute the production JSVM helper and request registration with contract
// doubles. Native PocketBase behavior is a separate acceptance check.
function runtime({
    original = mission(),
    patch = {},
    auth = { id: 'user1' },
    workspaceOwner = 'user1',
    role = '',
    receipts = [receipt()],
    create = false,
} = {}) {
    const module = { exports: {} };
    vm.runInNewContext(
        source(policyPath),
        { module, BadRequestError, ForbiddenError, ApiError },
        { filename: pathToFileURL(resolve(policyPath)).href },
    );
    const callbacks = {};
    const scope = {
        __hooks: '/hooks',
        require: (path) => {
            assert.equal(path, '/hooks/mission-policy.js');
            return module.exports;
        },
    };
    for (const kind of ['Create', 'Update'])
        scope[`onRecord${kind}Request`] = (callback, collection) => {
            assert.equal(collection, 'missions');
            callbacks[kind] = callback;
        };
    vm.runInNewContext(source(hookPath), scope, {
        filename: pathToFileURL(resolve(hookPath)).href,
    });
    const records = receipts.map((data) => new Record(data, 'evidence'));
    const lookups = [];
    let calls = 0;
    const event = {
        auth,
        record: new Record({ ...original, ...patch }, 'missions', original),
        requestInfo: () => ({ auth }),
        app: {
            findRecordById: (collection, id) => {
                lookups.push([collection, id]);
                if (collection === 'workspaces')
                    return new Record({ id, owner: workspaceOwner }, 'workspaces');
                const found = records.find((record) => record.id === id);
                if (!found) throw new Error('Record not found');
                return found;
            },
            canAccessRecord: (record, info, rule) => {
                assert.equal(info.auth, auth);
                assert.equal(rule, 'owner = @request.auth.id');
                return record.data.owner === auth.id;
            },
            findRecordsByFilter: (collection, filter, sort, limit, offset, params) => {
                assert.equal(collection, 'workspace_members');
                assert.match(filter, /workspace = \{:workspace\} && user = \{:user\}/);
                assert.ok(filter.includes('role = "editor"'));
                assert.equal(sort, '');
                assert.equal(limit, 1);
                assert.equal(offset, 0);
                assert.equal(params.user, auth.id);
                assert.equal(params.workspace, 'workspace1');
                return ['owner', 'admin', 'editor'].includes(role) ? [new Record({ role })] : [];
            },
        },
        next: () => {
            calls++;
            return 'saved';
        },
    };
    return {
        event,
        records,
        lookups,
        policy: module.exports,
        run: () => callbacks[create ? 'Create' : 'Update'](event),
        calls: () => calls,
    };
}
const rejects = (options, pattern) => {
    const env = runtime(options);
    assert.throws(env.run, pattern);
    assert.equal(env.calls(), 0);
    return env;
};

// Learning semantics: use saved facts, never transient click counts.
test('TEVV and framework references distinguish evidence, security and credential integrity', () => {
    assert.deepEqual(
        TEVV.map((step) => step.label),
        ['Testing', 'Evaluation', 'Verification', 'Validation'],
    );
    assert.equal(FRAMEWORKS.length, 3);
    for (const framework of FRAMEWORKS) assert.ok(new URL(framework.href).protocol === 'https:');
    assert.match(FRAMEWORKS[2].note, /signature does not/);
    assert.ok(
        LESSONS.every((lesson) => lesson.choices.some((choice) => choice.id === lesson.answer)),
    );
});
test('drafts can be incomplete and shared plan and server contracts agree', () => {
    const env = runtime();
    assert.deepEqual(
        Array.from(env.policy.PLAN_FIELDS),
        PLAN_FIELDS.map((field) => field.id),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(env.policy.TRANSITIONS)), TRANSITIONS);
    assert.deepEqual(
        Array.from(env.policy.TEVV),
        TEVV.map((step) => step.id),
    );
    for (const lesson of LESSONS)
        assert.deepEqual(
            Array.from(env.policy.ANSWERS[lesson.id]),
            lesson.choices.map((choice) => choice.id),
        );
    assert.equal(planIssues(emptyPlan()).length, PLAN_FIELDS.length);
    assert.deepEqual(planIssues(plan()), []);
    assert.deepEqual(readPlan(null), emptyPlan());
    assert.deepEqual(readPlan([]), emptyPlan());
    assert.equal(readPlan({ risk: 'A9', purpose: false }).risk, 'A1');
    assert.equal(readPlan({ purpose: 'Investigate', ignored: 99 }).purpose, 'Investigate');
    assert.equal(readPlan({ ignored: 99 }).ignored, undefined);
    for (const field of PLAN_FIELDS)
        assert.ok(planIssues({ ...plan(), [field.id]: ' '.repeat(1201) }).length > 0);
    assert.ok(planIssues({ ...plan(), risk: 'A3', version: 0 }).includes('Supported risk tier'));
});
test('learning points are bounded, repeatable and cannot confer a mission outcome', () => {
    const record = mission({ mission_plan: null, mission_learning: { points: 9999 } });
    assert.equal(learningRewards(record).points, 0);
    record.mission_plan = plan();
    assert.equal(learningRewards(record).points, 30);
    record.mission_learning = answers();
    assert.equal(learningRewards(record).points, 90);
    record.mission_review = review();
    assert.equal(learningRewards(record, [receipt()]).points, 100);
    assert.equal(learningRewards(record, [receipt()]).points, 100);
    assert.equal(record.status, 'proposed');
    assert.ok(learningRewards(record).exampleUnlocked && learningRewards(record).coachUnlocked);
    record.mission_learning.scope = 'optimistic';
    assert.equal(learningRewards(record).points, 75);
    record.mission_plan.version = 5;
    assert.equal(learningRewards(record).points, 45);
});
test('honest failed experiments earn the same review learning credit as passing ones', () => {
    for (const outcome of ['pass', 'fail']) {
        const record = mission({ mission_review: review(outcome) });
        assert.equal(learningRewards(record, [receipt()]).points, 40);
        assert.equal(reviewIssues(record, record.mission_review, [receipt()], false).length, 0);
        assert.equal(
            reviewIssues(record, record.mission_review, [receipt()]).length,
            outcome === 'pass' ? 0 : 4,
        );
    }
    assert.ok(reviewIssues(mission(), emptyReview(), [receipt()]).length > 0);
    assert.ok(reviewIssues(mission(), { ...review(), reflection: ' ' }, [receipt()]).length > 0);
});
test('foreign, missing and unsourced evidence cannot earn review credit', () => {
    const record = mission({ mission_review: review() });
    for (const invalid of [
        { workspace: 'other' },
        { mission: 'other' },
        { content: '' },
        { source: '' },
    ]) {
        assert.equal(missionEvidence(record, [receipt(invalid)]).length, 0);
        assert.equal(learningRewards(record, [receipt(invalid)]).points, 30);
    }
    const broken = review();
    broken.test.observation = 'x'.repeat(1201);
    assert.ok(reviewIssues(record, broken, [receipt()]).length > 0);
});
test('downloaded learning records explicitly remain unsigned and omit private content', () => {
    const record = learningRecord(mission({ mission_learning: answers() }), [receipt(), receipt()]);
    assert.equal(record.format, 'buildanddo.mission-learning/1');
    assert.match(record.assurance, /not a verifiable credential/);
    assert.equal(record.recorded_review_at, null);
    assert.deepEqual(record.evidence_ids, ['receipt1']);
    for (const field of ['proof', '@context', 'credentialSubject', 'mission_plan', 'owner'])
        assert.ok(!(field in record));
    assert.ok(!JSON.stringify(record).includes('Procedure and observed result'));
    assert.equal(
        learningRecord(mission({ mission_reviewed_at: 'saved timestamp' })).recorded_review_at,
        'saved timestamp',
    );
});

// API boundary and lifecycle: every rejection stops e.next() from persisting.
test('a legacy client can create a proposed draft without invented measurements', () => {
    const env = runtime({
        create: true,
        original: mission({
            mission_plan: null,
            mission_approved_by: 'forged',
            mission_reviewed_by: 'forged',
        }),
    });
    assert.equal(env.run(), 'saved');
    assert.equal(env.calls(), 1);
    assert.deepEqual(JSON.parse(JSON.stringify(env.event.record.data.mission_plan)), emptyPlan());
    assert.equal(env.event.record.data.mission_approved_by, '');
    assert.equal(env.event.record.data.mission_reviewed_by, '');
});
test('mission writes require authentication and the correct writable workspace', () => {
    rejects({ auth: null }, /Sign in/);
    rejects({ create: true, auth: { id: 'other' } }, /own account/);
    rejects({ workspaceOwner: 'other', role: 'viewer' }, /workspace owner/);
    rejects({ workspaceOwner: 'other', role: '' }, /workspace owner/);
    for (const role of ['owner', 'admin', 'editor'])
        assert.equal(runtime({ workspaceOwner: 'other', role }).run(), 'saved');
    rejects({ patch: { owner: 'other' } }, /cannot be reassigned/);
    rejects({ patch: { workspace: 'other' } }, /cannot be reassigned/);
});
test('missing schema and malformed JSON fail closed without a partial save', () => {
    const env = runtime();
    env.event.record.fields.delete('mission_review');
    assert.throws(env.run, (error) => error.status === 503);
    assert.equal(env.calls(), 0);
    const malformed = runtime();
    malformed.event.record.raw.mission_plan = '{';
    assert.throws(malformed.run, /data format/);
    assert.equal(malformed.calls(), 0);
});
test('unknown or oversized JSON input and client point counters are rejected', () => {
    for (const invalidPlan of [
        [],
        false,
        { ...plan(), version: 2 },
        { ...plan(), risk: 'A3' },
        { ...plan(), extra: true },
        { ...plan(), purpose: 5 },
        { ...plan(), test: 'x'.repeat(1201) },
    ])
        rejects({ patch: { mission_plan: invalidPlan } }, /plan|characters|risk/);
    for (const invalidLearning of [[], 3, { points: 999 }, { scope: 'unlisted' }])
        rejects({ patch: { mission_learning: invalidLearning } }, /listed lesson/);
    for (const invalidReview of [
        [],
        {},
        { ...review(), extra: true },
        { ...review(), reflection: false },
        { ...review(), test: { outcome: 'pass', observation: '', evidence: '', extra: 'x' } },
    ])
        rejects(
            { original: approved({ status: 'running' }), patch: { mission_review: invalidReview } },
            /review|TEVV/,
        );
    assert.equal(runtime({ patch: { mission_learning: answers() } }).run(), 'saved');
});
test('approval requires a saved complete plan and stamps the authenticated decision maker', () => {
    rejects(
        { original: mission({ mission_plan: emptyPlan() }), patch: { status: 'approved' } },
        /Complete/,
    );
    rejects(
        {
            patch: {
                status: 'approved',
                mission_plan: { ...plan(), target: 'Changed before saving' },
            },
        },
        /Save the plan first/,
    );
    const env = runtime({
        patch: { status: 'approved', mission_approved_by: 'fake', mission_approved_at: 'fake' },
    });
    const start = Date.now();
    env.run();
    assert.equal(env.event.record.data.mission_approved_by, 'user1');
    assert.ok(Date.parse(env.event.record.data.mission_approved_at) >= start);
});
test('clients cannot jump stages, alter a running target or reopen finished work', () => {
    for (const status of ['approved', 'running', 'verified', 'failed', 'unknown'])
        rejects({ create: true, original: mission({ status }) }, /sequence/);
    for (const status of ['running', 'verified', 'failed'])
        rejects({ patch: { status } }, /sequence/);
    rejects({ original: approved(), patch: { status: 'verified' } }, /sequence/);
    rejects({ original: mission({ status: 'unknown' }) }, /sequence/);
    for (const status of ['approved', 'running', 'verified', 'failed']) {
        rejects(
            {
                original: approved({ status }),
                patch: { mission_plan: { ...plan(), target: 'Move the goalpost' } },
            },
            /changing the approved/,
        );
        rejects(
            { original: approved({ status }), patch: { title: 'New goal' } },
            /changing the approved/,
        );
    }
    for (const status of ['verified', 'failed']) {
        rejects({ original: approved({ status }), patch: { status: 'running' } }, /sequence/);
        rejects({ original: approved({ status }), patch: { progress: 20 } }, /finished mission/);
        rejects(
            {
                original: approved({ status, mission_review: review() }),
                patch: { mission_review: review('fail') },
            },
            /finished mission/,
        );
        assert.equal(
            runtime({
                original: approved({ status }),
                patch: { mission_learning: answers() },
            }).run(),
            'saved',
        );
    }
});
test('replanning an approved or paused mission clears approval and prior review', () => {
    for (const status of ['approved', 'needs_attention']) {
        const env = runtime({
            original: approved({
                status,
                mission_review: review(),
                mission_reviewed_by: 'user1',
                mission_reviewed_at: 'previous',
            }),
            patch: {
                status: 'proposed',
                mission_plan: { ...plan(), target: 'Revised target for approval.' },
            },
        });
        env.run();
        assert.equal(env.event.record.data.mission_review, null);
        assert.equal(env.event.record.data.mission_approved_by, '');
        assert.equal(env.event.record.data.mission_reviewed_at, '');
    }
    rejects(
        { original: approved({ status: 'running' }), patch: { status: 'proposed' } },
        /sequence/,
    );
});
test('legacy missions stay readable but need plan and approval before advancing', () => {
    assert.equal(
        runtime({
            original: mission({ status: 'verified', mission_plan: null }),
            patch: { mission_learning: answers() },
        }).run(),
        'saved',
    );
    rejects(
        {
            original: mission({ status: 'approved', mission_plan: null }),
            patch: { status: 'running' },
        },
        /legacy mission/,
    );
    rejects(
        { original: mission({ status: 'approved' }), patch: { status: 'running' } },
        /record approval/,
    );
    const env = runtime({ original: approved(), patch: { status: 'running' } });
    assert.equal(env.run(), 'saved');
    assert.equal(
        runtime({
            original: approved({ status: 'running' }),
            patch: { status: 'needs_attention' },
        }).run(),
        'saved',
    );
    assert.equal(
        runtime({
            original: approved({ status: 'needs_attention' }),
            patch: { status: 'running' },
        }).run(),
        'saved',
    );
});
test('review drafts and honest failures preserve observations without declaring verification', () => {
    rejects({ patch: { mission_review: emptyReview() } }, /Record work/);
    const env = runtime({
        original: approved({ status: 'running' }),
        patch: { mission_review: emptyReview() },
    });
    env.run();
    assert.equal(env.event.record.data.status, 'running');
    assert.equal(env.event.record.data.mission_reviewed_by, 'user1');
    rejects({ original: approved({ status: 'running' }), patch: { status: 'failed' } }, /failure/);
    const failed = runtime({
        original: approved({ status: 'running' }),
        patch: {
            status: 'failed',
            mission_review: {
                ...emptyReview(),
                reflection: 'The service was unavailable; no outcome was measured.',
            },
        },
    });
    failed.run();
    assert.equal(failed.event.record.data.status, 'failed');
});
test('verification rejects missing, failing, foreign or unreadable evidence', () => {
    const original = approved({ status: 'running' });
    rejects({ original, patch: { status: 'verified' } }, /learned/);
    rejects(
        { original, patch: { status: 'verified', mission_review: review('fail') } },
        /passing TEVV/,
    );
    rejects(
        {
            original,
            patch: {
                status: 'verified',
                mission_review: {
                    ...review(),
                    test: { outcome: 'pass', observation: '', evidence: '' },
                },
            },
        },
        /passing TEVV/,
    );
    for (const receipts of [
        [],
        [receipt({ workspace: 'other' })],
        [receipt({ mission: 'other' })],
        [receipt({ owner: 'other' })],
        [receipt({ source: '' })],
        [receipt({ content: '' })],
    ])
        rejects(
            { original, receipts, patch: { status: 'verified', mission_review: review() } },
            /evidence/,
        );
});
test('prototype property names cannot bypass evidence lookup', () => {
    for (const evidence of ['toString', 'constructor', '__proto__']) {
        const fabricated = review();
        for (const step of TEVV) fabricated[step.id].evidence = evidence;
        rejects({ original: approved({ status: 'running' }), receipts: [], patch: { status: 'verified', mission_review: fabricated } }, /evidence/);
    }
});
test('a complete passing review stamps the reviewer once and preserves terminal evidence', () => {
    const env = runtime({
        original: approved({ status: 'running' }),
        patch: {
            status: 'verified',
            mission_review: review(),
            mission_reviewed_by: 'fake',
            mission_reviewed_at: 'fake',
        },
    });
    const start = Date.now();
    assert.equal(env.run(), 'saved');
    const stored = env.event.record.data;
    assert.equal(stored.status, 'verified');
    assert.equal(stored.progress, 100);
    assert.equal(stored.mission_reviewed_by, 'user1');
    assert.ok(Date.parse(stored.mission_reviewed_at) >= start);
    assert.equal(env.lookups.filter(([collection]) => collection === 'evidence').length, 1);
    const preserve = runtime({
        original: stored,
        patch: {
            mission_reviewed_at: 'fake',
            mission_reviewed_by: 'fake',
            mission_learning: answers(),
        },
    });
    preserve.run();
    assert.equal(preserve.event.record.data.mission_reviewed_at, stored.mission_reviewed_at);
    assert.equal(preserve.calls(), 1);
});
test('persistence failures propagate without a success result or retrying the write', () => {
    const env = runtime();
    const failure = new Error('Storage unavailable');
    env.event.next = () => {
        throw failure;
    };
    assert.throws(env.run, (error) => error === failure);
});
test('the optional-field migration is repeatable and its down migration preserves existing fields and rules', () => {
    let up, down;
    const fields = new Map([
        ['title', { id: 'title', name: 'title' }],
        ['status', { id: 'status', name: 'status' }],
    ]);
    const collection = {
        id: 'missions',
        createRule: 'existing create rule',
        updateRule: 'existing update rule',
        fields: {
            getByName: (name) => fields.get(name),
            add: (field) => fields.set(field.name, field),
            removeById: (id) => {
                for (const [name, field] of fields) if (field.id === id) fields.delete(name);
            },
        },
    };
    let saves = 0;
    const app = {
        findCollectionByNameOrId: (name) => (name === 'missions' ? collection : { id: 'users' }),
        save: (record) => {
            assert.equal(record, collection);
            saves++;
        },
    };
    class Field {
        constructor(definition) {
            Object.assign(this, definition, { id: `new-${definition.name}` });
        }
    }
    vm.runInNewContext(
        source(migrationPath),
        {
            migrate: (apply, rollback) => {
                up = apply;
                down = rollback;
            },
            Field,
        },
        { filename: pathToFileURL(resolve(migrationPath)).href },
    );
    up(app);
    up(app);
    assert.equal(saves, 1);
    assert.equal(fields.size, 9);
    for (const name of schemaFields) {
        assert.ok(fields.has(name));
        assert.ok(!fields.get(name).required);
    }
    assert.equal(fields.get('mission_review').maxSize, 24000);
    assert.equal(fields.get('mission_approved_by').collectionId, 'users');
    assert.equal(collection.createRule, 'existing create rule');
    assert.equal(collection.updateRule, 'existing update rule');
    down(app);
    down(app);
    assert.equal(saves, 2);
    assert.deepEqual([...fields.keys()], ['title', 'status']);
});
