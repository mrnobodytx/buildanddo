// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/decision-runtime.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/workflow-policy.js, apps/decision/adapters/server.py, apps/pocketbase/pb_hooks/telemetry.js
// EnumType:    Adapter
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js; CONSUMES apps/decision/adapters/server.py; CONSUMES apps/pocketbase/pb_hooks/telemetry.js
// DAG Node:    none
// Intent:      Persist Python decision receipts behind native workspace authorization without exposing source content to telemetry.
// ───────────────────────────────────────────────────────────────

const policy = require(__hooks + '/workflow-policy.js');
const TIERS = { A0: 0, A1: 1, A2: 2, A3: 3 };
const MAX_RESPONSE = 12 * 1024 * 1024;
const REQUIRED = ['workspace', 'owner', 'decision_id', 'request_key', 'request_hash', 'state',
    'questions', 'answers', 'confidence', 'route', 'latency_ms', 'cost_usd', 'result', 'protocol_version'];

function diagnose(operation, category, status) {
    try { require(`${__hooks}/telemetry.js`).diagnostic(operation, category, status); }
    catch (_) { /* Do not alter processor errors, permissions or stored receipts. */ }
}

function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function canonical(value, depth = 0) {
    if (depth > 20) policy.invalid('Input nesting is too deep.');
    if (value === null || ['boolean', 'string'].includes(typeof value)) return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
    policy.invalid('Input must contain JSON-compatible values.');
}
function scope(e) {
    policy.authenticated(e);
    const workspace = e.request.pathValue('workspace');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(workspace || '')) policy.invalid('Select a valid workspace.');
    policy.role(e.app, e.auth, workspace);
    policy.schema(e.app, 'workspace_decisions', REQUIRED);
    return workspace;
}
function local(operation, body) {
    // An operator may choose a port, never a user-controlled host or URL.
    const port = $os.getenv('BUILDANDDO_DECISION_PORT') || '8091';
    if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        diagnose('decision.request', 'config');
        throw new ApiError(503, 'The local decision runtime is not configured.');
    }
    let response;
    try {
        response = $http.send({ url: 'http://127.0.0.1:' + port + '/' + operation,
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), timeout: 35 });
    } catch (_) {
        diagnose('decision.request', 'transport');
        throw new ApiError(503, 'The local Python decision runtime is unavailable.');
    }
    let status;
    try { status = response.statusCode; }
    catch (error) { diagnose('decision.request', 'schema'); throw error; }
    if (status !== 200) diagnose('decision.request', 'upstream_status', status);
    if (status === 400) policy.invalid('The Python runtime rejected the input.');
    if (status === 403) throw new ForbiddenError('The requested authority is unavailable.');
    if (status !== 200) throw new ApiError(503, 'The local Python processor could not complete this request.');
    try {
        const result = response.json;
        if (!object(result) || JSON.stringify(result).length > MAX_RESPONSE)
            throw new ApiError(502, 'The local processor returned an invalid result.');
        return result;
    } catch (error) { diagnose('decision.request', 'parse', 200); throw error; }
}
function validateResult(result, questions, maximum) {
    const finite = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    if (!object(result) || result.verified !== false || !own(TIERS, result.authority)
        || TIERS[result.authority] > TIERS[maximum] || !object(result.answers)
        || Object.keys(result.answers).length !== Object.keys(questions).length
        || typeof result.route !== 'string' || result.route.length > 128
        || !finite(result.latency_ms) || !finite(result.cost_usd)
        || !/^[a-f0-9]{64}$/.test(result.state_hash || '')
        || !Array.isArray(result.evidence_refs))
        throw new ApiError(502, 'The Python decision contract is invalid.');
    for (const key of Object.keys(questions)) {
        const answer = result.answers[key];
        if (!object(answer) || !finite(answer.confidence) || answer.confidence > 1
            || typeof answer.abstained !== 'boolean' || !own(answer, 'value')
            || (answer.abstained && answer.value !== null)
            || (answer.probability !== undefined && (!finite(answer.probability) || answer.probability > 1))
            || (answer.probabilities !== undefined && (!object(answer.probabilities)
                || Object.values(answer.probabilities).some((v) => !finite(v) || v > 1))))
            throw new ApiError(502, 'The Python answer confidence contract is invalid.');
    }
}
function existing(app, workspace, owner, key) {
    return app.findRecordsByFilter('workspace_decisions',
        'workspace = {:workspace} && owner = {:owner} && request_key = {:key}', '', 1, 0,
        { workspace, owner, key })[0] || null;
}
function save(app, auth, workspace, key, request, result, decisionId) {
    const hash = $security.sha256(canonical(request));
    const previous = existing(app, workspace, auth.id, key);
    if (previous) {
        if (previous.getString('request_hash') !== hash)
            throw new ApiError(409, 'This decision request key already identifies different input.');
        return policy.json(previous, 'result');
    }
    const collection = policy.schema(app, 'workspace_decisions', REQUIRED);
    const row = new Record(collection);
    const response = { ...result, decision_id: decisionId };
    const values = { workspace, owner: auth.id, decision_id: decisionId,
        request_key: key, request_hash: hash, state: request.state,
        questions: request.questions, answers: result.answers,
        confidence: Object.fromEntries(Object.entries(result.answers).map(([name, answer]) => [name, answer.confidence])),
        route: result.route, latency_ms: result.latency_ms, cost_usd: result.cost_usd,
        authority: result.authority, trace_id: result.trace_id, state_hash: result.state_hash,
        verified: false, result: response, protocol_version: 1 };
    for (const [name, value] of Object.entries(values)) row.set(name, value);
    app.save(row);
    return response;
}
function decide(e) {
    const workspace = scope(e);
    const body = e.requestInfo().body;
    if (!policy.fields(body, ['state', 'questions', 'evidence', 'authority', 'trace_id'])
        || !own(body, 'state') || !object(body.questions)
        || !Object.keys(body.questions).length || Object.keys(body.questions).length > 32
        || canonical(body).length > 192000)
        policy.invalid('Supply bounded state and typed questions.');
    const authority = body.authority ?? 'A0';
    const traceId = body.trace_id ?? $security.randomString(32);
    if (!own(TIERS, authority) || typeof traceId !== 'string'
        || !/^[A-Za-z0-9_.:-]{1,128}$/.test(traceId)) policy.invalid('Invalid authority or trace identifier.');
    const request = { ...body, authority, trace_id: traceId };
    const cached = existing(e.app, workspace, e.auth.id, traceId);
    if (cached) {
        if (cached.getString('request_hash') !== $security.sha256(canonical(request)))
            throw new ApiError(409, 'This decision request key already identifies different input.');
        return policy.json(cached, 'result');
    }
    const result = local('decide', request);
    try {
        validateResult(result, request.questions, authority);
        if (result.trace_id !== traceId) throw new ApiError(502, 'The Python decision trace does not match.');
    } catch (error) { diagnose('decision.result', 'schema', 200); throw error; }
    let response;
    e.app.runInTransaction((app) => {
        // Membership may have changed while the local processor was running.
        policy.role(app, e.auth, workspace);
        response = save(app, e.auth, workspace, traceId, request, result,
            'decision-' + $security.sha256(workspace + ':' + e.auth.id + ':' + traceId));
    });
    // Source content, receipt IDs and fingerprints stay in the locked collection.
    try { require(`${__hooks}/telemetry.js`).decision(response.route, response.latency_ms, response.cost_usd); }
    catch (_) { /* Do not change the saved result. */ }
    return response;
}
function blueprint(e) {
    const workspace = scope(e);
    const body = e.requestInfo().body;
    if (!policy.fields(body, ['pdf_base64', 'name', 'authority', 'include_prompts'])
        || typeof body.pdf_base64 !== 'string' || body.pdf_base64.length > 27962028
        || typeof body.name !== 'string' || body.name.length > 180
        || !body.name.toLowerCase().endsWith('.pdf')
        || (body.authority !== undefined && body.authority !== 'A0')
        || (body.include_prompts !== undefined && typeof body.include_prompts !== 'boolean'))
        policy.invalid('Supply a PDF for A0 analysis.');
    const result = local('blueprint', { ...body, authority: 'A0' });
    try {
        if (result.verified !== false || result.authority !== 'A0' || !object(result.blueprint)
            || result.blueprint.verified !== false || result.blueprint.authority !== 'A0'
            || !Array.isArray(result.evaluations) || result.evaluations.length > 500
            || !object(result.component_graph) || result.component_graph.verified !== false
            || !Array.isArray(result.session_prompts))
            throw new ApiError(502, 'The blueprint result is invalid.');
        for (const evaluation of result.evaluations) {
            if (!object(evaluation.questions) || evaluation.blueprint_id !== result.blueprint.id
                || evaluation.source?.input_sha256 !== result.blueprint.input_sha256
                || !/^evaluation-[a-f0-9]{64}$/.test(evaluation.id))
                throw new ApiError(502, 'The blueprint evaluation provenance is invalid.');
            validateResult(evaluation.decision, evaluation.questions, 'A0');
        }
        if ((result.mission_plan && (result.mission_plan.verified !== false || result.mission_plan.authority !== 'A0'))
            || result.session_prompts.some((p) => p.verified !== false || p.authority !== 'A0' || p.review_required !== true))
            throw new ApiError(502, 'The blueprint plan authority is invalid.');
    } catch (error) { diagnose('decision.result', 'schema', 200); throw error; }
    e.app.runInTransaction((app) => {
        policy.role(app, e.auth, workspace);
        for (const evaluation of result.evaluations) {
            const request = { state: evaluation.state, questions: evaluation.questions, authority: 'A0', trace_id: evaluation.id };
            save(app, e.auth, workspace, evaluation.id, request, evaluation.decision, evaluation.id);
        }
    });
    return { ...result, workspace };
}
function detail(e) {
    const workspace = scope(e);
    const id = e.request.pathValue('decision');
    if (!/^(decision|evaluation)-[a-f0-9]{64}$/.test(id || '')) policy.invalid('Invalid decision identifier.');
    const row = e.app.findRecordsByFilter('workspace_decisions',
        'workspace = {:workspace} && owner = {:owner} && decision_id = {:id}', '', 1, 0,
        { workspace, owner: e.auth.id, id })[0];
    if (!row) throw new NotFoundError('This decision is unavailable.');
    return { ...policy.json(row, 'result'), state: policy.json(row, 'state'),
        questions: policy.json(row, 'questions'), outcome: policy.json(row, 'outcome') };
}

module.exports = { decide, blueprint, detail };
