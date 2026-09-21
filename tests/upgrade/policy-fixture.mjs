// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/policy-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/policyIntelligence.js, apps/web/src/data/policy-demo.json, tests/upgrade/research-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/policyIntelligence.js; CONSUMES apps/web/src/data/policy-demo.json; CONSUMES tests/upgrade/research-fixture.mjs
// DAG Node:    none
// Intent:      Exercise policy proposals against actual research and mission handlers with explicitly synthetic transport and transactional storage.
// ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { canonicalPolicy, createPolicyClient, importPolicy } from '../../apps/web/src/lib/policyIntelligence.js';
import { researchFixture } from './research-fixture.mjs';
import { plain } from './admin-fixture.mjs';
import { repoPath } from './admin-fixture.mjs';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const demo = () => JSON.parse(readFileSync(repoPath('apps/web/src/data/policy-demo.json'), 'utf8'));
export function seal(value) {
    for (const item of value.observations) {
        item.provenance.excerpt_sha256 = hash(item.excerpt);
        item.provenance.input_sha256 = hash(item.url);
        const { id: _id, observed_at: _time, ...body } = item;
        const { research_id: _receipt, ...proof } = body.provenance; body.provenance = proof;
        item.id = 'pe_' + hash(canonicalPolicy(body)).slice(0, 32);
    }
    const { packet_sha256: _signature, ...body } = value;
    value.packet_sha256 = hash(canonicalPolicy(body));
    return value;
}
export function researchPacket(workspace = 'ws1') {
    // This is a research transport fixture, not an observed government record.
    const data = demo(); data.mode = 'research'; data.tenant_id = workspace;
    data.observations.forEach((item) => {
        item.tenant_id = workspace; item.provenance.processor = 'firecrawl'; item.provenance.version = 'v2';
        item.provenance.research_id = 'researchfixture';
    });
    return seal(data);
}
export async function imported(value = researchPacket(), workspace = 'ws1') {
    return importPolicy(canonicalPolicy(value), workspace, webcrypto);
}
export function connected({ actor = 'editor', ...options } = {}) {
    const f = researchFixture(); const requests = []; let current = true;
    const client = { authStore: { record: { id: actor } },
        async send(path, request) {
            requests.push({ path, request });
            const e = f.event(client.authStore.record.id, request.body, { workspace: path.split('/')[4] });
            return plain(f.service.command(e));
        } };
    const api = createPolicyClient({ client, accountId: actor, workspaceId: 'ws1', isCurrent: () => current, ...options });
    return { f, api, client, requests, setCurrent: (value) => { current = value; } };
}
