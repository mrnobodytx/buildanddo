// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/mutations.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/lib/observability/config.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Adapter
// EnumEdges:   DEPENDS_ON apps/web/src/lib/observability/config.js; CONSUMES apps/web/src/lib/navigationIntent.js
// DAG Node:    none
// Intent:      Measure successful and failed workspace writes once at the actual mutation boundary.
// ───────────────────────────────────────────────────────────────

import pb from '@/lib/pocketbaseClient';
import { trackEvent } from '@/lib/telemetry';
import { MUTATION_ACTIONS } from '@/lib/observability/config';
import { reportAction, reportMetric } from '@/lib/observability/runtime';
import { telemetrySection } from '@/lib/navigationIntent';

function mutationOutcome(value, rejected, collection, verb) {
    const failed = rejected || value?.ok === false;
    // Successful SDK results do not carry an HTTP status; do not invent one.
    const status = failed ? value?.status : undefined;
    const status_class = status === 0 ? 'network' : Number.isInteger(status) && status >= 100 && status < 600
        ? `${Math.floor(status / 100)}xx` : 'unknown';
    const result = (outcome, reason) => ({ outcome, reason, status_class });
    if (failed) {
        const reason = value?.reason;
        if (reason === 'scope_changed' || !rejected && value?.stale === true) return result('scope_changed', 'scope_changed');
        if (rejected && (value?.isAbort === true || value?.name === 'AbortError') || reason === 'cancelled') return result('cancelled', 'cancelled');
        if ([401, 403].includes(status) || reason === 'forbidden') return result('forbidden', 'forbidden');
        if (status === 409 || reason === 'conflict') return result('conflict', 'conflict');
        if (reason === 'invalid_receipt') return result('uncertain', 'invalid_receipt');
        if (status === 0) return result('uncertain', 'network');
        if (Number.isInteger(status) && status >= 500 && status < 600) return result('uncertain', 'server_error');
        if (reason === 'uncertain' || reason === 'upload_uncertain' || rejected && status_class === 'unknown') return result('uncertain', 'unconfirmed');
        if (status === 429) return result('failure', 'rate_limited');
        if (status === 400 || reason === 'invalid') return result('failure', 'invalid');
        return result('failure', ['unavailable', 'busy', 'write_failed'].includes(reason) ? reason : 'rejected');
    }
    // A saved unavailable chat turn is not a successful inference. Do not apply
    // record-state semantics to CRUD: saving a failed task can itself succeed.
    if (collection === 'assistant_sessions' && verb === 'chat') {
        if (value?.data?.status === 'unavailable') return result('failure', 'unavailable');
        if (value?.data?.status === 'pending') return result('uncertain', 'pending');
    }
    return result('success', 'confirmed');
}

/** Measure a validated operation without changing its result or rejection.
 * Receipt and lifetime checks belong inside operation, before it resolves.
 */
export async function observeMutation(collection, verb, operation) {
    const action = typeof collection === 'string' && typeof verb === 'string' && Object.hasOwn(MUTATION_ACTIONS, collection) &&
        Object.hasOwn(MUTATION_ACTIONS[collection], verb) ? MUTATION_ACTIONS[collection][verb] : null;
    let section = '/unknown', started;
    try { section = telemetrySection(globalThis.window?.location?.pathname); } catch { /* Never expose the raw location. */ }
    try { started = performance.now(); } catch { /* Timing is optional. */ }
    let outcome = { outcome: 'uncertain', reason: 'unconfirmed', status_class: 'unknown' };
    try {
        const result = await operation();
        try { outcome = mutationOutcome(result, false, collection, verb); } catch { /* An unreadable result is not confirmation. */ }
        return result;
    } catch (error) {
        try { outcome = mutationOutcome(error, true, collection, verb); } catch { /* Preserve even opaque rejections. */ }
        throw error;
    } finally {
        if (action) {
            const context = { collection, operation: verb, section, ...outcome };
            let duration;
            try {
                const finished = performance.now();
                if (Number.isFinite(started) && Number.isFinite(finished)) duration = Math.max(0, finished - started);
            } catch { /* Missing timing must not suppress either action sink. */ }
            try {
                Promise.resolve(reportAction(action, { ...context })).catch(() => {});
            } catch {
                /* Preserve the mutation result. */
            }
            try {
                Promise.resolve(trackEvent(action, { ...context })).catch(() => {});
            } catch {
                /* Product analytics is best-effort too. */
            }
            try {
                if (Number.isFinite(duration)) {
                    Promise.resolve(reportMetric('workspace.mutation.duration', duration, {
                        unit: 'millisecond',
                        tags: { ...context },
                    })).catch(() => {});
                }
            } catch {
                /* A collector failure must not affect the caller. */
            }
        }
    }
}

/** Wrap direct workspace collection writes with the same instrumentation as hooks. */
export function workspaceCollection(collection) {
    const client = pb.collection(collection);
    return {
        create: (...args) => observeMutation(collection, 'create', () => client.create(...args)),
        update: (...args) => observeMutation(collection, 'update', () => client.update(...args)),
        delete: (...args) => observeMutation(collection, 'delete', () => client.delete(...args)),
    };
}
