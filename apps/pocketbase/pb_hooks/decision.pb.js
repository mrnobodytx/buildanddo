// ─── CGRF Header ──────────────────────────────
// File:        apps/pocketbase/pb_hooks/decision.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-DECISION-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DECISION-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/workflow-policy.js, apps/decision/contract.py
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js; USES_TEMPLATE apps/decision/contract.py
// DAG Node:    none
// Intent:      Expose the typed decision contract to authenticated workspace members without granting action or verification authority.
// ───────────────────────────────────────────────────────────

// PocketBase hook callbacks run in isolated JSVM scopes, so the complete
// dependency-free Phase 1 adapter stays inside the registered callback.
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/decide', (e) => {
    const policy = require(`${__hooks}/workflow-policy.js`);
    const started = Date.now();
    const authorityOrder = { A0: 0, A1: 1, A2: 2, A3: 3 };
    const thresholds = { noul: 0.75, choice: 0.70, score: 0.65, rank: 0.70, select_many: 0.70, extract: 0.80 };

    function object(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }
    function hasOwn(value, key) {
        return Object.prototype.hasOwnProperty.call(value, key);
    }
    function exact(value, names) {
        if (!object(value) || Object.keys(value).length !== names.length ||
            !Object.keys(value).every((name) => names.includes(name)))
            policy.invalid('Question fields do not match the selected type.');
    }
    function name(value) {
        if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value))
            policy.invalid('Use safe question names.');
        return value;
    }
    function strings(value, minimum) {
        if (!Array.isArray(value) || value.length < minimum || value.length > 64 ||
            value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 160 || /[\u0000-\u001f]/.test(item)) ||
            new Set(value).size !== value.length)
            policy.invalid('Question options must be unique bounded text.');
        return value.slice();
    }
    function finite(value) {
        return typeof value === 'number' && Number.isFinite(value);
    }
    function canonical(value, depth) {
        if (depth > 10) policy.invalid('Decision input nesting is too deep.');
        if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
        if (finite(value)) return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
        if (object(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
        policy.invalid('Decision input must contain JSON-compatible values.');
    }
    function question(value) {
        if (!object(value) || typeof value.type !== 'string') policy.invalid('Each question needs a type.');
        if (value.type === 'noul') exact(value, ['type']);
        else if (value.type === 'choice') { exact(value, ['type', 'options']); value.options = strings(value.options, 2); }
        else if (value.type === 'score') {
            exact(value, ['type', 'min', 'max']);
            if (!finite(value.min) || !finite(value.max) || value.min >= value.max) policy.invalid('Score bounds are invalid.');
        } else if (value.type === 'rank') {
            exact(value, ['type', 'candidates', 'top_k']); value.candidates = strings(value.candidates, 1);
            if (!Number.isSafeInteger(value.top_k) || value.top_k < 1 || value.top_k > value.candidates.length)
                policy.invalid('Rank top_k is invalid.');
        } else if (value.type === 'select_many') { exact(value, ['type', 'options']); value.options = strings(value.options, 1); }
        else if (value.type === 'extract') {
            exact(value, ['type', 'schema']);
            if (!object(value.schema) || !Object.keys(value.schema).length) policy.invalid('Extract schema must be a non-empty object.');
            canonical(value.schema, 0);
        } else policy.invalid('Question type is not supported.');
        return value;
    }
    function probabilities(labels, selected, peak) {
        const rest = labels.length > 1 ? (1 - peak) / (labels.length - 1) : 0;
        return Object.fromEntries(labels.map((label) => [label, label === selected ? peak : rest]));
    }
    function normalized(spec, value, confidence, route, probabilityMap) {
        const answer = { value, confidence, abstained: false };
        if (spec.type === 'noul') {
            if (typeof value !== 'boolean') policy.invalid('Noul answers must be boolean.');
            answer.probability = probabilityMap ?? confidence;
        } else if (spec.type === 'choice') {
            if (!spec.options.includes(value)) policy.invalid('Choice answer is not an option.');
            answer.probabilities = probabilityMap || probabilities(spec.options, value, confidence);
        } else if (spec.type === 'score') {
            if (!finite(value) || value < spec.min || value > spec.max) policy.invalid('Score answer is outside its bounds.');
            answer.probability = probabilityMap ?? confidence;
        } else if (spec.type === 'rank') {
            if (!Array.isArray(value) || !value.length || value.length > spec.top_k || new Set(value).size !== value.length || value.some((item) => !spec.candidates.includes(item)))
                policy.invalid('Rank answer is invalid.');
            answer.probabilities = probabilityMap || Object.fromEntries(spec.candidates.map((item, index) => [item, Math.max(0.05, confidence - index * 0.12)]));
        } else if (spec.type === 'select_many') {
            if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((item) => !spec.options.includes(item)))
                policy.invalid('SelectMany answer is invalid.');
            answer.probabilities = probabilityMap || Object.fromEntries(spec.options.map((item) => [item, value.includes(item) ? confidence : 1 - confidence]));
        } else {
            if (!object(value)) policy.invalid('Extract answer must be an object.');
            answer.probability = probabilityMap ?? confidence;
        }
        return { answer, confidence, route };
    }
    function workloadRule(key, state, spec) {
        if (!object(state)) return null;
        if (object(state.answers) && hasOwn(state.answers, key)) return normalized(spec, state.answers[key], 1, 'rules');
        const source = canonical(state, 0).toLowerCase();
        const keyword = (mapping) => {
            for (const [value, words] of Object.entries(mapping)) if (words.some((word) => source.includes(word)))
                return normalized(spec, value, 1, 'rules');
            return null;
        };
        if (key === 'challenge') return keyword({ customer_support: ['support', 'ticket'], operations: ['outage', 'workflow'], product: ['feature', 'feedback'], knowledge: ['documentation', 'how do'] });
        if (key === 'issue_type') return keyword({ tool_issue: ['tool failed', 'timeout', 'exception'], knowledge_gap: ['how do', 'documentation'], product_feedback: ['feature request', 'feedback'], support: ['billing', 'help me'] });
        if (key === 'tool') return keyword({ workspace_history: ['previous work', 'already tried'], evidence_search: ['evidence', 'claim'], status_check: ['status', 'outage'], documentation: ['docs', 'how do'] });
        if (key === 'urgency') {
            if (['security', 'outage', 'data loss', 'unsafe'].some((word) => source.includes(word))) return normalized(spec, 9.5, 1, 'rules');
            if (['cosmetic', 'nice to have', 'typo'].some((word) => source.includes(word))) return normalized(spec, 2, 1, 'rules');
        }
        if (key === 'should_act') {
            if (state.evidence_count === 0) return normalized(spec, false, 1, 'rules', 0.98);
            if (Number.isSafeInteger(state.evidence_count) && state.evidence_count >= 2 && state.contradicted === false) return normalized(spec, true, 1, 'rules', 0.92);
            if (state.contradicted === true) return normalized(spec, false, 1, 'rules', 0.9);
        }
        if (key === 'support' && Number.isSafeInteger(state.supporting_sources) && state.supporting_sources >= 0 && Number.isSafeInteger(state.contradicting_sources) && state.contradicting_sources >= 0) {
            const total = state.supporting_sources + state.contradicting_sources;
            return normalized(spec, total ? state.supporting_sources / total : 0, 1, 'rules', 1);
        }
        return null;
    }
    function classifier(spec, state) {
        const confidence = spec.type === 'choice' ? Math.max(0.45, 1 / spec.options.length) : spec.type === 'score' || spec.type === 'select_many' ? 0.5 : spec.type === 'rank' ? 0.55 : 0.4;
        if (spec.type === 'noul') return normalized(spec, false, confidence, 'local_reflex', 0.5);
        if (spec.type === 'choice') return normalized(spec, spec.options[0], confidence, 'local_reflex', probabilities(spec.options, spec.options[0], confidence));
        if (spec.type === 'score') return normalized(spec, (spec.min + spec.max) / 2, confidence, 'local_reflex', 0.5);
        if (spec.type === 'rank') return normalized(spec, spec.candidates.slice(0, spec.top_k), confidence, 'local_reflex');
        if (spec.type === 'select_many') return normalized(spec, [], confidence, 'local_reflex', Object.fromEntries(spec.options.map((item) => [item, 0.4])));
        const fields = object(spec.schema.properties) && object(state) ? Object.fromEntries(Object.keys(spec.schema.properties).filter((key) => hasOwn(state, key)).map((key) => [key, state[key]])) : {};
        return normalized(spec, fields, Object.keys(fields).length ? 0.6 : confidence, 'local_reflex', 0.4);
    }
    function frontier(spec) {
        const confidence = 0.84;
        if (spec.type === 'noul') return normalized(spec, false, confidence, 'frontier', 0.2);
        if (spec.type === 'choice') return normalized(spec, spec.options[0], confidence, 'frontier', probabilities(spec.options, spec.options[0], confidence));
        if (spec.type === 'score') return normalized(spec, (spec.min + spec.max) / 2, confidence, 'frontier', confidence);
        if (spec.type === 'rank') return normalized(spec, spec.candidates.slice(0, spec.top_k), confidence, 'frontier');
        if (spec.type === 'select_many') return normalized(spec, spec.options.slice(0, 1), confidence, 'frontier');
        return normalized(spec, Object.fromEntries(Object.keys(spec.schema.properties || {}).map((key) => [key, null])), confidence, 'frontier', confidence);
    }

    policy.authenticated(e);
    const workspace = e.request.pathValue('workspace');
    if (typeof workspace !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(workspace)) policy.invalid('Select a valid workspace.');
    policy.role(e.app, e.auth, workspace);
    const body = e.requestInfo().body;
    if (!policy.fields(body, ['state', 'questions', 'evidence', 'authority', 'trace_id']) || !hasOwn(body, 'state') || !object(body.questions))
        policy.invalid('Supply state and a typed question set.');
    const state = body.state;
    if (!(typeof state === 'string' && state.trim() && state.length <= 2048 && !/[\u0000-\u001f]/.test(state)) && !object(state))
        policy.invalid('State must be an inline object or bounded state reference.');
    const stateCanonical = canonical(typeof state === 'string' ? { state_ref: state } : state, 0);
    if (stateCanonical.length > 128000) policy.invalid('Decision state is too large.');
    const authority = body.authority ?? 'A0';
    if (!hasOwn(authorityOrder, authority)) policy.invalid('Authority must be A0, A1, A2 or A3.');
    if (body.evidence !== undefined && typeof body.evidence !== 'boolean') policy.invalid('Evidence must be boolean.');
    const traceId = body.trace_id ?? $security.randomString(32);
    if (typeof traceId !== 'string' || !traceId.trim() || traceId.length > 128 || /\s/.test(traceId)) policy.invalid('Trace identifier is invalid.');
    const entries = Object.entries(body.questions);
    if (!entries.length || entries.length > 32) policy.invalid('Supply one to 32 questions.');
    const answers = {};
    const routes = {};
    let cost = 0;
    let actual = 0;
    for (const [key, value] of entries) {
        name(key);
        const spec = question(value);
        let result = workloadRule(key, state, spec) || classifier(spec, state);
        if (result.confidence < thresholds[spec.type] && authorityOrder[authority] >= authorityOrder.A1) {
            result = frontier(spec);
            cost += 0.001;
            actual = Math.max(actual, authorityOrder.A1);
        }
        if (result.confidence < thresholds[spec.type]) {
            result.answer = { value: null, confidence: result.confidence, probability: result.confidence, abstained: true };
            result.route = 'abstain';
        }
        answers[key] = result.answer;
        routes[key] = result.route;
    }
    const distinct = [...new Set(Object.values(routes))];
    const route = distinct.length === 1 ? distinct[0] : `mixed(${distinct.join(',')})`;
    let evidenceRefs = [];
    if (body.evidence === true && object(state) && state.evidence_refs !== undefined) {
        if (!Array.isArray(state.evidence_refs) || state.evidence_refs.length > 64 || state.evidence_refs.some((item) => typeof item !== 'string' || !item.trim() || item.length > 512))
            policy.invalid('Evidence references must be bounded strings.');
        evidenceRefs = [...new Set(state.evidence_refs)];
    }
    const result = {
        answers,
        route,
        latency_ms: Math.max(0, Date.now() - started),
        cost_usd: cost,
        evidence_refs: evidenceRefs,
        authority: Object.keys(authorityOrder).find((key) => authorityOrder[key] === actual),
        verified: false,
        trace_id: traceId,
        state_hash: $security.sha256(stateCanonical),
    };
    try {
        console.log(JSON.stringify({
            level: 0,
            message: 'buildanddo.decision',
            data: {
                state_hash: result.state_hash,
                questions: body.questions,
                prediction: answers,
                confidence: Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, answer.confidence])),
                route,
                latency_ms: result.latency_ms,
                cost_usd: cost,
                outcome: null,
                verification: null,
                human_correction: null,
            },
        }));
    } catch (_) {
        /* Decision logging cannot change the response. */
    }
    return e.json(200, result);
}, $apis.requireAuth());
