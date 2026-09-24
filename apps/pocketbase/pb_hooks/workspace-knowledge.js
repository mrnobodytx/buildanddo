// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-knowledge.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/knowledge-graph.js, apps/pocketbase/pb_hooks/telemetry.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/knowledge-graph.js; CONSUMES apps/pocketbase/pb_hooks/telemetry.js
// DAG Node:    none
// Intent:      Rebuild workspace knowledge from current readable records while retaining permission, source-availability and scan boundaries.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const graph = require(`${__hooks}/knowledge-graph.js`);
const PER_SOURCE = 80;
const SCAN_LIMIT = 400;
const PAGE_SIZE = 100;
const TEXT_LIMIT = 3000;
const DEFINITIONS = [
    { collection: 'missions', kind: 'mission', fields: ['workspace', 'title', 'description', 'status'] },
    { collection: 'evidence', kind: 'evidence', fields: ['workspace', 'content', 'type', 'mission'] },
    { collection: 'research_submissions', kind: 'research', fields: ['protocol_version', 'workspace', 'mission', 'status', 'result'] },
    { collection: 'signals', kind: 'signal', fields: ['workspace', 'title', 'description', 'type'] },
    { collection: 'wiki_pages', kind: 'wiki', fields: ['workspace', 'title', 'body', 'status', 'revision'] },
];

function input(value, assembling) {
    if (!access.fields(value, assembling ? ['query', 'mission', 'max_chars', 'max_sources'] : ['mission']))
        access.invalid('Use the supported knowledge filters.');
    const mission = value.mission === undefined ? '' : access.id(value.mission, true);
    const query = value.query === undefined ? '' : access.bounded(value.query, 1000, false);
    const maxChars = value.max_chars === undefined ? 12000 : value.max_chars;
    const maxSources = value.max_sources === undefined ? 12 : value.max_sources;
    if (!Number.isSafeInteger(maxChars) || maxChars < 1024 || maxChars > 32000 ||
        !Number.isSafeInteger(maxSources) || maxSources < 1 || maxSources > 24)
        access.invalid('Use 1024–32000 characters and 1–24 context sources.');
    return { mission, query, max_chars: maxChars, max_sources: maxSources };
}

function document(workspace, definition, record) {
    let text = record.getString(definition.kind === 'evidence' ? 'content' : definition.kind === 'wiki' ? 'body' : 'description');
    const provenance = { collection: definition.collection, record_id: record.id,
        created_at: record.getString('created'), updated_at: record.getString('updated') };
    let upstreamTruncated = false;
    if (definition.kind === 'mission' && record.getString('mission_plan')) {
        const plan = access.json(record, 'mission_plan');
        if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
            for (const field of ['purpose', 'beneficiary', 'in_scope', 'out_of_scope', 'baseline', 'target', 'rollback'])
                if (typeof plan[field] === 'string') text += '\n' + field + ': ' + graph.clip(plan[field], 1000);
        }
    }
    if (definition.kind === 'research') {
        const result = access.json(record, 'result');
        if (!result || typeof result.text !== 'string' || typeof result.processor !== 'string' ||
            typeof result.version !== 'string' || !/^[a-f0-9]{64}$/.test(result.input_sha256 || '') ||
            typeof result.truncated !== 'boolean')
            throw new ApiError(503, 'Research provenance is unavailable.');
        text = record.getString('context') + '\n' + result.text;
        provenance.input_sha256 = result.input_sha256;
        provenance.processor = graph.clip(result.processor, 80);
        provenance.processor_version = graph.clip(result.version, 80);
        provenance.processed_at = record.getString('processed_at');
        upstreamTruncated = result.truncated;
    }
    if (['research', 'wiki'].includes(definition.kind)) provenance.revision = Number(record.get('revision') || 0);
    return { id: graph.key(workspace, definition.collection, record.id), kind: definition.kind,
        title: graph.clip(record.getString('title') || `${definition.kind} ${record.id}`, 160),
        text: graph.clip(text, TEXT_LIMIT), state: graph.clip(record.getString('status') || record.getString('type') || 'recorded', 80),
        source: provenance, truncated: upstreamTruncated || text.length > TEXT_LIMIT,
        category: graph.clip(record.getString('category'), 40),
        tags: record.getString('tags').split(',').slice(0, 12).map((tag) => graph.clip(tag.trim(), 40)).filter(Boolean), relations: [] };
}

function scan(app, definition, filter, parameters, accept) {
    const documents = []; let offset = 0; let complete = false;
    while (offset < SCAN_LIMIT) {
        const size = Math.min(PAGE_SIZE, SCAN_LIMIT - offset);
        const records = app.findRecordsByFilter(definition.collection, filter, '-updated,-id', size + 1, offset, parameters);
        for (const record of records.slice(0, size)) {
            if (documents.length === PER_SOURCE) return { documents, complete: false };
            const accepted = accept(record);
            if (accepted) documents.push(accepted);
        }
        offset += size;
        if (records.length <= size) { complete = true; break; }
    }
    return { documents, complete };
}

function collect(e, workspace, options) {
    const info = e.requestInfo(); const documents = new Map(); const missions = new Map(); const coverage = [];
    const missionDefinition = DEFINITIONS[0];
    // Source rules can be stricter than membership; check each original record.
    const readable = (record) => record.getString('workspace') === workspace &&
        e.app.canAccessRecord(record, info, record.collection().viewRule);
    const findMission = (id) => {
        if (missions.has(id)) return missions.get(id);
        let record;
        try { record = access.find(e.app, 'missions', access.id(id)); }
        catch (error) { if (error.status === 404) { missions.set(id, null); return null; } throw error; }
        const result = readable(record) ? document(workspace, missionDefinition, record) : null;
        missions.set(id, result); return result;
    };
    if (options.mission) {
        const selected = findMission(options.mission);
        if (!selected) throw new NotFoundError('The selected mission is unavailable.');
        documents.set(selected.id, selected);
    }
    for (const definition of DEFINITIONS) {
        const name = definition.collection;
        const status = { collection: name, state: 'complete', included: 0, limit: PER_SOURCE };
        try {
            const collection = access.schema(e.app, name, definition.fields);
            if (definition.kind === 'wiki' && !access.settings(access.controls(e.app, workspace)).wiki_enabled) {
                status.state = 'disabled'; coverage.push(status); continue;
            }
            if (name === 'missions' && options.mission) { status.included = 1; coverage.push(status); continue; }
            let filter = 'workspace = {:workspace}';
            if (options.mission && ['evidence', 'research'].includes(definition.kind)) filter += ' && mission = {:mission}';
            if (definition.kind === 'wiki') filter += ' && status = "published"';
            if (definition.kind === 'research') {
                filter += ' && (status = "ready" || status = "attached")';
                if (collection.fields.getByName('mode')) filter += ' && mode != "blueprint"';
            }
            const result = scan(e.app, definition, filter, { workspace, mission: options.mission }, (record) => {
                if (record.getString('workspace') !== workspace) return null;
                // Locked research/wiki collections use their existing custom-route
                // policies: readable mission results and enabled published pages.
                if (!['research', 'wiki'].includes(definition.kind) && !readable(record)) return null;
                if (definition.kind === 'wiki' && record.getString('status') !== 'published') return null;
                if (definition.kind === 'research' && (record.getString('mode') === 'blueprint' ||
                    !['ready', 'attached'].includes(record.getString('status')))) return null;
                const mission = ['research', 'evidence'].includes(definition.kind) ? record.getString('mission') : '';
                if (options.mission && ['research', 'evidence'].includes(definition.kind) && mission !== options.mission) return null;
                if ((mission && !findMission(mission)) || (definition.kind === 'research' && !mission)) return null;
                const node = document(workspace, definition, record);
                if (mission) node.relations.push({ target: graph.key(workspace, 'missions', mission),
                    relation: definition.kind === 'research' ? 'RESEARCH_FOR' : 'EVIDENCE_FOR' });
                if (definition.kind === 'research' && record.getString('evidence')) {
                    // Validate the evidence side after all source reads, without
                    // exposing an unreadable/missing identifier in graph output.
                    node.evidence = { id: graph.key(workspace, 'evidence', record.getString('evidence')), mission };
                }
                return node;
            });
            for (const node of result.documents) {
                documents.set(node.id, node);
                for (const relation of node.relations) {
                    const parent = [...missions.values()].find((item) => item?.id === relation.target);
                    if (parent) documents.set(parent.id, parent);
                }
            }
            status.included = result.documents.length;
            if (!result.complete) status.state = 'limited';
        } catch (error) {
            // Unknown schema or storage failures are unavailable, never empty
            // success. No source bytes or provider diagnostics enter the response.
            if (error.status === 403 || error.status === 401) throw error;
            try { require(`${__hooks}/telemetry.js`).diagnostic('knowledge.collect', 'schema', 0, name); }
            catch (_) { /* Diagnostics do not grant access or change source availability. */ }
            status.state = 'unavailable';
        }
        coverage.push(status);
    }
    for (const entry of coverage)
        entry.included = [...documents.values()].filter((node) => node.source.collection === entry.collection).length;
    for (const node of documents.values()) {
        if (node.evidence) {
            const evidence = documents.get(node.evidence.id);
            const parent = graph.key(workspace, 'missions', node.evidence.mission);
            if (evidence?.relations.some((edge) => edge.relation === 'EVIDENCE_FOR' && edge.target === parent))
                evidence.relations.push({ target: node.id, relation: 'DERIVED_FROM' });
        }
    }
    // A revocation during collection invalidates the entire assembled result.
    access.requireRole(e.app, e.auth, workspace);
    return graph.buildGraph(workspace, [...documents.values()], coverage, new Date().toISOString());
}

function scope(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    access.requireRole(e.app, e.auth, workspace);
    return workspace;
}

/** Read an automatically rebuilt graph under current native workspace access. */
function snapshot(e) {
    const workspace = scope(e);
    return collect(e, workspace, input(e.requestInfo().query || {}, false));
}

/** Assemble context without persisting a copy or invoking an inference provider. */
function assemble(e) {
    return assembleFor(e, e.requestInfo().body);
}

/** Reuse native source visibility when an authenticated assistant requests context. */
function assembleFor(e, values) {
    const workspace = scope(e);
    const options = input(values, true);
    const result = collect(e, workspace, options);
    return { ...result, context: graph.assembleContext(result, options) };
}

module.exports = { snapshot, assemble, assembleFor };
