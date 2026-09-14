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
// Depends:     apps/web/src/lib/observability/config.js
// EnumType:    Adapter
// EnumEdges:   DEPENDS_ON apps/web/src/lib/observability/config.js
// DAG Node:    none
// Intent:      Measure successful and failed workspace writes once at the actual mutation boundary.
// ───────────────────────────────────────────────────────────────

import pb from '@/lib/pocketbaseClient';
import { trackEvent } from '@/lib/telemetry';
import { MUTATION_ACTIONS } from '@/lib/observability/config';
import { reportAction, reportMetric } from '@/lib/observability/runtime';

/** Measure a real mutation without changing its result or rejection. */
export async function observeMutation(collection, verb, operation) {
    const action = MUTATION_ACTIONS[collection]?.[verb];
    const started = performance.now();
    let outcome = 'failure';
    try {
        const result = await operation();
        outcome = 'success';
        return result;
    } finally {
        if (action) {
            const duration = Math.max(0, performance.now() - started);
            const context = { collection, operation: verb, outcome };
            try {
                reportAction(action, context);
            } catch {
                /* Preserve the mutation result. */
            }
            try {
                trackEvent(action, context);
            } catch {
                /* Product analytics is best-effort too. */
            }
            try {
                reportMetric('workspace.mutation.duration', duration, {
                    unit: 'millisecond',
                    tags: context,
                });
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
