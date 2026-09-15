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
// Intent:      Keep home and workspace summaries consistent without inventing outcomes or combining revenue sources.
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
    const date = (record) => new Date(record.edition_date || record.created).getTime();
    return (
        records
            .filter(
                (record) =>
                    record.status === 'published' &&
                    Number.isFinite(date(record)) &&
                    date(record) <= now.getTime(),
            )
            .sort((a, b) => date(b) - date(a))[0] || null
    );
}

/** @param {Array<object>} records Corrections. @returns {Array<object>} Complete verified comparisons. */
export function verifiedCorrections(records) {
    return records.filter(
        (record) =>
            record.status === 'verified' &&
            record.prior_prediction?.trim() &&
            record.observed_result?.trim(),
    );
}

/** @param {object} record Support source. @param {Date} now Clock. @returns {boolean} Has reported amounts. */
export function hasReportedRevenue(record, now = new Date()) {
    if (typeof record.last_sync !== 'string' || !record.last_sync.trim()) return false;
    const sync = new Date(record.last_sync).getTime();
    return (
        ['connected', 'syncing', 'healthy', 'degraded', 'error'].includes(record.status) &&
        Number.isFinite(sync) &&
        sync <= now.getTime() &&
        typeof record.gross === 'number' &&
        Number.isFinite(record.gross) &&
        record.gross >= 0 &&
        /^[A-Z]{3}$/.test(record.currency || '')
    );
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
