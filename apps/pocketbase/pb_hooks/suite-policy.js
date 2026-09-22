// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/suite-policy.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_hooks/research-policy.js, apps/pocketbase/pb_hooks/workspace-access.js, apps/mission_suite/engine.py
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/research-policy.js; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/mission_suite/engine.py
// DAG Node:    none
// Intent:      Validate suite inputs and bind workers to current mission authority without alternate authentication.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/research-policy.js`);
const base = require(`${__hooks}/workspace-access.js`);
const VERSION = 'mission-suite/1.0.0';
const DEFAULT_PARAMETERS = { gap_seconds: 900, max_speed_knots: 45, position_tolerance_m: 5000, stale_seconds: 3600 };
const HASH = /^[a-f0-9]{64}$/;
function canonical(value, depth = 0) {
    if (depth > 12) access.invalid('Suite input is too deeply nested.');
    if (Array.isArray(value)) return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
    if (!['string', 'boolean', 'number'].includes(typeof value) && value !== null || typeof value === 'number' && !Number.isFinite(value))
        access.invalid('Supply finite JSON values.');
    return JSON.stringify(value);
}
function hash(value) { return $security.sha256(value); }
function utc(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value) || !Number.isFinite(Date.parse(value)))
        access.invalid('Use an explicit UTC timestamp.');
    const millis = Date.parse(value);
    if (new Date(millis).toISOString().slice(0, 19) !== value.slice(0, 19)) access.invalid('Use a real calendar timestamp.');
    return millis;
}
function array(value, max, min = 0) {
    if (!Array.isArray(value) || value.length < min || value.length > max) access.invalid(`Supply ${min} to ${max} items.`);
    return value;
}
function key(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_:.-]{1,80}$/.test(value)) access.invalid('Use a bounded identifier.');
    return value;
}
function finite(value, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) access.invalid('A number is outside the permitted range.');
    return value;
}
function bindings(workspace) {
    const raw = $os.getenv('BUILDANDDO_SUITE_BINDINGS'); let items;
    if (!raw) return null;
    try { items = JSON.parse(raw); } catch { throw new ApiError(503, 'Suite worker bindings need operator review.'); }
    if (!Array.isArray(items) || items.length > 100) throw new ApiError(503, 'Suite worker bindings need operator review.');
    const seen = new Set();
    for (const item of items) {
        access.exact(item, ['workspace', 'worker_user', 'binding', 'source_sha256', 'enabled']);
        access.id(item.workspace); key(item.binding);
        // `worker_user` may name one worker or a bounded list of them. What guards the evidence
        // is ONE PINNED SOURCE per workspace - source_sha256 is matched in currentJob and
        // re-attested by the worker on complete - not one person holding it. The lease was
        // always multi-consumer machinery: suite_runs.processor is a per-user relation, an
        // expired lease is re-claimable by someone else, and complete() fences on the attempt
        // number the claimer recorded, which can only matter when another worker can take over.
        // A plain string stays valid, so existing single-worker bindings are unaffected.
        item.worker_users = Array.isArray(item.worker_user) ? item.worker_user : [item.worker_user];
        if (!item.worker_users.length || item.worker_users.length > 16 ||
            new Set(item.worker_users).size !== item.worker_users.length)
            throw new ApiError(503, 'Suite worker bindings need operator review.');
        item.worker_users.forEach((id) => access.id(id));
        if (seen.has(item.workspace) || !HASH.test(item.source_sha256) || typeof item.enabled !== 'boolean')
            throw new ApiError(503, 'Suite worker bindings need operator review.');
        seen.add(item.workspace);
    }
    return items.find((item) => item.workspace === workspace && item.enabled) || null;
}
function worker(app, auth, workspace) {
    const binding = bindings(workspace);
    if (!binding || auth.collection().name !== 'users' || !binding.worker_users.includes(auth.id))
        throw new ForbiddenError('A registered suite worker is required.');
    return binding;
}
function schema(app) {
    base.schema(app, 'suite_receipts', ['command_sha256', 'request_key', 'result']);
    base.schema(app, 'suite_controls', ['protocol_version', 'revision', 'state_revision', 'observations', 'active_run']);
    return base.schema(app, 'suite_runs', ['protocol_version', 'input_canonical', 'result_canonical', 'revision', 'lease_until']);
}
function control(app, workspace, mission) {
    const matches = app.findRecordsByFilter('suite_controls', 'workspace = {:workspace} && mission = {:mission}', '', 2, 0, { workspace, mission });
    if (matches.length > 1) throw new ApiError(503, 'Suite state needs operator review.');
    return matches[0] || null;
}
function configuration(value) {
    access.exact(value, ['enabled', 'rights', 'parameters']);
    if (typeof value.enabled !== 'boolean') access.invalid('Choose whether the suite is enabled.');
    const seen = new Set();
    array(value.rights, 32).forEach((right) => {
        access.exact(right, ['source_id', 'rights_id', 'license_ref', 'classification', 'processing_allowed', 'export_allowed', 'expires_at', 'independence_group']);
        key(right.source_id); key(right.rights_id); key(right.independence_group); access.bounded(right.license_ref, 2048);
        if (seen.has(right.source_id) || !['PUBLIC', 'COMMERCIAL'].includes(right.classification) ||
            typeof right.processing_allowed !== 'boolean' || typeof right.export_allowed !== 'boolean') access.invalid('Use unique public or commercial source-rights records.');
        utc(right.expires_at); seen.add(right.source_id);
    });
    access.exact(value.parameters, Object.keys(DEFAULT_PARAMETERS));
    finite(value.parameters.gap_seconds, 60, 86400); finite(value.parameters.max_speed_knots, 1, 100);
    finite(value.parameters.position_tolerance_m, 10, 100000); finite(value.parameters.stale_seconds, 60, 604800);
    return value;
}
function rightsFor(control, observations, now) {
    if (!control) throw new ForbiddenError('Current source-rights configuration is required.');
    const rights = access.json(control, 'rights', []);
    for (const observation of observations) {
        const right = rights.find((row) => row.source_id === observation.source_id);
        if (!right || !right.processing_allowed || !['PUBLIC', 'COMMERCIAL'].includes(right.classification) || utc(right.expires_at) <= now)
            throw new ForbiddenError('Current processing rights are required for every observation.');
    }
    return rights.filter((right) => observations.some((row) => row.source_id === right.source_id));
}
function observations(previous, additions, at) {
    const items = new Map(previous.map((row) => [row.observation_id, row]));
    const sourceKeyOf = (row) => JSON.stringify([row.source_id, row.source_record_id]);
    const sourceIds = new Map(previous.map((row) => [sourceKeyOf(row), row.observation_id]));
    array(additions, 128, 1).forEach((row) => {
        access.exact(row, ['observation_id', 'source_id', 'source_record_id', 'entity_id', 'event_time', 'latitude', 'longitude']);
        ['observation_id', 'source_id', 'source_record_id', 'entity_id'].forEach((field) => key(row[field]));
        finite(row.latitude, -90, 90); finite(row.longitude, -180, 180);
        if (utc(row.event_time) > utc(at)) access.invalid('Observation time cannot follow receipt time.');
        const prior = items.get(row.observation_id);
        if (prior && canonical(Object.fromEntries(Object.entries(prior).filter(([name]) => name !== 'ingest_time'))) !== canonical(row))
            access.conflict('An observation identity already names different immutable evidence.');
        const sourceKey = sourceKeyOf(row);
        if (sourceIds.has(sourceKey) && sourceIds.get(sourceKey) !== row.observation_id) access.conflict('This source record already has an observation identity.');
        sourceIds.set(sourceKey, row.observation_id);
        if (!prior) items.set(row.observation_id, { ...row, ingest_time: at });
    });
    if (items.size > 256) access.invalid('This bounded mission retains at most 256 observations. Start a new mission window.');
    return Array.from(items.values()).sort((a, b) => a.observation_id.localeCompare(b.observation_id));
}
function result(raw, record) {
    if (typeof raw !== 'string' || raw.length > 650000) access.invalid('The suite result exceeds its bound.');
    let value;
    try { value = JSON.parse(raw); } catch { access.invalid('Supply a JSON suite result.'); }
    access.exact(value, ['schema_version', 'suite', 'tenant_id', 'mission_id', 'engine_version', 'evaluated_at', 'input_sha256', 'source_sha256', 'analysis', 'proof', 'release_state']);
    if (value.schema_version !== 'mission-suite.result/v1' || value.engine_version !== VERSION || value.release_state !== 'HOLD' ||
        value.tenant_id !== record.getString('workspace') || value.mission_id !== record.getString('mission') ||
        value.suite !== record.getString('suite') || value.input_sha256 !== record.getString('input_sha256') || value.source_sha256 !== record.getString('source_sha256') ||
        value.evaluated_at !== JSON.parse(record.getString('input_canonical')).evaluated_at) access.invalid('Result identity does not match the leased input.');
    access.exact(value.proof, ['root_algorithm', 'artifacts', 'artifact_count', 'root_digest', 'authority', 'release_root']);
    if (value.proof.authority !== 'evidence_only' || value.proof.release_root !== null || value.proof.root_algorithm !== 'sha256-merkle-v1' ||
        !HASH.test(value.proof.root_digest) || value.proof.artifact_count !== 4) access.invalid('A suite proof cannot grant release authority.');
    const paths = ['input.json', 'analysis.json', 'engine-version', 'source-manifest'];
    array(value.proof.artifacts, 4, 4).forEach((item, i) => {
        access.exact(item, ['path', 'digest']);
        if (item.path !== paths[i] || !HASH.test(item.digest)) access.invalid('Invalid proof artifact.');
    });
    if (value.proof.artifacts[0].digest !== value.input_sha256) access.invalid('Proof input differs from this run.');
    if (value.proof.artifacts[3].digest !== value.source_sha256) access.invalid('Proof source differs from this worker binding.');
    if (value.suite === 'maritime') {
        access.exact(value.analysis, ['observations', 'entities', 'features', 'candidates', 'geojson', 'admitted_cues', 'summary', 'limits']);
        if (array(value.analysis.admitted_cues, 0).length) access.invalid('No operational admission is available.');
        array(value.analysis.candidates, 768).forEach((cue) => {
            if (cue.admission_verdict !== 'HOLD') access.invalid('A suite worker cannot admit an operational cue.');
        });
        const input = JSON.parse(record.getString('input_canonical'));
        const ids = new Set(input.payload.observations.map((row) => row.observation_id));
        const observed = array(value.analysis.observations, 256, 1);
        if (observed.length !== ids.size || new Set(observed.map((row) => row.observation_id)).size !== ids.size ||
            observed.some((row) => !ids.has(row.observation_id) || row.tenant_id !== value.tenant_id || row.mission_id !== value.mission_id || !['PUBLIC', 'COMMERCIAL'].includes(row.classification)))
            access.invalid('The result must preserve this mission’s observation set.');
    } else {
        access.exact(value.analysis, ['checks', 'document_issues', 'state', 'summary', 'submission_receipt', 'limits']);
        if (!['READY_FOR_HUMAN_REVIEW', 'NEEDS_EVIDENCE'].includes(value.analysis.state) || value.analysis.submission_receipt !== null)
            access.invalid('Readiness is not a portal submission.');
    }
    return value;
}
module.exports = { ...access, VERSION, DEFAULT_PARAMETERS, HASH, canonical, hash, utc, array, key, finite, bindings,
    worker, schema, control, configuration, rightsFor, observations, result };
