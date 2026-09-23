// ─── CGRF Header ──────────────────────────────
// File:        tests/upgrade/journey.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-JOURNEY-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-JOURNEY-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/journey.js, apps/pocketbase/pb_migrations/data/starter-tutorials.json
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/journey.js
// DAG Node:    none
// Intent:      Prove every answer combination compiles to a shipped lesson and a proposed draft that still needs the person's own baseline and target.
// ───────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JOURNEY_QUESTIONS, assistantDraft, compileJourney, journeyComplete } from '../../apps/web/src/lib/journey.js';
import { planIssues } from '../../apps/web/src/lib/missionLearning.js';

const shipped = new Set(JSON.parse(readFileSync(new URL('../../apps/pocketbase/pb_migrations/data/starter-tutorials.json', import.meta.url)))
    .lessons.map((lesson) => lesson.slug));

function* combinations(index = 0, answers = {}) {
    if (index === JOURNEY_QUESTIONS.length) { yield { ...answers }; return; }
    for (const item of JOURNEY_QUESTIONS[index].choices) yield* combinations(index + 1, { ...answers, [JOURNEY_QUESTIONS[index].id]: item.id });
}

test('every combination compiles to a shipped lesson and an unapprovable-until-measured draft', () => {
    let count = 0;
    for (const answers of combinations()) {
        count += 1;
        assert.equal(journeyComplete(answers), true);
        const compiled = compileJourney(answers);
        assert.ok(shipped.has(compiled.lesson.slug), compiled.lesson.slug);
        assert.equal(compiled.mission.status, 'proposed');
        assert.equal(compiled.mission.mission_plan.baseline, '');
        assert.equal(compiled.mission.mission_plan.target, '');
        assert.deepEqual(compiled.remaining, ['Baseline', 'Success criterion']);
        assert.deepEqual(planIssues(compiled.mission.mission_plan), compiled.remaining);
        assert.equal(compiled.mission.mission_plan.independent_review, answers.proof === 'reviewer');
        assert.ok(compiled.mission.title.length <= 200);
        assert.match(assistantDraft(compiled), /baseline I can measure/);
    }
    assert.equal(count, 2 * 5 * 3 * 3 * 2);
});

test('unknown or missing answers are refused', () => {
    assert.equal(journeyComplete({ mode: 'build' }), false);
    assert.throws(() => compileJourney({ mode: 'build' }), TypeError);
    assert.throws(() => compileJourney({ mode: 'fly', area: 'software', experience: 'new', time: 'day', proof: 'self' }), TypeError);
});
