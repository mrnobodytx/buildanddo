// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/telemetry.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     none
// EnumType:    Adapter
// EnumEdges:   PRODUCES buildanddo.telemetry; PRODUCES buildanddo.backend.failure
// DAG Node:    none
// Intent:      Keep backend request and cause observations bounded and content-free without changing application outcomes.
// ───────────────────────────────────────────────────────────────

// The JSVM loads CommonJS modules; this is not Node.js application code.
// Only stdout forwarding is opt-in. Cause diagnostics use the existing native
// logger; no request/body/error text is passed to it. No vendor transport exists.
const COLLECTIONS = [
    'missions',
    'workflows',
    'workflow_runs',
    'signals',
    'services',
    'operations',
    'operation_runs',
    'roadmap_items',
    'evidence',
    'daily_editions',
    'editions',
    'domains',
    'tutorial_progress',
    'support_sources',
    'specialist_desks',
    'corrections',
    'erp_objectives',
    'erp_tasks',
    'erp_contacts',
    'social_channels',
    'social_content',
    'workspaces',
    'users',
    'early_access',
    'workspace_members',
    'workspace_controls',
    'workspace_admin_events',
    'workspace_integrations',
    'workspace_decisions',
    'workspace_blueprints',
    'assistant_sessions',
    'assistant_turns',
    'assistant_patterns',
    'classroom_rooms',
    'classroom_members',
    'classroom_attendance',
    'classroom_media_sessions',
    'classroom_presence',
    'research_submissions',
    'suite_runs',
    'government_memberships',
    'wiki_pages',
    'forum_threads',
    'forum_posts',
    'seat_events',
];

// These are source-owned templates, never a request's route/pathValue or a
// replacement that leaves arbitrary path segments in a metric label.
const ROUTES = [
    '/api/health',
    '/api/ocn/login',
    '/api/ocn/health',
    '/api/buildanddo/onboarding',
    '/api/buildanddo/workflow-runs',
    '/api/buildanddo/workflow-runs/:id/decisions',
    '/api/buildanddo/career/profile',
    '/api/buildanddo/estate/fleet-status',
    '/api/buildanddo/dossier',
    '/api/buildanddo/dossier/read',
    '/api/buildanddo/learning',
    '/api/buildanddo/learning/states',
    '/api/buildanddo/learning/:id',
    ...[
        'access', 'admin', 'integrations', 'wiki', 'forums', 'forums/:id',
        'community', 'claims', 'operator', 'government', 'business', 'mission-replay/:id',
        'assistant', 'assistant/chat', 'assistant/knowledge', 'knowledge', 'knowledge/context',
        'classrooms', 'classrooms/:id', 'classrooms/:id/record', 'classrooms/:id/presence',
        'research', 'research/:id', 'research-worker', 'research-worker/queue',
        'discord-research', 'discord-research/upload', 'suite', 'discord-dossier',
        'decide', 'decisions/:id', 'blueprints', 'blueprints/analyze',
        'blueprints/:id', 'blueprints/:id/commands',
    ].map((suffix) => '/api/buildanddo/workspaces/:workspace/' + suffix),
    ...['session', 'tracks', 'renegotiate', 'close', 'health', 'presence', 'presence/health']
        .map((suffix) => '/api/classroom/' + suffix),
].map((template) => ({ template, pattern: new RegExp('^' + template.replace(/:[a-z]+/g, '[^/]+') + '/?$') }));
const OPERATIONS = [
    'assistant.infer', 'assistant.context', 'operator.snapshot', 'operator.integrations', 'knowledge.collect',
    'government.membership', 'classroom.presence.save', 'classroom.presence.sweep', 'classroom.presence.health',
    'classroom.media.schema', 'classroom.media.session', 'classroom.media.change',
    'classroom.realtime', 'classroom.realtime.echo', 'classroom.health',
    'decision.request', 'decision.result', 'career.profile', 'reach.contacts', 'mailer.send',
];
const CATEGORIES = ['config', 'upstream_status', 'parse', 'transport', 'schema'];
let writing = false;
let diagnosing = false;

function enabled() {
    try {
        return $os.getenv('BUILDANDDO_TELEMETRY_TRANSPORT') === 'stdout';
    } catch (_) {
        return false;
    }
}

function environment() {
    try {
        const value = $os.getenv('DD_ENV') || $os.getenv('NODE_ENV') || 'development';
        return ['production', 'staging', 'preview', 'development'].includes(value) ? value : 'other';
    } catch (_) { return 'other'; }
}

function stdout(envelope) {
    if (writing) return;
    try {
        if (!enabled()) return;
        writing = true;
        console.log(JSON.stringify(envelope));
    } catch (_) {
        /* Never log a logging failure, retry a send or change the application. */
    } finally { writing = false; }
}

function emit(metric, type, value, tags, context) {
    stdout({
        level: tags.status_code >= 500 || tags.error_status >= 500 ? 8 : tags.outcome === 'failure' ? 4 : 0,
        message: 'buildanddo.telemetry',
        data: { metric, type, value, tags: Object.assign({ env: environment() }, tags), context: context || {} },
    });
}

function statusCode(value) {
    return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0;
}

function diagnosticFields(operation, category, status, collection) {
    return {
        operation: OPERATIONS.includes(operation) ? operation : 'other',
        category: CATEGORIES.includes(category) ? category : 'unknown',
        status_code: statusCode(status),
        collection: COLLECTIONS.includes(collection) ? collection : 'other',
    };
}

/** Record a known failure category, never an exception or caller-supplied context. */
function diagnostic(operation, category, status, collection) {
    if (diagnosing) return;
    try {
        diagnosing = true;
        const data = diagnosticFields(operation, category, status, collection);
        $app.logger().error('buildanddo.backend.failure',
            'operation', data.operation, 'category', data.category,
            'status_code', data.status_code, 'collection', data.collection);
    } catch (_) {
        /* Missing/throwing loggers cannot replace the original result or error. */
    } finally { diagnosing = false; }
}

/** Forward only severity and a revalidated diagnostic envelope after native persistence. */
function forwardLog(model) {
    try {
        if (!enabled() || ['buildanddo.telemetry', 'buildanddo.forwarded', 'buildanddo.decision'].includes(model.message)) return;
        const data = { env: environment(), event: 'pocketbase.log' };
        if (model.message === 'buildanddo.backend.failure') {
            const raw = model.data.string();
            if (typeof raw === 'string' && raw.length <= 4096) {
                const fields = JSON.parse(raw);
                Object.assign(data, diagnosticFields(fields.operation, fields.category, fields.status_code, fields.collection));
                data.event = 'backend.failure';
            }
        }
        stdout({ level: [-4, 0, 4, 8].includes(model.level) ? model.level : 0, message: 'buildanddo.forwarded', data });
    } catch (_) { /* The original log remains in the database. */ }
}

/** Keep successful decision timings opt-in and omit receipt IDs and state fingerprints. */
function decision(route, latency, cost) {
    try {
        if (!Number.isFinite(latency) || latency < 0 || !Number.isFinite(cost) || cost < 0) return;
        const components = ['rules', 'local_reflex', 'frontier', 'abstain'];
        let label = components.includes(route) ? route : 'other';
        // DecisionRouter joins distinct backend names; never retain the joined input as a label.
        if (typeof route === 'string' && route.length <= 128 && route.startsWith('mixed(') && route.endsWith(')')) {
            const mixed = route.slice(6, -1).split(',');
            if (mixed.length >= 2 && mixed.length <= components.length && new Set(mixed).size === mixed.length &&
                mixed.every((component) => components.includes(component))) label = 'mixed';
        }
        stdout({ level: 0, message: 'buildanddo.decision', data: {
            env: environment(), route: label,
            latency_ms: latency, cost_usd: cost,
        } });
    } catch (_) { /* Do not change a saved decision. */ }
}

function record(event, operation, failed) {
    try {
        if (!enabled()) return;
        const collection = event.record.collection().name;
        if (!COLLECTIONS.includes(collection)) return;
        if (!['create', 'update', 'delete'].includes(operation)) return;
        const verb = { create: 'created', update: 'updated', delete: 'deleted' }[operation];
        emit(failed ? 'buildanddo.records.errors' : `buildanddo.records.${verb}`, 'count', 1, {
            collection,
            operation,
            outcome: failed ? 'failure' : 'success',
        });
    } catch (_) {
        /* Ignore unknown collections and incompatible event shapes. */
    }
}

function endpoint(path) {
    const clean = typeof path === 'string' && path.length <= 8192 ? path.split(/[?#]/, 1)[0] : '';
    const match = /^\/api\/collections\/([^/]+)\/records(\/[^/]+)?\/?$/.exec(clean);
    if (match) {
        const collection = COLLECTIONS.includes(match[1]) ? match[1] : 'other';
        return { collection, endpoint: '/api/collections/' + (collection === 'other' ? ':collection' : collection)
            + '/records' + (match[2] ? '/:id' : '') };
    }
    const route = ROUTES.find((entry) => entry.pattern.test(clean));
    if (route) return { collection: route.template.startsWith('/api/buildanddo/workflow-runs') ? 'workflow_runs' : 'other', endpoint: route.template };
    const family = ['/api/buildanddo', '/api/classroom', '/api/collections'].find((prefix) => clean === prefix || clean.startsWith(prefix + '/'));
    return { collection: 'other', endpoint: (family || '') + '/:other' };
}

function traceContext(request) {
    const context = {};
    try {
        const parent = request.header.get('traceparent');
        const match = /^00-([a-f0-9]{32})-([a-f0-9]{16})-[a-f0-9]{2}$/i.exec(parent || '');
        if (match && !/^0+$/.test(match[1]) && !/^0+$/.test(match[2])) {
            context.trace_id = match[1];
            context.span_id = match[2];
        }
    } catch (_) {
        /* Trace correlation is optional and never a metric tag. */
    }
    return context;
}

function observeRequest(event) {
    if (!enabled()) return event.next();
    let tags = { collection: 'other', endpoint: '/:other', method: 'OTHER' };
    let started = 0;
    try {
        started = Date.now();
        tags = Object.assign(endpoint(event.request.url.path), {
            method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'].includes(event.request.method)
                ? event.request.method : 'OTHER',
        });
    } catch (_) { /* Retain a bounded fallback for uninspectable requests. */ }
    let failed = false;
    let errorStatus = 0;
    try {
        return event.next();
    } catch (error) {
        failed = true;
        // JS-thrown API errors and Goja's native GoError wrapper have distinct
        // shapes. A generic JS error is mapped by the outer native handler, not
        // necessarily to 500. Retain an unknown status until one is observed.
        try { errorStatus = statusCode(error?.status) || statusCode(error?.value?.status); }
        catch (_) { /* No exception inspection is required to rethrow it. */ }
        throw error;
    } finally {
        let status = 0, written = false, context = {};
        // Inspect response state only; never wrap e.json or inspect its payload.
        try { status = statusCode(event.status()); written = event.written(); } catch (_) { /* Unknown is not success. */ }
        if (failed && !(written && status)) status = errorStatus;
        try { context = traceContext(event.request); } catch (_) { /* Optional. */ }
        try {
            emit(
                'buildanddo.request.duration_ms',
                'distribution',
                started ? Math.max(0, Date.now() - started) : 0,
                Object.assign(tags, {
                    status_code: status,
                    error_status: errorStatus,
                    outcome: failed || status >= 400 ? 'failure' : status ? 'success' : 'unknown',
                }),
                context,
            );
        } catch (_) {
            /* Retain the downstream result even if inspection fails. */
        }
    }
}

module.exports = { record, observeRequest, diagnostic, forwardLog, decision };
