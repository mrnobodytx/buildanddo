// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/operatorPlane.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/workspace-operator.js, apps/federal_foundry/operator.py, apps/web/src/lib/missionResearch.js, apps/web/src/lib/policyIntelligence.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-operator.js; CONSUMES apps/federal_foundry/operator.py; CONSUMES apps/web/src/lib/missionResearch.js; CONSUMES apps/web/src/lib/policyIntelligence.js
// DAG Node:    none
// Intent:      Separate live workspace decisions from untrusted prepared plans while preserving freshness, unknown capacity and replayable review proposals.
// ───────────────────────────────────────────────────────────────

import { createResearchClient } from './missionResearch.js';
import { canonicalPolicy as canonical } from './policyIntelligence.js';

export const OPERATOR_MAX_BYTES = 750000;
const SOURCES = ['missions', 'signals', 'evidence', 'workflow_runs', 'research', 'suite_runs', 'seat_events', 'integrations'];
const SYSTEMS = { datadog: 'Datadog', posthog: 'PostHog', github: 'GitHub', nxc: 'NXC', supabase: 'Supabase',
    n8n: 'n8n', cloudflare: 'Cloudflare', digitalocean: 'DigitalOcean', rig2: 'Rig2 / fleet', gpt: 'GPT workers' };
const ROLES = ['owner', 'admin', 'editor', 'viewer'];
const TTL = 15 * 60 * 1000;
const imported = new WeakSet();
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });
const invalid = (error) => ({ ok: false, reason: 'invalid', error });
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const name = (value) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, max = 6000, empty = false) => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0);
const list = (value, max, check) => Array.isArray(value) && value.length <= max && value.every(check);
const unique = (value) => new Set(value).size === value.length;
const keys = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key));
const stamp = (value) => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value.replace(' ', 'T')) : NaN;
const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const requireValue = (value) => { if (!value) throw new TypeError('Invalid operator data'); };
const strings = (value, max = 128) => list(value, max, (item) => text(item));
const relativePath = (value) => text(value, 300) && /^(apps|docs|tests|scripts\/ci|\.bits)\//.test(value) &&
    !value.split('/').some((part) => !part || part === '.' || part === '..') && !/[\\\x00-\x1f]/.test(value);

function snapshotShape(value, workspace) {
    if (!keys(value, ['schema_version', 'workspace', 'role', 'observed_at', 'page_size', 'sources']) ||
        value.schema_version !== 'buildanddo.operator-snapshot/v1' || value.workspace !== workspace || !ROLES.includes(value.role) ||
        !Number.isFinite(stamp(value.observed_at)) || value.page_size !== 20 || !keys(value.sources, SOURCES)) return false;
    return SOURCES.every((key) => {
        const source = value.sources[key];
        if (!keys(source, ['state', 'items', 'page', 'has_more']) || !['available', 'unavailable'].includes(source.state) ||
            !Number.isSafeInteger(source.page) || source.page < 1 || source.page > 9999 || typeof source.has_more !== 'boolean' ||
            !list(source.items, 20, (row) => row && typeof row === 'object') ||
            source.state === 'unavailable' && (source.items.length || source.has_more)) return false;
        if (key === 'integrations') return unique(source.items.map((row) => row.provider)) && source.items.every((row) =>
            name(row.provider) && text(row.label, 160) && typeof row.desired_enabled === 'boolean' &&
            keys(row.observation, ['state', 'at', 'current', 'receipt_ref', 'check_pending']) &&
            ['unknown', 'disabled', 'healthy', 'degraded', 'failed'].includes(row.observation.state) &&
            text(row.observation.at, 80, true) && text(row.observation.receipt_ref, 2048, true) &&
            typeof row.observation.current === 'boolean' && typeof row.observation.check_pending === 'boolean');
        return unique(source.items.map((row) => row.id)) && source.items.every((row) => id(row.id) && row.workspace === workspace &&
            ['title', 'status', 'owner', 'mission', 'created', 'updated'].every((field) => text(row[field], field === 'title' ? 240 : 80, true)) &&
            (key !== 'missions' || typeof row.plan_complete === 'boolean' && typeof row.approved === 'boolean' && text(row.priority, 32, true)) &&
            (!['research', 'suite_runs'].includes(key) || Number.isSafeInteger(row.attempt) && row.attempt >= 0 && row.attempt <= 100 &&
                Number.isSafeInteger(row.revision) && row.revision >= 1 && text(row.lease_until, 80, true) && text(row.failure, 80, true)) &&
            (key !== 'seat_events' || text(row.seat, 80, true) && text(row.subject, 64, true) && text(row.subject_type, 32, true)));
    });
}

/** Derive decisions from actual workflow states, keeping work and missing observations separate. */
export function projectOperator(snapshot, now = Date.now()) {
    requireValue(snapshotShape(snapshot, snapshot?.workspace) && Number.isFinite(now));
    const rows = (key) => snapshot.sources[key].state === 'available' ? snapshot.sources[key].items : [];
    const age = now - stamp(snapshot.observed_at);
    const freshness = age < 0 ? 'future' : age > TTL ? 'stale' : 'current';
    const sources = SOURCES.map((key) => ({ id: key, state: snapshot.sources[key].state, page: snapshot.sources[key].page, has_more: snapshot.sources[key].has_more }));
    const human_decisions = []; const work_queue = [];
    const entry = (key, row, reason, href) => ({ id: `${key}:${row.id}`, title: row.title || row.id, reason, href });
    const missionHref = (row) => `/app/missions?mission=${encodeURIComponent(row.id)}`;
    const active_missions = rows('missions').filter((row) => !['verified', 'failed'].includes(row.status))
        .map((row) => ({ ...entry('mission', row, 'Saved mission state', missionHref(row)), status: row.status, owner: row.owner }));
    for (const row of rows('missions')) {
        if (row.status === 'proposed') (row.plan_complete ? human_decisions : work_queue).push(entry('mission', row,
            row.plan_complete ? 'Decide whether to approve this completed mission plan.' : 'Complete the plan before requesting approval.', missionHref(row)));
        else if (row.status === 'needs_attention') work_queue.push(entry('mission', row, 'Inspect the recorded blocker; human judgment is not yet established.', missionHref(row)));
        else if (row.status === 'approved') work_queue.push(entry('mission', row, 'Record work started in the existing mission desk.', missionHref(row)));
    }
    for (const row of rows('workflow_runs')) if (row.status === 'awaiting_approval')
        human_decisions.push(entry('workflow', row, 'A saved workflow step requires an owner or administrator decision.', '/app/workflows'));
    for (const key of ['research', 'suite_runs']) for (const row of rows(key)) {
        const href = key === 'suite_runs' ? `/app/suite?mission=${encodeURIComponent(row.mission)}` : row.mode === 'blueprint' ? '/app/blueprints' : `/app/research?mission=${encodeURIComponent(row.mission)}`;
        if (row.status === 'ready') work_queue.push(entry(key, row, 'Inspect the result and its evidence before attaching it to the mission.', href));
        else if (['failed', 'blocked'].includes(row.status)) work_queue.push(entry(key, row,
            row.attempt >= (key === 'suite_runs' ? 3 : 5) ? 'Attempt limit reached. Inspect retained failures before planning new work.' :
                'Inspect capability or failure evidence; recover or retry through the existing worker desk.', href));
        else if (row.status === 'processing' && Number.isFinite(stamp(row.lease_until)) && stamp(row.lease_until) <= now)
            work_queue.push(entry(key, row, 'The recorded lease expired. Check worker recovery in the existing desk.', href));
    }
    for (const row of rows('signals')) if (['new', 'untriaged'].includes(row.status))
        work_queue.push(entry('signal', row, 'Inspect the observation and existing capabilities before proposing a change.', '/app/signals'));
    const systems = Object.entries(SYSTEMS).map(([key, label]) => {
        const row = rows('integrations').find((item) => item.provider === key);
        let status = row ? 'unknown' : 'not_connected';
        let reason = row ? 'Configuration alone does not establish live health.' : 'No runtime observation is exposed by this workspace adapter.';
        let at = '';
        if (snapshot.sources.integrations.state !== 'available') { status = 'unavailable'; reason = 'Integration observations could not be read.'; }
        else if (row) {
            const observation = row.observation; const elapsed = now - stamp(observation.at);
            if (observation.receipt_ref && Number.isFinite(elapsed) && elapsed >= 0 && observation.state !== 'unknown') {
                at = observation.at;
                status = observation.current && elapsed <= TTL && freshness === 'current' ? observation.state : 'stale';
                reason = status === 'stale' ? 'The observation is stale or its configuration has changed.' : 'A dated receipt supports this state; it is not an end-to-end feature check.';
            }
        }
        return { id: key, name: label, status, observed_at: at, reason, href: '/app/integrations' };
    });
    const changes = ['missions', 'evidence', 'signals', 'seat_events'].flatMap((key) => rows(key)
        .filter((row) => !row.created || Number.isFinite(stamp(row.created)) && stamp(row.created) <= now).map((row) => ({
        id: `${key}:${row.id}`, title: row.title || row.id, at: row.updated || row.created,
        href: key === 'missions' ? missionHref(row) : key === 'signals' ? '/app/signals' : key === 'evidence' ? '/app/evidence' : '/app/fleet',
    }))).filter((row) => Number.isFinite(stamp(row.at)) && stamp(row.at) <= now)
        .sort((a, b) => stamp(b.at) - stamp(a.at) || a.id.localeCompare(b.id)).slice(0, 20);
    const latest = new Map();
    for (const row of rows('seat_events')) {
        const key = `${row.seat}:${row.subject_type}:${row.subject}`;
        if (!row.seat || !Number.isFinite(stamp(row.created)) || stamp(row.created) > now) continue;
        const previous = latest.get(key);
        // Completion remains terminal for this subject, even after later chatter.
        if (!previous || previous.status !== 'completed' && (row.status === 'completed' || stamp(row.created) > stamp(previous.created))) latest.set(key, row);
    }
    const workers = [...latest.values()].map((row) => ({ id: row.id, seat: row.seat,
        status: now - stamp(row.created) > TTL ? 'stale activity' : row.status, at: row.created, href: '/app/fleet' }));
    return { active_missions, human_decisions, work_queue, systems, changes, workers, sources,
        partial: sources.some((row) => row.state !== 'available' || row.has_more || row.page > 1), observed_at: snapshot.observed_at, freshness };
}

function typed(value, depth = 0) {
    requireValue(depth <= 30);
    if (value === null) return ['null'];
    if (typeof value === 'boolean') return ['boolean', value];
    if (typeof value === 'string') {
        for (let index = 0; index < value.length; index++) {
            const code = value.charCodeAt(index);
            if (code >= 0xd800 && code <= 0xdbff) { const low = value.charCodeAt(++index); requireValue(low >= 0xdc00 && low <= 0xdfff); }
            else requireValue(code < 0xdc00 || code > 0xdfff);
        }
        return ['string', value];
    }
    if (typeof value === 'number') {
        requireValue(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)));
        const bytes = new ArrayBuffer(8); new DataView(bytes).setFloat64(0, value, false);
        return ['number', Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')];
    }
    if (Array.isArray(value)) return ['array', value.map((item) => typed(item, depth + 1))];
    requireValue(value && typeof value === 'object');
    return ['object', Object.keys(value).sort().map((key) => {
        requireValue(!['__proto__', 'constructor', 'prototype'].includes(key)); typed(key, depth + 1);
        return [key, typed(value[key], depth + 1)];
    })];
}
async function digest(value, crypto) {
    const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function blueprintShape(value) {
    if (value === null) return true;
    if (!keys(value, ['title', 'source_file', 'source_hash', 'extracted_at', 'sections', 'requirements', 'components', 'constraints', 'assumptions',
        'open_questions', 'extraction_confidence', 'parser_version', 'page_count', 'truncated']) || !hash(value.source_hash) ||
        !text(value.title, 160) || !text(value.source_file, 180) || !Number.isFinite(stamp(value.extracted_at)) || !text(value.parser_version, 80) ||
        !Number.isInteger(value.page_count) || value.page_count < 0 || value.page_count > 200 || typeof value.truncated !== 'boolean' ||
        !Number.isFinite(value.extraction_confidence) || value.extraction_confidence < 0 || value.extraction_confidence > 1 ||
        !list(value.sections, 64, (row) => name(row?.id) && text(row.title, 160) && text(row.text, 16000, true)) ||
        !list(value.requirements, 80, (row) => name(row?.id) && text(row.text, 2000) && text(row.raw_context, 800) &&
            value.sections.some((section) => section.id === row.section) && ['must', 'should', 'could', 'wont', 'high', 'medium', 'low'].includes(row.priority) &&
            ['functional', 'performance', 'security', 'integration', 'data', 'constraint'].includes(row.type)) ||
        !list(value.components, 64, (row) => text(row?.name, 160) && text(row.description, 800, true) &&
            ['service', 'database', 'queue', 'gateway', 'worker', 'storage', 'external'].includes(row.type) && strings(row.requirements, 80) && strings(row.dependencies, 64)) ||
        !['constraints', 'assumptions', 'open_questions'].every((key) => strings(value[key], 80))) return false;
    return unique(value.sections.map((row) => row.id)) && unique(value.requirements.map((row) => row.id)) && unique(value.components.map((row) => row.name)) &&
        value.components.every((row) => row.requirements.every((item) => value.requirements.some((requirement) => requirement.id === item)) &&
            row.dependencies.every((item) => item !== row.name && value.components.some((component) => component.name === item)));
}
function planShape(plan) {
    requireValue(keys(plan, ['schema_version', 'id', 'content_sha256', 'created_at', 'source_sha256', 'catalog_sha256', 'authority', 'status', 'verified',
        'problem', 'evidence', 'existing_capabilities', 'missing_capabilities', 'proposed_modules', 'dependencies', 'owner', 'tests', 'telemetry',
        'risks', 'rollback', 'acceptance_criteria', 'evidence_refs', 'work_queue', 'human_decisions', 'opportunities', 'source_blueprint', 'prepared_tasks', 'hosted_dispatches_created']) &&
        plan.schema_version === 'buildanddo.operator-blueprint/v1' && plan.authority === 'A0' && plan.status === 'proposal' && plan.verified === false &&
        plan.hosted_dispatches_created === 0 && hash(plan.content_sha256) && plan.id === `OP-${plan.content_sha256.slice(0, 24)}` &&
        Number.isFinite(stamp(plan.created_at)) && hash(plan.source_sha256) && hash(plan.catalog_sha256) && text(plan.problem) &&
        keys(plan.owner, ['seat', 'status']) && plan.owner.seat === null && plan.owner.status === 'unassigned');
    const reference = (row) => keys(row, ['id', 'kind', 'path', 'sha256']) && name(row.id) &&
        ['source_file', 'blueprint_input'].includes(row.kind) && text(row.path, 300) && (row.kind === 'blueprint_input' || relativePath(row.path)) && hash(row.sha256);
    requireValue(list(plan.evidence, 150, reference) && list(plan.evidence_refs, 150, reference) && canonical(plan.evidence) === canonical(plan.evidence_refs) && unique(plan.evidence.map((row) => row.id)));
    const refs = new Map(plan.evidence.map((row) => [row.id, row]));
    const refIds = (value) => list(value, 150, (item) => refs.has(item)) && unique(value);
    requireValue(list(plan.existing_capabilities, 64, (row) => keys(row, ['id', 'name', 'intent', 'source_refs', 'missing_source_paths', 'evidence_state', 'runtime_readiness']) &&
        name(row.id) && text(row.name, 200) && text(row.intent) && row.runtime_readiness === 'unknown' &&
        ['source_inspected', 'source_incomplete'].includes(row.evidence_state) && list(row.missing_source_paths, 64, relativePath) &&
        list(row.source_refs, 64, (ref) => reference(ref) && canonical(refs.get(ref.id)) === canonical(ref)) &&
        (row.evidence_state === 'source_inspected' ? row.missing_source_paths.length === 0 && row.source_refs.length > 0 : row.missing_source_paths.length > 0)));
    const capabilities = new Set(plan.existing_capabilities.map((row) => row.id));
    requireValue(capabilities.size === plan.existing_capabilities.length);
    const capabilityIds = (value) => list(value, 64, (item) => capabilities.has(item)) && unique(value);
    requireValue(list(plan.work_queue, 128, (row) => keys(row, ['id', 'title', 'kind', 'status', 'depends_on', 'capability_ids', 'evidence_refs', 'authority', 'owner']) &&
        name(row.id) && text(row.title) && ['discovery', 'research', 'verification', 'review'].includes(row.kind) && ['ready', 'planned'].includes(row.status) &&
        row.authority === 'A0' && row.owner === null && capabilityIds(row.capability_ids) && refIds(row.evidence_refs) && list(row.depends_on, 128, name)));
    const work = new Map(plan.work_queue.map((row) => [row.id, row]));
    requireValue(work.size === plan.work_queue.length && list(plan.dependencies, 128, (row) => keys(row, ['id', 'depends_on']) && work.has(row.id) &&
        canonical(row.depends_on) === canonical(work.get(row.id).depends_on)) && unique(plan.dependencies.map((row) => row.id)) && plan.dependencies.length === work.size);
    const visited = new Set(); const visiting = new Set();
    const visit = (key) => {
        requireValue(work.has(key) && !visiting.has(key)); if (visited.has(key)) return;
        visiting.add(key); requireValue(unique(work.get(key).depends_on)); work.get(key).depends_on.forEach(visit); visiting.delete(key); visited.add(key);
    };
    work.forEach((_row, key) => visit(key));
    requireValue(list(plan.missing_capabilities, 64, (row) => keys(row, ['id', 'name', 'state', 'reason', 'work_item']) && name(row.id) &&
        text(row.name) && row.state === 'discovery_required' && text(row.reason) && work.has(row.work_item)) &&
        list(plan.proposed_modules, 64, (row) => keys(row, ['id', 'name', 'action', 'capability_ids', 'reason']) && name(row.id) &&
            text(row.name) && ['reuse', 'extend', 'discover'].includes(row.action) && capabilityIds(row.capability_ids) && text(row.reason)) &&
        list(plan.tests, 64, (row) => keys(row, ['id', 'command', 'status', 'purpose']) && name(row.id) && text(row.command) && row.status === 'not_run' && text(row.purpose)) &&
        list(plan.telemetry, 20, (row) => keys(row, ['id', 'status', 'observed_at', 'evidence_refs']) && name(row.id) && row.status === 'not_observed' &&
            row.observed_at === null && Array.isArray(row.evidence_refs) && row.evidence_refs.length === 0) &&
        list(plan.risks, 64, (row) => keys(row, ['id', 'description', 'mitigation']) && name(row.id) && text(row.description) && text(row.mitigation)) &&
        keys(plan.rollback, ['strategy', 'steps']) && text(plan.rollback.strategy) && strings(plan.rollback.steps, 20) &&
        list(plan.acceptance_criteria, 128, (row) => keys(row, ['id', 'text', 'status', 'evidence_refs']) && name(row.id) && text(row.text) && row.status === 'pending' && refIds(row.evidence_refs)) &&
        list(plan.human_decisions, 64, (row) => keys(row, ['id', 'title', 'condition', 'state', 'required_for', 'decision']) && name(row.id) &&
            text(row.title) && text(row.condition) && text(row.required_for) && row.state === 'conditional' && row.decision === null) &&
        list(plan.opportunities, 20, (row) => keys(row, ['id', 'title', 'srs_code', 'deadline', 'evidence_state']) && name(row.id) && text(row.title) &&
            name(row.srs_code) && keys(row.deadline, ['status', 'value']) && row.deadline.status === 'unverified' && row.deadline.value === null && row.evidence_state === 'unverified') &&
        blueprintShape(plan.source_blueprint));
    requireValue(list(plan.prepared_tasks, 40, (row) => row?.schema_version === 'federal.task/v1' && name(row.task_id) &&
        row.execution_dispatch_id === null && row.intake_status === 'PREPARED' && ['builder', 'verifier'].includes(row.role) && row.model_selection === 'caller' &&
        hash(row.task_sha256) && row.source_sha256 === plan.source_sha256 && row.catalog_sha256 === plan.catalog_sha256 &&
        row.limits?.max_model_calls === 1 && row.limits.timeout_seconds <= 120 && plan.opportunities.some((opportunity) => opportunity.id === row.lane_id)));
    for (const field of ['missing_capabilities', 'proposed_modules', 'tests', 'telemetry', 'risks', 'acceptance_criteria', 'human_decisions', 'opportunities'])
        requireValue(unique(plan[field].map((row) => row.id)));
    requireValue(unique(plan.prepared_tasks.map((row) => row.task_id)));
}

/** Import a compiler proposal; a matching hash establishes bytes, never source truth or authority. */
export async function importOperatorBlueprint(raw, crypto = globalThis.crypto) {
    try {
        requireValue(typeof raw === 'string' && raw.length <= OPERATOR_MAX_BYTES && new TextEncoder().encode(raw).length <= OPERATOR_MAX_BYTES && crypto?.subtle);
        const plan = JSON.parse(raw);
        // Compiler keys are sorted. Normalize legal numeric spellings and string
        // escapes while rejecting duplicate keys and noncanonical object order.
        const tokens = raw.match(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]/g) || [];
        const compact = tokens.map((token) => /^[{}\[\]:,]$/.test(token) ? token : JSON.stringify(JSON.parse(token))).join('');
        requireValue(canonical(plan) === compact);
        typed(plan); planShape(plan);
        const { id: _id, content_sha256: content, created_at: _at, ...body } = plan;
        requireValue(content === await digest(JSON.stringify(typed(body)), crypto));
        freeze(plan); imported.add(plan);
        return { ok: true, blueprint: plan };
    } catch { return invalid('Use an unchanged operator-blueprint.json compiler export. Imported plans cannot supply approvals, runtime health or verified evidence.'); }
}

/** Read scoped state and submit only an explicit review request through the existing command boundary. */
export function createOperatorClient({ client, accountId, workspaceId, demo = false, isCurrent, crypto = globalThis.crypto,
    observe = (_name, _verb, operation) => operation() }) {
    const current = () => !demo && id(accountId) && id(workspaceId) && isCurrent() && client.authStore.record?.id === accountId;
    let generation = 0; let readable = null; let pending = null; let busy = false;
    const failure = (error) => ({ ok: false, reason: error?.status === 403 ? 'forbidden' : 'unavailable',
        error: error?.status === 403 ? 'Current workspace membership is required.' : 'The operator snapshot is unavailable. Refresh or check the installed workspace API.' });
    const write = async (operation) => {
        if (!current()) return stale();
        if (!readable || readable.role === 'viewer' || Date.now() - stamp(readable.observed_at) < 0 || Date.now() - stamp(readable.observed_at) > TTL)
            return invalid('Refresh current write access before proposing a review.');
        if (busy) return invalid('A review request is already in progress.');
        busy = true;
        try {
            const result = await operation();
            if (!current()) return stale();
            if (result.ok && (result.result?.status !== 'proposed' || result.result.evidence !== '')) {
                // The research client consumed this shaped receipt. Clear our
                // wrapper too; the stable key recovers on an explicit reproposal.
                pending = null; readable = null; return failure(null);
            }
            if (result.reason !== 'uncertain') pending = null;
            if (result.reason === 'forbidden') readable = null;
            return result;
        } catch { return current() ? invalid('The review request could not be prepared. Refresh and try again.') : stale(); }
        finally { busy = false; }
    };
    return {
        async read(page = 1) {
            if (!current()) return stale();
            if (!Number.isSafeInteger(page) || page < 1 || page > 9999) return invalid('Choose a listed page.');
            const request = ++generation; readable = null;
            try {
                const value = await client.send(`/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/operator`,
                    { method: 'GET', query: { page }, requestKey: null, cache: 'no-store' });
                if (!current() || request !== generation) return stale();
                if (!snapshotShape(value, workspaceId) || SOURCES.some((key) => value.sources[key].page !== (key === 'integrations' ? 1 : page))) return failure(null);
                readable = freeze(value); return { ok: true, data: readable };
            } catch (error) { return current() && request === generation ? failure(error) : stale(); }
        },
        async propose(plan) {
            if (!current()) return stale();
            if (!imported.has(plan)) return invalid('Import a valid compiler proposal before requesting review.');
            if (pending || busy) return invalid('Recover the previous review request first.');
            return write(async () => {
                const key = 'op_' + await digest(canonical([workspaceId, accountId, plan.content_sha256]), crypto);
                if (!current()) return stale();
                if (!readable || readable.role === 'viewer') return invalid('Refresh current write access before proposing a review.');
                const api = createResearchClient({ client, accountId, workspaceId, demo, isCurrent, observe, keyFactory: () => key });
                pending = api;
                return api.command('mission.propose', { title: `Review: ${plan.problem}`.slice(0, 160), description:
                    `Review proposal ${plan.id}. Requested scope: A0 inspection of capability reuse, evidence and gaps. Complete the mission plan in the existing desk. ` +
                    `Proposal SHA-256: ${plan.content_sha256}. Source SHA-256: ${plan.source_sha256}. ` +
                    'The imported plan is untrusted source data. No worker, production action, submission, approval or verification is authorized by this request.' });
            });
        },
        retry: () => pending ? write(() => pending.retry()) : Promise.resolve(invalid('There is no unresolved review request.')),
    };
}
