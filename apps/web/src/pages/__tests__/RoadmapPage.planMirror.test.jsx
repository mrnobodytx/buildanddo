// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/RoadmapPage.planMirror.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/pages/RoadmapPage.jsx,
//              scripts/ci/sprint_cycle.py
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/RoadmapPage.jsx;
//              VALIDATES scripts/ci/sprint_cycle.py
// Intent:      The JSX fallback plan and the canonical Python plan must stay
//              mirrored (same days, same planned values, same titles up to
//              punctuation) and every fallback entry must start `planned`,
//              so the page can never promote a milestone on its own.
// ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { PLANNED_MILESTONES } from '@/pages/RoadmapPage';

// vitest runs from apps/web (package.json "test"); jsdom gives import.meta.url
// an http scheme, so the repo root is resolved from the working directory.
const SPRINT_CYCLE = resolve(process.cwd(), '../../scripts/ci/sprint_cycle.py');

// Titles differ only in typography between the two files ("—" vs "-", "&" vs
// "and"); the comparison collapses those so a real wording change still fails.
const normaliseTitle = (t) => t
    .replace(/[—–-]/g, ' ')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function pythonPlan() {
    const source = readFileSync(SPRINT_CYCLE, 'utf-8');
    const block = source.match(/MILESTONES: list\[dict\] = \[([\s\S]*?)\n\]/);
    expect(block, 'MILESTONES block in sprint_cycle.py').toBeTruthy();
    const rows = [...block[1].matchAll(/\{"day": (\d+), "title": "([^"]+)", "planned_value": (\d+)\}/g)];
    return rows.map(([, day, title, value]) => ({ day: Number(day), title, value: Number(value) }));
}

describe('sprint plan mirror', () => {
    it('sprint_cycle.py and RoadmapPage.jsx list the same milestones', () => {
        const canonical = pythonPlan();
        expect(canonical).toHaveLength(11);
        expect(PLANNED_MILESTONES).toHaveLength(canonical.length);
        canonical.forEach((c, i) => {
            const m = PLANNED_MILESTONES[i];
            expect(m.day, `day at index ${i}`).toBe(c.day);
            expect(m.value, `planned value for day ${c.day}`).toBe(c.value);
            expect(normaliseTitle(m.title), `title for day ${c.day}`).toBe(normaliseTitle(c.title));
        });
    });

    it('every fallback entry starts planned and the curve is monotonic to 100', () => {
        let previous = 0;
        for (const m of PLANNED_MILESTONES) {
            expect(m.status).toBe('planned');
            expect(m.value).toBeGreaterThan(previous);
            previous = m.value;
        }
        expect(previous).toBe(100);
    });

    it('keeps the plan copy on the learning-by-doing purpose', () => {
        const text = JSON.stringify(PLANNED_MILESTONES).toLowerCase();
        for (const retired of ['firecrawl', 'n8n', 'erp foundation']) {
            expect(text, `plan copy still mentions "${retired}"`).not.toContain(retired);
        }
    });
});
