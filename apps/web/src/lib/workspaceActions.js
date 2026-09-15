// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workspaceActions.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/runtime.js,
//              apps/web/src/lib/telemetry.js
// EnumType:    Adapter
// EnumEdges:   PRODUCES datadog.rum.action;
//              CONSUMES apps/web/src/lib/observability/runtime.js;
//              CONSUMES apps/web/src/lib/telemetry.js
// Intent:      One named vocabulary for workspace interactions, so a product
//              question can be answered from RUM without reading the React tree.
// ───────────────────────────────────────────────────────────────

import { reportAction } from '@/lib/observability/runtime';
import { trackEvent } from '@/lib/telemetry';

/**
 * The closed set of workspace interactions worth measuring.
 *
 * Closed on purpose. An open `trackWorkspaceAction(anything)` produces a RUM
 * facet whose values drift with every page edit, and a dashboard built on it
 * silently stops matching. Adding an action here is a deliberate act.
 */
// CRUD action names and outcomes are owned by observability/config.js and
// emitted by observeMutation. This vocabulary is for non-mutation UI actions.
export const WORKSPACE_ACTIONS = Object.freeze({
    QUICK_ACTION: 'workspace.quick_action',
    DEMO_MODE_TOGGLED: 'workspace.demo_mode.toggled',
});

const KNOWN = new Set(Object.values(WORKSPACE_ACTIONS));

/**
 * Records a workspace interaction against the RUM session and PostHog.
 *
 * Best-effort by contract: an unreachable collector must never affect the
 * interaction the user just performed, so nothing here throws and nothing here
 * returns a value the caller is expected to check.
 *
 * @param {string} action One of {@link WORKSPACE_ACTIONS}.
 * @param {object} [context] Flat attribute bag. Must carry no record content —
 *   identifiers, enum values and counts only.
 * @returns {void}
 */
export function trackWorkspaceAction(action, context = {}) {
	if (!KNOWN.has(action)) return;
	try {
		reportAction(action, context);
		trackEvent(action, context);
	} catch {
		// Telemetry is never allowed to break the interaction it observes.
	}
}
