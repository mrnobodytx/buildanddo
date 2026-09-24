// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/objective-onboarding.test.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-22
// Depends:      apps/pocketbase/pb_hooks/workspace-onboarding.js, apps/pocketbase/pb_migrations/1791100000_objective_onboarding.js, apps/web/src/lib/onboarding.js
// EnumType:     Test
// EnumEdges:    VALIDATES apps/pocketbase/pb_hooks/workspace-onboarding.js; VALIDATES apps/pocketbase/pb_migrations/1791100000_objective_onboarding.js; VALIDATES apps/web/src/lib/onboarding.js
// DAG Node:     none
// Intent:       Verify that saved intent reaches a real objective and existing lessons without duplicate setups, lost goals or cross-account results.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fixture, plain } from './admin-fixture.mjs';
import { createWorkspace, ONBOARDING_INTENTS, recommendedPath } from '../../apps/web/src/lib/onboarding.js';

const MIGRATION = 'apps/pocketbase/pb_migrations/1791100000_objective_onboarding.js';
const input = { name: 'First website', domain: '', intent: 'build', objective: 'Deploy my first website', business_context: '' };
function setup() {
    const f = fixture({ runtime: { $security: { sha256: (value) => createHash('sha256').update(value).digest('hex') } } });
    f.migration('apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js').up();
    f.migration(MIGRATION).up();
    return f;
}
function expanded(f, result) {
    return { ...f.data.workspaces.find((row) => row.id === result.workspace),
        expand: { onboarding_objective: f.data.erp_objectives.find((row) => row.id === result.objective) } };
}

for (const { value: intent, label } of ONBOARDING_INTENTS) test(`${intent}: save an objective without a domain and reopen a real starting path`, () => {
    const f = setup(), result = f.load('workspace-onboarding.js').create(f.event('newuser', { ...input, intent }));
    const workspace = expanded(f, result), goal = workspace.expand.onboarding_objective;
    assert.equal(workspace.onboarding_intent, intent);
    assert.equal(workspace.onboarding_objective, goal.id);
    assert.equal(goal.title, input.objective); assert.equal(goal.status, 'active'); assert.equal(goal.owner, 'newuser');
    assert.equal(f.data.domains.length, 0); assert.equal(f.data.services.length, 7);
    assert.ok(f.data.services.every((row) => row.status === 'planned'));
    const path = recommendedPath(workspace);
    assert.equal(path.intent, label); assert.equal(path.objective, input.objective);
    assert.equal(path.steps[1].to, `/app/erp?objective=${goal.id}`);
    const lessons = JSON.parse(readFileSync(new URL('../../apps/pocketbase/pb_migrations/data/starter-tutorials.json', import.meta.url))).lessons;
    const slug = new URL(path.steps[0].to, 'https://fixture.invalid').searchParams.get('lesson');
    assert.ok(lessons.some((lesson) => lesson.slug === slug && path.steps[0].label.includes(lesson.title)));
    assert.equal(path.steps[2].to, intent === 'class' ? '/app/classrooms' : intent === 'explore' ? '/app/tutorials' : '/app/missions');
    assert.equal(f.data.missions.length, 0, 'Choosing intent cannot approve or create a mission');
});

test('optional context is saved as unverified input with the same recoverable identity', () => {
    const f = setup(), command = f.load('workspace-onboarding.js').create;
    const before = { ...input, name: ' First website ', domain: 'SHOP.EXAMPLE', business_context: ' Studio ' };
    const first = command(f.event('newuser', before));
    const again = command(f.event('newuser', { ...before, domain: 'shop.example', name: input.name, business_context: 'Studio' }));
    assert.equal(again.replayed, true); assert.equal(again.workspace, first.workspace); assert.equal(again.objective, first.objective);
    assert.equal(f.data.workspace_onboarding.length, 1); assert.equal(f.data.erp_objectives.length, 1);
    assert.equal(expanded(f, first).business_context, 'Studio');
    assert.equal(f.data.domains[0].status, 'selected'); assert.equal(f.data.domains[0].domain, 'shop.example');
});

test('distinct objectives and accounts cannot collapse into another setup', () => {
    const f = setup(), command = f.load('workspace-onboarding.js').create;
    const first = command(f.event('newuser', input));
    const changed = command(f.event('newuser', { ...input, objective: 'Learn to write my first test' }));
    const foreign = command(f.event('outsider', input));
    assert.equal(new Set([first.workspace, changed.workspace, foreign.workspace]).size, 3);
    assert.equal(new Set([first.objective, changed.objective, foreign.objective]).size, 3);
    const workspace = f.app.findRecordById('workspaces', first.workspace); workspace.set('owner', 'outsider'); f.app.save(workspace);
    assert.throws(() => command(f.event('newuser', input)), /no longer owned/);
});

test('legacy domain-only receipts survive migration and recovery unchanged', () => {
    const f = setup(), command = f.load('workspace-onboarding.js').create, legacy = { name: input.name, domain: '' };
    const first = command(f.event('newuser', legacy)), snapshot = plain(f.data.workspace_onboarding);
    f.migration(MIGRATION).down(); f.migration(MIGRATION).up(); f.migration(MIGRATION).up();
    assert.deepEqual(f.data.workspace_onboarding, snapshot);
    assert.equal(command(f.event('newuser', legacy)).workspace, first.workspace);
    assert.equal(f.data.erp_objectives.length, 0); assert.equal(recommendedPath(expanded(f, first)), null);
});

test('rollback disables objective setup while retaining every goal, context and retry receipt', () => {
    const f = setup(), command = f.load('workspace-onboarding.js').create;
    const first = command(f.event('newuser', input)), snapshot = plain(f.data);
    f.migration(MIGRATION).down(); f.migration(MIGRATION).down();
    assert.throws(() => command(f.event('newuser', input)), /not installed|schema|migrat/i);
    assert.deepEqual(f.data, snapshot);
    f.migration(MIGRATION).up(); f.migration(MIGRATION).up();
    assert.equal(command(f.event('newuser', input)).objective, first.objective);
});

for (const collection of ['erp_objectives', 'services', 'workspace_onboarding']) test(`a failure saving ${collection} leaves no partial workspace or goal`, () => {
    const f = setup(), save = f.app.save.bind(f.app), before = plain(f.data);
    f.app.save = (record) => { if (record.collection?.().name === collection) throw new Error('Synthetic storage failure'); return save(record); };
    assert.throws(() => f.load('workspace-onboarding.js').create(f.event('newuser', { ...input, domain: 'shop.example' })), /storage failure/);
    assert.deepEqual(f.data, before);
});

test('invalid, incomplete, overlong and authority-bearing inputs fail before writes', () => {
    const f = setup(), command = f.load('workspace-onboarding.js').create, before = plain(f.data);
    const invalid = [null, {}, { ...input, intent: 'deploy' }, { ...input, objective: '  ' }, { ...input, objective: 'x'.repeat(161) },
        { ...input, business_context: 'x'.repeat(121) }, { ...input, intent: null }, { ...input, objective: {} },
        { ...input, domain: 'https://example.com' }, { ...input, owner: 'owner' }, { ...input, approved: true }];
    for (const value of invalid) assert.throws(() => command(f.event('newuser', value)));
    const missing = { ...input }; delete missing.business_context;
    assert.throws(() => command(f.event('newuser', missing)));
    assert.throws(() => command(f.event(null, input)));
    assert.deepEqual(f.data, before);
});

test('custom access and incompatible fields stop the migration without partial schema changes', () => {
    for (const change of [
        (f) => { f.collections.workspaces.updateRule = ''; },
        (f) => { f.collections.workspace_onboarding.viewRule = ''; },
        (f) => { f.collections.workspaces.fields.getByName('onboarding_objective').collectionId = 'users'; },
        (f) => { f.collections.workspaces.fields.getByName('onboarding_intent').values.push('admin'); },
        (f) => { f.collections.workspaces.fields.getByName('business_context').required = true; },
    ]) {
        const f = setup(); change(f);
        const before = JSON.stringify(f.collections);
        assert.throws(() => f.migration(MIGRATION).up(), /Review/);
        assert.equal(JSON.stringify(f.collections), before);
    }
});

test('direct workspace creation cannot attach a foreign objective or manufacture onboarding state', () => {
    const f = setup(), policy = f.load('workspace-record-policy.js');
    for (const [field, value] of [['onboarding_intent', 'build'], ['onboarding_objective', 'foreigngoal'], ['business_context', 'Shop']]) {
        const e = f.event('newuser'); e.record = f.record('workspaces', { owner: 'newuser', name: input.name, [field]: value }); e.next = () => assert.fail('Unexpected write');
        assert.throws(() => policy.workspaceCreate(e), /Use workspace onboarding/);
    }
});

test('a lost browser response recovers one workspace and one goal through the real command', async () => {
    const f = setup(); let lost = true;
    const client = { authStore: { record: { id: 'newuser' } }, send: async (_, { body }) => {
        const result = plain(f.load('workspace-onboarding.js').create(f.event('newuser', body)));
        if (lost) { lost = false; throw new Error('Synthetic response loss'); } return result;
    } };
    assert.equal((await createWorkspace(client, 'newuser', input)).ok, false);
    const recovered = await createWorkspace(client, 'newuser', input);
    assert.equal(recovered.ok, true); assert.equal(recovered.replayed, true);
    assert.equal(f.data.workspace_onboarding.length, 1); assert.equal(f.data.erp_objectives.length, 1);
});

test('incomplete objective receipts and delayed responses from another account are rejected', async () => {
    const f = setup(), receipt = plain(f.load('workspace-onboarding.js').create(f.event('newuser', input)));
    const client = { authStore: { record: { id: 'newuser' } }, send: async () => ({ ...receipt, objective: '' }) };
    assert.equal((await createWorkspace(client, 'newuser', input)).ok, false);
    client.send = async () => ({ ...receipt, intent: 'explore' });
    assert.equal((await createWorkspace(client, 'newuser', input)).ok, false);
    client.send = async () => { client.authStore.record = { id: 'outsider' }; return receipt; };
    assert.equal((await createWorkspace(client, 'newuser', input)).stale, true);
});

test('recommendations hide foreign, deleted and malformed objectives instead of inventing progress', () => {
    const f = setup(), receipt = f.load('workspace-onboarding.js').create(f.event('newuser', input)), workspace = expanded(f, receipt);
    for (const value of [null, {}, { ...workspace, onboarding_intent: 'admin' }, { ...workspace, expand: {} },
        { ...workspace, onboarding_objective: 'other' }, { ...workspace, id: 'other' },
        { ...workspace, expand: { onboarding_objective: { ...workspace.expand.onboarding_objective, title: '' } } },
        { ...workspace, onboarding_objective: '../unsafe', expand: { onboarding_objective: { ...workspace.expand.onboarding_objective, id: '../unsafe' } } },
    ]) assert.equal(recommendedPath(value), null);
});
