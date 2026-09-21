// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/lib/dailyDigest.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/hooks/useWorkspaceRecords.js
// EnumType:     Adapter
// EnumEdges:    DEPENDS_ON apps/web/src/hooks/useWorkspaceRecords.js
// DAG Node:     none
// Intent:       Keep failed observations and unknown review dates from becoming false daily operational conclusions.
// ───────────────────────────────────────────────────────────────

/** Derive a digest only from readable sources and actual review timestamps.
 * @param {object} missions Mission source state.
 * @param {object} signals Signal source state.
 * @param {Date} now Observation time.
 * @returns {object} Source availability and dated priorities/outcomes.
 */
export function dailyDigest(missions, signals, now = new Date()) {
    const unavailable = ['missions', 'signals'].filter((name) => ({ missions, signals })[name].degraded);
    const loading = Boolean(missions.loading || signals.loading);
    const result = { loading, unavailable, priorities: [], completed: [], blockers: [], undated: 0 };
    if (loading || unavailable.length) return result;
    const rank = (m) => ({ urgent: 0, high: 1, normal: 2, low: 3 })[m.priority] ?? 2;
    const overdue = (m) => Number(Boolean(m.due_date) && Date.parse(m.due_date) < now.getTime());
    result.priorities = missions.records.filter((m) => !['verified', 'failed'].includes(m.status))
        .sort((a, b) => overdue(b) - overdue(a) || rank(a) - rank(b)).slice(0, 5);
    result.completed = missions.records.filter((m) => {
        if (m.status !== 'verified') return false;
        const date = new Date(m.mission_reviewed_at);
        if (!m.mission_reviewed_at || !Number.isFinite(date.getTime()) || date > now) { result.undated++; return false; }
        return date.toDateString() === now.toDateString();
    });
    result.blockers = missions.records.filter((m) => ['needs_attention', 'failed'].includes(m.status))
        .map((m) => ({ id: m.id, label: m.title, detail: m.status === 'failed' ? 'Mission failed' : 'Mission needs attention' }))
        .concat(signals.records.filter((s) => (s.state || 'new') === 'new' && ['critical', 'high'].includes(s.severity))
            .sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'))
            .map((s) => ({ id: s.id, label: s.title, detail: `Untriaged ${s.severity} signal` })));
    return result;
}
