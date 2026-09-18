// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/knowledge-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/workspaceKnowledge.js, tests/upgrade/knowledge-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workspaceKnowledge.js; CONSUMES tests/upgrade/knowledge-fixture.mjs
// DAG Node:    none
// Intent:      Verify the connected browser and backend contract, response races, permission loss and malformed graph rejection.
// ───────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeClient, knowledgeNeighborhood, knowledgeSourceHref } from '../../apps/web/src/lib/workspaceKnowledge.js';
import { knowledgeFixture } from './knowledge-fixture.mjs';
import { plain, source } from './admin-fixture.mjs';

function connected(options = {}) {
    const f = knowledgeFixture(); const requests = []; let current = true;
    const client = { authStore: { record: { id: 'editor' } }, async send(path, config) {
        requests.push({ path, config });
        return f.assemble(config.body, client.authStore.record.id, path.split('/')[4]);
    } };
    const api = createKnowledgeClient({ client, accountId: 'editor', workspaceId: 'ws1', isCurrent: () => current, ...options });
    return { f, client, requests, api, stale: () => { current = false; } };
}

test('browser assembly uses the authenticated backend with private query bodies and cache-disabled independent requests', async () => {
    const c = connected(); const options = { query: '  appointments  ', mission: 'mission1', max_chars: 4000, max_sources: 5 };
    const response = await c.api.assemble(options); assert.equal(response.ok, true);
    assert.equal(c.requests[0].path, '/api/buildanddo/workspaces/ws1/knowledge/context');
    assert.equal(c.requests[0].config.method, 'POST'); assert.equal(c.requests[0].config.cache, 'no-store');
    assert.equal(c.requests[0].config.requestKey, null); assert.equal(c.requests[0].config.query, undefined);
    assert.equal(response.data.context.query, 'appointments'); assert.equal(options.query, '  appointments  ');
    assert.ok(response.data.context.characters <= 4000);
    const record = c.f.app.findRecordById('signals', 'signal1'); record.set('title', 'New booking source'); c.f.app.save(record);
    assert.ok((await c.api.assemble()).data.nodes.some((node) => node.title === 'New booking source'));
});

test('scope changes, unauthenticated accounts and demo mode perform no private read', async () => {
    for (const options of [{ demo: true }, { accountId: '' }, { workspaceId: '../ws2' }]) {
        const c = connected(options); assert.equal((await c.api.assemble()).reason, 'scope_changed'); assert.equal(c.requests.length, 0);
    }
    const c = connected(); c.stale(); assert.equal((await c.api.assemble()).reason, 'scope_changed'); assert.equal(c.requests.length, 0);
    const another = connected(); another.client.authStore.record = null;
    assert.equal((await another.api.assemble()).reason, 'scope_changed'); assert.equal(another.requests.length, 0);
});

test('out-of-order context responses discard the previous query and late errors', async () => {
    const c = connected(); const pending = [];
    c.client.send = (_path, config) => new Promise((resolve, reject) => pending.push({ resolve, reject, body: config.body }));
    const old = c.api.assemble({ query: 'old' }); const latest = c.api.assemble({ query: 'appointments' });
    pending[1].resolve(c.f.assemble(pending[1].body)); assert.equal((await latest).ok, true);
    pending[0].resolve(c.f.assemble(pending[0].body)); assert.deepEqual(await old, { ok: false, reason: 'scope_changed', error: '' });
    const failing = c.api.assemble(); c.stale(); pending[2].reject({ status: 500, message: 'previous private query' });
    assert.deepEqual(await failing, { ok: false, reason: 'scope_changed', error: '' });
});

test('account changes during a response suppress the prior account content', async () => {
    const c = connected(); c.client.send = async (_path, config) => {
        const value = c.f.assemble(config.body); c.client.authStore.record = { id: 'otherowner' }; return value;
    };
    assert.deepEqual(await c.api.assemble(), { ok: false, reason: 'scope_changed', error: '' });
});

test('permission loss and missing APIs produce no graph or source content', async () => {
    const c = connected(); assert.equal((await c.api.assemble()).ok, true);
    c.f.app.delete(c.f.app.findRecordById('workspace_members', 'editormember'));
    const revoked = await c.api.assemble(); assert.equal(revoked.reason, 'forbidden'); assert.equal(revoked.data, undefined);
    for (const status of [401, 404, 500]) {
        c.client.send = async () => { throw { status, response: { message: 'internal source details' } }; };
        const value = await c.api.assemble(); assert.equal(value.ok, false); assert.ok(!JSON.stringify(value).includes('internal source'));
    }
});

test('unsupported query budgets and identifiers are rejected before requests', async () => {
    const c = connected();
    for (const options of [{ mission: 'x/../other' }, { query: 'x'.repeat(1001) }, { query: 5 }, { max_chars: 0 }, { max_chars: 32001 },
        { max_sources: 0 }, { max_sources: 25 }, { max_sources: 2.1 }]) assert.equal((await c.api.assemble(options)).reason, 'invalid');
    assert.equal(c.requests.length, 0);
});

test('malformed graphs, foreign scopes, dangling relationships and forged packets never become valid context', async () => {
    const c = connected(); const good = c.f.assemble();
    const mutations = [
        (value) => { value.workspace = 'ws2'; }, (value) => { value.nodes = null; },
        (value) => { value.nodes[0].id = 'ws2/category/general'; }, (value) => { value.nodes.push(value.nodes[0]); },
        (value) => { value.nodes.find((node) => node.source).source.collection = 'users'; },
        (value) => { value.nodes.find((node) => node.source).text = null; },
        (value) => { value.edges[0].target = 'ws1/unknown'; }, (value) => { value.edges[0].relation = 'APPROVES'; },
        (value) => { value.document_count = 0; }, (value) => { value.complete = false; },
        (value) => { value.coverage[0].state = 'unknown'; }, (value) => { value.coverage[0].collection = 'dossiers'; },
        (value) => { value.context.query = 'wrong query'; }, (value) => { value.context.characters = 0; },
        (value) => { value.context.citations[0] = 'ws2/evidence/private'; }, (value) => { value.context.selections = []; },
        (value) => { value.context.text = '{}'; value.context.characters = 2; },
        (value) => { const packet = JSON.parse(value.context.text); packet.sources[0].content = 'injected content'; value.context.text = JSON.stringify(packet); value.context.characters = value.context.text.length; },
        (value) => { const packet = JSON.parse(value.context.text); packet.sources[0].provenance.record_id = 'foreign'; value.context.text = JSON.stringify(packet); value.context.characters = value.context.text.length; },
        (value) => { const packet = JSON.parse(value.context.text); packet.relationships[0].relation = 'APPROVES'; value.context.text = JSON.stringify(packet); value.context.characters = value.context.text.length; },
    ];
    for (const mutate of mutations) {
        const value = plain(good); mutate(value); c.client.send = async () => value;
        const result = await c.api.assemble(); assert.equal(result.ok, false); assert.equal(result.data, undefined);
    }
});

test('partial source coverage stays visible and request cancellation is passed to the actual transport', async () => {
    const c = connected(); c.f.collections.research_submissions.fields.removeByName('protocol_version');
    const controller = new AbortController(); const result = await c.api.assemble({}, controller.signal);
    assert.equal(result.ok, true); assert.equal(result.data.complete, false); assert.equal(result.data.context.truncated, true);
    assert.equal(c.requests[0].config.signal, controller.signal);
});

test('source navigation is restricted to known internal desks and graph neighborhoods retain every displayed endpoint', () => {
    const c = connected(); const graph = c.f.assemble();
    const research = graph.nodes.find((node) => node.kind === 'research');
    assert.equal(knowledgeSourceHref(research), '/app/research?source=research1');
    assert.equal(knowledgeSourceHref(graph.nodes.find((node) => node.kind === 'mission')), '/app/missions');
    assert.equal(knowledgeSourceHref({ ...research, source: { ...research.source, record_id: '../evil' } }), '');
    assert.equal(knowledgeSourceHref(graph.nodes.find((node) => node.kind === 'category')), '');
    assert.equal(knowledgeSourceHref(null), '');
    const view = knowledgeNeighborhood(graph, research.id, 3);
    assert.equal(view.nodes[0].id, research.id); assert.equal(view.nodes.length, 3); assert.ok(view.omitted > 0);
    assert.ok(view.nodes.slice(1).every((node) => ['mission', 'evidence'].includes(node.kind)));
    const ids = new Set(view.nodes.map((node) => node.id)); assert.ok(view.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
    assert.deepEqual(knowledgeNeighborhood(graph, 'missing'), { nodes: [], edges: [], omitted: 0 });
});

test('workspace navigation and mission/research entry points reach the lazy knowledge route', () => {
    assert.match(source('apps/web/src/App.jsx'), /path: 'knowledge', label: 'Knowledge & context', element: KnowledgePage/);
    assert.match(source('apps/web/src/components/workspace/WorkspaceLayout.jsx'), /to: '\/app\/knowledge'/);
    assert.match(source('apps/web/src/pages/workspace/MissionsPage.jsx'), /<MissionKnowledgeContext missionId=\{detail\.id\}/);
    assert.match(source('apps/web/src/pages/workspace/ResearchPage.jsx'), /\/app\/knowledge\?mission=/);
});
