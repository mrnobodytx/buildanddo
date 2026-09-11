// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/roadmapStatus.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/lib/roadmapStatus.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/roadmapStatus.js
// Intent:      progressionOf says UNMEASURED for nothing, STALE for old,
//              MEASURED for fresh, flags a contract change, and never
//              combines axes. dayLabel prints D09 / 21 and D-- for unknown.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';

import { progressionOf, dayLabel, shortContract, PROGRESSION_STALE_AFTER_MS } from '@/lib/roadmapStatus';
import { CONTRACT, progressionFixture, statusFixture } from '@/test/roadmapFixtures';

const NOW = Date.parse('2026-09-11T12:00:00Z');

describe('dayLabel', () => {
    it('prints the day zero-padded over the total', () => {
        expect(dayLabel(9, 21)).toBe('D09 / 21');
        expect(dayLabel(11)).toBe('D11 / 21');
    });
    it('prints D-- for an unknown day, because unknown is not zero', () => {
        expect(dayLabel(null)).toBe('D-- / 21');
        expect(dayLabel(undefined, 21)).toBe('D-- / 21');
        expect(dayLabel(NaN)).toBe('D-- / 21');
    });
});

describe('progressionOf', () => {
    it('is UNMEASURED with no numbers when the status is null or carries no block', () => {
        for (const status of [null, undefined, {}, { state: 'UNMEASURED' }]) {
            const p = progressionOf(status, { now: NOW });
            expect(p.state).toBe('UNMEASURED');
            expect(p.measuredPct).toBeNull();
            expect(p.calendarPct).toBeNull();
            expect(p.day).toBeNull();
            expect(p.reason).toBe('PROGRESSION_ABSENT');
        }
    });

    it('is UNMEASURED with the estate reason when the block says so, keeping plan facts', () => {
        const p = progressionOf(statusFixture({ state: 'UNMEASURED', reason: 'PROGRESSION_FILE_ABSENT', plan_day: 9, planned_pct: 40, day_source: 'calendar' }), { now: NOW });
        expect(p.state).toBe('UNMEASURED');
        expect(p.reason).toBe('PROGRESSION_FILE_ABSENT');
        expect(p.measuredPct).toBeNull();
        expect(p.planDay).toBe(9);
        expect(p.plannedPct).toBe(40);
        expect(p.verifiedPct).toBe(20); // milestone evidence is a separate axis, still known
    });

    it('is MEASURED when fresh and keeps every axis separate', () => {
        const p = progressionOf(statusFixture(), { now: NOW });
        expect(p.state).toBe('MEASURED');
        expect(p.freshness).toBe('FRESH');
        expect(p.day).toBe(11);
        expect(p.planDay).toBe(9);
        expect(p.dayDisagreement).toBe(true);
        expect(p.calendarPct).toBe(42.9);
        expect(p.plannedPct).toBe(50);
        expect(p.measuredPct).toBe(56.8);
        expect(p.verifiedPct).toBe(20);
        expect(p.fullPct).toBe(32.1);
        expect(p.pace).toBe('AT_RISK');
        expect(p.nextHardMilestone.daysUntil).toBe(1);
        expect(p.dayAnchor.anchorDay).toBe(8);
        expect(p.dayAnchor.anchorRuleDay).toBe(11);
        expect(p.contractShort).toBe(CONTRACT.slice(0, 12));
        expect(p.contractChanged).toBeNull();
        const axes = new Set([p.calendarPct, p.plannedPct, p.measuredPct, p.verifiedPct, p.fullPct]);
        expect(axes.size).toBe(5);
    });

    it('is STALE when observed more than 48h ago, numbers still quoted', () => {
        const p = progressionOf(statusFixture(progressionFixture({ generated_at: '2026-09-08T06:00:00+00:00' })), { now: NOW });
        expect(p.state).toBe('STALE');
        expect(p.measuredPct).toBe(56.8);
        expect(p.ageMs).toBeGreaterThan(PROGRESSION_STALE_AFTER_MS);
    });

    it('is STALE when the estate projection is two or more days behind the build', () => {
        const p = progressionOf(statusFixture(progressionFixture({ freshness: 'STALE', stale_days: 2, day_source: 'calendar', current_date: '2026-09-09', day: 9, day_disagreement: false })), { now: NOW });
        expect(p.state).toBe('STALE');
        expect(p.freshness).toBe('STALE');
        expect(p.staleDays).toBe(2);
        expect(p.day).toBe(9);
        expect(p.daySource).toBe('calendar');
    });

    it('stays MEASURED when one day behind but recently observed, with the build label kept', () => {
        const p = progressionOf(statusFixture(progressionFixture({ freshness: 'STALE', stale_days: 1 })), { now: NOW });
        expect(p.state).toBe('MEASURED');
        expect(p.freshness).toBe('STALE');
        expect(p.staleDays).toBe(1);
    });

    it('flags a measurement-contract change without touching the numbers', () => {
        const same = progressionOf(statusFixture(), { now: NOW, knownContract: CONTRACT });
        expect(same.contractChanged).toBe(false);
        const changed = progressionOf(statusFixture(progressionFixture({ measurement_contract: 'a'.repeat(64) })), { now: NOW, knownContract: CONTRACT });
        expect(changed.contractChanged).toBe(true);
        expect(changed.measuredPct).toBe(same.measuredPct);
        expect(changed.state).toBe('MEASURED');
    });

    it('treats a measured block without numbers as a schema mismatch, not zero', () => {
        const p = progressionOf(statusFixture(progressionFixture({ measured_pct: '56.8' })), { now: NOW });
        expect(p.state).toBe('UNMEASURED');
        expect(p.reason).toBe('PROGRESSION_SCHEMA_MISMATCH');
        expect(p.measuredPct).toBeNull();
    });
});

describe('shortContract', () => {
    it('shortens a hex hash and rejects anything else', () => {
        expect(shortContract(CONTRACT)).toBe(CONTRACT.slice(0, 12));
        expect(shortContract('nope')).toBeNull();
        expect(shortContract(null)).toBeNull();
    });
});
