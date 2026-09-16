// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/suite-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/lib/missionSuite.js, tests/upgrade/suite-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/missionSuite.js; DEPENDS_ON tests/upgrade/suite-fixture.mjs
// DAG Node:    none
// Intent:      Verify browser-to-policy command recovery, account isolation and local PDF fingerprinting without a rendered-runtime claim.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createSuiteClient, fingerprintPdf } from '../../apps/web/src/lib/missionSuite.js';
import { suiteFixture, hash } from './suite-fixture.mjs';
import { plain } from './admin-fixture.mjs';
function connected(options = {}) {
    const f = suiteFixture(); f.configure(); let current = true; let key = 0; const calls = [];
    const client = { authStore: { record: { id: 'editor' } }, async send(path, config) {
        calls.push({ path, config });
        return plain(f.service.command(f.event(client.authStore.record.id, config.body)));
    } };
    const api = createSuiteClient({ client, accountId: 'editor', workspaceId: 'ws1', missionId: 'mission1', isCurrent: () => current,
        keyFactory: () => `suite_client_request_${++key}`, ...options });
    const payload = () => ({ suite: 'maritime', input: { observations: [f.observation()] } });
    return { f, api, client, calls, payload, stale: () => { current = false; } };
}

test('browser uses one POST surface for real policy reads, enqueue and reviewed results', async () => {
    const c = connected(); assert.equal((await c.api.read()).ok, true);
    const saved = await c.api.command('enqueue', c.payload()); assert.equal(saved.ok, true);
    const queued = await c.api.detail(saved.result.id); assert.equal(queued.ok, true);
    assert.equal(queued.data.record.result, null); assert.equal(queued.data.record.result_canonical, '');
    c.f.complete(c.f.claim(saved.result));
    const detail = await c.api.detail(saved.result.id); assert.equal(detail.ok, true); assert.equal(detail.data.record.result.release_state, 'HOLD');
    assert.equal(hash(detail.data.record.result_canonical), detail.data.record.result_sha256);
    assert.equal((await c.api.command('attach', { id: saved.result.id, note: 'Reviewed source and limitations.' }, detail.data.record.revision)).ok, true);
    assert.ok(c.calls.every((call) => call.path === '/api/buildanddo/workspaces/ws1/suite' && call.config.method === 'POST' && call.config.cache === 'no-store' && call.config.requestKey === null));
});

test('nested pending input is immutable and a different nested edit cannot reuse an uncertain command', async () => {
    const c = connected(); const send = c.client.send; let lost = true;
    c.client.send = async (...args) => { const value = await send(...args); if (lost) { lost = false; throw new Error('connection lost'); } return value; };
    const payload = c.payload(); assert.equal((await c.api.command('enqueue', payload)).reason, 'uncertain');
    payload.input.observations[0].longitude = 25;
    assert.equal((await c.api.command('enqueue', payload)).reason, 'uncertain');
    const recovered = await c.api.retry(); assert.equal(recovered.result.replayed, true);
    assert.equal(JSON.parse(c.f.data.suite_runs[0].input_canonical).payload.observations[0].longitude, -90);
    assert.equal(c.f.data.suite_runs.length, 1); assert.equal((await c.api.retry()).reason, 'invalid');
});

test('in-flight account change discards results, errors and retry payloads', async () => {
    for (const lateError of [false, true]) {
        const c = connected(); const send = c.client.send;
        c.client.send = async (...args) => { const value = await send(...args); c.client.authStore.record = { id: 'viewer' }; if (lateError) throw new Error(); return value; };
        assert.deepEqual(await c.api.command('enqueue', c.payload()), { ok: false, reason: 'scope_changed', error: '' });
        assert.equal((await c.api.retry()).reason, 'scope_changed');
    }
    const c = connected(); const send = c.client.send;
    c.client.send = async (...args) => { const value = await send(...args); c.stale(); return value; };
    assert.equal((await c.api.read()).reason, 'scope_changed');
});

test('malformed receipts stay uncertain; malformed or foreign reads never become successful empty state', async () => {
    const c = connected(); const send = c.client.send;
    c.client.send = async (...args) => { await send(...args); return {}; };
    assert.equal((await c.api.command('enqueue', c.payload())).reason, 'uncertain');
    c.client.send = send; const recovered = await c.api.retry(); assert.equal(recovered.ok, true);
    c.client.send = async (...args) => { const data = await send(...args); delete data.record.result_canonical; return data; };
    assert.equal((await c.api.detail(recovered.result.id)).ok, false);
    c.client.send = async () => ({ workspace: 'ws1', mission: 'mission2', items: [] });
    assert.equal((await c.api.read()).ok, false); assert.equal((await c.api.detail('run1')).ok, false);
    assert.equal((await c.api.detail('../foreign')).ok, false); assert.equal((await c.api.read(0)).ok, false);
});

test('server revocation and conflicts clear definitive failures while scope and demo never send', async () => {
    const c = connected(); const saved = await c.api.command('enqueue', c.payload());
    assert.equal((await c.api.command('cancel', { id: saved.result.id }, 500)).reason, 'conflict');
    c.f.app.delete(c.f.app.findRecordById('workspace_members', 'editormember'));
    assert.equal((await c.api.read()).reason, 'forbidden'); assert.equal((await c.api.command('cancel', { id: saved.result.id }, 1)).reason, 'forbidden');
    const demo = connected({ demo: true }); assert.equal((await demo.api.read()).reason, 'scope_changed'); assert.equal(demo.calls.length, 0);
    const invalid = connected({ keyFactory: () => 'short' }); assert.equal((await invalid.api.command('enqueue', invalid.payload())).reason, 'invalid');
    assert.equal((await c.api.command('admit', {}, 0)).ok, false);
});

test('concurrent sends share the original command rather than creating duplicates', async () => {
    const c = connected(); const send = c.client.send; let release;
    c.client.send = (...args) => new Promise((resolve) => { release = async () => resolve(await send(...args)); });
    const first = c.api.command('enqueue', c.payload()); assert.equal((await c.api.retry()).reason, 'busy');
    await release(); assert.equal((await first).ok, true); assert.equal(c.f.data.suite_runs.length, 1);
});

test('PDF fingerprint describes selected bytes and rejects wrong headers and oversized files', async () => {
    const bytes = Buffer.from('%PDF-1.7\nIllustrative test artifact, not a submission.');
    const file = { name: 'brief.pdf', size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
    assert.deepEqual(await fingerprintPdf(file), { name: 'brief.pdf', sha256: hash(bytes) });
    for (const wrong of [{ ...file, name: 'brief.exe' }, { ...file, size: 25 * 1024 * 1024 }, { ...file, size: 3 },
        { ...file, arrayBuffer: async () => new TextEncoder().encode('invalid source').buffer }]) await assert.rejects(() => fingerprintPdf(wrong));
});
