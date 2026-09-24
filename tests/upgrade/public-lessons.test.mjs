// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/public-lessons.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/plugins/vite-plugin-public-lessons.js, apps/web/tools/check-public-lessons.mjs, apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/plugins/vite-plugin-public-lessons.js; VALIDATES apps/web/tools/check-public-lessons.mjs; VALIDATES apps/web/vite.config.js; VALIDATES apps/web/vitest.config.js; CONSUMES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Prove the browser receives authored lessons without knowledge-check answers or the explanations that reveal them.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import publicLessonsPlugin, { loadPublicLessons } from '../../apps/web/plugins/vite-plugin-public-lessons.js';
import { explanationFingerprints, findLessonAnswers } from '../../apps/web/tools/check-public-lessons.mjs';
import { validLesson } from '../../apps/web/src/lib/tutorialCurriculum.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = (path) => readFileSync(join(root, path), 'utf8');
const CURRICULA = ['starter-tutorials.json', 'broadcast-classroom-lessons.json', 'government-submissions.json'];

function imported(importer, specifier) {
    const plugin = publicLessonsPlugin();
    const id = plugin.resolveId(specifier, join(root, importer));
    const code = plugin.load.call({ addWatchFile() {} }, id);
    assert.match(code, /^export default /);
    return JSON.parse(code.slice('export default '.length).trim().replace(/;$/, ''));
}

test('the imported public lesson modules keep every lesson renderable and carry no answer or explanation', () => {
    for (const name of CURRICULA) {
        const authored = JSON.parse(source(`apps/pocketbase/pb_migrations/data/${name}`));
        const shipped = imported('apps/web/src/components/workspace/TutorialCatalog.jsx', `../../../../pocketbase/pb_migrations/data/${name}?public-lessons`);
        assert.equal(shipped.lessons.length, authored.lessons.length, name);
        assert.equal(shipped.version, authored.version);
        for (const [index, record] of shipped.lessons.entries()) {
            assert.equal(/"answer"|"explanation"/.test(JSON.stringify(record.lesson.check)), false, record.slug);
            const { answer: _answer, explanation: _explanation, ...check } = authored.lessons[index].lesson.check;
            assert.deepEqual(record.lesson.check, check);
            assert.deepEqual({ ...record.lesson, check: authored.lessons[index].lesson.check }, authored.lessons[index].lesson);
            assert.ok(validLesson(record.lesson), record.slug);
        }
    }
    assert.throws(() => loadPublicLessons(join(root, 'package.json')), /authored curriculum data/);
    assert.equal(publicLessonsPlugin().resolveId('../data/starter-tutorials.json', join(root, 'apps/web/src/x.jsx')), null, 'raw imports are left alone');
});

test('application code imports lesson curricula only through the public projection, and both builds install it', () => {
    const files = readdirSync(join(root, 'apps/web/src'), { recursive: true }).map(String)
        .filter((name) => /\.(?:js|jsx|mjs)$/.test(name) && !/(?:^|[/\\])__tests__[/\\]|\.test\./.test(name));
    const raw = [];
    for (const name of files) {
        for (const match of source(`apps/web/src/${name}`).matchAll(/from\s+'([^']*pb_migrations\/data\/([^'?]+\.json)(\?[^']*)?)'/g)) {
            if (CURRICULA.includes(match[2]) && match[3] !== '?public-lessons') raw.push(`${name}: ${match[1]}`);
        }
    }
    assert.deepEqual(raw, []);
    for (const config of ['apps/web/vite.config.js', 'apps/web/vitest.config.js']) {
        assert.match(source(config), /import publicLessonsPlugin from '\.\/plugins\/vite-plugin-public-lessons\.js'/);
        assert.match(source(config), /publicLessonsPlugin\(\),\s*\n?\s*react\(\)/);
    }
    assert.match(source('apps/web/tools/build.mjs'), /findLessonAnswers\(output\)/);
});

test('the post-build scan finds a shipped explanation however the minifier quotes it and passes clean assets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'buildanddo-public-lessons-'));
    try {
        mkdirSync(join(directory, 'assets', 'nested'), { recursive: true });
        const [first, second] = explanationFingerprints();
        writeFileSync(join(directory, 'assets', 'clean.js'), 'export const lesson={check:{question:"Q",choices:["A","B"]}};');
        writeFileSync(join(directory, 'community-catalog.json'), JSON.stringify({ explanation: first.fingerprint }));
        assert.deepEqual(findLessonAnswers(directory), [], 'only browser script assets are scanned');
        writeFileSync(join(directory, 'assets', 'nested', 'leak.js'), `var a={answer:1,explanation:\`${second.fingerprint}\\u2014more\`};`);
        assert.deepEqual(findLessonAnswers(directory), [{ file: join('nested', 'leak.js'), slug: second.slug }]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
    assert.ok(explanationFingerprints().every(({ fingerprint }) => fingerprint.length >= 24));
});
