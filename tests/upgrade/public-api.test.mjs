// CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/public-api.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-002, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-002, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     tests/upgrade/admin-fixture.mjs, tests/upgrade/tutorial-learning-fixture.mjs, tests/upgrade/lesson-keys-fixture.mjs,
//              apps/pocketbase/pb_hooks/public-api.js, apps/pocketbase/pb_hooks/buddi-intake.js, apps/pocketbase/pb_hooks/public-api.pb.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/tutorial-learning-fixture.mjs;
//              CONSUMES tests/upgrade/lesson-keys-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/public-api.js;
//              VALIDATES apps/pocketbase/pb_hooks/buddi-intake.js; VALIDATES apps/pocketbase/pb_hooks/public-api.pb.js
// DAG Node:    none
// Intent:      Keep Buddi's mirrored public text equal to the site's own sources, the mounted routes equal to the
//              tool contracts, and the request schema strict - without a database.
// ───────────────────────────────────────────────────────────────

// These run the module source itself with no PocketBase double: only pure functions are called,
// so nothing here can agree with the hook by imitating it. Behaviour that needs the runtime - the
// rules, the database, the receipts - is proven on the real binary in test_public_api_native.py.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { plain, repoPath, source } from './admin-fixture.mjs';
import { SYNTHETIC_PREFIX } from './lesson-keys-fixture.mjs';
import { learningFixture } from './tutorial-learning-fixture.mjs';

const HOOKS = 'apps/pocketbase/pb_hooks';

function load(name, cache = {}) {
    if (cache[name]) return cache[name];
    const module = { exports: {} };
    vm.runInNewContext(source(`${HOOKS}/${name}`), {
        module, __hooks: '/hooks', require: (target) => load(target.replace('/hooks/', ''), cache),
    }, { filename: repoPath(`${HOOKS}/${name}`) });
    cache[name] = module.exports;
    return module.exports;
}

const api = load('public-api.js');
const intake = load('buddi-intake.js');
const flat = (text) => text.replace(/\s+/g, ' ');

test('the routes mounted are exactly the eight tool contracts, and nothing catches /api/webhooks', () => {
    const routes = [...source(`${HOOKS}/public-api.pb.js`).matchAll(/routerAdd\('(GET|POST)', '([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(routes.sort(), [
        'GET /api/v1/public/challenges/demo',
        'GET /api/v1/public/challenges/{challenge_id}/state',
        'GET /api/v1/public/evidence',
        'GET /api/v1/public/product-context',
        'GET /api/v1/public/replay/{challenge_id}',
        'POST /api/v1/public/challenges/request',
        'POST /api/v1/public/feedback',
        'POST /api/v1/public/support/handoff',
    ]);
});

test('mirrored public text still matches the files it cites', () => {
    assert.ok(source('README.md').includes(api.PURPOSE.statement), 'README purpose line changed');
    const pages = source('apps/web/src/lib/publicPages.js');
    assert.ok(flat(pages).includes(api.PURPOSE.summary), 'home description changed');
    for (const page of api.PAGES) {
        assert.ok(flat(pages).includes(`path: '${page.path}'`), `page ${page.path} is gone`);
        assert.ok(flat(pages).includes(page.description), `description of ${page.path} changed`);
    }
    assert.ok(flat(source('apps/web/src/pages/PricingPage.jsx')).includes(api.BOUNDARIES.pricing), 'pricing statement changed');
    // One source for community links since SRS-BUILDANDDO-COMMUNITY-WEB-001; the footer reads from it.
    assert.equal(api.COMMUNITY.source, 'apps/web/src/lib/communityLinks.js');
    const links = flat(source(api.COMMUNITY.source));
    for (const key of ['discord', 'wiki', 'forum', 'reddit']) {
        const entry = links.slice(links.indexOf(`id: '${key}'`));
        assert.ok(links.includes(`id: '${key}'`) && entry.slice(0, entry.indexOf('}')).includes(`url: '${api.COMMUNITY[key]}'`),
            `${key} link changed`);
    }
    assert.ok(flat(source('apps/web/src/pages/HomePage.jsx')).includes('Submitting a challenge does not start an automation or create a verified result.'));
    assert.ok(api.OPERATING_MODEL.flow.some((line) => line.includes('Submitting a challenge does not start an automation or create a verified result.')));
});

test('search terms drop filler words and match on five-letter prefixes', () => {
    // The module runs in its own realm, so results are compared as plain JSON values.
    assert.deepEqual(plain(api.terms('I want to verify a release before shipping')), ['verif', 'relea', 'shipp']);
    assert.deepEqual(plain(api.terms('missed_appointments')), ['misse', 'appoi']);
    assert.deepEqual(plain(api.terms('real_estate')), ['estat']);
    assert.deepEqual(plain(api.terms('a b to')), []);
});

test('request bodies must be the declared JSON object and nothing more', () => {
    const ok = (kind, body) => plain(intake.validate(kind, JSON.stringify(body)));
    assert.deepEqual(ok('feedback', { feedback_type: ' gap ', summary: 'Line one\nline two\ttabbed', rating: 5 }).payload,
        { feedback_type: 'gap', summary: 'Line one\nline two\ttabbed', rating: 5 });
    assert.deepEqual(ok('feedback', { feedback_type: 'gap', summary: 's', challenge_id: '', rating: null }).payload,
        { feedback_type: 'gap', summary: 's' });
    assert.deepEqual(ok('handoff', { reason: 'r', summary: 's', preferred_contact_method: null }).payload, { reason: 'r', summary: 's' });
    assert.ok(ok('challenge_request', { challenge_id: 'release-with-evidence', user_objective: 'o', success_criteria: 'c' }).payload);
    const refused = [
        ['feedback', 'not json'],
        ['feedback', '[1]'],
        ['feedback', 'null'],
        ['feedback', JSON.stringify({ feedback_type: 'gap', summary: 's', extra: 1 })],
        ['feedback', JSON.stringify({ feedback_type: 'gap' })],
        ['feedback', JSON.stringify({ feedback_type: '', summary: 's' })],
        ['feedback', JSON.stringify({ feedback_type: 'gap', summary: 7 })],
        ['feedback', JSON.stringify({ feedback_type: 'gap', summary: 's', rating: 0 })],
        ['feedback', JSON.stringify({ feedback_type: 'gap', summary: 's', rating: 5.5 })],
        ['feedback', JSON.stringify({ feedback_type: 'gap', summary: 's', rating: '4' })],
        ['feedback', JSON.stringify({ feedback_type: 'gap', summary: 'bell\u0007' })],
        ['feedback', JSON.stringify({ feedback_type: 'gap', summary: 'x'.repeat(2001) })],
        ['feedback', JSON.stringify({ feedback_type: 'x'.repeat(101), summary: 's' })],
        ['handoff', JSON.stringify({ reason: 'x'.repeat(501), summary: 's' })],
        ['handoff', JSON.stringify({ reason: 'r', summary: 's', preferred_contact_method: 'x'.repeat(201) })],
        ['challenge_request', JSON.stringify({ challenge_id: 'release-with-evidence', user_objective: 'o' })],
        ['challenge_request', JSON.stringify({ challenge_id: '../x', user_objective: 'o', success_criteria: 'c' })],
        ['challenge_request', JSON.stringify({ challenge_id: 'a', user_objective: 'o', success_criteria: 'c', business_context: 3 })],
    ];
    for (const [kind, raw] of refused) {
        const result = intake.validate(kind, raw);
        assert.equal(result.payload, undefined, `${kind} accepted ${raw.slice(0, 60)}`);
        assert.equal(typeof result.reason, 'string');
    }
});

test('the write limits and the minimum secret length are the documented ones', () => {
    assert.equal(intake.PER_CONVERSATION, 5);
    assert.equal(intake.PER_HOUR, 200);
    assert.equal(intake.MIN_SECRET, 32);
    assert.deepEqual(plain(Object.keys(intake.CONTRACTS).sort()), ['challenge_request', 'feedback', 'handoff']);
});

// ---- published digests over private keys (SRS-BUILDANDDO-CURRICULUM-PRIVATE-001) ------------------------------
// These few run public-api.js inside the learning storage double, because the published digest must be the one
// tutorial-learning.js binds into a certificate. Grading keys are synthetic, generated at test time and served as the
// private key file. A failing comparison names the lesson, never a digest or a key.

/** Run one public-api handler against a storage double and return its single stamped reply. */
function call(f, handler, { challenge = '', query = {} } = {}) {
    const replies = [], headers = {};
    handler({
        app: f.app,
        request: { pathValue: (name) => (name === 'challenge_id' ? challenge : ''),
            url: { path: '/api/v1/public/test', query: () => ({ get: (name) => (Object.prototype.hasOwnProperty.call(query, name) ? query[name] : '') }) } },
        response: { header: () => ({ set: (key, value) => { headers[key] = value; } }) },
        json: (status, body) => { replies.push({ status, text: JSON.stringify(body) }); return null; },
        written: () => replies.length > 0,
    });
    assert.equal(replies.length, 1, 'one reply');
    assert.equal(headers['Cache-Control'], 'no-store');
    const { status, text } = replies[0];
    assert.ok(!text.includes(SYNTHETIC_PREFIX) && !/"(?:answer|explanation)"/.test(text), 'a reply never carries a key');
    return { status, body: JSON.parse(text) };
}

function publicFixture(options) {
    const f = learningFixture(options);
    const errors = [];
    f.app.logger = () => ({ error: (...args) => errors.push(args), warn: () => {} });
    return { f, api: f.load('public-api.js'), errors };
}

const published = (api, f, slug) => {
    const state = call(f, api.challengeState, { challenge: slug });
    const evidence = call(f, api.evidence, { query: { challenge_id: slug, evidence_type: 'digest' } });
    assert.equal(state.status, 200, slug); assert.equal(evidence.status, 200, slug);
    return { state: state.body, digest: evidence.body.items[0] };
};

test('a published content_digest is the enrollment and certificate digest, whether the key comes from the file or the database', () => {
    const { f, api, errors } = publicFixture();
    const { f: g, api: held } = publicFixture({ keys: 'absent' });
    for (const lesson of g.lessons) g.data.tutorials.find((row) => row.id === lesson.id).lesson = g.keyed(lesson.id);
    for (const lesson of f.lessons) {
        const { state, digest } = published(api, f, lesson.slug);
        assert.equal(state.verifier.state, 'SERVER_CHECKED', lesson.slug);
        assert.equal(digest.state, 'COMPUTED', lesson.slug);
        assert.ok(/^[0-9a-f]{64}$/.test(state.content_digest), lesson.slug);
        assert.ok(digest.content_digest === state.content_digest, `${lesson.slug}: evidence and state agree`);
        assert.ok(state.content_digest === f.detail(lesson.id).tutorial.content_digest, `${lesson.slug}: the enrollment digest`);
        assert.ok(published(held, g, lesson.slug).state.content_digest === state.content_digest, `${lesson.slug}: database-keyed`);
    }
    const certificate = f.finish().enrollment.certificate;
    assert.ok(certificate.content_digest === published(api, f, f.lessons[0].slug).state.content_digest, 'the certificate digest');
    assert.deepEqual(errors, []);
});

test('a lesson that cannot be graded publishes content_digest null and UNAVAILABLE, and the catalogue still answers', () => {
    for (const keys of ['absent', 'invalid']) {
        const { f, api, errors } = publicFixture({ keys });
        for (const lesson of f.lessons.slice(0, 3)) {
            const { state, digest } = published(api, f, lesson.slug);
            assert.equal(state.state, 'PUBLISHED', keys);
            assert.equal(state.content_digest, null, keys);
            assert.equal(state.verifier.state, 'UNAVAILABLE', keys);
            assert.equal(typeof state.verifier.reason, 'string');
            assert.deepEqual([digest.state, digest.content_digest], ['UNAVAILABLE', null], keys);
            assert.equal(state.steps.at(-1).kind, 'check');
        }
        assert.equal(call(f, api.demoChallenges).status, 200, keys);
        assert.deepEqual(errors, [], keys);
    }
    // An entry that disagrees with its lesson makes that lesson alone ungradable.
    const { f: base } = publicFixture();
    const [target, other] = base.lessons;
    const { f, api } = publicFixture({ keys: 'tampered', keyOptions: { slug: target.slug } });
    assert.deepEqual([published(api, f, target.slug).state.verifier.state, published(api, f, target.slug).state.content_digest], ['UNAVAILABLE', null]);
    assert.equal(published(api, f, other.slug).state.verifier.state, 'SERVER_CHECKED');
});

test('the key file is read at most once per catalogue read, and never by a read that publishes no digest', () => {
    const { f, api } = publicFixture();
    const reads = () => f.keys.reads.length;
    let before = reads();
    call(f, api.challengeState, { challenge: f.lessons[0].slug });
    assert.equal(reads() - before, 1, 'challenge state');
    before = reads();
    call(f, api.evidence, { query: { challenge_id: f.lessons[0].slug } });
    assert.equal(reads() - before, 1, 'challenge evidence');
    before = reads();
    call(f, api.demoChallenges, { query: { limit: '10' } });
    call(f, api.productContext, { query: { section: 'curriculum' } });
    call(f, api.replay, { challenge: f.lessons[0].slug });
    assert.equal(reads() - before, 0, 'listing, curriculum and replay publish no digest');
    assert.equal(f.data.tutorial_learning.length, 0, 'public reads never enroll');
});
