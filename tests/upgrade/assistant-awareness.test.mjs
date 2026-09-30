// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/assistant-awareness.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     tests/upgrade/assistant-fixture.mjs, apps/pocketbase/pb_hooks/workspace-assistant.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/assistant-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-assistant.js
// Intent:      Keep Buddi's connection claims, route suggestions and system context bounded by current workspace evidence and native authority.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantFixture, assistantSurface } from './assistant-fixture.mjs';
import { plain } from './admin-fixture.mjs';

const estate = ['/app/fleet', '/app/platforms', '/app/passport'];
function master(f, enabled) {
    const user = f.app.findRecordById('users', 'owner');
    user.set('cnwb_seat_level', enabled ? 'master' : 'none'); f.app.save(user);
}

test('workspace ownership cannot suggest or capture estate routes; native master metadata can', () => {
    const f = assistantFixture(), session = f.start();
    assert.ok(f.service.snapshot(f.event()).routes.every(([path]) => !estate.includes(path)));
    for (const path of estate) {
        f.agentConfig.reply = { reply: 'Open an estate report.', steps: [{ kind: 'navigate', path }] };
        assert.equal(f.chat(session).status, 'unavailable');
        assert.throws(() => f.chat(session, 'owner', { surface: { ...assistantSurface, route: path } }), /accessible platform route/);
    }
    master(f, true);
    assert.ok(f.service.snapshot(f.event()).routes.some(([path]) => path === estate[0]));
    assert.equal(f.chat(session).status, 'ready');
    master(f, false);
    assert.ok(f.service.snapshot(f.event()).routes.every(([path]) => !estate.includes(path)));
});

test('master-seat revocation during inference fences the proposed response', () => {
    const f = assistantFixture(); master(f, true);
    const session = f.start();
    f.agentConfig.reply = { reply: 'Open fleet.', steps: [{ kind: 'navigate', path: estate[0] }] };
    f.agentConfig.during = () => master(f, false);
    assert.throws(() => f.chat(session), /authority changed/);
    assert.equal(f.data.assistant_turns[0].status, 'pending');
});

test('availability uses the same URL and nonblank model requirements as actual inference', () => {
    for (const [url, model] of [['http://agent.example.org/chat', 'model'], ['https://agent.example.org/chat', '   '],
        ['https://user:password@example.org/chat', 'model'], ['https://agent.example.org/chat?private=yes', 'model']]) {
        const f = assistantFixture(); Object.assign(f.agentConfig, { url, model });
        assert.equal(f.service.snapshot(f.event()).inference_configured, false);
        assert.equal(f.chat(f.start()).status, 'unavailable');
        assert.equal(f.agentConfig.calls.length, 0);
    }
});

test('system awareness carries dated scoped observations without configuration, receipts or foreign state', () => {
    const f = assistantFixture(), now = new Date().toISOString();
    f.seed('workspace_integrations', { id: 'ownintegration', workspace: 'ws1', provider: 'datadog', desired_enabled: true,
        configuration: { binding: 'PRIVATE-ENDPOINT-SENTINEL' }, revision: 2, applied_revision: 2,
        observed_state: 'healthy', observed_at: now, receipt_ref: 'PRIVATE-RECEIPT-SENTINEL' });
    f.seed('workspace_integrations', { id: 'foreignintegration', workspace: 'ws2', provider: 'posthog', desired_enabled: true,
        revision: 1, applied_revision: 1, observed_state: 'failed', observed_at: now, receipt_ref: 'FOREIGN-SENTINEL' });
    const result = plain(f.service.snapshot(f.event())), own = result.systems.items.find((item) => item.provider === 'datadog');
    assert.equal(own.state, 'healthy'); assert.equal(own.observed_at, now);
    assert.equal(result.systems.items.find((item) => item.provider === 'posthog').state, 'not_configured');
    const turn = f.chat(f.start()); assert.equal(turn.status, 'ready');
    const prompt = JSON.parse(f.agentConfig.calls[0].messages[1].content);
    assert.equal(prompt.systems.items.find((item) => item.provider === 'datadog').state, 'healthy');
    assert.ok(!JSON.stringify({ result, prompt, turn }).includes('SENTINEL'));
    assert.ok(prompt.routes.every(([path]) => !estate.includes(path)));
    assert.equal(turn.plan.context.systems.items.find((item) => item.provider === 'datadog').observed_at, now);
});

test('old, future, unapplied and receipt-free observations cannot claim healthy connections', () => {
    for (const override of [{ observed_at: new Date(Date.now() - 16 * 60000).toISOString() },
        { observed_at: new Date(Date.now() + 60000).toISOString() }, { applied_revision: 1 }, { receipt_ref: '' }]) {
        const f = assistantFixture();
        f.seed('workspace_integrations', { id: 'oldintegration', workspace: 'ws1', provider: 'datadog', desired_enabled: true,
            revision: 2, applied_revision: 2, observed_state: 'healthy', observed_at: new Date().toISOString(), receipt_ref: 'receipt', ...override });
        const systems = f.service.snapshot(f.event()).systems;
        assert.notEqual(systems.items.find((item) => item.provider === 'datadog').state, 'healthy');
    }
});

test('missing or ambiguous integration data leaves Buddi usable with explicit partial awareness', () => {
    const f = assistantFixture(); delete f.collections.workspace_integrations;
    assert.equal(f.service.snapshot(f.event()).systems.state, 'unavailable');
    assert.equal(f.chat(f.start()).status, 'ready');
    const prompt = JSON.parse(f.agentConfig.calls.at(-1).messages[1].content);
    assert.equal(prompt.systems.state, 'unavailable');
    assert.deepEqual(prompt.systems.items, []);
    const duplicate = assistantFixture();
    for (const id of ['duplicateone', 'duplicatetwo'])
        duplicate.seed('workspace_integrations', { id, workspace: 'ws1', provider: 'datadog' });
    assert.equal(duplicate.service.snapshot(duplicate.event()).systems.state, 'unavailable');
    assert.equal(duplicate.chat(duplicate.start()).status, 'ready');
});

test('a retained successful plan cannot restore estate access after native seat revocation', () => {
    const f = assistantFixture(); master(f, true);
    const session = f.start(), request_key = 'retained-estate-request';
    f.agentConfig.reply = { reply: 'Open fleet.', steps: [{ kind: 'navigate', path: estate[0] }] };
    assert.equal(f.chat(session, 'owner', { request_key }).status, 'ready');
    master(f, false);
    assert.throws(() => f.chat(session, 'owner', { request_key }), /accessible platform route/);
    assert.equal(f.agentConfig.calls.length, 1);
});
