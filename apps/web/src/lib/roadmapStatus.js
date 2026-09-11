// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/roadmapStatus.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001, SRS-BUILDANDDO-SIGNALS-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/public/roadmap-status.json
// EnumType:    Lib
// EnumEdges:   CONSUMES apps/web/public/roadmap-status.json;
//              CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx;
//              CONSUMED_BY apps/web/src/pages/HomePage.jsx;
//              CONSUMED_BY apps/web/src/components/site/Header.jsx;
//              CONSUMED_BY apps/web/src/components/roadmap/ProgressionPanel.jsx
// Intent:      One fetch for the sprint projection so every surface that
//              quotes it (roadmap page, home pulse, header chip) reads the
//              same file the same way and fails soft the same way. The
//              progression normaliser keeps every axis separate and says
//              UNMEASURED or STALE rather than inventing a number.
// ───────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

export const ROADMAP_STATUS_URL = '/roadmap-status.json';

// A projection observed more than two days ago is quoted, but as STALE.
export const PROGRESSION_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/**
 * Fetches the sprint projection. Rejects on any non-2xx or network error so
 * callers decide what "unknown" looks like on their surface.
 *
 * @returns {Promise<object>} Parsed roadmap-status.json.
 */
export function fetchRoadmapStatus() {
    return fetch(ROADMAP_STATUS_URL, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))));
}

/**
 * Reads the projection once on mount.
 *
 * @returns {{status: object|null, error: boolean}} `status` is null until the
 *          fetch resolves; `error` is true when it failed (and stays null).
 */
export function useRoadmapStatus() {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchRoadmapStatus()
            .then((data) => { if (!cancelled) setStatus(data); })
            .catch(() => { if (!cancelled) setError(true); });
        return () => { cancelled = true; };
    }, []);

    return { status, error };
}

/**
 * Signals state as the header chip reports it. Anything other than a
 * projection that says MEASURED is UNMEASURED - there is no third word.
 *
 * @param {object|null} status Parsed roadmap-status.json.
 * @returns {'MEASURED'|'UNMEASURED'} The state.
 */
export function signalsStateOf(status) {
    return status?.signals_state === 'MEASURED' && status?.signals ? 'MEASURED' : 'UNMEASURED';
}

/**
 * "D09 / 21" - the sprint day as the page prints it. An unknown day prints
 * "D-- / 21" rather than D00, because unknown is not zero.
 *
 * @param {number|null|undefined} day 1-based sprint day.
 * @param {number} [total=21] Days in the sprint.
 * @returns {string} The label.
 */
export function dayLabel(day, total = 21) {
    const n = Number.isFinite(total) ? total : 21;
    if (!Number.isFinite(day)) return `D-- / ${n}`;
    return `D${String(Math.trunc(day)).padStart(2, '0')} / ${n}`;
}

/**
 * The first 12 hex characters of a measurement-contract hash, for display.
 *
 * @param {string|null|undefined} hash Full sha256 hex.
 * @returns {string|null} Short form, or null when there is no hash.
 */
export function shortContract(hash) {
    return typeof hash === 'string' && /^[0-9a-f]{16,}$/i.test(hash) ? hash.slice(0, 12) : null;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Normalises the `progression` block of roadmap-status.json for rendering.
 *
 * Every axis stays its own field - calendar, plan, measured, milestone
 * evidence, full campaign - and nothing here combines them. The state is one
 * of three words:
 *
 *   UNMEASURED  no block, or the estate said it measured nothing. No numbers.
 *   STALE       measured, but observed more than 48h ago (or the estate's own
 *               current_date is two or more days behind the build). Numbers
 *               are still returned, labelled.
 *   MEASURED    measured and recent.
 *
 * `contractChanged` is null unless a `knownContract` is passed; when it is,
 * true means the estate's rule text changed since that hash, so a moved
 * number is a contract change, not progression.
 *
 * @param {object|null} status Parsed roadmap-status.json.
 * @param {{knownContract?: string|null, now?: number}} [options]
 * @returns {object} The normalised progression.
 */
export function progressionOf(status, options = {}) {
    const { knownContract = null, now = Date.now() } = options;
    const p = status?.progression;
    const topMeasured = Boolean(status) && status.state !== 'UNMEASURED';
    const verifiedPct = topMeasured ? num(status.verified_pct ?? status.actual_pct) : null;
    const planDay = num(p?.plan_day ?? (topMeasured ? status.plan_day ?? status.sprint_day : null));
    const anchor = p?.day_anchor && typeof p.day_anchor === 'object' ? p.day_anchor : null;
    const dayAnchor = anchor ? {
        state: str(anchor.state) || 'UNMEASURED',
        planWindowStart: str(anchor.plan_window_start),
        anchorDay: num(anchor.canonical_anchor_day),
        anchorDate: str(anchor.canonical_anchor_date),
        anchorRuleDay: num(anchor.anchor_rule_day),
        windowStart: str(anchor.window_start),
        windowEnd: str(anchor.window_end),
        hostingerDeadline: str(anchor.hostinger_deadline),
        rule: str(anchor.rule),
    } : null;
    const contract = str(p?.measurement_contract);
    const base = {
        state: 'UNMEASURED',
        reason: str(p?.reason) || (p ? 'NO_MEASUREMENT' : 'PROGRESSION_ABSENT'),
        owner: str(p?.owner) || 'Citadel Development Continuity + repository bridge',
        campaignId: str(p?.campaign_id),
        day: null,
        totalDays: num(p?.total_days) ?? num(status?.sprint_days) ?? 21,
        currentDate: null,
        observedAt: null,
        ageMs: null,
        calendarPct: null,
        measuredPct: null,
        fullPct: null,
        plannedPct: num(p?.planned_pct) ?? (topMeasured ? num(status.planned_pct) : null),
        verifiedPct,
        pace: null,
        criteriaToDate: null,
        criteriaTotal: null,
        verifiedToDate: null,
        verifiedTotal: null,
        dueHolds: null,
        nextHardMilestone: null,
        currentFocus: null,
        dayIndexRule: null,
        windowStart: null,
        windowEnd: null,
        sourceTitle: null,
        planDay,
        daySource: str(p?.day_source) || 'calendar',
        dayDisagreement: null,
        dayAnchor,
        freshness: 'UNMEASURED',
        staleDays: null,
        measurementContract: contract,
        contractShort: shortContract(contract),
        baselineEpoch: str(p?.baseline_epoch),
        contractChanged: knownContract && contract ? knownContract !== contract : null,
    };
    if (!p || p.state !== 'MEASURED') return base;

    const measuredPct = num(p.measured_pct);
    const day = num(p.day);
    if (measuredPct === null || day === null) return { ...base, reason: 'PROGRESSION_SCHEMA_MISMATCH' };

    const observed = str(p.generated_at) ? new Date(p.generated_at) : null;
    const observedMs = observed && !Number.isNaN(observed.getTime()) ? observed.getTime() : null;
    const ageMs = observedMs === null ? null : Math.max(0, now - observedMs);
    const staleDays = num(p.stale_days);
    const buildFresh = p.freshness === 'FRESH';
    const stale = (ageMs !== null && ageMs > PROGRESSION_STALE_AFTER_MS) || (staleDays !== null && staleDays >= 2);
    const nextHard = p.next_hard_milestone && typeof p.next_hard_milestone === 'object' ? p.next_hard_milestone : null;
    const focus = p.current_focus && typeof p.current_focus === 'object' ? p.current_focus : null;

    return {
        ...base,
        state: stale ? 'STALE' : 'MEASURED',
        reason: null,
        day,
        currentDate: str(p.current_date),
        observedAt: observedMs === null ? null : observed.toISOString(),
        ageMs,
        calendarPct: num(p.calendar_pct),
        measuredPct,
        fullPct: num(p.full_pct),
        pace: str(p.pace),
        criteriaToDate: num(p.criteria_to_date),
        criteriaTotal: num(p.criteria_total),
        verifiedToDate: num(p.verified_to_date),
        verifiedTotal: num(p.verified_total),
        dueHolds: num(p.due_holds),
        nextHardMilestone: nextHard ? {
            title: str(nextHard.title),
            date: str(nextHard.date),
            daysUntil: num(nextHard.days_until),
            past: typeof nextHard.past === 'boolean' ? nextHard.past : null,
        } : null,
        currentFocus: focus ? { day: num(focus.day), title: str(focus.title), state: str(focus.state) } : null,
        dayIndexRule: str(p.day_index_rule),
        windowStart: str(p.window_start),
        windowEnd: str(p.window_end),
        sourceTitle: str(p.source_title),
        dayDisagreement: typeof p.day_disagreement === 'boolean' ? p.day_disagreement : (planDay !== null ? planDay !== day : null),
        freshness: buildFresh ? 'FRESH' : 'STALE',
        staleDays: buildFresh ? 0 : staleDays,
    };
}
