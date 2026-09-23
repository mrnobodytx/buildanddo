// ─── CGRF Header ──────────────────────────────
// File:        tests/upgrade/career-profile.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-CAREER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CAREER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/career-profile.pb.js, apps/pocketbase/pb_hooks/career-profile.js, apps/career/profile.py
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/career-profile.pb.js; VALIDATES apps/pocketbase/pb_hooks/career-profile.js; DEPENDS_ON apps/career/profile.py
// DAG Node:    none
// Intent:      Run the real profile route against a Citadel double serving a Python-built envelope, proving auth, account binding, allow-listing, no-store and no persistence.
// ───────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { repoPath, runPython } from './admin-fixture.mjs';

const hooks = (name) => readFileSync(repoPath(`apps/pocketbase/pb_hooks/${name}`), 'utf8');
const TOKEN = 'test-service-token-not-a-secret';

let built;
function envelope(subject = 'u_person01') {
    if (!built) {
        built = JSON.parse(runPython(['-c', [
            'import json', 'from datetime import datetime, timezone',
            'from apps.career.evidence import EvidenceRef, Participation, ClaimState',
            'from apps.career.passport import build_passport',
            'from apps.career.profile import build_profile',
            'now = datetime(2026, 9, 23, tzinfo=timezone.utc)',
            'refs = [EvidenceRef("commit", "a" * 40, "ci_cd", Participation.PERSONALLY_IMPLEMENTED, ClaimState.OBSERVED, "2026-09-01T00:00:00+00:00", "ci(ci): gate"),',
            '        EvidenceRef("commit", "b" * 40, "ci_cd", Participation.PERSONALLY_IMPLEMENTED, ClaimState.OBSERVED, "2026-09-02T00:00:00+00:00", "ci(ci): wire"),',
            '        EvidenceRef("assessment", "assessment:A-1", "python", Participation.ASSESSED, ClaimState.VERIFIED, "2026-09-03T00:00:00+00:00", "5/5 proctored")]',
            'p = build_passport("human.test", refs, as_of=now, sources=[{"kind": "git", "head": "c" * 40, "authored": 2, "identity_digest": "sha256:" + "d" * 64}])',
            'print(json.dumps(build_profile(p.to_dict(), "u_person01", now)))',
        ].join('\n')]));
    }
    return { ...JSON.parse(JSON.stringify(built)), subject_id: subject };
}

function fixture({ env = {}, answer, verified = true } = {}) {
    const routes = new Map(); const calls = []; const logs = []; const headers = new Map();
    const forbidden = new Proxy({}, { get: (_, key) => { if (key === 'logger') return () => ({ warn: (...args) => logs.push(args) }); throw new Error(`storage touched: ${String(key)}`); } });
    const context = {
        __hooks: '/hooks', $app: forbidden,
        $os: { getenv: (name) => env[name] || '' },
        $http: { send(request) { calls.push(request); return answer(request); } },
        $apis: { requireAuth: (collection) => ({ collection }) },
        routerAdd(method, path, handler, ...middleware) { routes.set(`${method} ${path}`, { handler, middleware }); },
    };
    const load = (name) => {
        const module = { exports: {} };
        vm.runInNewContext(hooks(name), { ...context, module, exports: module.exports }, { filename: name });
        return module.exports;
    };
    context.require = (path) => load(path.split('/').at(-1));
    vm.runInNewContext(hooks('career-profile.pb.js'), context);
    const route = routes.get('GET /api/buildanddo/career/profile');
    const request = (auth = { id: 'u_person01', email: 'person@example.invalid' }) => {
        let response;
        route.handler({
            auth: auth && { ...auth, getBool: (key) => key === 'verified' && verified, getString: (key) => auth[key] || '' },
            response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
            json: (status, body) => { response = { status, body }; return response; },
        });
        return JSON.parse(JSON.stringify(response)); // leave the vm realm before comparing
    };
    return { routes, route, calls, logs, headers, request };
}

const live = { BUILDANDDO_CAREER_PROFILE_URL: 'https://profiles.example.invalid/career', BUILDANDDO_CAREER_PROFILE_TOKEN: TOKEN };

test('the route is native-authenticated GET and answers not_configured without calling Citadel', () => {
    const f = fixture({ answer: () => { throw new Error('must not call'); } });
    assert.equal(f.routes.size, 1);
    assert.equal(f.route.middleware[0].collection, 'users');
    assert.deepEqual(f.request(), { status: 200, body: { state: 'not_configured', subject_id: 'u_person01' } });
    assert.equal(f.calls.length, 0);
    assert.equal(f.headers.get('Cache-Control'), 'no-store');
    assert.equal(f.request(null).status, 401);
});

test('a Citadel profile loads for the signed-in account with only allow-listed fields', () => {
    const served = envelope();
    served.reserved_answers = { work_authorization: 'private-answer-marker' };
    served.identity = { person_emails: ['person@example.invalid'] };
    served.passport.capabilities[0].evidence.push({ ref: 'private-evidence-marker' });
    served.passport.sources[0].note = 'private-source-marker';
    const f = fixture({ env: live, answer: () => ({ statusCode: 200, json: served }) });
    const response = f.request();
    assert.equal(response.status, 200);
    assert.equal(response.body.state, 'ready');
    assert.equal(response.body.subject_id, 'u_person01');
    const profile = response.body.profile;
    assert.equal(profile.person_id, 'human.test');
    assert.equal(profile.digest, served.passport.digest);
    assert.deepEqual(profile.capabilities.map((row) => [row.capability_id, row.state]), [['ci_cd', 'OBSERVED'], ['python', 'VERIFIED']]);
    assert.deepEqual(profile.sources[0], { kind: 'git', head: 'c'.repeat(40), authored: 2 });
    assert.match(profile.card, /Check it yourself/);
    const text = JSON.stringify(response);
    for (const marker of ['private-answer-marker', 'private-evidence-marker', 'private-source-marker', 'person_emails', TOKEN,
        '"evidence":', 'a'.repeat(40), 'assessment:A-1', 'identity_digest'])
        assert.equal(text.includes(marker), false, marker);
    const [call] = f.calls;
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(JSON.parse(call.body), { subject_id: 'u_person01', email: 'person@example.invalid' });
    assert.equal(f.headers.get('Cache-Control'), 'no-store');
    assert.equal(f.logs.length, 0);
});

test('an unverified email is not sent to Citadel', () => {
    const f = fixture({ env: live, verified: false, answer: () => ({ statusCode: 404, json: {} }) });
    assert.deepEqual(f.request().body, { state: 'no_profile', subject_id: 'u_person01' });
    assert.equal(JSON.parse(f.calls[0].body).email, '');
});

test('wrong subject, malformed envelopes and upstream failures fail closed without leaking detail', () => {
    const cases = [
        () => ({ statusCode: 200, json: envelope('u_someone_else') }),
        () => ({ statusCode: 200, json: { ...envelope(), schema: 'other' } }),
        () => { const e = envelope(); e.passport.capabilities[0].verified = true; return { statusCode: 200, json: e }; },
        () => { const e = envelope(); e.passport.capabilities[0].state = 'TRUSTED'; return { statusCode: 200, json: e }; },
        () => { const e = envelope(); e.passport.digest = 'sha256:short'; return { statusCode: 200, json: e }; },
        () => ({ statusCode: 200, json: null }),
        () => ({ statusCode: 500, json: {} }),
        () => { throw new Error('connection refused'); },
    ];
    for (const answer of cases) {
        const f = fixture({ env: live, answer });
        const response = f.request();
        assert.deepEqual(response, { status: 503, body: { state: 'unavailable', subject_id: 'u_person01' } });
        assert.equal(f.logs.length, 1);
        assert.doesNotMatch(JSON.stringify(f.logs), /u_someone_else|connection refused/);
    }
});

test('an insecure endpoint or a missing token is refused before any request', () => {
    for (const env of [
        { ...live, BUILDANDDO_CAREER_PROFILE_URL: 'http://profiles.example.invalid/career' },
        { ...live, BUILDANDDO_CAREER_PROFILE_URL: 'https://user:pass@profiles.example.invalid/' },
        { ...live, BUILDANDDO_CAREER_PROFILE_URL: 'not a url' },
        { BUILDANDDO_CAREER_PROFILE_URL: live.BUILDANDDO_CAREER_PROFILE_URL },
    ]) {
        const f = fixture({ env, answer: () => { throw new Error('must not call'); } });
        assert.equal(f.request().status, 503);
        assert.equal(f.calls.length, 0);
    }
    const loopback = fixture({ env: { ...live, BUILDANDDO_CAREER_PROFILE_URL: 'http://127.0.0.1:8095/career' },
        answer: () => ({ statusCode: 200, json: envelope() }) });
    assert.equal(loopback.request().body.state, 'ready');
});
