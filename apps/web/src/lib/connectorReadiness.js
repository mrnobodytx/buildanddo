// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/connectorReadiness.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/pocketbase/pb_hooks/workspace-administration.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-administration.js
// Intent:      Explain current connection prerequisites before an operator requests a bounded effect.
// ───────────────────────────────────────────────────────────────

/** Explain whether a configured connection currently has a usable observation.
 * @param {object|null} item Observed integration view.
 * @param {number} now Current time in milliseconds.
 * @returns {{ready: boolean, reason: string}} Advisory readiness; server checks remain authoritative.
 */
export function connectorReadiness(item, now = Date.now()) {
    if (!item?.id || !item.configuration?.binding) return { ready: false, reason: 'Configure a registered connection first.' };
    if (!item.desired_enabled) return { ready: false, reason: 'This connection is disabled.' };
    const mode = item.provider === 'firecrawl' ? 'read' : 'reviewed_run';
    if (item.configuration.mode !== mode) return { ready: false, reason: 'This connection does not allow the requested operation.' };
    const observation = item.observation;
    const age = now - Date.parse(observation?.at);
    if (!observation?.current || !observation.receipt_ref || !Number.isFinite(age) || age < 0 || age > 900_000)
        return { ready: false, reason: 'Request a fresh health check for the current configuration.' };
    if (observation.state !== 'healthy') return { ready: false, reason: `The latest health check reports ${observation.state || 'an unknown state'}.` };
    return { ready: true, reason: 'A current healthy observation is available. The server rechecks it before dispatch.' };
}
