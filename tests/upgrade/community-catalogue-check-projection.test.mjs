// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/community-catalogue-check-projection.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/tools/generate-community.mjs, apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/pocketbase/pb_migrations/data/government-submissions.json
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/tools/generate-community.mjs
// DAG Node:    none
// Intent:      Hold the public community catalogue to a named allowlist for the knowledge check, so no graded answer or explanation is ever served to an unauthenticated reader.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// Namespace import on purpose. A named import of PUBLIC_CHECK_FIELDS is an ESM link error when
// the export is absent, which aborts the whole file and hides the per-lesson count that the
// first control exists to produce. This way each control fails for its own reason.
import * as generator from '../../apps/web/tools/generate-community.mjs';

const { buildCommunityCatalogue } = generator;

const release = { version: '38+abc1234', commit_sha: 'abc1234' + '0'.repeat(33) };

// Written out rather than derived from the module under test. A control that read its expectation
// from the code it is checking would agree with any projection the code happened to produce, which
// is the exact failure this file exists to catch.
const PUBLISHED_CHECK_KEYS = ['choices', 'question'];
const WITHHELD_CHECK_KEYS = ['answer', 'explanation'];

const starter = JSON.parse(readFileSync(
    new URL('../../apps/pocketbase/pb_migrations/data/starter-tutorials.json', import.meta.url), 'utf8',
));
const government = JSON.parse(readFileSync(
    new URL('../../apps/pocketbase/pb_migrations/data/government-submissions.json', import.meta.url), 'utf8',
));
const curriculum = {
    version: starter.version + '+' + government.version,
    lessons: [...starter.lessons, ...government.lessons],
};

test('no lesson in the public catalogue publishes its graded answer or its explanation', async (t) => {
    const result = buildCommunityCatalogue(release);
    assert.equal(result.lessons.length, 33, 'the fixture must cover the whole shipped curriculum');
    for (const entry of result.lessons) {
        // One subtest per lesson: a single aggregate assertion would report one failure for a
        // defect that is present 33 times, and the count is the measurement here.
        await t.test(entry.slug, () => {
            // Key-set comparison, not a text search. Grepping for the word "answer" passes the
            // moment the field is renamed, and fails on a lesson that merely discusses answers.
            assert.deepEqual(Object.keys(entry.lesson.check).sort(), PUBLISHED_CHECK_KEYS);
            for (const withheld of WITHHELD_CHECK_KEYS) {
                assert.ok(!(withheld in entry.lesson.check),
                    'check.' + withheld + ' reached the public catalogue for ' + entry.slug);
            }
        });
    }
});

test('the published check is built from a named allowlist, so a field added later cannot leak', () => {
    // The projection must declare its public field names in one exported list. A projection that
    // instead copies the authored check and deletes two keys publishes the next graded field an
    // author invents, which is the defect class, not just the two fields measured live.
    assert.ok(Array.isArray(generator.PUBLIC_CHECK_FIELDS),
        'generate-community.mjs must export PUBLIC_CHECK_FIELDS as the named public field list');
    assert.deepEqual([...generator.PUBLIC_CHECK_FIELDS].sort(), PUBLISHED_CHECK_KEYS);

    const input = structuredClone(curriculum);
    // Two shapes of "someone added a field upstream": a plain scalar, and a nested object that a
    // shallow delete-two-keys projection would carry out whole.
    input.lessons[0].lesson.check.hint = 'leaked-hint';
    input.lessons[0].lesson.check.marking = { correct_index: 3, rubric: 'leaked-rubric' };
    const built = buildCommunityCatalogue(release, { curriculum: input });
    assert.deepEqual(Object.keys(built.lessons[0].lesson.check).sort(), PUBLISHED_CHECK_KEYS);
});

test('the catalogue still carries what its legitimate readers need', async (t) => {
    const result = buildCommunityCatalogue(release);
    for (const [index, entry] of result.lessons.entries()) {
        await t.test(entry.slug, () => {
            const authored = curriculum.lessons[index].lesson.check;
            assert.equal(entry.lesson.check.question, authored.question);
            assert.deepEqual(entry.lesson.check.choices, authored.choices);
            assert.ok(entry.lesson.check.choices.length >= 2);
            // Copied, not aliased: a reader mutating the served array must not reach authored data.
            assert.notEqual(entry.lesson.check.choices, authored.choices);
        });
    }
});
