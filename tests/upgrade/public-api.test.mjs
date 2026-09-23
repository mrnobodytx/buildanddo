// CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/public-api.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-002
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/public-api.js,
//              apps/pocketbase/pb_hooks/buddi-intake.js, apps/pocketbase/pb_hooks/public-api.pb.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/public-api.js;
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
    assert.ok(pages.includes(api.BOUNDARIES.pricing), 'pricing statement changed');
    const footer = source('apps/web/src/components/site/Footer.jsx');
    for (const [key, name] of [['discord', 'DISCORD_INVITE_URL'], ['wiki', 'WIKI_URL'], ['forum', 'FORUM_URL'], ['reddit', 'REDDIT_URL']]) {
        assert.ok(footer.includes(`const ${name} = '${api.COMMUNITY[key]}';`), `${key} link changed`);
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
