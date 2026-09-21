// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/knowledge-graph.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     none
// EnumType:    Service
// EnumEdges:   VERIFIED_BY tests/upgrade/knowledge-system.test.mjs
// DAG Node:    none
// Intent:      Organize authorized source records and assemble bounded cited context without changing their evidence state or requiring inference.
// ───────────────────────────────────────────────────────────────

const SCHEMA = 'buildanddo.knowledge/v1';
const CONTEXT_SCHEMA = 'buildanddo.context/v1';
const CATEGORIES = [
    { id: 'operations', label: 'Operations', words: ['appointment', 'appointments', 'booking', 'bookings', 'customer', 'customers', 'schedule', 'scheduling', 'workflow', 'workflows', 'supplier'] },
    { id: 'engineering', label: 'Engineering', words: ['api', 'backend', 'blueprint', 'code', 'database', 'deployment', 'frontend', 'inference', 'software', 'test', 'tests'] },
    { id: 'governance', label: 'Governance & security', words: ['access', 'audit', 'auth', 'authorization', 'compliance', 'governance', 'permission', 'permissions', 'privacy', 'risk', 'security'] },
    { id: 'finance', label: 'Finance', words: ['budget', 'cost', 'costs', 'finance', 'invoice', 'invoices', 'payment', 'payments', 'pricing', 'revenue'] },
    { id: 'learning', label: 'Learning', words: ['classroom', 'education', 'learning', 'lesson', 'lessons', 'teaching', 'training', 'tutorial', 'tutorials'] },
    { id: 'research', label: 'Research', words: ['analysis', 'benchmark', 'experiment', 'experiments', 'hypothesis', 'research', 'study'] },
    { id: 'general', label: 'General', words: [] },
];
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'of', 'on', 'or', 'our', 'that', 'the', 'this', 'to', 'was', 'we', 'what', 'which', 'with']);
const TERM_ALIASES = { appointments: 'appointment', bookings: 'booking', customers: 'customer', reminders: 'reminder',
    workflows: 'workflow', costs: 'cost', invoices: 'invoice', payments: 'payment', permissions: 'permission',
    tests: 'test', lessons: 'lesson', tutorials: 'tutorial', experiments: 'experiment' };
const RELATED = new Set(['EVIDENCE_FOR', 'RESEARCH_FOR', 'DERIVED_FROM', 'OBSERVED_IN']);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const key = (workspace, collection, id) => `${workspace}/${collection}/${encodeURIComponent(id)}`;

function clip(value, maximum) {
    let text = String(value || '').slice(0, maximum);
    if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
    return text;
}
function terms(value) {
    return [...new Set(String(value).toLowerCase().split(/[\s.,;:!?()[\]{}"'<>/\\|+=_-]+/)
        .filter((word) => word.length > 1 && word.length <= 64 && !STOP_WORDS.has(word))
        .map((word) => Object.prototype.hasOwnProperty.call(TERM_ALIASES, word) ? TERM_ALIASES[word] : word))];
}
function categories(document) {
    const words = new Set(terms(document.title + ' ' + document.text));
    const declared = String(document.category || '').toLowerCase();
    const matches = CATEGORIES.filter((item) => item.id !== 'general').flatMap((item) => {
        const found = item.words.filter((word) => words.has(word));
        return declared === item.id || found.length ? [{ id: item.id, label: item.label,
            basis: declared === item.id ? 'source_category' : 'vocabulary', matched: found.slice(0, 6) }] : [];
    });
    return matches.length ? matches : [{ id: 'general', label: 'General', basis: 'fallback', matched: [] }];
}

/** Build a deterministic graph from already authorized, bounded documents. */
function buildGraph(workspace, documents, coverage, assembledAt) {
    const nodes = new Map(); const edges = new Map();
    const addEdge = (source, target, relation, basis, matched = []) => {
        const id = `${source}|${relation}|${target}`;
        edges.set(id, { id, source, target, relation, basis, matched });
    };
    const sorted = [...documents].sort((a, b) => compare(a.id, b.id));
    for (const document of sorted) {
        const classification = categories(document);
        nodes.set(document.id, { id: document.id, kind: document.kind, title: document.title,
            text: document.text, state: document.state, source: document.source, truncated: document.truncated,
            categories: classification.map((item) => item.id) });
        for (const item of classification) {
            const target = key(workspace, 'category', item.id);
            nodes.set(target, { id: target, kind: 'category', title: item.label, category: item.id });
            addEdge(document.id, target, 'CATEGORIZED_AS', item.basis, item.matched);
        }
        const tags = [...new Set(document.tags.map((tag) => clip(tag.trim().toLowerCase().replace(/\s+/g, ' '), 40)).filter(Boolean))].sort(compare);
        for (const tag of tags) {
            const target = key(workspace, 'topic', tag);
            nodes.set(target, { id: target, kind: 'topic', title: tag });
            addEdge(document.id, target, 'TAGGED_WITH', 'source_tag');
        }
    }
    for (const document of sorted) {
        for (const relation of document.relations) {
            // No dangling identifiers or relationships to excluded records.
            if (nodes.has(relation.target) && RELATED.has(relation.relation))
                addEdge(document.id, relation.target, relation.relation, 'source_relation');
        }
    }
    return { schema: SCHEMA, workspace, assembled_at: assembledAt,
        nodes: [...nodes.values()].sort((a, b) => compare(a.id, b.id)),
        edges: [...edges.values()].sort((a, b) => compare(a.id, b.id)),
        coverage, complete: coverage.every((item) => ['complete', 'disabled'].includes(item.state)),
        document_count: sorted.length };
}

function rankedDocuments(graph, query, mission) {
    const documents = graph.nodes.filter((node) => node.source);
    const anchor = mission ? key(graph.workspace, 'missions', mission) : '';
    const missionNode = documents.find((node) => node.id === anchor);
    const queryTerms = terms(query || (missionNode ? missionNode.title + ' ' + missionNode.text : '')).slice(0, 32);
    const missionLinks = new Set(graph.edges.filter((edge) => edge.target === anchor && RELATED.has(edge.relation)).map((edge) => edge.source));
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const organization = new Map();
    for (const edge of graph.edges) {
        if (!['CATEGORIZED_AS', 'TAGGED_WITH'].includes(edge.relation)) continue;
        if (!organization.has(edge.source)) organization.set(edge.source, new Set());
        for (const term of terms(nodes.get(edge.target).title)) organization.get(edge.source).add(term);
    }
    const scored = new Map(documents.map((node) => {
        const title = new Set(terms(node.title)); const text = new Set(terms(node.text));
        let score = !queryTerms.length && !mission ? 1 : 0; const reasons = [];
        if (node.id === anchor) { score += 1000; reasons.push('Selected mission'); }
        if (missionLinks.has(node.id)) { score += 40; reasons.push('Linked to selected mission'); }
        const matched = queryTerms.filter((term) => title.has(term) || text.has(term) || organization.get(node.id)?.has(term));
        for (const term of matched) score += title.has(term) ? 6 : organization.get(node.id)?.has(term) ? 3 : 1;
        if (matched.length) reasons.push('Matches: ' + matched.join(', '));
        if (score === 1 && !queryTerms.length) reasons.push('Recent workspace source');
        return [node.id, { node, score, reasons }];
    }));
    // Expand a single hop over recorded relations, never topic co-occurrence.
    const seeds = new Set([...scored.values()].filter((item) => item.score > 0).map((item) => item.node.id));
    for (const edge of graph.edges) {
        if (!RELATED.has(edge.relation)) continue;
        for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
            const candidate = scored.get(to);
            if (seeds.has(from) && candidate && !seeds.has(to)) {
                candidate.score = 1;
                if (!candidate.reasons.includes('Related source')) candidate.reasons.push('Related source');
            }
        }
    }
    return [...scored.values()].filter((item) => item.score > 0).sort((a, b) => b.score - a.score ||
        compare(b.node.source.updated_at, a.node.source.updated_at) || compare(a.node.id, b.node.id));
}

/** Pack cited source data and recorded relationships within the exact text budget. */
function assembleContext(graph, { query = '', mission = '', max_chars = 12000, max_sources = 12 } = {}) {
    const ranked = rankedDocuments(graph, query, mission);
    const related = graph.edges.filter((edge) => RELATED.has(edge.relation));
    const encode = (sources) => {
        const included = new Set(sources.map((item) => item.citation));
        const relationships = related.filter((edge) => included.has(edge.source) && included.has(edge.target))
            .map((edge) => ({ source: edge.source, relation: edge.relation, target: edge.target }));
        return JSON.stringify({ schema: CONTEXT_SCHEMA, workspace: graph.workspace, mission,
            source_trust: 'untrusted_reference_material',
            source_coverage: graph.coverage.map((item) => ({ collection: item.collection, state: item.state })),
            partial: !graph.complete || sources.some((source) => source.truncated) || ranked.length > sources.length,
            omitted_sources: ranked.length - sources.length, sources, relationships });
    };
    const sources = []; const selections = [];
    const fairExcerpt = Math.max(160, Math.min(2000, Math.floor(max_chars / Math.max(1, Math.min(ranked.length, max_sources))) - 400));
    for (const item of ranked) {
        if (sources.length >= max_sources) break;
        const node = item.node;
        const source = { citation: node.id, title: node.title, kind: node.kind, state: node.state,
            provenance: node.source, content: '', truncated: node.truncated };
        const candidate = (length) => ({ ...source, content: clip(node.text, length), truncated: source.truncated || length < node.text.length });
        if (encode([...sources, candidate(0)]).length > max_chars) continue;
        let low = 0; let high = Math.min(node.text.length, fairExcerpt);
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (encode([...sources, candidate(middle)]).length <= max_chars) low = middle;
            else high = middle - 1;
        }
        if (node.text.length && low < Math.min(80, node.text.length)) continue;
        sources.push(candidate(low));
        selections.push({ id: node.id, reasons: item.reasons, score: item.score });
    }
    const text = encode(sources);
    return { schema: CONTEXT_SCHEMA, query, mission, text, characters: text.length, max_chars, max_sources,
        citations: sources.map((source) => source.citation), selections, matched_sources: ranked.length,
        omitted_sources: ranked.length - sources.length,
        truncated: !graph.complete || sources.some((source) => source.truncated) || ranked.length > sources.length,
        empty_reason: sources.length ? '' : ranked.length ? 'budget_too_small' : 'no_matching_sources' };
}

module.exports = { SCHEMA, CONTEXT_SCHEMA, CATEGORIES, key, clip, buildGraph, assembleContext };
