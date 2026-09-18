// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/blueprint-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/web/src/lib/blueprints.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/blueprints.js
// DAG Node:    none
// Intent:      Verify scoped PDF analysis, account isolation, review prompts and JSON exports through the actual application adapters.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlueprintClient, exportMissionPlan } from '../../apps/web/src/lib/blueprints.js';
import { decisionFixture, layoutBlueprintResult } from './decision-fixture.mjs';

const bytes = new TextEncoder().encode('%PDF-1.4 fixture');
const file = () => ({ name: 'sample.pdf', size: bytes.length, arrayBuffer: async () => bytes.buffer });
function setup() {
    const backend = decisionFixture();
    backend.transport(() => ({ statusCode: 200, json: layoutBlueprintResult() }));
    let active = true;
    const client = { authStore: { record: { id: 'member' } }, calls: [],
        async send(path, options) {
            this.calls.push({ path, options });
            return backend.request(options.body, { operation: 'blueprints/analyze' }).result;
        } };
    const api = createBlueprintClient({ client, accountId: 'member', workspaceId: 'ws1', isCurrent: () => active });
    return { backend, client, api, leave: () => { active = false; } };
}

test('PDF client reaches authenticated pipeline and retains review plan and decision provenance', async () => {
    const f = setup(); const result = await f.api.analyze(file(), true);
    assert.equal(result.ok, true); assert.equal(f.backend.rows.length, 3);
    assert.equal(result.data.session_prompts.length, 3);
    assert.equal(f.client.calls[0].path, '/api/buildanddo/workspaces/ws1/blueprints/analyze');
    assert.equal(f.client.calls[0].options.body.authority, 'A0');
    assert.equal(f.client.calls[0].options.body.include_prompts, true);
    assert.equal(atob(f.client.calls[0].options.body.pdf_base64), '%PDF-1.4 fixture');
    assert.equal(f.client.calls[0].options.cache, 'no-store');
    assert.equal(f.client.calls[0].options.requestKey, null);
});

test('client declines demo, account changes and workspace changes without exposing results', async () => {
    const f = setup();
    f.leave(); assert.equal((await f.api.analyze(file())).reason, 'scope_changed');
    assert.equal(f.client.calls.length, 0);
    const demo = createBlueprintClient({ client: f.client, accountId: 'member', workspaceId: 'ws1', demo: true, isCurrent: () => true });
    assert.equal((await demo.analyze(file())).reason, 'scope_changed');
    const changed = setup(); changed.client.authStore.record = { id: 'other' };
    assert.equal((await changed.api.analyze(file())).reason, 'scope_changed');
});

test('late file reads and late analysis responses are discarded after scope changes', async () => {
    const f = setup(); let finish;
    const pending = f.api.analyze({ ...file(), arrayBuffer: () => new Promise((resolve) => { finish = resolve; }) });
    f.leave(); finish(bytes.buffer);
    assert.equal((await pending).reason, 'scope_changed'); assert.equal(f.client.calls.length, 0);
    const g = setup(); let resolve;
    g.client.send = () => new Promise((done) => { resolve = done; });
    const analysis = g.api.analyze(file()); await Promise.resolve(); await Promise.resolve();
    g.leave(); resolve({ ...layoutBlueprintResult(), workspace: 'ws1' });
    assert.equal((await analysis).reason, 'scope_changed');
});

test('duplicate in-flight analysis is prevented and malformed or oversized files do not send', async () => {
    const f = setup();
    for (const invalid of [null, { ...file(), name: 'x.exe' }, { ...file(), size: 0 }, { ...file(), size: 20971521 },
        { ...file(), name: 'x'.repeat(180) + '.pdf' }])
        assert.equal((await f.api.analyze(invalid)).ok, false);
    assert.equal(f.client.calls.length, 0);
    let finish; const pending = f.api.analyze({ ...file(), arrayBuffer: () => new Promise((done) => { finish = done; }) });
    assert.match((await f.api.analyze(file())).error, /already running/);
    finish(bytes.buffer); assert.equal((await pending).ok, true);
});

test('truncated files and processor failures remain visible failures', async () => {
    const f = setup();
    assert.match((await f.api.analyze({ ...file(), size: bytes.length + 1 })).error, /completely/);
    f.client.send = async () => { throw { status: 503, response: { message: 'private-state-marker' } }; };
    const result = await f.api.analyze(file());
    assert.equal(result.ok, false); assert.doesNotMatch(result.error, /private-state-marker/);
});

test('malformed or foreign responses cannot become a review plan', async () => {
    for (const change of [
        (d) => { d.workspace = 'ws2'; }, (d) => { d.verified = true; },
        (d) => { d.blueprint.parsed.requirements = null; }, (d) => { d.blueprint.assessment = null; },
        (d) => { d.mission_plan.authority = 'A3'; }, (d) => { d.session_prompts[0].review_required = false; },
    ]) {
        const f = setup(); const response = { ...layoutBlueprintResult(), workspace: 'ws1' }; change(response);
        f.client.send = async () => response;
        assert.equal((await f.api.analyze(file())).ok, false);
    }
});

test('JSON export retains provenance and revokes its temporary object URL', async () => {
    const before = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout };
    let blob; let clicked = false; let removed = false; let revoked = false;
    const anchor = { click() { clicked = true; }, remove() { removed = true; } };
    try {
        globalThis.document = { createElement: () => anchor, body: { appendChild() {} } };
        URL.createObjectURL = (value) => { blob = value; return 'blob:test'; };
        URL.revokeObjectURL = (url) => { assert.equal(url, 'blob:test'); revoked = true; };
        globalThis.setTimeout = (callback) => { callback(); return 0; };
        const plan = layoutBlueprintResult().mission_plan;
        exportMissionPlan(plan);
        assert.equal(clicked, true); assert.equal(removed, true); assert.equal(revoked, true);
        assert.equal(anchor.download, 'blueprint-mission-plan.json');
        assert.deepEqual(JSON.parse(await blob.text()), plan);
        clicked = false; exportMissionPlan({ ...plan, verified: true }); assert.equal(clicked, false);
    } finally {
        globalThis.document = before.document; URL.createObjectURL = before.create; URL.revokeObjectURL = before.revoke;
        globalThis.setTimeout = before.timeout;
    }
});
