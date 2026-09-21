// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/workspace-rooms.test.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/lib/workspaceRooms.js, apps/web/src/lib/roomGraph.js
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/web/src/lib/workspaceRooms.js; DEPENDS_ON apps/web/src/lib/roomGraph.js
// DAG Node:     none
// Intent:       Require source-scoped room projections to retain partial coverage and inferred relations without fabricating verified capabilities.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceRoom, publishedRoom } from '../../apps/web/src/lib/workspaceRooms.js';
import { layoutProjection } from '../../apps/web/src/lib/roomGraph.js';
const graph = { workspace: 'ws1', assembled_at: '2026-09-21T00:00:00Z', complete: true, coverage: [], nodes: [
    { id: 'ws1/missions/m1', kind: 'mission', title: 'Recorded work', state: 'verified', source: { collection: 'missions', record_id: 'm1', updated_at: '2026-09-20' } },
    { id: 'ws1/evidence/e1', kind: 'evidence', title: 'Review evidence', state: 'observed', source: { collection: 'evidence', record_id: 'e1', updated_at: '2026-09-21' } },
    { id: 'ws1/category/operations', kind: 'category', title: 'Operations' },
    { id: 'ws2/missions/foreign', kind: 'mission', title: 'Foreign work', source: { updated_at: '2026-09-21' } },
], edges: [
    { id: 'edge1', source: 'ws1/evidence/e1', target: 'ws1/missions/m1', relation: 'EVIDENCE_FOR', basis: 'source_relation' },
    { id: 'edge2', source: 'ws1/missions/m1', target: 'ws1/category/operations', relation: 'CATEGORIZED_AS', basis: 'vocabulary' },
] };
test('workspace room preserves provenance without promoting recorded verification or inferred ownership', () => {
    const value = workspaceRoom(graph, 'organization');
    assert.equal(value.nodes.length, 3); assert.ok(value.nodes.every((item) => item.id.startsWith('ws1/')));
    assert.equal(value.nodes.find((item) => item.type === 'mission').state, 'OBSERVED');
    assert.equal(value.nodes.find((item) => item.type === 'mission').attributes.recorded_state, 'verified');
    assert.deepEqual(value.edges.map((item) => item.state), ['observed', 'inferred']);
    assert.equal(value.nodes.some((item) => item.type === 'owner'), false);
});
test('capability and development projections contain only existing records and source relations', () => {
    for (const room of ['capability', 'development']) {
        const result = workspaceRoom(graph, room); assert.equal(result.nodes.length, 2); assert.equal(result.edges.length, 1);
        assert.equal(layoutProjection(result).size, 2);
    }
});
test('bounded and unavailable source coverage remains partial rather than a complete inventory', () => {
    const result = workspaceRoom({ ...graph, complete: false }, 'organization', 1);
    assert.equal(result.state, 'PARTIAL'); assert.equal(result.omitted, 1);
    assert.equal(workspaceRoom(null, 'organization'), null); assert.equal(workspaceRoom(graph, 'invented'), null);
    const empty = workspaceRoom({ ...graph, nodes: [], edges: [] }, 'development'); assert.deepEqual(empty.nodes, []);
});
test('published graph parsing rejects wrong rooms, duplicate identities and dangling relationships', () => {
    const value = { projection: 'organization', nodes: [{ id: 'observed', title: 'Actual export record', type: 'seat' }], edges: [] };
    assert.equal(publishedRoom(value, 'organization'), value);
    for (const bad of [{ ...value, projection: 'other' }, { ...value, nodes: [...value.nodes, ...value.nodes] },
        { ...value, edges: [{ source: 'observed', target: 'missing', relation: 'OWNS' }] }, { ...value, nodes: [] , edges: [{}] }])
        assert.throws(() => publishedRoom(bad, 'organization'));
});
