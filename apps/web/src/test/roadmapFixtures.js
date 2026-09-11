// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/test/roadmapFixtures.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     scripts/deploy/roadmap_status.py (shape of the `progression` block)
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/roadmapStatus.js
// Intent:      One roadmap-status.json fixture, shaped exactly like the
//              projection roadmap_status.py writes, shared by every test that
//              quotes progression so the tests cannot drift from the file.
// ───────────────────────────────────────────────────────────────

export const CONTRACT = 'f569b6e3f259769fd8d7b3e5f487049c4f43d513381c21ca18f11217bbc9ab44';

export const progressionFixture = (overrides = {}) => ({
    state: 'MEASURED',
    reason: null,
    source_state: 'DEGRADED',
    owner: 'Citadel Development Continuity + repository bridge',
    campaign_id: 'citadel-21-day-2026-09',
    day: 11,
    total_days: 21,
    current_date: '2026-09-11',
    generated_at: '2026-09-11T06:00:00+00:00',
    calendar_pct: 42.9,
    measured_pct: 56.8,
    full_pct: 32.1,
    pace: 'AT_RISK',
    criteria_to_date: 37,
    criteria_total: 78,
    verified_to_date: 21,
    verified_total: 25,
    due_holds: 0,
    next_hard_milestone: { title: 'AI Tinkerers - Contextual Guildmaster', date: '2026-09-12', days_until: 1, past: false },
    current_focus: { day: 11, title: 'Workflows editor', state: 'UNMEASURED' },
    day_index_rule: 'Operator-declared sprint index. Day 8 is anchored to 2026-09-08 and increments by local calendar day.',
    window_start: '2026-09-03',
    window_end: '2026-09-30',
    source_title: 'Citadel Nexus - 21-Day Build, Compete & Compound Strategy v4',
    planned_pct: 50,
    plan_day: 9,
    day_source: 'canonical',
    day_disagreement: true,
    day_anchor: {
        plan_window_start: '2026-09-03', canonical_anchor_day: 8, canonical_anchor_date: '2026-09-08', anchor_rule_day: 11,
        window_start: '2026-09-03', window_end: '2026-09-30', hostinger_deadline: '2026-09-24', rule: 'Day 8 is anchored to 2026-09-08.', state: 'MEASURED', reason: null,
    },
    freshness: 'FRESH',
    stale_days: 0,
    measurement_contract: CONTRACT,
    baseline_epoch: '2026-09-11T06:00:00+00:00',
    ...overrides,
});

export const statusFixture = (progression = progressionFixture(), overrides = {}) => ({
    state: 'MEASURED',
    sprint_day: 9,
    plan_day: 9,
    sprint_days: 21,
    planned_pct: 40,
    verified_pct: 20,
    actual_pct: 20,
    milestones: [],
    progression,
    ...overrides,
});
