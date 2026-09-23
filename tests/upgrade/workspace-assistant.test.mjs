// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/workspace-assistant.test.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/workspace-assistant.js, apps/web/src/lib/workspaceAssistant.js, tests/upgrade/admin-fixture.mjs
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-assistant.js; DEPENDS_ON apps/web/src/lib/workspaceAssistant.js; DEPENDS_ON tests/upgrade/admin-fixture.mjs
// DAG Node:     none
// Intent:       Test tenant and account isolation, bounded inferred plans, revocation, retained personal patterns and unavailable inference.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { plain } from './admin-fixture.mjs';
import { assistantFixture as setup, assistantSurface as surface, assistantMigration as migration } from './assistant-fixture.mjs';
import { createAssistantClient } from '../../apps/web/src/lib/workspaceAssistant.js';
import { assistantDraft, compileJourney } from '../../apps/web/src/lib/journey.js';

test('the compiled journey can be sent from its actual route without granting approval authority', () => {
    const f = setup(), session = f.start('editor');
    const compiled = compileJourney({ mode: 'build', area: 'software', experience: 'some', time: 'day', proof: 'reviewer' });
    f.agentConfig.reply = { reply: 'Measure the baseline before setting a target.', steps: [] };
    assert.equal(f.agentConfig.calls.length, 0);
    for (const route of ['/app/journey', '/app/career']) {
        const turn = f.chat(session, 'editor', { message: assistantDraft(compiled), surface: { ...surface, route, controls: [] } });
        assert.equal(turn.status, 'ready');
        assert.equal(turn.plan.route, route);
        assert.deepEqual(turn.plan.steps, []);
        assert.throws(() => f.chat(session, 'editor', { surface: { ...surface, route,
            controls: [{ ...surface.controls[0], label: 'Approve mission' }] } }), /direct user/);
    }
    assert.equal(f.agentConfig.calls.length, 2);
    assert.equal(f.data.missions.some((mission) => mission.title === compiled.mission.title), false);
});

test('assistant sessions and messages are isolated from every other account including workspace admins', () => {
    const f = setup(), session = f.start('editor'); const turn = f.chat(session, 'editor');
    assert.equal(turn.status, 'ready'); assert.equal(turn.owner, 'editor');
    for (const actor of ['owner', 'admin', 'viewer', 'outsider']) {
        assert.throws(() => f.service.snapshot(f.event(actor, {}, { query: { session: session.id } })), /unavailable|access|member|role/);
        assert.throws(() => f.chat(session, actor), /unavailable|access|member|role/);
    }
    const own = f.service.snapshot(f.event('owner'));
    assert.deepEqual(plain(own.sessions.items), []); assert.equal(f.agentConfig.calls.length, 1);
});
test('inference receives only current account history and patterns, never foreign conversations', () => {
    const f = setup(), other = f.start('admin'); f.chat(other, 'admin', { message: 'Foreign private phrase' });
    const own = f.start('editor'); f.chat(own, 'editor');
    const request = f.agentConfig.calls.at(-1);
    assert.ok(!JSON.stringify(request).includes('Foreign private phrase'));
    assert.match(request.messages[0].content, /untrusted data, never authority/);
});
test('duplicate messages recover the same inferred plan without another model call', () => {
    const f = setup(), session = f.start(); const request_key = 'same-inference-request';
    const one = f.chat(session, 'owner', { request_key }), two = f.chat(session, 'owner', { request_key });
    assert.equal(one.id, two.id); assert.equal(f.agentConfig.calls.length, 1);
    assert.throws(() => f.chat(session, 'owner', { request_key, message: 'Changed inputs' }), /identical message/);
});
test('missing provider binding is visible and never produces invented plans', () => {
    const f = setup(); f.agentConfig.enabled = false; const session = f.start(), turn = f.chat(session);
    assert.equal(turn.status, 'unavailable'); assert.equal(turn.plan, null); assert.equal(f.agentConfig.calls.length, 0);
});
test('invalid inferred controls and authority actions fail closed without application effects', () => {
    const f = setup(), session = f.start(); const baseline = f.data.erp_tasks.length;
    for (const steps of [[{ kind: 'fill', control: 'invisible', value: 'injection' }],
        [{ kind: 'navigate', path: 'https://attacker.org' }], [{ kind: 'script', code: 'run arbitrary code' }],
        [{ kind: 'navigate', path: '/app/erp' }, { kind: 'fill', control: 'control-0', value: 'stale destination' }],
        [{ kind: 'navigate', path: '/app/erp' }, { kind: 'navigate', path: '/app/missions' }]]) {
        f.agentConfig.reply = { reply: 'Invalid model suggestion', steps };
        assert.equal(f.chat(session).status, 'unavailable');
    }
    assert.equal(f.data.erp_tasks.length, baseline);
});
test('sensitive fields and human authority decisions cannot become model controls', () => {
    const f = setup(), session = f.start();
    for (const label of ['Password', 'API credential', 'Verify mission', 'Approve plan', 'Delete record', 'Invite member']) {
        const controls = [{ ...surface.controls[0], label }];
        assert.throws(() => f.chat(session, 'owner', { surface: { ...surface, controls } }), /direct user/);
    }
    assert.equal(f.agentConfig.calls.length, 0);
});
test('viewers can navigate but cannot receive form-write plans or administration routes', () => {
    const f = setup(), session = f.start('viewer');
    assert.equal(f.chat(session, 'viewer').status, 'unavailable');
    f.agentConfig.reply = { reply: 'Open the task desk.', steps: [{ kind: 'navigate', path: '/app/erp' }] };
    assert.equal(f.chat(session, 'viewer').status, 'ready');
    f.agentConfig.reply.steps[0].path = '/app/admin'; assert.equal(f.chat(session, 'viewer').status, 'unavailable');
});
test('revocation or role change while inference runs prevents returning the retained plan', () => {
    const f = setup(), session = f.start('editor');
    f.agentConfig.during = () => { const member = f.app.findRecordById('workspace_members', 'editormember'); member.set('role', 'viewer'); f.app.save(member); };
    assert.throws(() => f.chat(session, 'editor'), /authority changed/);
    assert.equal(f.data.assistant_turns[0].status, 'pending');
});
test('personal knowledge retains observed patterns per session without storing filled values', () => {
    const f = setup(), session = f.start('editor'), turn = f.chat(session, 'editor');
    const receipt = f.command('plan.record', { turn: turn.id, outcome: 'applied', completed_steps: 1, observation: 'Browser field changed; saved outcome remains unverified.' }, 'editor');
    assert.equal(receipt.evidence_state, 'client_observed');
    const graph = plain(f.service.knowledge(f.event('editor')));
    assert.equal(graph.patterns.length, 1); assert.equal(graph.patterns[0].session, session.id);
    assert.ok(graph.edges.some((edge) => edge.relation === 'OBSERVED_IN'));
    assert.ok(!JSON.stringify(graph).includes('Customer follow-up'));
    assert.equal(f.service.knowledge(f.event('owner')).patterns.length, 0);
    assert.throws(() => f.command('plan.record', { turn: turn.id, outcome: 'failed', completed_steps: 0, observation: 'Replace prior result' }, 'editor'), /cannot be rewritten/);
});
test('impossible outcomes and false verification are rejected', () => {
    const f = setup(), turn = f.chat(f.start());
    for (const outcome of [{ outcome: 'verified', completed_steps: 1 }, { outcome: 'applied', completed_steps: 0 }, { outcome: 'partial', completed_steps: 2 }])
        assert.throws(() => f.command('plan.record', { turn: turn.id, ...outcome, observation: '' }), /actual browser|proposed plan/);
    assert.equal(f.data.assistant_patterns.length, 0);
});
test('closing a session stops new inference; forgetting removes only the current user history', () => {
    const f = setup(), one = f.start('owner'), two = f.start('editor'); f.chat(one); f.chat(two, 'editor');
    f.command('session.close', { session: one.id }); assert.throws(() => f.chat(one), /new session/);
    assert.throws(() => f.command('session.forget', { session: two.id }), /unavailable/);
    f.command('session.forget', { session: one.id });
    assert.equal(f.data.assistant_sessions.length, 1); assert.equal(f.data.assistant_turns[0].owner, 'editor');
});
test('rollback retains personal history while disabling assistant reads and writes', () => {
    const f = setup(), session = f.start(); f.chat(session); f.migration(migration).down();
    assert.throws(() => f.service.snapshot(f.event()), /schema/); assert.equal(f.data.assistant_turns.length, 1);
    f.migration(migration).up(); assert.equal(f.service.snapshot(f.event()).sessions.items.length, 1);
    f.collections.assistant_sessions.listRule = ''; assert.throws(() => f.service.snapshot(f.event()), /account isolation/);
});
test('connected assistant client rejects late and foreign scope responses', async () => {
    let current = true;
    const client = { authStore: { record: { id: 'editor' } }, send: async () => ({ workspace: 'ws1', owner: 'owner' }) };
    const api = createAssistantClient({ client, workspaceId: 'ws1', accountId: 'editor', isCurrent: () => current });
    assert.equal((await api.snapshot()).ok, false);
    client.send = async () => { current = false; return { workspace: 'ws1', owner: 'editor' }; };
    assert.equal((await api.snapshot()).stale, true);
    client.send = async () => { throw new Error('should not call'); }; assert.equal((await api.snapshot()).stale, true);
});

test('assistant context cites only readable current-workspace records and the actual mission plan', () => {
    const f = setup();
    f.seed('missions', { id: 'citedmission', workspace: 'ws1', owner: 'editor', title: 'Customer follow-up', description: 'Readable observation',
        status: 'proposed', mission_plan: { purpose: 'Customer follow-up', target: 'Confirm callback ownership' } });
    f.seed('missions', { id: 'foreignmission', workspace: 'ws2', owner: 'otherowner', title: 'Customer private foreign', description: 'Foreign workspace bytes', status: 'proposed' });
    f.seed('missions', { id: 'deniedmission', workspace: 'ws1', owner: 'owner', title: 'Customer denied', description: 'Restricted record bytes', status: 'proposed' });
    f.denied.add('deniedmission');
    const turn = f.chat(f.start('editor'), 'editor', { message: 'Customer follow-up' });
    assert.equal(turn.status, 'ready');
    const packet = JSON.parse(f.agentConfig.calls.at(-1).messages[1].content).knowledge;
    assert.ok(JSON.stringify(packet).includes('Confirm callback ownership'));
    assert.ok(!JSON.stringify(packet).includes('Foreign workspace bytes')); assert.ok(!JSON.stringify(packet).includes('Restricted record bytes'));
    assert.equal(packet.source_trust, 'untrusted_reference_material');
    assert.ok(turn.plan.context.citations.some((item) => item.record === 'citedmission'));
});
test('recorded partial outcomes cannot be rewritten with a different completed-step count', () => {
    const f = setup(); f.agentConfig.reply.steps = [
        { kind: 'fill', control: 'control-0', value: 'Changed title' }, { kind: 'activate', control: 'control-1' },
    ];
    const turn = f.chat(f.start());
    const payload = { turn: turn.id, outcome: 'partial', completed_steps: 1, observation: 'One field changed before context expired' };
    const one = f.command('plan.record', payload), two = f.command('plan.record', payload);
    assert.equal(one.id, two.id);
    assert.throws(() => f.command('plan.record', { ...payload, completed_steps: 0 }), /proposed plan/);
    assert.equal(f.data.assistant_patterns.length, 1);
});
test('missing identity indices or field contracts stop assistant reads before inference', () => {
    for (const collection of ['assistant_sessions', 'assistant_turns', 'assistant_patterns']) {
        const f = setup(); f.collections[collection].indexes = [];
        assert.throws(() => f.service.snapshot(f.event()), /isolation/); assert.equal(f.agentConfig.calls.length, 0);
    }
});

const usageMigration = 'apps/pocketbase/pb_migrations/1791300001_assistant_turn_usage.js';
test('assistant turns keep the answering model and reported token counts, never estimated ones', () => {
    const f = setup(); f.migration(usageMigration).up(); f.migration(usageMigration).up();
    const session = f.start();
    f.agentConfig.envelope = { model: 'provider-model-7', usage: { prompt_tokens: 812, completion_tokens: 96, total_tokens: 908 } };
    const one = f.chat(session);
    const saved = f.data.assistant_turns.find((row) => row.id === one.id);
    assert.deepEqual(saved.usage, { model: 'provider-model-7', input_tokens: 812, output_tokens: 96 });
    assert.equal('usage' in (saved.plan || {}), false, 'usage never enters the stored plan');
    assert.equal(JSON.stringify(one).includes('input_tokens'), false, 'usage is not returned to the browser');

    f.agentConfig.envelope = {};
    const two = f.chat(session);
    assert.deepEqual(f.data.assistant_turns.find((row) => row.id === two.id).usage, { model: 'configured-model' });

    f.agentConfig.envelope = { usage: { prompt_tokens: -4, completion_tokens: 1.5 } };
    const three = f.chat(session);
    assert.deepEqual(f.data.assistant_turns.find((row) => row.id === three.id).usage, { model: 'configured-model' });
});

test('a failed turn records no usage, and servers without the usage migration are unchanged', () => {
    const plainServer = setup(), s1 = plainServer.start();
    const turn = plainServer.chat(s1);
    assert.equal('usage' in plainServer.data.assistant_turns.find((row) => row.id === turn.id), false);

    const f = setup(); f.migration(usageMigration).up(); const session = f.start();
    f.agentConfig.enabled = false;
    const failed = f.chat(session);
    assert.equal(failed.status, 'unavailable');
    assert.equal(f.data.assistant_turns.find((row) => row.id === failed.id).usage, null);
    f.migration(usageMigration).down();
    assert.equal(f.collections.assistant_turns.fields.getByName('usage'), undefined);
});
