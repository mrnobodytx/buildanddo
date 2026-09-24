// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workspaceValue.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/workspace-value.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-value.js
// Intent:      Give every dashboard lens the same scoped measurements, lineage and explicit economic gaps.
// ───────────────────────────────────────────────────────────────

const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const text = (value, max = 240) => typeof value === 'string' && value.length <= max;
const keys = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key));
const stamp = (value) => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value.replace(' ', 'T')) : NaN;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

/** Validate the optional projection; old snapshots remain readable without measured outcomes. */
export function valueSummaryShape(value) {
    if (!keys(value, ['state', 'reviewed_at', 'reviewer', 'independent', 'evidence', 'required_authority', 'actions']) ||
        !['UNMEASURED', 'VERIFIED', 'CONFLICTING'].includes(value.state) || !text(value.reviewed_at, 80) ||
        !text(value.reviewer, 64) || typeof value.independent !== 'boolean' ||
        ![null, 'A0', 'A1', 'A2'].includes(value.required_authority) ||
        !Array.isArray(value.evidence) || value.evidence.length > 4 ||
        !value.evidence.every((row) => keys(row, ['id', 'owner', 'source_ref', 'observed_at']) && id(row.id) &&
            text(row.owner, 64) && row.source_ref === 'evidence/' + row.id && text(row.observed_at, 80)) ||
        new Set(value.evidence.map((row) => row.id)).size !== value.evidence.length) return false;
    if (value.state === 'VERIFIED' && (!id(value.reviewer) || !Number.isFinite(stamp(value.reviewed_at)) ||
        !value.evidence.length || value.evidence.some((row) => !Number.isFinite(stamp(row.observed_at)) ||
            stamp(row.observed_at) > stamp(value.reviewed_at)))) return false;
    if (value.independent && (value.state !== 'VERIFIED' || value.evidence.some((row) => !row.owner || row.owner === value.reviewer))) return false;
    const actions = value.actions;
    return Boolean(keys(actions, ['state', 'has_more', 'items']) && ['available', 'unavailable'].includes(actions.state) &&
        typeof actions.has_more === 'boolean' && Array.isArray(actions.items) && actions.items.length <= 20 &&
        (actions.state !== 'unavailable' || !actions.items.length && !actions.has_more) &&
        new Set(actions.items.map((row) => row?.id)).size === actions.items.length &&
        actions.items.every((row) => keys(row, ['id', 'run', 'provider', 'status', 'evidence', 'state', 'result_sha256', 'observed_at', 'receipt_ref', 'release']) &&
            id(row.id) && text(row.run, 64) && text(row.provider, 64) && text(row.status, 64) && text(row.evidence, 64) &&
            ['OBSERVED', 'UNMEASURED'].includes(row.state) && text(row.result_sha256, 64) && text(row.observed_at, 80) &&
            (row.state !== 'OBSERVED' || hash(row.result_sha256) && Number.isFinite(stamp(row.observed_at))) &&
            row.receipt_ref === 'business_jobs/' + row.id + '#result' &&
            (row.release === null || keys(row.release, ['candidate_sha', 'environment']) &&
                /^[a-f0-9]{40}$/.test(row.release.candidate_sha) && ['staging', 'production', 'fixture'].includes(row.release.environment))));
}

const unknown = (id, title, benefit, missing) => ({ id, title, benefit, value: null,
    display: 'Not yet measured', state: 'UNMEASURED', missing, outcome_ids: [] });

/** Project one month's visible outcomes; lens selection never changes the underlying facts. */
export function projectWorkspaceValue(snapshot, operator, now = Date.now()) {
    if (!snapshot || !operator || !Number.isFinite(now) || !id(snapshot.workspace) ||
        operator.observed_at !== snapshot.observed_at || !Number.isFinite(stamp(snapshot.observed_at)))
        throw new TypeError('Use a scoped operator snapshot.');
    const date = new Date(now);
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    const source = snapshot.sources.missions;
    if (!source || !['available', 'unavailable'].includes(source.state) ||
        !Array.isArray(source.items) || source.items.length > 20 ||
        !Number.isInteger(source.page) || source.page < 1 || typeof source.has_more !== 'boolean' ||
        !source.items.every((row) => row && id(row.id) && row.workspace === snapshot.workspace) ||
        new Set(source.items.map((row) => row.id)).size !== source.items.length)
        throw new TypeError('Use one bounded workspace source.');
    const rows = source.state === 'available' ? source.items : [];
    const outcomes = rows.map((row) => {
        if (row.value !== undefined && !valueSummaryShape(row.value)) throw new TypeError('Invalid value lineage.');
        return {
            id: row.id, title: row.title || row.id, owner: row.owner, mission_state: row.status,
            state: row.value?.state || 'UNMEASURED', reviewed_at: row.value?.reviewed_at || '',
            reviewer: row.value?.reviewer || '', independent: row.value?.independent || false,
            required_authority: row.value?.required_authority ?? null, canonical_identity: null,
            evidence: row.value?.evidence || [],
            actions: row.value?.actions || { state: 'unavailable', has_more: false, items: [] },
            href: '/app/missions?mission=' + encodeURIComponent(row.id),
        };
    });
    const reviewed = outcomes.filter((row) => row.mission_state === 'verified' && row.state === 'VERIFIED' &&
        stamp(row.reviewed_at) >= start && stamp(row.reviewed_at) <= now);
    const unresolved = outcomes.filter((row) => row.mission_state === 'verified' &&
        (row.state !== 'VERIFIED' || !Number.isFinite(stamp(row.reviewed_at)) || stamp(row.reviewed_at) > now));
    const partial = source.has_more || source.page > 1 || unresolved.length > 0;
    const elapsed = now - stamp(snapshot.observed_at);
    const freshness = elapsed < 0 ? 'future' : elapsed > 900000 ? 'stale' : 'current';
    const measurable = freshness === 'current' && source.state === 'available' && (!partial || reviewed.length > 0);
    const verified = {
        id: 'verified', title: 'Work verified', benefit: 'Outcomes backed by retained review.',
        value: measurable ? reviewed.length : null,
        independent: measurable ? reviewed.filter((row) => row.independent).length : null,
        display: !measurable ? 'Not yet measured' : partial ? 'At least ' + reviewed.length : String(reviewed.length),
        state: !measurable ? 'UNMEASURED' : partial ? 'PARTIAL' : 'OBSERVED',
        missing: !measurable ? ['A current readable mission sample with complete retained reviews.'] :
            partial ? ['Complete visible-source coverage and resolution of incomplete reviews.'] : [],
        outcome_ids: reviewed.map((row) => row.id),
    };
    const metrics = [
        unknown('value', 'Value created', 'Make the return on this work visible.',
            ['Attributable revenue or avoided cost, currency, measurement period and independent outcome evidence.']),
        unknown('hours', 'Hours returned', 'Reduce manual effort.',
            ['Measured before-and-after effort for the same work, including review and recovery time.']),
        verified,
        unknown('risk', 'Risk prevented', 'Avoid recovery and business disruption.',
            ['A recorded intervention and evidence of the failure or loss it prevented; holds alone are insufficient.']),
        unknown('automation', 'Automation rate', 'Handle repeat work with fewer manual steps.',
            ['An owner-defined complete eligible-work denominator and measured automatic completions for the same period.']),
    ];
    const next = operator.human_decisions[0] || operator.work_queue[0] || null;
    return freeze({
        workspace: snapshot.workspace, observed_at: snapshot.observed_at, freshness,
        period: { from: new Date(start).toISOString(), to: new Date(now).toISOString(), label: 'This month (UTC)' },
        coverage: partial || source.state !== 'available' ? 'PARTIAL' : 'VISIBLE_SAMPLE',
        metrics, outcomes, next_action: next,
        gaps: ['Economic value and system cost are unmeasured.', 'Semantic identity mappings and ecosystem coverage are unmeasured.',
            'Authority ceilings and any A0–A5 progression model need their canonical owner.',
            'Provider observations and release references do not establish a verified deployment or exercised rollback.'],
        authorized: false,
    });
}
