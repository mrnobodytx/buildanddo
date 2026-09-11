// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/milestoneA11y.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     -
// EnumType:    Lib
// EnumEdges:   CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx
// Intent:      Pure helpers for the milestone markers: the accessible label
//              every marker announces, the DOM ids the ledger and chart share,
//              and the arrow-key walk between milestones.
// ───────────────────────────────────────────────────────────────

const STATUS_WORD = {
    proposed: 'proposed',
    planned: 'planned',
    in_progress: 'in progress',
    blocked: 'blocked',
    verified: 'verified',
    archived: 'archived',
};

/**
 * @param {string} status Milestone status key.
 * @returns {string} Human wording for the status.
 */
export function statusWord(status) {
    return STATUS_WORD[status] || String(status || 'unknown').replace(/_/g, ' ');
}

/**
 * Accessible name for a marker: "Day 9: Missions — bounded-action engine — planned".
 *
 * @param {{day:number,title:string,status:string}} m Milestone.
 * @returns {string} The aria-label.
 */
export function milestoneLabel(m) {
    return `Day ${m.day}: ${m.title} — ${statusWord(m.status)}`;
}

/**
 * @param {number} day Sprint day.
 * @returns {string} DOM id of the ledger entry for that day.
 */
export function ledgerId(day) {
    return `milestone-day-${day}`;
}

/**
 * @param {number} day Sprint day.
 * @returns {string} DOM id of the chart marker for that day.
 */
export function markerId(day) {
    return `milestone-marker-${day}`;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Which milestone an arrow/Home/End key moves to.
 *
 * @param {string} key KeyboardEvent.key.
 * @param {number[]} days Milestone days in chart order.
 * @param {number} currentDay The day whose marker has focus.
 * @returns {number|null} The target day, or null when the key is not a
 *          navigation key.
 */
export function dayForKey(key, days, currentDay) {
    if (!days.length) return null;
    const idx = days.indexOf(currentDay);
    if (key === 'Home') return days[0];
    if (key === 'End') return days[days.length - 1];
    if (NEXT_KEYS.has(key)) return days[Math.min(days.length - 1, idx + 1)];
    if (PREV_KEYS.has(key)) return days[Math.max(0, idx - 1)];
    return null;
}
