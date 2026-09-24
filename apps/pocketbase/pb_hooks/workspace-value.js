// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-value.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/mission-policy.js, apps/pocketbase/pb_hooks/business-actions.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/mission-policy.js; CONSUMES apps/pocketbase/pb_hooks/business-actions.js
// Intent:      Project retained mission review and readable action lineage into value facts without creating verification or exposing source bodies.
// ───────────────────────────────────────────────────────────────

const access = require(__hooks + '/workspace-access.js');
const missions = require(__hooks + '/mission-policy.js');
const business = require(__hooks + '/business-actions.js');
const snapshotFields = ['workspace', 'mission', 'owner', 'type', 'title', 'source', 'content', 'url', 'created', 'updated'];
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const stamp = (value) => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value.replace(' ', 'T')) : NaN;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const present = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;

function actions(e, mission) {
    try {
        // Reuse the owner of locked job visibility, including linked-record denial.
        const rows = business.missionHistory(e.app, e, mission.getString('workspace'), mission.id);
        return { state: 'available', has_more: rows.length > 20, items: rows.slice(0, 20).map((row) => {
            const result = row.result?.reported;
            const measured = result && hash(row.result_sha256) &&
                row.result.records?.evidence === row.evidence && result.status === row.status &&
                $security.sha256(access.canonical(result)) === row.result_sha256 &&
                Number.isFinite(stamp(result.observed_at)) && stamp(result.observed_at) <= Date.now();
            const release = row.release_context;
            return { id: row.id, run: row.run, provider: row.provider, status: row.status, evidence: row.evidence,
                state: measured ? 'OBSERVED' : 'UNMEASURED', result_sha256: measured ? row.result_sha256 : '',
                observed_at: measured ? result.observed_at : '', receipt_ref: 'business_jobs/' + row.id + '#result',
                release: release && /^[a-f0-9]{40}$/.test(release.candidate_sha) &&
                    ['staging', 'production', 'fixture'].includes(release.environment)
                    ? { candidate_sha: release.candidate_sha, environment: release.environment } : null };
        }) };
    } catch {
        // Missing schema, incomplete history and unreadable links do not mean zero actions.
        return { state: 'unavailable', has_more: false, items: [] };
    }
}

/** Read the native review decision and its exact evidence; never perform verification. */
function outcome(e, mission) {
    const plan = access.json(mission, 'mission_plan', {});
    const result = { state: 'UNMEASURED', reviewed_at: '', reviewer: '', independent: false, evidence: [],
        required_authority: ['A0', 'A1', 'A2'].includes(plan?.risk) ? plan.risk : null, actions: actions(e, mission) };
    if (mission.getString('status') !== 'verified') return result;
    const review = access.json(mission, 'mission_review', {});
    const reviewer = mission.getString('mission_reviewed_by');
    const reviewedAt = mission.getString('mission_reviewed_at');
    if (!id(reviewer) || !Number.isFinite(stamp(reviewedAt)) || stamp(reviewedAt) > Date.now() ||
        review?.version !== 1 || !present(review.reflection, 1200) ||
        !Array.isArray(review.evidence_snapshot) || !review.evidence_snapshot.length || review.evidence_snapshot.length > 4 ||
        !missions.TEVV.every((key) => review[key]?.outcome === 'pass' && present(review[key]?.observation, 1200) && id(review[key]?.evidence)))
        return result;
    const selected = [...new Set(missions.TEVV.map((key) => review[key].evidence))];
    if (!review.evidence_snapshot.every((item) => item && id(item.id)) ||
        new Set(review.evidence_snapshot.map((item) => item.id)).size !== selected.length ||
        review.evidence_snapshot.length !== selected.length || review.evidence_snapshot.some((item) => !selected.includes(item.id)))
        return result;
    let conflicting = false;
    const evidence = [];
    try {
        for (const saved of review.evidence_snapshot) {
            const current = access.find(e.app, 'evidence', saved.id);
            if (current.getString('workspace') !== mission.getString('workspace') ||
                current.getString('mission') !== mission.id) return result;
            access.readable(e.app, current, e.requestInfo());
            if (snapshotFields.some((key) => typeof saved[key] !== 'string' || saved[key] !== current.getString(key)) ||
                !present(saved.source, 6000) || !present(saved.content, 100000) ||
                !Number.isFinite(stamp(saved.updated)) || stamp(saved.updated) > stamp(reviewedAt))
                conflicting = true;
            evidence.push({ id: current.id, owner: current.getString('owner'), source_ref: 'evidence/' + current.id,
                observed_at: current.getString('updated') });
        }
    } catch { return result; }
    const separate = Boolean(mission.getString('owner')) && reviewer !== mission.getString('owner') &&
        evidence.every((item) => item.owner && item.owner !== reviewer);
    if (plan?.independent_review === true && !separate) conflicting = true;
    return { ...result, state: conflicting ? 'CONFLICTING' : 'VERIFIED', reviewed_at: reviewedAt, reviewer,
        independent: !conflicting && plan?.independent_review === true && separate, evidence };
}

module.exports = { outcome };
