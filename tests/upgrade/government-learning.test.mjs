// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/government-learning.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_migrations/data/government-submissions.json, apps/pocketbase/pb_migrations/1790400000_government_submission_learning.js, apps/web/src/lib/missionLearning.js, apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_migrations/data/government-submissions.json; VALIDATES apps/pocketbase/pb_migrations/1790400000_government_submission_learning.js; CONSUMES apps/web/src/lib/missionLearning.js; CONSUMES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Validate the usable mission starter, substantive exercises and persistent lesson identities across upgrades and rollback.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { source, fixture } from './admin-fixture.mjs';
import { planIssues, readPlan } from '../../apps/web/src/lib/missionLearning.js';
import { validLesson, mergeTutorials } from '../../apps/web/src/lib/tutorialCurriculum.js';
const path = 'apps/pocketbase/pb_migrations/data/government-submissions.json';
const data = JSON.parse(source(path));
const migration = 'apps/pocketbase/pb_migrations/1790400000_government_submission_learning.js';
function installed() {
    const f = fixture({ runtime: { toString: String, $os: { readFile: (value) => {
        assert.ok(['/pb_migrations/data/starter-tutorials.json', '/pb_migrations/data/government-submissions.json'].includes(value));
        return source(value.replace('/pb_migrations/', 'apps/pocketbase/pb_migrations/'));
    } } } });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    return f;
}

test('business seed migration assigns canonical IDs to new lessons and preserves authored content', () => {
    const f = installed(), starter = JSON.parse(source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'));
    assert.equal(f.data.tutorials.length, starter.lessons.length);
    for (const seed of starter.lessons) {
        const row = f.data.tutorials.find((row) => row.slug === seed.slug);
        assert.ok(row, seed.slug);
        if (!seed.legacy_summary) assert.equal(row.id, seed.id);
        assert.deepEqual(row.lesson, seed.lesson);
    }
});

test('government starter fills a reviewable plan without granting approval or inventing a baseline', () => {
    assert.deepEqual(planIssues(readPlan(data.mission.mission_plan)), []);
    assert.equal(data.mission.mission_plan.risk, 'A2');
    assert.match(data.mission.mission_plan.baseline, /no measurement is claimed/);
    for (const field of ['status', 'mission_approved_by', 'mission_review', 'mission_approved_at', 'due_date']) assert.ok(!(field in data.mission));
    assert.match(data.mission.mission_plan.authorization, /before work starts/);
});

test('eight substantive government lessons render through the existing curriculum contract', () => {
    assert.equal(data.lessons.length, 8); assert.equal(new Set(data.lessons.map((row) => row.id)).size, 8);
    const merged = mergeTutorials([], data.lessons); assert.equal(merged.length, 8);
    for (const row of data.lessons) {
        assert.equal(validLesson(row.lesson), true, row.slug);
        assert.match(row.id, /^[a-z0-9]{15}$/); assert.equal(row.category, 'Government submissions');
        assert.ok(row.lesson.sections.length >= 3); assert.ok(row.lesson.exercise.checklist.length >= 3);
        assert.ok(row.lesson.references.length >= 1); assert.ok(JSON.stringify(row.lesson).length > 2200);
    }
    assert.match(JSON.stringify(data), /actual portal acknowledgment/);
});

test('seed is idempotent, retains edited lessons and preserves progress under down/re-up', () => {
    const f = installed(); f.migration(migration).up(); assert.equal(f.data.tutorials.length, 33);
    const seed = data.lessons[0]; const record = f.app.findRecordById('tutorials', seed.id);
    record.set('summary', 'Operator clarification'); f.app.save(record);
    f.seed('tutorial_progress', { id: 'learnerprogress', owner: 'editor', tutorial: seed.id, status: 'completed', progress: 100 });
    f.migration(migration).up(); f.migration(migration).down(); f.migration(migration).up();
    assert.equal(f.data.tutorials.length, 33); assert.equal(f.app.findRecordById('tutorials', seed.id).getString('summary'), 'Operator clarification');
    assert.equal(f.data.tutorial_progress[0].tutorial, seed.id); assert.equal(f.data.tutorial_progress[0].progress, 100);
});

test('identity collisions fail the entire seed without replacing existing records', () => {
    const f = installed(); f.seed('tutorials', { id: data.lessons[1].id, slug: 'different-content', title: 'Existing lesson' });
    const count = f.data.tutorials.length;
    assert.throws(() => f.migration(migration).up(), /identity collision/); assert.equal(f.data.tutorials.length, count);
    assert.equal(f.app.findRecordById('tutorials', data.lessons[1].id).getString('title'), 'Existing lesson');
});
