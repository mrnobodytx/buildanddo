// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/blueprints.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/web/src/lib/missionResearch.js, apps/web/src/lib/missionLearning.js, apps/pocketbase/pb_hooks/blueprint.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/missionResearch.js; CONSUMES apps/web/src/lib/missionLearning.js; CONSUMES apps/pocketbase/pb_hooks/blueprint.pb.js
// DAG Node:    none
// Intent:      Keep blueprint uploads and proposal exports scoped to one account while retaining uncertain request identity and unknown assessments.
// ───────────────────────────────────────────────────────────────

import { createResearchClient, RESEARCH_STATES } from './missionResearch.js';
import { emptyPlan } from './missionLearning.js';

const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value) => typeof value === 'string';
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });
const invalid = (error) => ({ ok: false, reason: 'invalid', error });
const types = ['service', 'database', 'queue', 'gateway', 'worker', 'storage', 'external'];
const questions = ['feasibility', 'complexity', 'component_type', 'automatable', 'risk'];
const score = (value) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10);
const list = (value, maximum, validate) => Array.isArray(value) && value.length <= maximum && value.every(validate);
function recordShape(record, workspace, detailed = false) {
    if (!record || record.workspace !== workspace || !id(record.id) || !id(record.submission) || !id(record.owner) ||
        !hash(record.input_sha256) || !text(record.source_file) || !Object.hasOwn(RESEARCH_STATES, record.status) ||
        !Number.isSafeInteger(record.revision) || record.revision < 1 || !Number.isSafeInteger(record.attempt) || record.attempt < 0) return false;
    if (!detailed) return true;
    if (!text(record.text) || !id(record.upload) || !text(record.blueprint_failure) || !text(record.evaluation_failure) || typeof record.truncated !== 'boolean') return false;
    const blueprint = record.blueprint;
    if (blueprint === null) return record.evaluation === null;
    if (!blueprint || blueprint.source_hash !== record.input_sha256 || blueprint.source_file !== record.source_file || !text(blueprint.title) ||
        !Number.isFinite(blueprint.extraction_confidence) || blueprint.extraction_confidence < 0 || blueprint.extraction_confidence > 1 ||
        !Number.isSafeInteger(blueprint.page_count) || !text(blueprint.extracted_at) || !text(blueprint.parser_version) ||
        !list(blueprint.sections, 64, (row) => row && text(row.id) && text(row.title) && text(row.text)) ||
        !list(blueprint.requirements, 80, (row) => row && ['id', 'text', 'priority', 'type', 'section', 'raw_context'].every((key) => text(row[key]))) ||
        !list(blueprint.components, 64, (row) => row && text(row.name) && text(row.description) && types.includes(row.type) &&
            list(row.dependencies, 64, text) && list(row.requirements, 80, text)) ||
        !['constraints', 'assumptions', 'open_questions'].every((key) => list(blueprint[key], 80, text))) return false;
    const evaluation = record.evaluation;
    return evaluation === null || (evaluation?.authority === 'A0' && evaluation.verified === false && evaluation.source_hash === record.input_sha256 &&
        evaluation.overall && ['empty', 'assessed', 'review_required'].includes(evaluation.overall.status) &&
        evaluation.requirements?.length === blueprint.requirements.length &&
        list(evaluation.requirements, 80, (row) => row && blueprint.requirements.some((item) => item.id === row.requirement_id) &&
            ['feasibility', 'complexity', 'risk'].every((key) => score(row[key])) && (row.automatable === null || typeof row.automatable === 'boolean') &&
            (row.component_type === null || types.includes(row.component_type)) && list(row.abstained, 5, (key) => questions.includes(key)) &&
            list(row.components, 64, text) && row.confidence && questions.every((key) => Number.isFinite(row.confidence[key]) &&
                row.confidence[key] >= 0 && row.confidence[key] <= 1 && (row[key] === null) === row.abstained.includes(key))));
}

/** Connect blueprint intake and review to the existing authenticated research transport. */
export function createBlueprintClient({ client, accountId, workspaceId, demo = false, isCurrent, crypto = globalThis.crypto,
    observe = (_name, _verb, operation) => operation() }) {
    const current = () => !demo && id(accountId) && id(workspaceId) && isCurrent() && client.authStore.record?.id === accountId;
    const prefix = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/blueprints`;
    const research = createResearchClient({ client, accountId, workspaceId, demo, isCurrent, observe });
    let pending = null; let busy = false;
    const failure = (error, writing = false) => ({ ok: false,
        reason: writing && (!error?.status || error.status >= 500) ? 'uncertain' : 'unavailable',
        error: error?.status === 403 ? 'Your current workspace access does not permit this operation.' : writing ?
            (!error?.status || error.status >= 500 ? 'Could not confirm the save. Retry the previous request to recover its receipt.' :
                'The request was rejected. Refresh the saved state and check the PDF before retrying.') :
            'Blueprints are unavailable. Refresh or check the workspace processing settings.' });
    const read = async (suffix, query, validate) => {
        if (!current()) return stale();
        try {
            const data = await client.send(prefix + suffix, { method: 'GET', query, requestKey: null, cache: 'no-store' });
            if (!current()) return stale();
            return validate(data) ? { ok: true, data } : failure(null);
        } catch (error) { return current() ? failure(error) : stale(); }
    };
    const send = async () => {
        if (!current()) return stale();
        if (busy) return invalid('A blueprint request is already running.');
        if (!pending) return invalid('There is no unresolved request.');
        busy = true;
        try {
            const request = pending;
            const data = await observe('research_submissions', request.kind === 'upload' ? 'create' : 'update', () =>
                client.send(prefix + request.suffix, { method: 'POST', body: request.body, requestKey: null, cache: 'no-store' }));
            if (!current()) return stale();
            if (data?.workspace !== workspaceId || !recordShape(data.record, workspaceId, true) ||
                (request.kind === 'upload' ? data.record.input_sha256 !== request.digest || typeof data.replayed !== 'boolean' : data.record.id !== request.id))
                throw new Error('Incomplete blueprint receipt');
            pending = null;
            return { ok: true, data, kind: request.kind };
        } catch (error) {
            if (!current()) return stale();
            const result = failure(error, true);
            if (result.reason !== 'uncertain') pending = null;
            return result;
        } finally { busy = false; }
    };
    const requestKey = () => {
        const key = crypto.randomUUID();
        if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) throw new Error('Invalid request key');
        return key;
    };
    return {
        read: (page = 1) => read('', { page }, (data) => data?.workspace === workspaceId && ['owner', 'admin', 'editor', 'viewer'].includes(data.role) &&
            data.page === page && typeof data.has_more === 'boolean' && list(data.items, 20, (row) => recordShape(row, workspaceId))),
        detail: (recordId) => id(recordId) ? read(`/${recordId}`, {}, (data) => data?.workspace === workspaceId && data.record?.id === recordId &&
            recordShape(data.record, workspaceId, true)) : Promise.resolve(invalid('Choose a saved blueprint.')),
        original: research.original,
        async upload(file) {
            if (!current()) return stale();
            if (!file?.name?.toLowerCase().endsWith('.pdf') || !file.size || file.size > 20971520 || file.name.length > 180 || /[\u0000-\u001f/\\"]/.test(file.name))
                return invalid('Choose a PDF of at most 20 MiB.');
            if (busy || pending) return invalid('Recover the previous request before uploading another blueprint.');
            busy = true;
            try {
                const bytes = await file.arrayBuffer();
                const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
                if (!current()) return stale();
                const body = new FormData();
                body.append('asset', file); body.append('request_key', requestKey()); body.append('input_sha256', digest);
                pending = { kind: 'upload', body, suffix: '', digest };
            } catch {
                return current() ? invalid('The PDF could not be prepared. Use a browser with secure file hashing and try again.') : stale();
            } finally { busy = false; }
            return send();
        },
        async command(recordId, action, revision) {
            if (!current()) return stale();
            if (!id(recordId) || !['retry', 'cancel'].includes(action) || !Number.isSafeInteger(revision) || revision < 1)
                return invalid('Reload the blueprint before continuing.');
            if (busy || pending) return invalid('Recover the previous request first.');
            try { pending = { kind: 'command', id: recordId, suffix: `/${recordId}/commands`, body: { action, revision, request_key: requestKey() } }; }
            catch { return invalid('A secure request identifier is unavailable.'); }
            return send();
        },
        retry: send,
    };
}

/** Export a proposed definition with full source data and an incomplete review plan. */
export function blueprintDefinition(record, kind = 'mission') {
    if (!['mission', 'challenge'].includes(kind) || record?.status !== 'ready' || !record.blueprint || !recordShape(record, record.workspace, true))
        throw new Error('Choose a ready blueprint to export.');
    const blueprint = record.blueprint;
    const plan = { ...emptyPlan(), risk: 'A0', purpose: 'Review this blueprint and resolve its design questions before implementation.',
        in_scope: `Review the ${blueprint.requirements.length} extracted requirements and component dependencies in this proposal.`,
        input_validation: 'Treat the attached source and extracted statements as untrusted user input.' };
    return JSON.parse(JSON.stringify({ format: 'buildanddo.blueprint-proposal.v1', kind, requires_review: true,
        definition: { title: blueprint.title, description: `Blueprint proposal from ${blueprint.source_file}.`, status: 'proposed', progress: 0,
            priority: 'medium', mission_plan: plan },
        source: { file: blueprint.source_file, sha256: blueprint.source_hash, parser_version: blueprint.parser_version,
            extracted_at: blueprint.extracted_at, truncated: blueprint.truncated || record.truncated },
        requirements: blueprint.requirements, components: blueprint.components, sections: blueprint.sections,
        constraints: blueprint.constraints, assumptions: blueprint.assumptions, open_questions: blueprint.open_questions,
        evaluation: record.evaluation }));
}
