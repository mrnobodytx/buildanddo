// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/public-lessons.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-QUIZ-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001, VCC-BUILDANDDO-QUIZ-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/plugins/vite-plugin-public-lessons.js, apps/web/tools/check-public-lessons.mjs, apps/web/src/lib/tutorialCurriculum.js,
//              apps/web/tools/build.mjs, tests/upgrade/lesson-keys-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/plugins/vite-plugin-public-lessons.js; VALIDATES apps/web/tools/check-public-lessons.mjs; VALIDATES apps/web/vite.config.js; VALIDATES apps/web/vitest.config.js;
//              VALIDATES apps/web/tools/build.mjs; CONSUMES apps/web/src/lib/tutorialCurriculum.js; CONSUMES tests/upgrade/lesson-keys-fixture.mjs
// DAG Node:    none
// Intent:      Prove the browser receives authored lessons without knowledge-check answers or the explanations that reveal them.
// ───────────────────────────────────────────────────────────────

// SYNTHETIC KEYS ONLY. Explanation fingerprints come from key files these tests write to temporary directories from
// public lesson text (tests/upgrade/lesson-keys-fixture.mjs). No key file is read from or written to the repository,
// and no assertion message or captured output carries an explanation, a fingerprint or a key file path.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import publicLessonsPlugin, { loadPublicLessons } from '../../apps/web/plugins/vite-plugin-public-lessons.js';
import { explanationFingerprints, findLessonAnswers, LessonScanError } from '../../apps/web/tools/check-public-lessons.mjs';
import { buildCommunityCatalogue } from '../../apps/web/tools/generate-community.mjs';
import { validLesson } from '../../apps/web/src/lib/tutorialCurriculum.js';
import { dump, keyFile, resealed, syntheticDocument, syntheticExplanation } from './lesson-keys-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = (path) => readFileSync(join(root, path), 'utf8');
const CURRICULA = ['starter-tutorials.json', 'broadcast-classroom-lessons.json', 'government-submissions.json', 'authority-repairs-lessons.json'];
const PUBLIC_LESSONS = CURRICULA.reduce((count, name) => count + JSON.parse(source(`apps/pocketbase/pb_migrations/data/${name}`)).lessons.length, 0);
const CLI = join(root, 'apps/web/tools/check-public-lessons.mjs');
const SKIP_LINE = 'SKIP: lesson explanation fingerprints need BUILDANDDO_LESSON_KEYS_FILE; output scanned for answer-bearing JSON checks only.';
const KEY_VARIABLES = ['BUILDANDDO_LESSON_KEYS_FILE', 'BUILDANDDO_LESSON_KEYS_REQUIRED', 'BUILDANDDO_LESSON_KEYS_SYNTHETIC'];
const ANSWERED_FEED = JSON.stringify({ lessons: [{ slug: 'planted-lesson', lesson: { check: { question: 'Q', choices: ['A', 'B'], answer: 1 } } }] });

/** Made-up explanations for a key file labelled private: written at test time, never a real key. */
const madeUp = (slug) => `Made-up test explanation for ${slug}, written when the test runs.`;
const privateDocument = () => resealed(syntheticDocument(), (copy) => {
    copy.synthetic = false;
    copy.source.revision = '0'.repeat(40);
    for (const [slug, entry] of Object.entries(copy.lessons)) entry.explanation = madeUp(slug);
});

/** @returns {boolean} Whether text carries key text or names a key file; checked on every message and captured output. */
function carriesKeyText(text, ...paths) {
    return /SYNTHETIC|placeholder|Made-up test explanation/.test(text) || paths.some((path) => path && text.includes(path));
}

/** @returns {Error} What run threw. Nothing about the error is printed, so a faulty message cannot reach test output. */
function refusal(run) {
    try { run(); } catch (error) { return error; }
    assert.fail('expected a refusal');
}

/** @returns {boolean} Whether error is a LessonScanError with this exit code whose message carries no key text. */
const refused = (error, exitCode, ...paths) =>
    error instanceof LessonScanError && error.exitCode === exitCode && !carriesKeyText(error.message, ...paths);

/** A temporary output directory and a separate key directory, removed after the test. */
function workspace(t) {
    const base = mkdtempSync(join(tmpdir(), 'buildanddo-public-lessons-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const output = join(base, 'dist', 'apps', 'web');
    const keys = join(base, 'keys');
    mkdirSync(output, { recursive: true });
    mkdirSync(keys);
    const writeKeys = (name, text) => {
        const path = join(keys, name);
        writeFileSync(path, text, { mode: 0o600 });
        return path;
    };
    return { base, output, keys, writeKeys };
}

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

test('application code imports lesson curricula only through the public projection, never a key file, and both builds install it', () => {
    const files = readdirSync(join(root, 'apps/web/src'), { recursive: true }).map(String)
        .filter((name) => /\.(?:js|jsx|mjs)$/.test(name) && !/(?:^|[/\\])__tests__[/\\]|\.test\./.test(name));
    const raw = [];
    for (const name of files) {
        for (const match of source(`apps/web/src/${name}`).matchAll(/from\s+'([^']*pb_migrations\/data\/([^'?]+\.json)(\?[^']*)?)'/g)) {
            if (CURRICULA.includes(match[2]) && match[3] !== '?public-lessons') raw.push(`${name}: ${match[1]}`);
        }
    }
    assert.deepEqual(raw, []);
    // Grading keys stay on the server: no browser module, plugin or build configuration names a key file or its variables.
    const browserSide = [
        ...files.map((name) => `apps/web/src/${name}`),
        ...readdirSync(join(root, 'apps/web/plugins')).filter((name) => /\.(?:js|mjs)$/.test(name)).map((name) => `apps/web/plugins/${name}`),
        'apps/web/vite.config.js', 'apps/web/vitest.config.js',
    ];
    assert.deepEqual(browserSide.filter((path) => /lesson[-_]keys|BUILDANDDO_LESSON_KEYS/i.test(source(path))), []);
    const tools = readdirSync(join(root, 'apps/web/tools')).filter((name) => /\.(?:js|mjs)$/.test(name));
    assert.deepEqual(tools.filter((name) => /lesson[-_]keys|BUILDANDDO_LESSON_KEYS/i.test(source(`apps/web/tools/${name}`))).sort(),
        ['build.mjs', 'check-public-lessons.mjs'], 'only the build and its scanner read the key file variable');
    for (const config of ['apps/web/vite.config.js', 'apps/web/vitest.config.js']) {
        assert.match(source(config), /import publicLessonsPlugin from '\.\/plugins\/vite-plugin-public-lessons\.js'/);
        assert.match(source(config), /publicLessonsPlugin\(\),\s*\n?\s*react\(\)/);
    }
    assert.match(source('apps/web/tools/build.mjs'), /findLessonAnswers\(output, \{/);
});

test('fingerprints come from the key file, one per public lesson, and a planted explanation and answer-bearing check are both found', (t) => {
    const { output, writeKeys } = workspace(t);
    const document = syntheticDocument();
    const keysFile = writeKeys('keys.json', dump(document));
    assert.deepEqual(explanationFingerprints({ keysFile: null }), [], 'without a key file there is nothing to fingerprint');
    const fingerprints = explanationFingerprints({ keysFile });
    assert.equal(fingerprints.length, PUBLIC_LESSONS, 'one fingerprint per public lesson');
    assert.deepEqual(fingerprints.map(({ slug }) => slug).sort(), Object.keys(document.lessons).sort());
    assert.equal(fingerprints.every(({ slug, fingerprint }) => fingerprint.length >= 24 && document.lessons[slug].explanation.includes(fingerprint)), true,
        'each fingerprint is a long run of its own lesson explanation');
    mkdirSync(join(output, 'assets', 'nested'), { recursive: true });
    writeFileSync(join(output, 'assets', 'clean.js'), 'export const lesson={check:{question:"Q",choices:["A","B"]}};');
    writeFileSync(join(output, 'community-catalog.json'), JSON.stringify({ lessons: [{ slug: 's', lesson: { check: { question: 'Q', choices: ['A', 'B'] } } }] }));
    writeFileSync(join(output, 'index.html'), '<!doctype html><title>Answer key</title>');
    const clean = findLessonAnswers(output, { keysFile });
    assert.deepEqual(clean, []);
    assert.equal(clean.mode, 'synthetic');
    assert.equal(clean.lessons, PUBLIC_LESSONS);
    // A minifier may escape characters around the explanation; the fingerprint run survives that.
    const { slug } = fingerprints[1];
    writeFileSync(join(output, 'assets', 'nested', 'leak.js'), `var a={answer:1,explanation:"${syntheticExplanation(slug).replace(':', '\\u003a')}\\u2014more"};`);
    writeFileSync(join(output, 'assets', 'nested', 'feed.json'), ANSWERED_FEED);
    assert.deepEqual(findLessonAnswers(output, { keysFile }), [
        { file: join('assets', 'nested', 'feed.json'), slug: 'planted-lesson' },
        { file: join('assets', 'nested', 'leak.js'), slug },
    ]);
    const structural = findLessonAnswers(output, { keysFile: null });
    assert.deepEqual(structural, [{ file: join('assets', 'nested', 'feed.json'), slug: 'planted-lesson' }], 'without keys only the JSON check is visible');
    assert.equal(structural.mode, 'skipped');
});

test('the scan covers every output file, so a planted answer or explanation in community-catalog.json fails the build', (t) => {
    const { output: directory, writeKeys } = workspace(t);
    const keysFile = writeKeys('keys.json', keyFile('synthetic'));
    const [first] = explanationFingerprints({ keysFile });
    const release = { version: '38+abc1234', commit_sha: 'abc1234' + '0'.repeat(33) };
    const write = (value) => writeFileSync(join(directory, 'community-catalog.json'), JSON.stringify(value));
    const catalogue = buildCommunityCatalogue(release);
    write(catalogue);
    assert.deepEqual(findLessonAnswers(directory, { keysFile }), [], 'the real catalogue is clean');
    const answered = structuredClone(catalogue);
    answered.lessons[3].lesson.check.answer = 0;
    write(answered);
    assert.deepEqual(findLessonAnswers(directory, { keysFile }), [{ file: 'community-catalog.json', slug: catalogue.lessons[3].slug }]);
    const explained = structuredClone(catalogue);
    explained.lessons[0].lesson.check.explanation = 'Short.';
    write(explained);
    assert.deepEqual(findLessonAnswers(directory, { keysFile: null }), [{ file: 'community-catalog.json', slug: catalogue.lessons[0].slug }]);
    write({ note: `Background: ${syntheticExplanation(first.slug)}` });
    assert.deepEqual(findLessonAnswers(directory, { keysFile }), [{ file: 'community-catalog.json', slug: first.slug }], 'explanation text anywhere in the file');
    writeFileSync(join(directory, 'community-catalog.json'), `{"broken": "${syntheticExplanation(first.slug)}`);
    assert.deepEqual(findLessonAnswers(directory, { keysFile }), [{ file: 'community-catalog.json', slug: first.slug }], 'unparseable JSON is still scanned');
    rmSync(join(directory, 'community-catalog.json'));
    mkdirSync(join(directory, 'feeds'));
    writeFileSync(join(directory, 'feeds', 'lessons.txt'), syntheticExplanation(first.slug));
    assert.deepEqual(findLessonAnswers(directory, { keysFile }), [{ file: join('feeds', 'lessons.txt'), slug: first.slug }], 'a non-JSON feed');
    assert.match(source('apps/web/tools/build.mjs'), /generateCommunityCatalogue\(output, release\);\n[\s\S]*findLessonAnswers\(output, /, 'the scan runs after the catalogue is written');
});

test('without a key file the scan is structural and says so, and required keys must be present and private', (t) => {
    const { output, keys, writeKeys } = workspace(t);
    writeFileSync(join(output, 'feed.json'), ANSWERED_FEED);
    for (const keysFile of [null, '', join(keys, 'absent.json'), writeKeys('empty.json', '')]) {
        const scan = findLessonAnswers(output, { keysFile });
        assert.deepEqual(scan, [{ file: 'feed.json', slug: 'planted-lesson' }], 'the answer-bearing check is found without keys');
        assert.equal(scan.mode, 'skipped');
        assert.equal(scan.reason, keysFile ? 'absent' : 'unnamed');
        assert.equal(scan.lessons, 0);
        assert.deepEqual(explanationFingerprints({ keysFile }), []);
        const error = refusal(() => findLessonAnswers(output, { keysFile, requireKeys: true }));
        assert.equal(refused(error, 3) && /required/.test(error.message), true, 'required keys that are absent are BLOCKED');
    }
    rmSync(join(output, 'feed.json'));
    // A fixture file relabelled private still carries fixture explanations, so it is still synthetic.
    for (const keysFile of [writeKeys('synthetic.json', keyFile('synthetic')), writeKeys('relabelled.json', keyFile('relabelled'))]) {
        assert.equal(findLessonAnswers(output, { keysFile }).mode, 'synthetic');
        const error = refusal(() => findLessonAnswers(output, { keysFile, requireKeys: true }));
        assert.equal(refused(error, 1, keysFile) && /synthetic/.test(error.message), true, 'synthetic keys cannot satisfy a requirement');
    }
    const keysFile = writeKeys('private.json', dump(privateDocument()));
    for (const requireKeys of [false, true]) {
        const scan = findLessonAnswers(output, { keysFile, requireKeys });
        assert.deepEqual(scan, []);
        assert.equal(scan.mode, 'private');
        assert.equal(scan.lessons, PUBLIC_LESSONS);
    }
});

test('a key file must cover exactly the public lessons with usable explanations, and a fault never quotes it', (t) => {
    const { output, keys, writeKeys } = workspace(t);
    const document = syntheticDocument();
    const [first] = Object.keys(document.lessons).sort();
    const cases = {
        missing: dump(resealed(document, (copy) => { delete copy.lessons[first]; })),
        extra: dump(resealed(document, (copy) => { copy.lessons['no-such-lesson'] = { ...copy.lessons[first] }; })),
        short: dump(resealed(document, (copy) => { copy.lessons[first].explanation = 'Too short: see notes.'; })),
        malformed: dump(resealed(document, (copy) => { copy.lessons[first].answer = -1; })),
        schema: dump({ ...document, schema_version: 'buildanddo.lesson-keys/0' }),
        members: dump({ ...document, note: 'unexpected' }),
        // JSON.parse would quote the text around this fault.
        not_json: syntheticExplanation(first),
        oversized: ' '.repeat(256 * 1024) + dump(document),
    };
    const messages = {};
    for (const [name, text] of Object.entries(cases)) {
        const keysFile = writeKeys(`${name}.json`, text);
        for (const run of [() => explanationFingerprints({ keysFile }), () => findLessonAnswers(output, { keysFile }),
            () => findLessonAnswers(output, { keysFile, requireKeys: true })]) {
            const error = refusal(run);
            assert.equal(refused(error, 1, keysFile), true, name);
            messages[name] ??= error.message;
        }
    }
    assert.ok(messages.missing.includes(`covers ${PUBLIC_LESSONS - 1} of ${PUBLIC_LESSONS} public lessons; missing: ${first}`), 'the count guard names the gap');
    assert.ok(messages.extra.includes(`covers ${PUBLIC_LESSONS} of ${PUBLIC_LESSONS} public lessons and has 1 entries for no public lesson`));
    assert.ok(messages.short.includes(`Lesson ${first} needs a longer explanation`));
    assert.equal(messages.not_json, 'the lesson key file is not JSON');
    assert.equal(refused(refusal(() => findLessonAnswers(output, { keysFile: keys })), 1, keys), true, 'a directory is not a key file');
});

test('the command line imports node built-ins only and maps clean, leak, unusable, synthetic and absent keys to exit codes', (t) => {
    const cli = source('apps/web/tools/check-public-lessons.mjs');
    const specifiers = [...cli.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)].map((match) => match[1] ?? match[2]);
    assert.deepEqual(specifiers.sort(), ['node:fs', 'node:path', 'node:url']);
    assert.doesNotMatch(cli, /\bimport\s*\(|\brequire\s*\(/);
    const { base, output, keys, writeKeys } = workspace(t);
    writeFileSync(join(output, 'index.html'), '<!doctype html><title>Lessons</title>');
    const synthetic = writeKeys('synthetic.json', keyFile('synthetic'));
    const privateKeys = writeKeys('private.json', dump(privateDocument()));
    const invalid = writeKeys('invalid.json', syntheticExplanation('any-lesson'));
    const absent = join(keys, 'absent.json');
    const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !KEY_VARIABLES.includes(name)));
    const run = (args, env = {}) => {
        const result = spawnSync(process.execPath, [CLI, ...args], { cwd: base, env: { ...environment, ...env }, encoding: 'utf8' });
        const text = `${result.stdout}${result.stderr}`;
        assert.equal(carriesKeyText(text, synthetic, privateKeys, invalid, absent), false, `output of ${args.length} arguments carries no key text or key path`);
        return { status: result.status, text };
    };
    const skipped = run([output]);
    assert.equal(skipped.status, 0);
    assert.ok(skipped.text.includes('SKIP: lesson explanation fingerprints need BUILDANDDO_LESSON_KEYS_FILE or --keys'));
    assert.match(skipped.text, /^OK: /m);
    assert.equal(run([output, '--keys', absent]).status, 0, 'an absent file is a skip unless keys are required');
    for (const [args, env] of [[[output, '--require-keys'], {}], [[output], { BUILDANDDO_LESSON_KEYS_REQUIRED: '1' }],
        [[output, '--keys', absent, '--require-keys'], {}], [[output, '--keys', '', '--require-keys'], { BUILDANDDO_LESSON_KEYS_FILE: privateKeys }]]) {
        const blocked = run(args, env);
        assert.equal(blocked.status, 3, 'required keys that are absent are BLOCKED');
        assert.match(blocked.text, /^BLOCKED: /m);
    }
    const fromSynthetic = run([output, '--keys', synthetic]);
    assert.equal(fromSynthetic.status, 0);
    assert.ok(fromSynthetic.text.includes(`Lesson explanation fingerprints: ${PUBLIC_LESSONS} lessons from synthetic keys.`));
    assert.equal(run([output], { BUILDANDDO_LESSON_KEYS_FILE: synthetic }).status, 0, 'the variable names the file when --keys is absent');
    assert.equal(run([output, '--keys', synthetic, '--require-keys']).status, 1, 'synthetic keys cannot satisfy a requirement');
    for (const args of [[output, '--keys', privateKeys, '--require-keys'], [`--keys=${privateKeys}`, output, '--require-keys']]) {
        const fromPrivate = run(args);
        assert.equal(fromPrivate.status, 0);
        assert.ok(fromPrivate.text.includes(`Lesson explanation fingerprints: ${PUBLIC_LESSONS} lessons from private keys.`));
    }
    assert.equal(run([output, '--keys', invalid]).status, 1, 'an unusable key file fails');
    const [, { slug }] = explanationFingerprints({ keysFile: synthetic });
    mkdirSync(join(output, 'assets'));
    writeFileSync(join(output, 'assets', 'leak.js'), `var a=${JSON.stringify(syntheticExplanation(slug))};`);
    const leaked = run([output, '--keys', synthetic]);
    assert.equal(leaked.status, 1);
    assert.ok(leaked.text.includes(`FAIL: lesson ${slug} answer is in ${join('assets', 'leak.js')}`));
    assert.equal(run([join(base, 'missing')]).status, 1, 'an unreadable output fails');
    for (const args of [[], [output, output], [output, '--keys'], [output, '--keys', '--require-keys'], [output, '--unknown']]) {
        const usage = run(args);
        assert.equal(usage.status, 1);
        assert.match(usage.text, /^usage: /m);
    }
});

test('the build prints the SKIP line without keys, scans with a key file, and refuses missing or synthetic keys when they are required', async (t) => {
    const { base, output, keys, writeKeys } = workspace(t);
    writeFileSync(join(output, 'index.html'), '<!doctype html><title>Lessons</title>');
    const synthetic = writeKeys('synthetic.json', keyFile('synthetic'));
    const privateKeys = writeKeys('private.json', dump(privateDocument()));
    const invalid = writeKeys('invalid.json', '{}');
    const absent = join(keys, 'absent.json');
    // The real wrapper with its imports replaced: Vite, the generators and telemetry are doubles, the scan is real.
    const wrapper = source('apps/web/tools/build.mjs').replace(/^#!.*\n/, '').replace(/^import .*;$/gm, '')
        .replaceAll('import.meta.url', '__moduleUrl').replace("await import('vite')", '__vite');
    async function build(env, scan = findLessonAnswers) {
        const lines = [];
        const context = {
            URL, fileURLToPath, TELEMETRY_MANIFEST: 'telemetry-manifest.json',
            __moduleUrl: pathToFileURL(join(base, 'apps', 'web', 'tools', 'build.mjs')).href,
            process: { env: { ...env }, exit: (code) => { throw Object.assign(new Error('Build refused'), { exitCode: code }); } },
            console: { log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) },
            rmSync() {}, resolveBuildRelease: () => ({ commit_sha: 'a'.repeat(40), version: '38+aaaaaaa' }),
            releaseTelemetryContract: () => null, releaseTelemetryPlugin: () => null, generatePublicAssets() {},
            spawnSync: () => ({ status: 0 }), __vite: { build: async () => {} }, generatePageHeads() {}, generateCommunityCatalogue() {},
            findLessonAnswers: scan,
        };
        let code = 0;
        try { await vm.runInNewContext(`(async () => { ${wrapper}\n })()`, context); }
        catch (error) { if (typeof error?.exitCode !== 'number') throw error; code = error.exitCode; }
        const text = lines.join('\n');
        assert.equal(carriesKeyText(text, synthetic, privateKeys, invalid, absent), false, 'build output carries no key text or key path');
        return { code, text };
    }
    const unnamed = await build({});
    assert.equal(unnamed.code, 0);
    assert.equal(unnamed.text, SKIP_LINE);
    const missing = await build({ BUILDANDDO_LESSON_KEYS_FILE: absent });
    assert.equal(missing.code, 0);
    assert.equal(missing.text, `${SKIP_LINE} The named key file is absent.`);
    const fixture = await build({ BUILDANDDO_LESSON_KEYS_FILE: synthetic });
    assert.equal(fixture.code, 0);
    assert.equal(fixture.text, `Lesson explanation fingerprints: ${PUBLIC_LESSONS} lessons from synthetic keys.`);
    for (const env of [{}, { BUILDANDDO_LESSON_KEYS_FILE: absent }, { BUILDANDDO_LESSON_KEYS_FILE: synthetic }, { BUILDANDDO_LESSON_KEYS_FILE: invalid }]) {
        const refused = await build({ ...env, BUILDANDDO_LESSON_KEYS_REQUIRED: '1' });
        assert.equal(refused.code, 1, 'required keys that are missing, synthetic or unusable fail the build');
        assert.match(refused.text, /^Lesson answer scan refused the build: /);
    }
    assert.equal((await build({ BUILDANDDO_LESSON_KEYS_FILE: invalid })).code, 1, 'an unusable key file fails a public build too');
    const required = await build({ BUILDANDDO_LESSON_KEYS_FILE: privateKeys, BUILDANDDO_LESSON_KEYS_REQUIRED: '1' });
    assert.equal(required.code, 0);
    assert.equal(required.text, `Lesson explanation fingerprints: ${PUBLIC_LESSONS} lessons from private keys.`);
    // The build re-checks the mode itself, so a scanner that stopped enforcing the requirement could not pass it.
    const lax = () => Object.defineProperties([], { mode: { value: 'synthetic' }, reason: { value: '' }, lessons: { value: PUBLIC_LESSONS } });
    assert.equal((await build({ BUILDANDDO_LESSON_KEYS_REQUIRED: '1' }, lax)).code, 1);
    const [, { slug }] = explanationFingerprints({ keysFile: synthetic });
    mkdirSync(join(output, 'assets'));
    writeFileSync(join(output, 'assets', 'leak.js'), `var a=${JSON.stringify(syntheticExplanation(slug))};`);
    const leaked = await build({ BUILDANDDO_LESSON_KEYS_FILE: synthetic });
    assert.equal(leaked.code, 1);
    assert.ok(leaked.text.includes(`Lesson ${slug} answer is in ${join('assets', 'leak.js')}`));
    assert.equal(JSON.parse(source('apps/web/package.json')).scripts.build, 'node tools/build.mjs', 'the build script has no shell chaining');
});
