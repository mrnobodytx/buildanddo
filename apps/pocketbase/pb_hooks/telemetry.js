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
// Depends:     apps/pocketbase/pb_hooks/logs-forwarder.pb.js
// EnumType:    Adapter
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/logs-forwarder.pb.js
// DAG Node:    none
// Intent:      Emit bounded opt-in PocketBase metrics without blocking on a remote transport.
// ───────────────────────────────────────────────────────────────

// The JSVM loads CommonJS modules; this is not Node.js application code.
// Structured stdout follows the envelope used by logs-forwarder.pb.js. There
// is no network call, timer, database write or dependency on a host credential.
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
    'corrections',
    'erp_objectives',
    'erp_tasks',
    'erp_contacts',
    'social_channels',
    'social_content',
    'workspaces',
];

function enabled() {
    try {
        return $os.getenv('BUILDANDDO_TELEMETRY_TRANSPORT') === 'stdout';
    } catch (_) {
        return false;
    }
}

function environment() {
    const value = $os.getenv('DD_ENV') || $os.getenv('NODE_ENV') || 'development';
    return ['production', 'staging', 'preview', 'development'].includes(value) ? value : 'other';
}

function emit(metric, type, value, tags, context) {
    try {
        if (!enabled()) return;
        console.log(
            JSON.stringify({
                level: 0,
                message: 'buildanddo.telemetry',
                data: {
                    metric,
                    type,
                    value,
                    tags: Object.assign({ env: environment() }, tags),
                    context: context || {},
                },
            }),
        );
    } catch (_) {
        /* Telemetry cannot change a write or its error. */
    }
}

function record(event, operation, failed) {
    try {
        if (!enabled()) return;
        const collection = event.record.collection().name;
        if (!COLLECTIONS.includes(collection)) return;
        const verb = { create: 'created', update: 'updated', delete: 'deleted' }[operation];
        if (!verb) return;
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
    if (/^\/api\/buildanddo\/workflow-runs\/?$/.test(path || '')) {
        return { collection: 'workflow_runs', endpoint: '/api/buildanddo/workflow-runs' };
    }
    if (/^\/api\/buildanddo\/workflow-runs\/[^/]+\/decisions\/?$/.test(path || '')) {
        return { collection: 'workflow_runs', endpoint: '/api/buildanddo/workflow-runs/:id/decisions' };
    }
    const match = /^\/api\/collections\/([^/]+)\/records(\/[^/]+)?\/?$/.exec(path || '');
    if (!match || !COLLECTIONS.includes(match[1])) return null;
    return {
        collection: match[1],
        endpoint: `/api/collections/${match[1]}/records${match[2] ? '/:id' : ''}`,
    };
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
    let tags;
    try {
        tags = endpoint(event.request.url.path);
        if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(event.request.method)) tags = null;
    } catch (_) {
        tags = null;
    }
    if (!tags) return event.next();
    const started = Date.now();
    let failed = false;
    try {
        return event.next();
    } catch (error) {
        failed = true;
        throw error;
    } finally {
        try {
            emit(
                'buildanddo.request.duration_ms',
                'distribution',
                Math.max(0, Date.now() - started),
                Object.assign(tags, {
                    method: event.request.method,
                    outcome: failed ? 'failure' : 'success',
                }),
                traceContext(event.request),
            );
        } catch (_) {
            /* Retain the downstream result even if inspection fails. */
        }
    }
}

module.exports = { record, observeRequest };
