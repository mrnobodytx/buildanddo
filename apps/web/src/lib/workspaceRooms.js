// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/lib/workspaceRooms.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/lib/workspaceKnowledge.js
// EnumType:     Adapter
// EnumEdges:    DEPENDS_ON apps/web/src/lib/workspaceKnowledge.js
// DAG Node:     none
// Intent:       Render existing workspace provenance in Living Rooms without converting recorded states into independent verification.
// ───────────────────────────────────────────────────────────────

const TYPES = new Set(['mission', 'evidence', 'signal', 'research', 'wiki', 'category', 'topic']);
/** Project bounded readable records without inventing estate ownership or verified capabilities.
 * @param {object} graph Native permission-filtered knowledge graph.
 * @param {string} room Organization, capability or development view.
 * @param {number} limit Maximum records rendered in this room.
 * @returns {object|null} A cited observation projection, or null without a scoped source.
 */
export function workspaceRoom(graph, room, limit = 24) {
    if (!graph?.workspace || !['organization', 'capability', 'development'].includes(room) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
    const permitted = room === 'capability' ? ['mission', 'evidence', 'research'] : room === 'development' ? ['mission', 'evidence', 'signal'] : ['mission', 'evidence', 'signal', 'research', 'wiki'];
    const documents = graph.nodes.filter((node) => node.id?.startsWith(graph.workspace + '/') && node.source && permitted.includes(node.kind));
    documents.sort((a, b) => (b.source.updated_at || '').localeCompare(a.source.updated_at || '') || a.id.localeCompare(b.id));
    const selected = documents.slice(0, Math.max(1, Math.min(40, limit))), ids = new Set(selected.map((node) => node.id));
    if (room === 'organization') {
        const adjacent = new Set(graph.edges.filter((edge) => ids.has(edge.source) && edge.relation === 'CATEGORIZED_AS').map((edge) => edge.target));
        graph.nodes.filter((node) => node.kind === 'category' && adjacent.has(node.id) && node.id.startsWith(graph.workspace + '/')).forEach((node) => { ids.add(node.id); selected.push(node); });
    }
    return { projection: room, workspace: graph.workspace, state: graph.complete && documents.length <= limit ? 'OBSERVED' : 'PARTIAL',
        observed_at: graph.assembled_at, omitted: Math.max(0, documents.length - Math.min(40, limit)), coverage: graph.coverage,
        nodes: selected.filter((node) => TYPES.has(node.kind)).map((node) => ({ id: node.id, type: node.kind, title: node.title,
            state: node.source ? 'OBSERVED' : 'INFERRED', attributes: node.source ? { source: node.source, recorded_state: node.state, truncated: node.truncated } : { basis: 'Vocabulary category, not an organization or owner' } })),
        edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ ...edge,
            state: edge.basis === 'source_relation' ? 'observed' : edge.basis === 'source_category' ? 'declared' : 'inferred' })) };
}

/** Validate a separately published estate projection before rendering it as external observations.
 * @param {object} value Parsed projection document.
 * @param {string} room Selected room identity.
 * @returns {object} Admitted bounded projection.
 */
export function publishedRoom(value, room) {
    if (value?.projection !== room || !Array.isArray(value.nodes) || value.nodes.length > 400 || !Array.isArray(value.edges) || value.edges.length > 800) throw new Error('The published projection format is unsupported.');
    const ids = new Set();
    for (const node of value.nodes) {
        if (typeof node.id !== 'string' || node.id.length > 300 || ids.has(node.id) || typeof node.title !== 'string' || node.title.length > 300 || typeof node.type !== 'string' || node.type.length > 60) throw new Error('The published node identities are inconsistent.');
        ids.add(node.id);
    }
    if (value.edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target) || typeof edge.relation !== 'string' || edge.relation.length > 100)) throw new Error('The published relationships are incomplete.');
    return value;
}
