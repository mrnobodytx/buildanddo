// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workspaceKnowledge.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/knowledge.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/knowledge.pb.js
// DAG Node:    none
// Intent:      Deliver current scoped graph responses and cited context without retaining private data across accounts.
// ───────────────────────────────────────────────────────────────

export const KNOWLEDGE_KINDS = { mission: 'Missions', evidence: 'Evidence', research: 'Research', signal: 'Signals', wiki: 'Wiki pages' };
const COLLECTIONS = { mission: 'missions', evidence: 'evidence', research: 'research_submissions', signal: 'signals', wiki: 'wiki_pages' };
const RELATIONS = new Set(['CATEGORIZED_AS', 'TAGGED_WITH', 'EVIDENCE_FOR', 'RESEARCH_FOR', 'DERIVED_FROM']);
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit;
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });

function valid(data, workspace, options) {
    if (data?.schema !== 'buildanddo.knowledge/v1' || data.workspace !== workspace || !text(data.assembled_at, 80) ||
        !Array.isArray(data.nodes) || data.nodes.length > 9000 || !Array.isArray(data.edges) || data.edges.length > 12000 ||
        !Array.isArray(data.coverage) || data.coverage.length !== 5 || typeof data.complete !== 'boolean') return false;
    const nodes = new Map();
    for (const node of data.nodes) {
        if (!node || typeof node.id !== 'string' || !node.id.startsWith(workspace + '/') || nodes.has(node.id) || !text(node.title, 160)) return false;
        if (Object.hasOwn(COLLECTIONS, node.kind)) {
            if (!id(node.source?.record_id) || node.source.collection !== COLLECTIONS[node.kind] ||
                node.id !== `${workspace}/${node.source.collection}/${encodeURIComponent(node.source.record_id)}` ||
                !text(node.text, 3000) || !text(node.state, 80) || !text(node.source.updated_at, 80) ||
                !Array.isArray(node.categories) || typeof node.truncated !== 'boolean') return false;
        } else if (!['category', 'topic'].includes(node.kind) || node.source) return false;
        nodes.set(node.id, node);
    }
    if (data.document_count !== data.nodes.filter((node) => node.source).length ||
        data.edges.some((edge) => !edge || !nodes.has(edge.source) || !nodes.has(edge.target) || !RELATIONS.has(edge.relation) ||
            !text(edge.basis, 80) || !Array.isArray(edge.matched))) return false;
    const collections = new Set(data.coverage.map((entry) => entry?.collection));
    if (collections.size !== 5 || Object.values(COLLECTIONS).some((name) => !collections.has(name)) ||
        data.coverage.some((entry) => !['complete', 'disabled', 'limited', 'unavailable'].includes(entry.state) || !Number.isSafeInteger(entry.included) || entry.included < 0) ||
        data.complete !== data.coverage.every((entry) => ['complete', 'disabled'].includes(entry.state))) return false;
    const context = data.context;
    if (context?.schema !== 'buildanddo.context/v1' || context.query !== options.query || context.mission !== options.mission ||
        context.max_chars !== options.max_chars || context.max_sources !== options.max_sources ||
        !text(context.text, options.max_chars) || context.characters !== context.text.length || typeof context.truncated !== 'boolean' ||
        !Array.isArray(context.citations) || context.citations.length > options.max_sources || new Set(context.citations).size !== context.citations.length ||
        context.citations.some((citation) => !nodes.get(citation)?.source) || !Array.isArray(context.selections) ||
        context.selections.length !== context.citations.length || context.selections.some((entry, index) => entry.id !== context.citations[index] || !Array.isArray(entry.reasons)) ||
        !Number.isSafeInteger(context.omitted_sources) || context.omitted_sources < 0) return false;
    let packet;
    try { packet = JSON.parse(context.text); } catch { return false; }
    return packet?.schema === context.schema && packet.workspace === workspace && packet.mission === context.mission && packet.source_trust === 'untrusted_reference_material' &&
        packet.partial === context.truncated && packet.omitted_sources === context.omitted_sources &&
        JSON.stringify(packet.source_coverage) === JSON.stringify(data.coverage.map((entry) => ({ collection: entry.collection, state: entry.state }))) &&
        Array.isArray(packet.sources) && packet.sources.length === context.citations.length &&
        packet.sources.every((entry, index) => {
            const node = nodes.get(entry?.citation);
            return entry?.citation === context.citations[index] && entry.kind === node.kind && entry.title === node.title && entry.state === node.state &&
                typeof entry.content === 'string' && node.text.startsWith(entry.content) && typeof entry.truncated === 'boolean' &&
                entry.provenance?.collection === node.source.collection && entry.provenance.record_id === node.source.record_id && entry.provenance.updated_at === node.source.updated_at;
        }) && Array.isArray(packet.relationships) && packet.relationships.every((edge) =>
            context.citations.includes(edge.source) && context.citations.includes(edge.target) &&
            data.edges.some((original) => original.source === edge.source && original.target === edge.target && original.relation === edge.relation));
}

/** Read context for one account, discarding responses superseded by a later request. */
export function createKnowledgeClient({ client, accountId, workspaceId, demo = false, isCurrent }) {
    const current = () => !demo && id(accountId) && id(workspaceId) && isCurrent() && client.authStore.record?.id === accountId;
    let sequence = 0;
    return {
        async assemble(options = {}, signal) {
            if (!current()) return stale();
            const body = { query: options.query ?? '', mission: options.mission ?? '', max_chars: options.max_chars ?? 12000, max_sources: options.max_sources ?? 12 };
            if (!text(body.query, 1000) || !(body.mission === '' || id(body.mission)) ||
                !Number.isSafeInteger(body.max_chars) || body.max_chars < 1024 || body.max_chars > 32000 ||
                !Number.isSafeInteger(body.max_sources) || body.max_sources < 1 || body.max_sources > 24)
                return { ok: false, reason: 'invalid', error: 'Choose a valid mission, up to 1000 query characters and a supported context size.' };
            body.query = body.query.trim(); const attempt = ++sequence;
            try {
                const data = await client.send(`/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/knowledge/context`,
                    { method: 'POST', body, requestKey: null, cache: 'no-store', signal });
                if (!current() || sequence !== attempt) return stale();
                if (!valid(data, workspaceId, body)) return { ok: false, reason: 'invalid_response', error: 'Knowledge returned an incomplete response. Refresh to rebuild the context.' };
                return { ok: true, data };
            } catch (error) {
                if (!current() || sequence !== attempt) return stale();
                const forbidden = [401, 403, 404].includes(error?.status);
                return { ok: false, reason: forbidden ? 'forbidden' : 'unavailable', error: forbidden ?
                    'This workspace or mission is no longer available to your account.' : 'Knowledge is unavailable. Retry or ask the workspace operator to check the installed knowledge API.' };
            }
        },
    };
}

/** Resolve only known internal source desks; never navigate to a source-supplied URL. */
export function knowledgeSourceHref(node) {
    if (!node?.source || !id(node.source.record_id) || COLLECTIONS[node.kind] !== node.source.collection) return '';
    const paths = { mission: '/app/missions', evidence: '/app/evidence', research: '/app/research', signal: '/app/signals', wiki: '/app/wiki' };
    return paths[node.kind] + (node.kind === 'research' ? '?source=' + encodeURIComponent(node.source.record_id) : '');
}

/** Select a bounded graph neighborhood with recorded relationships shown first. */
export function knowledgeNeighborhood(graph, selected, limit = 9) {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    if (!nodes.has(selected)) return { nodes: [], edges: [], omitted: 0 };
    const edges = graph.edges.filter((edge) => edge.source === selected || edge.target === selected);
    edges.sort((a, b) => Number(b.basis === 'source_relation') - Number(a.basis === 'source_relation') || a.id.localeCompare(b.id));
    const adjacent = [...new Set(edges.map((edge) => edge.source === selected ? edge.target : edge.source))];
    const picked = [selected, ...adjacent.slice(0, Math.max(0, limit - 1))]; const ids = new Set(picked);
    return { nodes: picked.map((key) => nodes.get(key)), edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
        omitted: Math.max(0, adjacent.length - (picked.length - 1)) };
}
