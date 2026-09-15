// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/discord-catalogue.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/tools/generate-community.mjs
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/tools/generate-community.mjs
// DAG Node:    none
// Intent:      Verify the real community artifact preserves public lesson parity and excludes private or malformed data.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildCommunityCatalogue, generateCommunityCatalogue } from '../../apps/web/tools/generate-community.mjs';
import { PUBLIC_PAGES, SITE_ORIGIN } from '../../apps/web/src/lib/publicPages.js';

const release = { version: '38+abc1234', commit_sha: 'abc1234' + '0'.repeat(33) };
const curriculum = JSON.parse(readFileSync(
    new URL('../../apps/pocketbase/pb_migrations/data/starter-tutorials.json', import.meta.url), 'utf8',
));

test('community projection shares all 25 lessons and the exact public page/release identity', () => {
    const result = buildCommunityCatalogue(release);
    assert.equal(result.site_origin, SITE_ORIGIN);
    assert.deepEqual(result.release, release);
    assert.equal(result.curriculum_version, curriculum.version);
    assert.equal(result.lessons.length, 25);
    assert.deepEqual(result.pages.map((page) => page.path), PUBLIC_PAGES.map((page) => page.path));
    for (const [index, lesson] of result.lessons.entries()) {
        assert.deepEqual(lesson.lesson, curriculum.lessons[index].lesson);
        assert.equal(lesson.slug, curriculum.lessons[index].slug);
        assert.ok(!('id' in lesson));
        assert.ok(!('legacy_summary' in lesson));
    }
});

test('public projection drops added migration, user and internal nested metadata', () => {
    const input = structuredClone(curriculum);
    input.private_field = 'not-public';
    input.lessons[0].workspace = 'not-public';
    input.lessons[0].lesson.private_field = 'not-public';
    input.lessons[0].lesson.sections[0].private_field = 'not-public';
    input.lessons[0].lesson.exercise.private_field = 'not-public';
    input.lessons[0].lesson.check.private_field = 'not-public';
    input.lessons[0].lesson.references[0].private_field = 'not-public';
    assert.ok(!JSON.stringify(buildCommunityCatalogue(release, { curriculum: input })).includes('not-public'));
});

test('malformed and duplicate lesson data cannot be published as a working catalogue', () => {
    for (const alter of [
        (data) => data.lessons.push(data.lessons[0]),
        (data) => { data.lessons[0].lesson.check.answer = 10; },
        (data) => { data.lessons[0].lesson.check.choices[0] = 'x'.repeat(201); },
        (data) => { data.lessons[0].slug = '../private'; },
        (data) => { data.lessons[0].effort_minutes = 0; },
        (data) => { data.lessons = []; },
        (data) => { data.version = ''; },
    ]) {
        const input = structuredClone(curriculum);
        alter(input);
        assert.throws(() => buildCommunityCatalogue(release, { curriculum: input }));
    }
});

test('private and malformed page routes and mismatched release identity are rejected', () => {
    for (const path of ['/app', '/api/users', '/login', '//external.invalid', '/../private']) {
        assert.throws(() => buildCommunityCatalogue(release, { pages: [{ ...PUBLIC_PAGES[0], path }] }));
    }
    assert.throws(() => buildCommunityCatalogue({ ...release, version: '38+deadbee' }));
    assert.throws(() => buildCommunityCatalogue({ ...release, commit_sha: 'short' }));
    assert.throws(() => buildCommunityCatalogue(release, { pages: [] }));
});

test('the real generator writes a consumable artifact into the build directory', (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'buildanddo-community-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    generateCommunityCatalogue(directory, release);
    const contents = readFileSync(join(directory, 'community-catalog.json'), 'utf8');
    assert.deepEqual(JSON.parse(contents), buildCommunityCatalogue(release));
    assert.ok(Buffer.byteLength(contents) < 512_000);
});
