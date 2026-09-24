// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/evidenceInspection.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/pocketbase/pb_hooks/mission-policy.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/mission-policy.js
// Intent:      Expose actual evidence and its frozen review provenance without promoting a typed label to verification.
// ───────────────────────────────────────────────────────────────

/** Allow only navigable public web schemes without credentials.
 * @param {unknown} value Saved source reference.
 * @returns {string} Safe URL or an empty string for an inert reference.
 */
export function safeEvidenceUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
}
const evidenceFields = ['id', 'workspace', 'mission', 'owner', 'type', 'title', 'source', 'content', 'url', 'created', 'updated'];
/** Join one readable record to the exact evidence retained by its mission review.
 * @param {object} record Readable evidence.
 * @param {object[]} missions Readable mission records.
 * @param {string} workspace Current scope.
 * @returns {object} Observation and review provenance with an explicit integrity state.
 */
export function inspectEvidence(record, missions, workspace) {
    if (!workspace || !record?.id || record.workspace !== workspace) throw new Error('Evidence is outside the current workspace.');
    const mission = missions.find((row) => row.id === record.mission && row.workspace === workspace);
    let review = mission?.mission_review;
    if (typeof review === 'string') { try { review = JSON.parse(review); } catch { review = null; } }
    const snapshot = mission?.status === 'verified' && Array.isArray(review?.evidence_snapshot)
        ? review.evidence_snapshot.find((row) => row?.id === record.id && row.workspace === workspace && row.mission === mission.id) : null;
    const equal = snapshot && evidenceFields.every((field) => (snapshot[field] || '') === (record[field] || ''));
    return { record: Object.fromEntries(evidenceFields.map((key) => [key, record[key] || ''])),
        mission: mission ? { id: mission.id, title: mission.title, status: mission.status } : null,
        review: snapshot ? { reviewer: mission.mission_reviewed_by || '', at: mission.mission_reviewed_at || '',
            independent_required: mission.mission_plan?.independent_review === true, snapshot } : null,
        integrity: snapshot ? (equal ? 'matches_review' : 'changed_since_review') : 'no_retained_review' };
}

/** Download a user-requested observation export without transmitting its contents.
 * @param {object} value Export payload.
 * @param {string} filename Local download name.
 * @returns {void}
 */
export function downloadObservation(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
