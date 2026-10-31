// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/community-quiz.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-QUIZ-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-QUIZ-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     tests/upgrade/admin-fixture.mjs, tests/upgrade/lesson-keys-fixture.mjs, apps/pocketbase/pb_hooks/community-quiz.js, apps/pocketbase/pb_hooks/community-quiz.pb.js, apps/web/tools/generate-community.mjs
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/lesson-keys-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/community-quiz.js; VALIDATES apps/pocketbase/pb_hooks/community-quiz.pb.js; CONSUMES apps/web/tools/generate-community.mjs
// DAG Node:    none
// Intent:      Prove the community quiz is graded on the server for the bot only, never reveals the right choice on a wrong answer and stays bounded.
// ───────────────────────────────────────────────────────────────

// Grading keys are synthetic, generated at test time from public lesson text and served as the private key file.
// Assertions on key material use === or isDeepStrictEqual, so a failure names the lesson, never a key.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { fixture, plain, source } from './admin-fixture.mjs';
import { lessonKeyServer } from './lesson-keys-fixture.mjs';
import { buildCommunityCatalogue } from '../../apps/web/tools/generate-community.mjs';

// Synthetic test credential; never a deployed value.
const TOKEN = 'test-community-bot-token-' + 'x'.repeat(24);
const PERSON = '123456789012345678';
const release = { version: '38+abc1234', commit_sha: 'abc1234' + '0'.repeat(33) };
const starter = JSON.parse(source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'));
const government = JSON.parse(source('apps/pocketbase/pb_migrations/data/government-submissions.json'));

function quizFixture({ keys = 'synthetic', keyOptions = {} } = {}) {
    const served = lessonKeyServer(keys, { ...keyOptions, env: { BUILDANDDO_COMMUNITY_BOT_TOKEN: TOKEN } });
    const env = served.env;
    const comparisons = [];
    const sha256 = (text) => createHash('sha256').update(text).digest('hex');
    const f = fixture({ runtime: {
        ...served.runtime,
        $security: { sha256, equal: (a, b) => { comparisons.push([a.length, b.length]); return a === b; } },
    } });
    served.attach(f.app);
    for (const name of ['slug', 'lesson', 'curriculum_version']) f.collections.tutorials.fields.add({ name });
    for (const curriculum of [starter, government])
        for (const lesson of curriculum.lessons) f.seed('tutorials', { ...lesson, curriculum_version: curriculum.version });
    const shared = new Map();
    f.app.store = () => ({ setFunc: (key, fn) => shared.set(key, fn(shared.has(key) ? shared.get(key) : null)), get: (key) => shared.get(key) });
    const service = f.load('community-quiz.js');
    const event = (body, authorization = `Bearer ${TOKEN}`) => ({
        app: f.app, auth: null,
        request: { header: { get: (name) => name === 'Authorization' ? authorization : '' }, pathValue: () => '' },
        requestInfo: () => ({ body: plain(body), query: {}, auth: null }),
    });
    const grade = (slug, choice, { person = PERSON, authorization } = {}) =>
        plain(service.check(event({ slug, choice, discord_user_id: person }, authorization)));
    const check = (body) => plain(service.check(event(body)));
    return { ...f, env, comparisons, shared, service, grade, check, keys: served };
}
const refused = (status, pattern) => (error) => error.status === status && (!pattern || pattern.test(error.message));
const keys = lessonKeyServer();
const lesson = starter.lessons[0];
const right = keys.answerFor(lesson.slug);
const wrong = (right + 1) % lesson.lesson.check.choices.length;

test('the published community catalogue asks every lesson without its answer or explanation', () => {
    const catalogue = buildCommunityCatalogue(release);
    const text = JSON.stringify(catalogue);
    assert.equal(/"answer"|"explanation"/.test(text), false);
    for (const record of [...starter.lessons, ...government.lessons]) {
        assert.deepEqual(Object.keys(record.lesson.check).sort(), ['choices', 'question'], `${record.slug}: the authored source carries no key`);
        assert.equal(text.includes(keys.explanationFor(record.slug)), false, record.slug);
    }
    for (const [index, record] of catalogue.lessons.entries()) {
        const authored = [...starter.lessons, ...government.lessons][index];
        assert.deepEqual(record.lesson.check, { question: authored.lesson.check.question, choices: authored.lesson.check.choices });
    }
});

test('a right choice is confirmed with its explanation; a wrong one carries nothing that points at the answer', () => {
    const f = quizFixture();
    assert.ok(isDeepStrictEqual(f.grade(lesson.slug, wrong), { correct: false }), 'a wrong choice carries nothing more');
    const passed = f.grade(lesson.slug, right);
    assert.ok(isDeepStrictEqual(passed, { correct: true, explanation: keys.explanationFor(lesson.slug) }), 'the right choice is explained');
    for (const [index, record] of starter.lessons.entries()) {
        const person = String(200000000000000000n + BigInt(index));
        const answer = keys.answerFor(record.slug);
        const other = (answer + 1) % record.lesson.check.choices.length;
        const miss = f.grade(record.slug, other, { person });
        assert.deepEqual(Object.keys(miss), ['correct'], record.slug);
        assert.equal(JSON.stringify(miss).includes(record.lesson.check.choices[answer]), false);
        assert.ok(f.grade(record.slug, answer, { person }).explanation === keys.explanationFor(record.slug), record.slug);
    }
    assert.deepEqual(f.data.tutorials.find((row) => row.slug === lesson.slug).lesson, lesson.lesson, 'stored lessons are unchanged and keyless');
});

test('grading follows the private key: only the served key set answers right, and no key means no grade', () => {
    // Two synthetic salts give some lesson different answers; each fixture accepts only its own.
    const alternate = lessonKeyServer('synthetic', { salt: 'alternate' });
    const record = starter.lessons.find((item) => keys.answerFor(item.slug) !== alternate.answerFor(item.slug));
    assert.ok(record, 'the salts give at least one lesson different answers');
    for (const [salt, own, other] of [['synthetic', keys, alternate], ['alternate', alternate, keys]]) {
        const f = quizFixture({ keyOptions: { salt } });
        assert.ok(isDeepStrictEqual(f.grade(record.slug, other.answerFor(record.slug)), { correct: false }), salt);
        assert.equal(f.grade(record.slug, own.answerFor(record.slug)).correct, true, salt);
    }
    // No key file and no database key: the lesson cannot be graded here, so it is 404, never a pass or a guess.
    const absent = quizFixture({ keys: 'absent' });
    for (const choice of [0, 1]) assert.throws(() => absent.grade(lesson.slug, choice), refused(404));
    // A key file that cannot be used refuses with 503 where the database holds no key, and grades where it does.
    const invalid = quizFixture({ keys: 'invalid' });
    assert.throws(() => invalid.grade(lesson.slug, right), refused(503, /need an operator review/));
    const row = invalid.data.tutorials.find((item) => item.slug === lesson.slug);
    row.lesson = keys.keyed(lesson.slug, row.lesson);
    assert.equal(invalid.grade(lesson.slug, right, { person: '223456789012345678' }).correct, true, 'a database-held key keeps grading');
    // An entry that disagrees with its lesson refuses that lesson only.
    const target = starter.lessons[4];
    const tampered = quizFixture({ keys: 'tampered', keyOptions: { slug: target.slug } });
    assert.throws(() => tampered.grade(target.slug, keys.answerFor(target.slug)), refused(503, /needs an operator review/));
    assert.equal(tampered.grade(lesson.slug, right).correct, true, 'other lessons keep grading');
    assert.equal(absent.data.tutorials.find((item) => item.slug === lesson.slug).lesson.check.answer, undefined, 'grading never writes a key');
});

test('grading fails closed with 503 when the bot token is unset or shorter than 32 characters', () => {
    const f = quizFixture();
    for (const value of [undefined, '', 'x'.repeat(31)]) {
        if (value === undefined) delete f.env.BUILDANDDO_COMMUNITY_BOT_TOKEN; else f.env.BUILDANDDO_COMMUNITY_BOT_TOKEN = value;
        for (const authorization of [`Bearer ${value ?? ''}`, '', `Bearer ${TOKEN}`])
            assert.throws(() => f.grade(lesson.slug, right, { authorization }), refused(503, /^Community quiz grading is not configured on this server\.$/));
    }
    assert.equal(f.shared.size, 0, 'refused requests are not counted');
});

test('a missing or wrong token is refused with 401 after one fixed-length comparison', () => {
    const f = quizFixture();
    for (const authorization of ['', `Bearer `, `Basic ${TOKEN}`, `bearer ${TOKEN}`, `Bearer ${TOKEN.slice(0, -1)}`, `Bearer ${TOKEN}x`,
        `Bearer ${'y'.repeat(TOKEN.length)}`, `Bearer ${TOKEN.slice(0, 1)}`, `Bearer ${'z'.repeat(4096)}`]) {
        f.comparisons.length = 0;
        assert.throws(() => f.grade(lesson.slug, right, { authorization }), (error) =>
            refused(401)(error) && !error.message.includes(TOKEN.slice(0, 8)));
        // Always exactly one comparison of two 64-character digests, whatever the input's length or prefix.
        assert.deepEqual(f.comparisons, [[64, 64]], authorization.slice(0, 12));
    }
    assert.equal(f.shared.size, 0);
    assert.deepEqual(f.grade(lesson.slug, right).correct, true);
});

test('members-only government lessons are never graded anonymously, whatever the choice', () => {
    const f = quizFixture();
    for (const [index, record] of government.lessons.entries()) {
        const person = String(300000000000000000n + BigInt(index));
        const answer = keys.answerFor(record.slug);
        for (const choice of [answer, (answer + 1) % record.lesson.check.choices.length])
            assert.throws(() => f.grade(record.slug, choice, { person }), (error) =>
                refused(403, /website for current members/)(error) && !error.message.includes(keys.explanationFor(record.slug)));
    }
});

test('unknown, reading-only and duplicated lessons and malformed commands are refused', () => {
    const f = quizFixture();
    assert.throws(() => f.grade('no-such-lesson', 0), refused(404));
    f.seed('tutorials', { id: 'readingonly0001', slug: 'reading-only', title: 'Reading', category: 'Foundations', lesson: null });
    assert.throws(() => f.grade('reading-only', 0), refused(404));
    f.seed('tutorials', { ...lesson, id: 'duplicateslug01' });
    assert.throws(() => f.grade(lesson.slug, right, { person: '999999999999999999' }), refused(503));
    const g = quizFixture();
    for (const body of [
        { slug: lesson.slug, choice: right },
        { slug: lesson.slug, choice: right, discord_user_id: PERSON, extra: true },
        { slug: '../' + lesson.slug, choice: right, discord_user_id: PERSON },
        { slug: lesson.slug, choice: true, discord_user_id: PERSON },
        { slug: lesson.slug, choice: 6, discord_user_id: PERSON },
        { slug: lesson.slug, choice: -1, discord_user_id: PERSON },
        { slug: lesson.slug, choice: 1.5, discord_user_id: PERSON },
        { slug: lesson.slug, choice: right, discord_user_id: 123 },
        { slug: lesson.slug, choice: right, discord_user_id: '01234567890123456' },
    ]) assert.throws(() => g.check(body), refused(400), JSON.stringify(body));
    const outside = lesson.lesson.check.choices.length;
    if (outside <= 5) assert.throws(() => g.grade(lesson.slug, outside), refused(400, /listed answer/));
});

test('attempts are bounded per person and lesson, per person, and in tracked keys, then recover after the window', () => {
    const f = quizFixture();
    const { per_lesson: perLesson, per_person: perPerson, max_keys: maxKeys, window_ms: windowMs } = f.service.LIMITS;
    for (let i = 0; i < perLesson; i++) f.grade(lesson.slug, wrong);
    assert.throws(() => f.grade(lesson.slug, right), refused(429, /Try again in (600|599) seconds/));
    assert.equal(f.grade(starter.lessons[1].slug, keys.answerFor(starter.lessons[1].slug)).correct, true, 'another lesson keeps its own budget');
    assert.equal(f.grade(lesson.slug, right, { person: '223456789012345678' }).correct, true, 'another person keeps theirs');
    // Per-person budget across lessons, measured directly on the limiter with a controlled clock.
    const start = 1_900_000_000_000;
    for (let i = 0; i < perPerson; i++) f.service.admit(f.app, '323456789012345678', starter.lessons[i % 25].slug + (i >= 25 ? '-x' : ''), start);
    assert.throws(() => f.service.admit(f.app, '323456789012345678', 'fresh-lesson', start + 1000), refused(429));
    f.service.admit(f.app, '323456789012345678', 'fresh-lesson', start + windowMs);
    // Tracked keys stay bounded: a full table refuses newcomers instead of evicting live windows.
    const g = quizFixture();
    for (let i = 0; i < maxKeys / 2; i++) g.service.admit(g.app, String(400000000000000000n + BigInt(i)), 'lesson', start);
    assert.throws(() => g.service.admit(g.app, '499999999999999999', 'lesson', start + 1), refused(429, /60 seconds/));
    g.service.admit(g.app, '400000000000000000', 'lesson', start + 2);
    assert.equal(Object.keys(JSON.parse(g.shared.get('buildanddo.community_quiz.attempts'))).length, maxKeys);
    g.service.admit(g.app, '499999999999999999', 'lesson', start + windowMs);
    assert.equal(Object.keys(JSON.parse(g.shared.get('buildanddo.community_quiz.attempts'))).length, 2, 'expired windows are dropped');
    // A corrupt store value is treated as empty rather than locking everyone out.
    g.shared.set('buildanddo.community_quiz.attempts', '{broken');
    g.service.admit(g.app, '499999999999999999', 'lesson', start);
});

test('the route is uncached, body-limited, authorized by the module and never logs the token, choice or answer', () => {
    const route = source('apps/pocketbase/pb_hooks/community-quiz.pb.js');
    assert.match(route, /routerAdd\('POST', '\/api\/buildanddo\/community\/quiz\/check'/);
    assert.match(route, /Cache-Control', 'no-store'/);
    assert.match(route, /\$apis\.bodyLimit\(2000\)\);/);
    assert.equal(/requireAuth/.test(route), false, 'the bot has no PocketBase account; the token is the credential');
    const module = source('apps/pocketbase/pb_hooks/community-quiz.js');
    assert.equal(/console\.|logger\(|\$app\.logger/.test(module), false);
    assert.match(module, /\$security\.equal\(\$security\.sha256\(given\), \$security\.sha256\(expected\)\)/);
    for (const file of ['.env.example', 'docker-compose.yml', 'docs/discord-bot.md'])
        assert.match(source(file), /BUILDANDDO_COMMUNITY_BOT_TOKEN/, file);
    assert.match(source('docker-compose.yml'), /BUILDANDDO_COMMUNITY_BOT_TOKEN: \$\{BUILDANDDO_COMMUNITY_BOT_TOKEN:-\}/);
    assert.match(source('.env.example'), /^BUILDANDDO_COMMUNITY_BOT_TOKEN=$/m);
});
