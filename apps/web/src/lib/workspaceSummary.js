// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workspaceSummary.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js
// DAG Node:    none
// Intent:      Keep summaries consistent without promoting historical reports into verified corrections or provider-confirmed revenue.
// ───────────────────────────────────────────────────────────────

/** @param {Array<object>} records Missions. @returns {Array<object>} Active missions. */
export function activeMissions(records) {
    return records.filter((record) =>
        ['approved', 'running', 'needs_attention'].includes(record.status),
    );
}

/** @param {Array<object>} records Evidence. @returns {Array<object>} Records marked verified. */
export function verifiedEvidence(records) {
    return records.filter((record) => record.type === 'verified');
}

/** @param {string} value Record timestamp. @param {Date} now Local clock. @returns {boolean} Same local day. */
export function isToday(value, now = new Date()) {
    if (!value) return false;
    const date = new Date(value);
    return (
        Number.isFinite(date.getTime()) && date <= now && date.toDateString() === now.toDateString()
    );
}

/** @param {Array<object>} records Editions. @param {Date} now Clock. @returns {object|null} Latest published edition. */
export function latestPublishedEdition(records, now = new Date()) {
    const date = (record) => new Date(record.published_at).getTime();
    return (
        records
            .filter(
                (record) =>
                    record.status === 'published' &&
                    Number.isSafeInteger(record.claim_revision) && record.claim_revision > 0 &&
                    typeof record.published_by === 'string' && record.published_by.trim() &&
                    typeof record.published_at === 'string' && record.published_at.trim() &&
                    Number.isFinite(date(record)) &&
                    date(record) <= now.getTime(),
            )
            .sort((a, b) => date(b) - date(a))[0] || null
    );
}

/** @returns {Array<object>} No verified corrections until a real review authority is bound. */
export function verifiedCorrections() {
    // Preserve old labels in their source records, not as verified home previews.
    return [];
}

/** @returns {boolean} No provider-confirmed revenue without an installed trusted ingestor. */
export function hasReportedRevenue() {
    // Legacy amounts and sync labels are historical reports, never metrics.
    return false;
}

/** @param {number} amount Reported amount. @param {string} currency ISO currency. @returns {string} Display amount. */
export function reportedMoney(amount, currency) {
    if (
        typeof amount !== 'number' ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        !/^[A-Z]{3}$/.test(currency || '')
    )
        return 'Not reported';
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** @param {string} value Record timestamp. @returns {string} Timestamp with an explicit unknown state. */
export function recordTimestamp(value) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not recorded';
}
