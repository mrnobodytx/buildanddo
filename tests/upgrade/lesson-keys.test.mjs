// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/lesson-keys.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     tests/upgrade/admin-fixture.mjs, tests/upgrade/lesson-keys-fixture.mjs, apps/pocketbase/pb_hooks/lesson-keys.js,
//              apps/pocketbase/pb_hooks/lesson-keys.pb.js, scripts/ci/lesson_keys.py
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/lesson-keys-fixture.mjs;
//              VALIDATES apps/pocketbase/pb_hooks/lesson-keys.js; VALIDATES apps/pocketbase/pb_hooks/lesson-keys.pb.js;
//              VALIDATES scripts/ci/lesson_keys.py
// DAG Node:    none
// Intent:      Prove the lesson key resolver loads only a sound key file, merges keys in memory without saving,
//              fails closed per lesson, and agrees with lesson_keys.py on every byte, using synthetic keys only.
// ───────────────────────────────────────────────────────────────

// Every key in this suite is synthetic, generated at test time from public lesson text. Assertions
// that touch key material are non-printing: assert.ok(a === b, slug) names the lesson, never a value.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fixture, plain, pythonBin, repoPath, source } from './admin-fixture.mjs';
import * as keys from './lesson-keys-fixture.mjs';

const DATA_DIR = '/pb_data';
const DEFAULT = '/pb_data/lesson-keys.json';
const NAMED = '/etc/buildanddo/lesson-keys.json';
const ELSEWHERE = '/srv/rehearsal/lesson-keys.json';
const OPT_IN = { [keys.SYNTHETIC_VARIABLE]: '1' };
const RECORDS = keys.curriculumRecords();
const LESSONS = keys.publicLessons(RECORDS);
const SLUGS = Object.keys(LESSONS).sort();
const SYNTHETIC = keys.syntheticDocument({ lessons: LESSONS });
const HEALTH = ['gradable', 'keys', 'lessons', 'schema_version', 'unavailable'];
const REPORT = ['db_only', 'file_only', 'lessons', 'mismatch', 'reason', 'state', 'stored_equal', 'unavailable'];

const same = (actual, expected, label) => assert.ok(actual === expected, label);
const sameJson = (actual, expected, label) => assert.ok(JSON.stringify(actual) === JSON.stringify(expected), label);
const refused = (status, message) => (error) => error.status === status && error.message === message;
const quiet = (text, label) => {
    assert.ok(!text.includes(keys.SYNTHETIC_PREFIX), `${label} carries a synthetic explanation`);
    assert.ok(!/[0-9a-f]{64}/.test(text), `${label} carries a hash`);
};
const flip = (hex) => hex.replace(/^./, (first) => (first === '0' ? '1' : '0'));

/** A storage double seeded with every curriculum lesson: public text only ('stripped') or with synthetic keys stored ('stored'). */
function keysFixture({ files = {}, env = {}, seed = 'stripped', document = SYNTHETIC } = {}) {
    const served = keys.keyRuntime({ files, env });
    const f = fixture({ runtime: { ...served.runtime, $security: { sha256: keys.sha256 } } });
    for (const name of ['slug', 'lesson', 'curriculum_version']) f.collections.tutorials.fields.add({ name });
    for (const { curriculum: _curriculum, ...record } of RECORDS) {
        const lesson = seed === 'stored' ? keys.keyedLesson(record.lesson, document.lessons[record.slug]) : record.lesson;
        f.seed('tutorials', { ...record, lesson });
    }
    const logs = [], saves = [], shared = new Map();
    f.app.dataDir = () => DATA_DIR;
    f.app.store = () => ({ setFunc: (key, fn) => shared.set(key, fn(shared.has(key) ? shared.get(key) : null)), get: (key) => shared.get(key) });
    f.app.logger = () => ({ warn: (...args) => logs.push(args) });
    const save = f.app.save;
    f.app.save = (value) => { saves.push(value); return save.call(f.app, value); };
    const service = f.load('lesson-keys.js');
    const access = f.load('workspace-access.js');
    const record = (slug) => f.app.findRecordsByFilter('tutorials', 'slug = {:slug}', '', 1, 0, { slug })[0];
    const stored = (slug) => JSON.parse(record(slug).getString('lesson'));
    const tutorials = () => JSON.stringify(f.data.tutorials);
    return { ...f, get data() { return f.data; }, served, files: served.files, env: served.env, logs, saves, shared, service, access,
        record, stored, tutorials, load: (options) => plain(service.load(f.app, options)) };
}

/** lesson-keys.pb.js run with captured routes, commands, console and exit. */
function routes(f) {
    const registered = [], commands = [], printed = [], errors = [], exits = [];
    class Command {
        constructor(definition) { Object.assign(this, definition); this.children = []; }
        addCommand(child) { this.children.push(child); }
    }
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/lesson-keys.pb.js'), {
        __hooks: '/hooks', Command,
        routerAdd: (...args) => registered.push(args),
        $app: Object.assign(Object.create(f.app), { rootCmd: { addCommand: (command) => commands.push(command) } }),
        $os: { ...f.served.runtime.$os, exit: (code) => exits.push(code) },
        console: { log: (line) => printed.push(String(line)), error: (line) => errors.push(String(line)) },
        require: (target) => { assert.equal(target, '/hooks/lesson-keys.js'); return f.service; },
    }, { filename: repoPath('apps/pocketbase/pb_hooks/lesson-keys.pb.js') });
    const health = () => {
        const headers = {}, replies = [];
        registered[0][2]({ app: f.app, response: { header: () => ({ set: (key, value) => { headers[key] = value; } }) },
            json: (status, body) => replies.push([status, JSON.stringify(body)]) });
        assert.equal(replies.length, 1);
        assert.equal(replies[0][0], 200);
        quiet(replies[0][1], 'keys-health');
        return { headers, body: JSON.parse(replies[0][1]) };
    };
    const check = (...args) => {
        const before = { printed: printed.length, errors: errors.length, exits: exits.length };
        commands[0].children[0].run({}, args);
        const output = printed.slice(before.printed), failures = errors.slice(before.errors);
        for (const line of [...output, ...failures]) quiet(line, 'lesson-keys check');
        return { output, failures, exits: exits.slice(before.exits), report: output.length ? JSON.parse(output[0]) : null };
    };
    return { registered, commands, health, check };
}

test('loads the default file, a named file or an explicit file, reading it once per call', () => {
    const f = keysFixture();
    sameJson(f.load(), { state: 'ABSENT', reason: 'absent', entries: {} }, 'no file is ABSENT');
    f.files[DEFAULT] = keys.keyFile('synthetic');
    f.env[keys.SYNTHETIC_VARIABLE] = '1';
    const before = f.served.reads.length;
    const synthetic = f.load();
    assert.equal(f.served.reads.length - before, 1, 'one read per call');
    assert.deepEqual(f.served.reads.slice(-1), [DEFAULT], 'the default file sits in the data directory');
    assert.equal(synthetic.state, 'SYNTHETIC');
    assert.equal(synthetic.reason, '');
    assert.deepEqual(Object.keys(synthetic.entries).sort(), SLUGS);
    // A named file replaces the default one, and a missing named file is never quietly ABSENT.
    f.env[keys.FILE_VARIABLE] = NAMED;
    sameJson(f.load(), { state: 'INVALID', reason: 'unreadable', entries: {} }, 'a missing named file is INVALID');
    f.files[NAMED] = keys.keyFile('private');
    f.files[DEFAULT] = '{not json';
    assert.equal(f.load().state, 'PRIVATE');
    f.files[ELSEWHERE] = keys.keyFile('invalid');
    assert.deepEqual([f.load({ file: ELSEWHERE }).state, f.load({ file: ELSEWHERE }).reason], ['INVALID', 'integrity'], 'an explicit file wins');
    delete f.env[keys.FILE_VARIABLE];
    f.files[DEFAULT] = 'unreadable';
    assert.deepEqual([f.load().state, f.load().reason], ['INVALID', 'unreadable'], 'an unreadable default file is not ABSENT');
    f.files[DEFAULT] = { directory: true };
    assert.deepEqual([f.load().state, f.load().reason], ['INVALID', 'unreadable']);
    assert.equal(f.saves.length, 0);
});

test('refuses every malformed or unsealed key file as INVALID, naming a reason code only', () => {
    const f = keysFixture({ env: { ...OPT_IN, [keys.FILE_VARIABLE]: NAMED } });
    const reason = (text) => {
        f.files[NAMED] = text;
        const result = f.load();
        if (result.state !== 'INVALID') return result.state;
        assert.ok(Object.keys(result.entries).length === 0, 'an INVALID file yields no entries');
        return result.reason;
    };
    const edit = (change) => keys.dump(keys.resealed(SYNTHETIC, change));
    const first = SLUGS[0];
    const entry = (change) => edit((doc) => change(doc.lessons[first]));
    // Python cannot write these values, so they are spliced into otherwise sealed text.
    const spliced = (change, marker, replacement) => {
        const text = entry(change);
        assert.equal(text.split(marker).length, 2, 'one marker');
        return text.replace(marker, replacement);
    };
    const made = (count) => {
        const lessons = {};
        for (let index = 0; index < count; index++)
            lessons[`made-up-${index}`] = { id: `madeup${index}`, curriculum_version: 'v-made-up', check_sha256: '0'.repeat(64), answer: 0, explanation: 'Made-up placeholder.' };
        return keys.dump(keys.keyDocument(lessons, { synthetic: true }));
    };
    assert.equal(reason(keys.keyFile('synthetic')), 'SYNTHETIC', 'the unaltered file loads');
    const cases = [
        ['{not json', 'not_json'],
        [keys.keyFile('synthetic') + ' '.repeat(256 * 1024), 'too_large'],
        [keys.keyFile('invalid'), 'integrity'],
        [edit((doc) => { doc.extra = true; }), 'schema'],
        [edit((doc) => { delete doc.source; }), 'schema'],
        [edit((doc) => { doc.schema_version = 'buildanddo.lesson-keys/2'; }), 'schema'],
        [edit((doc) => { doc.synthetic = 'true'; }), 'schema'],
        [keys.dump({ ...SYNTHETIC, integrity: SYNTHETIC.integrity.toUpperCase() }), 'schema'],
        [edit((doc) => { doc.source.kind = 'upload'; }), 'schema'],
        [edit((doc) => { doc.source.extra = ''; }), 'schema'],
        [edit((doc) => { doc.source.revision = 'line\nbreak'; }), 'schema'],
        [edit((doc) => { doc.lessons = []; }), 'schema'],
        [made(501), 'too_many_entries'],
        [edit((doc) => { doc.lessons.Not_A_Slug = doc.lessons[first]; }), 'entry'],
        [edit((doc) => { doc.lessons['two--hyphens'] = doc.lessons[first]; }), 'entry'],
        [edit((doc) => { doc.lessons['a'.repeat(81)] = doc.lessons[first]; }), 'entry'],
        [entry((value) => { value.extra = 1; }), 'entry'],
        [entry((value) => { delete value.explanation; }), 'entry'],
        [entry((value) => { value.id = 'has space'; }), 'entry'],
        [entry((value) => { value.curriculum_version = ''; }), 'entry'],
        [entry((value) => { value.curriculum_version = '\u{1D11E}'.repeat(41); }), 'entry'],
        [entry((value) => { value.check_sha256 = value.check_sha256.toUpperCase(); }), 'entry'],
        [entry((value) => { value.check_sha256 = value.check_sha256.slice(1); }), 'entry'],
        [entry((value) => { value.answer = 6; }), 'entry'],
        [entry((value) => { value.answer = -1; }), 'entry'],
        [spliced((value) => { value.answer = 987654; }, '"answer": 987654', '"answer": 1.5'), 'entry'],
        [entry((value) => { value.answer = '1'; }), 'entry'],
        [entry((value) => { value.answer = true; }), 'entry'],
        [entry((value) => { value.answer = null; }), 'entry'],
        [entry((value) => { value.explanation = ' \n\t '; }), 'entry'],
        [entry((value) => { value.explanation = 'x'.repeat(5001); }), 'entry'],
        [spliced((value) => { value.explanation = 'lone MARKER surrogate'; }, 'MARKER', '\\ud800'), 'entry'],
    ];
    cases.forEach(([text, expected], index) => assert.equal(reason(text), expected, `case ${index + 1}`));
    // The bounds themselves load.
    assert.equal(reason(made(500)), 'SYNTHETIC', 'five hundred entries load');
    assert.equal(reason(entry((value) => { value.explanation = 'x'.repeat(5000); })), 'SYNTHETIC');
    assert.equal(reason(entry((value) => { value.curriculum_version = '\u{1D11E}'.repeat(40); })), 'SYNTHETIC', 'counted in code points');
    assert.equal(reason(entry((value) => { value.answer = 5; })), 'SYNTHETIC', 'the range against choices is checked per lesson');
    // Synthetic keys need both the file's label and the environment's explicit opt-in.
    for (const value of ['', '0', 'true', 'yes']) {
        if (value) f.env[keys.SYNTHETIC_VARIABLE] = value; else delete f.env[keys.SYNTHETIC_VARIABLE];
        assert.equal(reason(keys.keyFile('synthetic')), 'synthetic_not_allowed', `opt-in value ${JSON.stringify(value)}`);
    }
    assert.equal(reason(keys.keyFile('private')), 'PRIVATE', 'a private file needs no opt-in');
});

test('an unusable file is logged by reason code only, at most once a minute, and never by the check command', () => {
    const f = keysFixture({ env: { [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: keys.keyFile('invalid') } });
    f.load(); f.load();
    assert.deepEqual(f.logs, [['Lesson grading keys are not usable.', 'reason', 'integrity']]);
    f.load({ log: false });
    assert.equal(f.logs.length, 1);
    f.shared.set('buildanddo.lesson_keys.warned_at', Date.now() - 61000);
    f.files[NAMED] = '{not json';
    f.load();
    assert.deepEqual(f.logs[1], ['Lesson grading keys are not usable.', 'reason', 'not_json']);
    f.shared.set('buildanddo.lesson_keys.warned_at', Date.now() + 3600000);
    f.load();
    assert.equal(f.logs.length, 3, 'a clock that went backwards does not silence the log');
    f.files[NAMED] = keys.keyFile('private');
    f.shared.clear();
    f.load();
    assert.equal(f.logs.length, 3, 'a usable file logs nothing');
    quiet(JSON.stringify(f.logs), 'the log');
});

test('resolves every lesson from the file in memory, leaving the stored lesson and the database untouched', () => {
    for (const variant of ['private', 'synthetic']) {
        const f = keysFixture({ env: { ...OPT_IN, [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: keys.keyFile(variant) } });
        const before = f.tutorials();
        const loaded = f.service.load(f.app);
        for (const slug of SLUGS) {
            const stored = f.stored(slug);
            const copy = JSON.stringify(stored);
            const resolved = plain(f.service.resolve(loaded, f.record(slug), stored));
            const entry = SYNTHETIC.lessons[slug];
            same(resolved.check.answer, entry.answer, slug);
            same(resolved.check.explanation, entry.explanation, slug);
            sameJson(resolved.check.question, stored.check.question, slug);
            sameJson(resolved.check.choices, stored.check.choices, slug);
            sameJson({ ...resolved, check: keys.publicCheck(resolved.check) }, stored, `${slug} keeps every other member`);
            same(JSON.stringify(stored), copy, `${slug} stored lesson is not mutated`);
        }
        assert.equal(f.saves.length, 0, 'the resolver never saves');
        same(f.tutorials(), before, 'tutorials are unchanged');
    }
});

test('an absent file, a missing entry or a lesson without a check leaves the stored lesson as it is', () => {
    const absent = keysFixture();
    const keysAbsent = absent.service.load(absent.app);
    for (const slug of SLUGS) {
        const stored = absent.stored(slug);
        same(absent.service.resolve(keysAbsent, absent.record(slug), stored), stored, slug);
    }
    const missing = SLUGS[3];
    const partial = keys.dump(keys.resealed(SYNTHETIC, (doc) => { delete doc.lessons[missing]; }));
    const f = keysFixture({ env: { ...OPT_IN, [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: partial } });
    const loaded = f.service.load(f.app);
    assert.equal(loaded.state, 'SYNTHETIC');
    const stored = f.stored(missing);
    same(f.service.resolve(loaded, f.record(missing), stored), stored, 'no entry for the slug');
    const reading = { schema_version: 1, sections: [] };
    same(f.service.resolve(loaded, f.record(missing), reading), reading, 'a lesson without a check');
    same(f.service.resolve(loaded, f.record(missing), null), null);
    assert.equal(f.saves.length, 0);
});

test('an unusable file still grades from database keys and fails closed only for lessons that need the file', () => {
    const env = { [keys.FILE_VARIABLE]: NAMED };
    const files = { [NAMED]: keys.keyFile('invalid') };
    const stored = keysFixture({ env, files, seed: 'stored' });
    const stripped = keysFixture({ env, files });
    const invalid = stored.service.load(stored.app);
    assert.equal(invalid.state, 'INVALID');
    for (const slug of SLUGS) {
        const lesson = stored.stored(slug);
        same(stored.service.resolve(invalid, stored.record(slug), lesson), lesson, `${slug} keeps grading from the database`);
        assert.throws(() => stripped.service.resolve(invalid, stripped.record(slug), stripped.stored(slug)),
            refused(503, 'Lesson grading keys need an operator review.'), slug);
    }
    for (const unknown of [undefined, null, {}, { state: 'PRIVATE' }, { state: 'LOADED', entries: SYNTHETIC.lessons }])
        assert.throws(() => stripped.service.resolve(unknown, stripped.record(SLUGS[0]), stripped.stored(SLUGS[0])),
            refused(503, 'Lesson grading keys need an operator review.'), 'an unknown key state fails closed');
    assert.equal(stored.saves.length + stripped.saves.length, 0);
});

test('an entry that disagrees with its lesson fails closed for that lesson only', () => {
    const review = refused(503, 'This lesson\'s knowledge check needs an operator review.');
    const target = SLUGS[5];
    for (const field of ['check_sha256', 'curriculum_version']) {
        const f = keysFixture({ env: { ...OPT_IN, [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: keys.keyFile('tampered', { slug: target, field }) } });
        const loaded = f.service.load(f.app);
        assert.equal(loaded.state, 'SYNTHETIC', 'a resealed tampered file loads');
        for (const slug of SLUGS) {
            if (slug === target) assert.throws(() => f.service.resolve(loaded, f.record(slug), f.stored(slug)), review, field);
            else same(plain(f.service.resolve(loaded, f.record(slug), f.stored(slug))).check.answer, SYNTHETIC.lessons[slug].answer, slug);
        }
    }
    const f = keysFixture({ env: { ...OPT_IN, [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: keys.keyFile('synthetic') } });
    const loaded = f.service.load(f.app);
    const record = f.record(target), lesson = f.stored(target), entry = SYNTHETIC.lessons[target];
    const resolve = (stored, at = record) => f.service.resolve(loaded, at, stored);
    const altered = (change) => { const copy = JSON.parse(JSON.stringify(lesson)); change(copy.check); return copy; };
    assert.throws(() => resolve(altered((check) => { check.question += ' (edited)'; })), review, 'an edited question');
    assert.throws(() => resolve(altered((check) => { check.choices.reverse(); })), review, 'reordered choices');
    assert.throws(() => resolve(altered((check) => { check.choices.push('An added choice'); })), review, 'an added choice');
    assert.throws(() => resolve(altered((check) => { delete check.question; })), review, 'no question');
    const moved = f.record(target); moved.set('curriculum_version', `${moved.getString('curriculum_version')}-next`);
    assert.throws(() => resolve(lesson, moved), review, 'a newer curriculum version');
    assert.throws(() => resolve(altered((check) => { check.answer = (entry.answer + 1) % check.choices.length; check.explanation = entry.explanation; })), review, 'a different stored answer');
    assert.throws(() => resolve(altered((check) => { check.answer = entry.answer; check.explanation = 'A different stored explanation.'; })), review, 'a different stored explanation');
    assert.throws(() => resolve(altered((check) => { check.answer = entry.answer; })), review, 'a stored answer without its explanation');
    assert.throws(() => resolve(altered((check) => { check.explanation = entry.explanation; })), review, 'a stored explanation without its answer');
    const agreeing = altered((check) => { check.answer = entry.answer; check.explanation = entry.explanation; });
    sameJson(plain(resolve(agreeing)), agreeing, 'stored keys equal to the entry resolve unchanged');
    // An index the lesson does not offer is refused even when the file is sealed around it.
    const short = SLUGS.find((slug) => LESSONS[slug].check.choices.length < 6);
    const outOfRange = keys.dump(keys.resealed(SYNTHETIC, (doc) => { doc.lessons[short].answer = LESSONS[short].check.choices.length; }));
    const g = keysFixture({ env: { ...OPT_IN, [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: outOfRange } });
    const sealed = g.service.load(g.app);
    assert.equal(sealed.state, 'SYNTHETIC');
    assert.throws(() => g.service.resolve(sealed, g.record(short), g.stored(short)), review, 'an answer beyond the choices');
    assert.equal(f.saves.length + g.saves.length, 0);
});

test('a lesson keyed in the database and the same lesson keyed by the file give one content digest', () => {
    const digest = (f, slug, lesson) => {
        const record = f.record(slug);
        return keys.sha256(f.access.canonical({ title: record.getString('title'), summary: record.getString('summary'),
            category: record.getString('category'), effort_minutes: Number(record.get('effort_minutes') || 10),
            curriculum_version: record.getString('curriculum_version') || 'custom', lesson }));
    };
    const database = keysFixture({ seed: 'stored' });
    const file = keysFixture({ env: OPT_IN, files: { [DEFAULT]: keys.keyFile('synthetic') } });
    const both = keysFixture({ env: OPT_IN, files: { [DEFAULT]: keys.keyFile('synthetic') }, seed: 'stored' });
    const loaded = [database, file, both].map((f) => f.service.load(f.app));
    assert.deepEqual(loaded.map((result) => result.state), ['ABSENT', 'SYNTHETIC', 'SYNTHETIC']);
    for (const slug of SLUGS) {
        const digests = [database, file, both].map((f, index) => digest(f, slug, plain(f.service.resolve(loaded[index], f.record(slug), f.stored(slug)))));
        same(digests[1], digests[0], `${slug} file-keyed equals database-keyed`);
        same(digests[2], digests[0], `${slug} keyed in both equals database-keyed`);
        assert.ok(digest(file, slug, file.stored(slug)) !== digests[0], `${slug} the keyless lesson has another digest`);
    }
});

test('the key decides correctness: two synthetic salts give each lesson its own answers', () => {
    const answers = {};
    for (const salt of ['synthetic', 'alternate']) {
        const f = keysFixture({ env: OPT_IN, files: { [DEFAULT]: keys.keyFile('synthetic', { salt }) } });
        const loaded = f.service.load(f.app);
        answers[salt] = Object.fromEntries(SLUGS.map((slug) => [slug, plain(f.service.resolve(loaded, f.record(slug), f.stored(slug))).check.answer]));
        for (const slug of SLUGS) same(answers[salt][slug], keys.syntheticAnswer(slug, LESSONS[slug].check.choices.length, salt), `${salt} ${slug}`);
    }
    assert.ok(SLUGS.some((slug) => answers.synthetic[slug] !== answers.alternate[slug]), 'the salts differ on at least one lesson');
});

test('the JavaScript fixture and lesson_keys.py synthetic agree on every byte, and the hook accepts the Python file', () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'lesson-keys-parity-'));
    try {
        for (const salt of ['synthetic', 'alternate']) {
            const out = path.join(scratch, `${salt}.json`);
            const run = spawnSync(pythonBin(), ['-I', repoPath('scripts/ci/lesson_keys.py'), 'synthetic', '--out', out, '--salt', salt],
                { cwd: repoPath('.'), encoding: 'utf8' });
            quiet(`${run.stdout}${run.stderr}`, 'lesson_keys.py output');
            assert.equal(run.status, 0, run.stderr);
            assert.deepEqual(JSON.parse(run.stdout), { lessons: SLUGS.length, mode: '0600', state: 'OK', synthetic: true });
            const python = readFileSync(out, 'utf8');
            same(python, keys.dump(keys.syntheticDocument({ salt, lessons: LESSONS })), `${salt} key file bytes`);
            const f = keysFixture({ env: OPT_IN, files: { [DEFAULT]: python } });
            assert.equal(f.load().state, 'SYNTHETIC', 'the hook verifies the Python integrity seal');
        }
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
    const f = keysFixture();
    for (const slug of SLUGS) same(f.service.binding(f.stored(slug).check), keys.binding(LESSONS[slug].check), `${slug} binding`);
    // Non-ASCII text and an astral character canonicalise alike in the fixture and the hook.
    const check = { question: 'Qué ✓ \u{1D11E}?', choices: ['été', '日本', 'tab\there', 'quote " and \\'] };
    same(f.service.binding(check), keys.binding(check), 'non-ASCII binding');
    assert.throws(() => keys.canonical({ question: 'lone \ud800', choices: [] }), /lone surrogate/);
});

test('keys-health is public and uncached, and reports the key state and lesson counts only', () => {
    const counts = (f) => { const { headers, body } = routes(f).health(); assert.equal(headers['Cache-Control'], 'no-store'); return body; };
    const f = keysFixture({ env: OPT_IN, files: { [DEFAULT]: keys.keyFile('synthetic') } });
    const route = routes(f);
    assert.equal(route.registered.length, 1);
    const [method, routePath, handler, ...middleware] = route.registered[0];
    assert.deepEqual([method, routePath, typeof handler, middleware.length], ['GET', '/api/buildanddo/learning/keys-health', 'function', 0]);
    const reads = f.served.reads.length;
    const body = counts(f);
    assert.equal(f.served.reads.length - reads, 1, 'one read per request');
    assert.deepEqual(Object.keys(body).sort(), HEALTH);
    const total = SLUGS.length;
    assert.deepEqual(body, { schema_version: 1, keys: 'SYNTHETIC', lessons: total, gradable: total, unavailable: 0 });
    assert.deepEqual(counts(keysFixture()), { schema_version: 1, keys: 'ABSENT', lessons: total, gradable: 0, unavailable: total });
    assert.deepEqual(counts(keysFixture({ seed: 'stored' })), { schema_version: 1, keys: 'ABSENT', lessons: total, gradable: total, unavailable: 0 });
    const invalid = { env: { [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: keys.keyFile('synthetic') } };
    assert.deepEqual(counts(keysFixture({ ...invalid, seed: 'stored' })), { schema_version: 1, keys: 'INVALID', lessons: total, gradable: total, unavailable: 0 });
    assert.deepEqual(counts(keysFixture(invalid)), { schema_version: 1, keys: 'INVALID', lessons: total, gradable: 0, unavailable: total });
    const tampered = keysFixture({ env: OPT_IN, files: { [DEFAULT]: keys.keyFile('tampered') } });
    assert.deepEqual(counts(tampered), { schema_version: 1, keys: 'SYNTHETIC', lessons: total, gradable: total - 1, unavailable: 1 });
    assert.equal(f.saves.length + tampered.saves.length, 0);
});

test('lesson-keys check is read-only, prints one line of counts and exits 1 whenever grading would fail', () => {
    const total = SLUGS.length;
    const report = (fields) => ({ state: 'SYNTHETIC', reason: '', lessons: total, stored_equal: 0, file_only: 0, db_only: 0, mismatch: 0, unavailable: 0, ...fields });
    const run = (options, ...args) => {
        const f = keysFixture(options);
        const before = f.tutorials();
        const command = routes(f);
        const result = command.check(...args);
        assert.equal(f.saves.length, 0, 'the check never saves');
        same(f.tutorials(), before, 'tutorials are unchanged');
        assert.equal(f.logs.length, 0, 'the check writes no log line');
        if (result.report) assert.deepEqual(Object.keys(result.report).sort(), REPORT);
        return { ...result, f, command };
    };
    const opted = { env: OPT_IN, files: { [DEFAULT]: keys.keyFile('synthetic') } };
    const first = run(opted);
    assert.equal(first.command.commands.length, 1);
    assert.equal(first.command.commands[0].use, 'lesson-keys');
    assert.deepEqual(first.command.commands[0].children.map((child) => child.use), ['check [file]']);
    assert.deepEqual(first.output.length, 1);
    assert.deepEqual([first.report, first.exits, first.failures], [report({ file_only: total }), [], []]);
    let result = run({ ...opted, seed: 'stored' });
    assert.deepEqual([result.report, result.exits], [report({ stored_equal: total }), []]);
    result = run({ seed: 'stored' });
    assert.deepEqual([result.report, result.exits], [report({ state: 'ABSENT', reason: 'absent', db_only: total }), []], 'database keys alone pass');
    result = run({});
    assert.deepEqual([result.report, result.exits], [report({ state: 'ABSENT', reason: 'absent', unavailable: total }), [1]]);
    result = run({ env: OPT_IN, files: { [DEFAULT]: keys.keyFile('tampered') } });
    assert.deepEqual([result.report, result.exits], [report({ file_only: total - 1, mismatch: 1, unavailable: 1 }), [1]]);
    result = run({ env: { [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: keys.keyFile('synthetic') }, seed: 'stored' });
    assert.deepEqual([result.report, result.exits],
        [report({ state: 'INVALID', reason: 'synthetic_not_allowed', db_only: total }), [1]], 'an unusable file fails even when the database grades');
    // An explicit file wins over the configured one, and a missing explicit file fails.
    result = run({ env: { ...OPT_IN, [keys.FILE_VARIABLE]: NAMED }, files: { [NAMED]: '{not json', [ELSEWHERE]: keys.keyFile('private') } }, ELSEWHERE);
    assert.deepEqual([result.report, result.exits], [report({ state: 'PRIVATE', file_only: total }), []]);
    result = run({ files: { [DEFAULT]: keys.keyFile('private') } }, '/nowhere/lesson-keys.json');
    assert.deepEqual([result.report, result.exits], [report({ state: 'INVALID', reason: 'unreadable', unavailable: total }), [1]]);
    result = run(opted, 'one', 'two');
    assert.deepEqual([result.output, result.failures, result.exits], [[], ['Usage: pocketbase lesson-keys check [file]'], [1]]);
    // An unexpected failure exits 1 without echoing its message.
    const f = keysFixture(opted);
    const command = routes(f);
    f.app.findRecordsByFilter = () => { throw new Error(`${keys.SYNTHETIC_PREFIX} text that must not be echoed`); };
    const failed = command.check();
    assert.deepEqual([failed.output, failed.failures, failed.exits], [[], ['lesson-keys check could not finish; nothing was changed.'], [1]]);
});
