// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/career-passport.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/careerPassport.js, tests/upgrade/career-fixture.mjs, tests/upgrade/operator-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/careerPassport.js; CONSUMES tests/upgrade/career-fixture.mjs; CONSUMES tests/upgrade/operator-fixture.mjs
// Intent:      Verify compiler interoperability, scoped native reads and invalidated career imports without external applications.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { CAREER_MAX_BYTES, careerJobUrl, createCareerClient, importCareerReview } from '../../apps/web/src/lib/careerPassport.js';
import { careerPacket, sealCareer } from './career-fixture.mjs';
import { operatorFixture } from './operator-fixture.mjs';
import { plain } from './admin-fixture.mjs';

const parse = (packet = careerPacket(), scope = {}) => importCareerReview(JSON.stringify(packet), {
    person: 'cni://person/pocketbase/editor', workspace: 'ws1', crypto: webcrypto, ...scope,
});
function connected({ demo = false, crypto = webcrypto } = {}) {
    const f = operatorFixture(); let current = true; const sent = [];
    const client = { authStore: { record: { id: 'editor' } }, async send(path, options) {
        sent.push({ path, options }); return plain(f.operator.snapshot(f.event(client.authStore.record.id, {},
            { workspace: path.split('/')[4], query: options.query })));
    } };
    const api = createCareerClient({ client, accountId: 'editor', workspaceId: 'ws1', demo, crypto, isCurrent: () => current });
    return { f, api, client, sent, change: () => { current = false; } };
}

test('actual Python 100/10/3 output is inspectable but remains an imported review', async () => {
    const result = await parse();
    assert.equal(result.ok, true, result.error); assert.equal(result.trust, 'IMPORTED_REVIEW');
    assert.equal(result.packet.job_count, 100); assert.equal(result.packet.dossiers.length, 10); assert.equal(result.packet.packages.length, 3);
    assert.equal(result.packet.live_jobs_verified, 0); assert.equal(result.packet.outcomes.counts.submitted, 0);
    assert.ok(Object.isFrozen(result.packet.passport.claims));
});

test('wrong person or workspace cannot import a career packet', async () => {
    assert.equal((await parse(undefined, { person: 'cni://person/pocketbase/foreign' })).ok, false);
    assert.equal((await parse(undefined, { workspace: 'foreign' })).ok, false);
});

test('changed file bytes fail integrity even when the JSON remains shaped', async () => {
    const packet = careerPacket(); packet.passport.claims[0].statement = 'Personally authored everything.';
    assert.equal((await parse(packet)).ok, false);
});

test('recomputed integrity cannot grant authority, live-job verification or unbound outcomes', async () => {
    for (const change of [p => { p.authority_granted = true; }, p => { p.live_jobs_verified = 100; }, p => { p.outcomes.counts.offers = 2; p.outcomes.counts.offer = 2; }]) {
        const packet = careerPacket(); change(packet);
        assert.equal((await parse(sealCareer(packet))).ok, false);
    }
});

test('verified agent attribution cannot be relabelled as personal work', async () => {
    const packet = careerPacket(); packet.passport.claims[0].contribution.participation = 'AGENT_EXECUTED';
    assert.equal((await parse(sealCareer(packet))).ok, false);
});

test('exclusions and coverage cannot silently disagree', async () => {
    const packet = careerPacket(); packet.dossiers[0].do_not_claim = [];
    assert.equal((await parse(sealCareer(packet))).ok, false);
});

test('URLs remain within their selected ATS tenant', async () => {
    const packet = careerPacket(); const job = packet.dossiers[0].job;
    assert.equal(careerJobUrl(job), job.source_url);
    for (const url of ['javascript:alert(1)', 'https://jobs.lever.co/foreign/job-1', 'https://jobs.lever.co@localhost/x']) {
        assert.equal(careerJobUrl({ ...job, source_url: url }), null);
    }
    job.apply_url = 'https://attacker.invalid/submit';
    assert.equal((await parse(sealCareer(packet))).ok, false);
});

test('oversized, malformed and future imports are denied', async () => {
    assert.equal((await importCareerReview('x'.repeat(CAREER_MAX_BYTES + 1), {})).ok, false);
    assert.equal((await importCareerReview('{broken', {})).ok, false);
    const packet = careerPacket();
    assert.equal((await parse(packet, { now: Date.parse(packet.as_of) - 1 })).ok, false);
    assert.equal((await parse(packet, { crypto: null })).ok, false);
});

test('private work export reuses the native scoped GET and creates no records', async () => {
    const c = connected(); assert.equal(c.api.exportWork(), null);
    assert.equal((await c.api.read()).ok, true);
    const capture = c.api.exportWork(); assert.equal(capture.person, 'cni://person/pocketbase/editor');
    assert.equal(capture.workspace, 'ws1'); assert.equal(c.sent.length, 1); assert.equal(c.sent[0].options.method, 'GET');
    assert.equal(c.sent[0].options.cache, 'no-store'); assert.equal((await c.api.importReview(JSON.stringify(careerPacket()))).ok, true);
    assert.equal(c.sent.length, 1); assert.equal(c.api.submit, undefined); assert.equal(c.api.approve, undefined);
});

test('demo mode and changed accounts cannot capture or import personal career data', async () => {
    const demo = connected({ demo: true }); assert.equal((await demo.api.read()).ok, false); assert.equal(demo.sent.length, 0);
    const c = connected(); await c.api.read(); c.client.authStore.record = { id: 'foreign' };
    assert.equal(c.api.exportWork(), null); assert.equal((await c.api.importReview(JSON.stringify(careerPacket()))).ok, false);
});

test('native revocation removes export authority and drops prior observations', async () => {
    const c = connected(); await c.api.read(); c.f.app.delete(c.f.app.findRecordById('workspace_members', 'editormember'));
    assert.equal((await c.api.read()).ok, false); assert.equal(c.api.exportWork(), null);
});

test('a delayed checksum cannot restore data after workspace change', async () => {
    let release; const wait = new Promise(resolve => { release = resolve; });
    const c = connected({ crypto: { subtle: { digest: async (...args) => { await wait; return webcrypto.subtle.digest(...args); } } } });
    await c.api.read(); const promise = c.api.importReview(JSON.stringify(careerPacket()));
    c.change(); release(); assert.equal((await promise).reason, 'scope_changed'); assert.equal(c.api.exportWork(), null);
});

test('disposal fences prior reads and effect reactivation still requires fresh authority', async () => {
    const c = connected(); await c.api.read(); c.api.dispose(); assert.equal(c.api.exportWork(), null);
    assert.equal((await c.api.read()).ok, false); c.api.activate(); assert.equal(c.api.exportWork(), null);
    assert.equal((await c.api.read()).ok, true);
});

test('HTML in a reviewed source remains ordinary text without execution', async () => {
    const packet = careerPacket(); packet.passport.claims[0].statement = '<script>globalThis.careerExecuted=true</script>';
    const parsed = await parse(sealCareer(packet)); assert.equal(parsed.ok, true); assert.equal(globalThis.careerExecuted, undefined);
});
