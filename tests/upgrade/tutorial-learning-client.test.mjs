// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/tutorial-learning-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     tests/upgrade/tutorial-learning-fixture.mjs, apps/web/src/lib/tutorialLearning.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/tutorial-learning-fixture.mjs; VALIDATES apps/web/src/lib/tutorialLearning.js; VALIDATES apps/web/src/lib/navigationIntent.js
// DAG Node:    none
// Intent:      Verify lost-response recovery, account isolation and safe certificate exports through the real client and command source.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createTutorialLearningClient, certificateDocument, validCertificate } from '../../apps/web/src/lib/tutorialLearning.js';
import { learningFixture } from './tutorial-learning-fixture.mjs';
import { plain } from './admin-fixture.mjs';
import { classroomTelemetryLocation, scrubClassroomProperties } from '../../apps/web/src/lib/navigationIntent.js';

function setup(options = {}) {
    const f = learningFixture();
    const state = { live: true, lose: false, mutate: (value) => value, requests: [], error: null };
    const sdk = { authStore: { record: { id: 'owner' } }, async send(path, request) {
        state.requests.push({ path, ...plain(request) });
        assert.equal(request.requestKey, null); assert.equal(request.cache, 'no-store');
        if (state.error) throw state.error;
        const id = path.replace('/api/buildanddo/learning', '').slice(1);
        const event = f.event(sdk.authStore.record.id, request.body || {}, { id, query: request.query || {} });
        let value;
        // Native hook errors reach the SDK as a status with a response message.
        try { value = plain(request.method === 'POST' ? f.service.command(event) : id ? f.service.detail(event) : f.service.list(event)); }
        catch (error) { throw error.status ? { status: error.status, response: { message: error.message } } : error; }
        if (state.lose) { state.lose = false; throw new Error('response lost'); }
        return state.mutate(value);
    } };
    const client = createTutorialLearningClient({ client: sdk, accountId: 'owner', isCurrent: () => state.live, ...options });
    const tutorial = f.detail().tutorial;
    return { f, state, sdk, client, tutorial, act: (action, payload = {}) => client.command(tutorial.id, action, tutorial.content_digest, payload) };
}

test('client accepts real saved responses, resumes after remount, and exports a complete certificate', async () => {
    const { f, state, sdk, client, tutorial, act } = setup();
    assert.equal((await client.read()).data.completed, 0);
    assert.equal((await client.read(tutorial.id)).data.enrollment, null);
    assert.equal((await act('start')).ok, true);
    await act('section', { index: 0 });
    const remounted = createTutorialLearningClient({ client: sdk, accountId: 'owner', isCurrent: () => true });
    assert.equal((await remounted.read(tutorial.id)).data.enrollment.next_section, 1);
    const finished = f.finish();
    assert.equal((await client.read(tutorial.id)).ok, true);
    const growth = (await client.read()).data;
    assert.equal(growth.points, 100);
    assert.equal(growth.certificates.items[0].certificate.id, finished.enrollment.certificate.id);
    assert.ok(validCertificate(finished.enrollment.certificate));
    assert.match(certificateDocument(finished.enrollment.certificate), /Certificate of completion/);
    assert.ok(state.requests.every((request) => !JSON.stringify(request).includes('Test Learner')), 'client cannot supply certificate identity');
});

test('a dropped committed response keeps the exact retry and refuses a new change until recovery', async () => {
    const { f, state, client, act } = setup();
    state.lose = true;
    assert.equal((await act('start')).reason, 'uncertain');
    assert.equal(f.data.tutorial_learning.length, 1);
    const requests = state.requests.length;
    assert.equal((await act('section', { index: 0 })).reason, 'uncertain');
    assert.equal(state.requests.length, requests);
    const recovered = await client.retry();
    assert.equal(recovered.ok, true);
    assert.equal(recovered.data.replayed, true);
    assert.equal(f.data.tutorial_learning.length, 1);
    assert.deepEqual(state.requests[0].body, state.requests[1].body);
    f.finish();
    state.lose = true;
    assert.equal((await act('answer', { choice: f.answerFor() })).reason, 'uncertain');
    assert.equal((await client.retry()).data.enrollment.points, 100);
    assert.equal(f.list().points, 100);
});

test('anonymous, demo, unmounted and changed-account clients perform no requests', async () => {
    for (const options of [{ demo: true }, { accountId: '' }]) {
        const { state, client, act } = setup(options);
        assert.equal((await client.read()).reason, 'scope_changed');
        assert.equal((await act('start')).reason, 'scope_changed');
        assert.equal(state.requests.length, 0);
    }
    const { sdk, state, client, act } = setup();
    state.live = false;
    assert.equal((await client.read()).reason, 'scope_changed');
    state.live = true; sdk.authStore.record = { id: 'otherowner' };
    assert.equal((await act('start')).reason, 'scope_changed');
    assert.equal(state.requests.length, 0);
});

test('late responses after account change or unmount are discarded', async () => {
    const { state, sdk, client, act } = setup();
    const send = sdk.send;
    let resolve;
    sdk.send = async (...args) => { const value = await send(...args); await new Promise((done) => { resolve = done; }); return value; };
    const response = client.read();
    await new Promise((done) => setImmediate(done));
    sdk.authStore.record = { id: 'otherowner' }; resolve();
    assert.equal((await response).reason, 'scope_changed');
    sdk.authStore.record = { id: 'owner' };
    const saved = act('start');
    await new Promise((done) => setImmediate(done));
    state.live = false; resolve();
    assert.equal((await saved).reason, 'scope_changed');
});

test('incomplete or cross-account responses never mint browser progress or credit', async () => {
    const { state, client, tutorial, act, f } = setup();
    for (const mutate of [
        (value) => ({ ...value, account_id: 'otherowner' }),
        (value) => ({ ...value, tutorial: { ...value.tutorial, id: 'foreign' } }),
        (value) => ({ ...value, tutorial: { ...value.tutorial, lesson: { schema_version: 2 } } }),
    ]) {
        state.mutate = mutate;
        assert.equal((await client.read(tutorial.id)).ok, false);
    }
    state.mutate = (value) => ({ ...value, enrollment: { ...value.enrollment, points: 999 } });
    assert.equal((await act('start')).reason, 'uncertain');
    state.mutate = (value) => value;
    assert.equal((await client.retry()).ok, true);
    f.finish();
    for (const mutate of [
        (value) => ({ ...value, points: 999 }),
        (value) => ({ ...value, level: { ...value.level, floor: 900 } }),
        (value) => ({ ...value, certificates: { ...value.certificates, items: [{ ...value.certificates.items[0], owner: 'otherowner' }] } }),
        (value) => ({ ...value, certificates: { ...value.certificates, has_more: 'no' } }),
    ]) { state.mutate = mutate; assert.equal((await client.read()).ok, false); }
});

test('wrong answers retain their feedback, wait on the server and cannot claim completion', async () => {
    const { client, tutorial, act, f, state } = setup();
    const answer = f.answerFor();
    assert.equal(tutorial.lesson.check.answer, undefined, 'the client validates lessons without the answer');
    await act('start');
    for (let index = 0; index < tutorial.lesson.sections.length; index++) await act('section', { index });
    await act('practice', { checks: tutorial.lesson.exercise.checklist.map(() => true) });
    const wrong = await act('answer', { choice: (answer + 1) % tutorial.lesson.check.choices.length });
    assert.equal(wrong.ok, true);
    assert.equal(wrong.data.feedback.correct, false);
    assert.equal(wrong.data.feedback.retry_after, 30);
    assert.equal(wrong.data.enrollment.certificate, null);
    assert.equal((await client.read()).data.points, 0);
    const waiting = await act('answer', { choice: answer });
    assert.equal(waiting.reason, 'wait');
    assert.match(waiting.error, /try the knowledge check again in \d+ seconds/);
    f.expire();
    const passed = await act('answer', { choice: answer });
    assert.equal(passed.data.enrollment.points, 100);
    assert.equal(passed.data.tutorial.lesson.check.answer, answer);
    assert.equal((await client.read(tutorial.id)).data.tutorial.lesson.check.answer, answer, 'earned answers load for review');
    for (const mutate of [(value) => ({ ...value, feedback: { ...value.feedback, correct: true } }),
        (value) => ({ ...value, feedback: null }), (value) => ({ ...value, feedback: { ...value.feedback, retry_after: -1 } })]) {
        state.mutate = (value) => mutate({ ...value, enrollment: { ...value.enrollment, status: 'in_progress', points: 0, progress: 80, completed_at: '', certificate: null } });
        assert.equal((await act('answer', { choice: answer })).reason, 'uncertain', 'an unconfirmed grade never displays as a pass');
        state.mutate = (value) => value; await client.retry();
    }
});

test('storage errors remain recoverable; rejected commands clear pending state', async () => {
    const { client, state, act } = setup();
    state.error = { status: 503, response: { message: 'Learning is not installed.' } };
    assert.equal((await client.read()).error, 'Learning is not installed.');
    assert.equal((await act('start')).reason, 'uncertain');
    state.error = { status: 403, response: { message: 'Access changed.' } };
    assert.equal((await client.retry()).reason, 'forbidden');
    assert.equal((await client.retry()).ok, false);
    state.error = { status: 409, response: { message: 'Reload.' } };
    assert.equal((await act('start')).reason, 'conflict');
    state.error = null;
    assert.equal((await act('start')).ok, true);
});

test('duplicate in-flight saves are serialized and invalid routes are never sent', async () => {
    const { state, sdk, client, act, tutorial } = setup();
    for (const request of [() => client.read('../other'), () => client.read('', 0), () => client.read('', 10000),
        () => client.command(tutorial.id, 'complete', tutorial.content_digest), () => client.command(tutorial.id, 'start', 'fake')])
        assert.equal((await request()).ok, false);
    assert.equal(state.requests.length, 0);
    const send = sdk.send;
    let resolve;
    sdk.send = async (...args) => { const value = await send(...args); await new Promise((done) => { resolve = done; }); return value; };
    const pending = act('start');
    await new Promise((done) => setImmediate(done));
    assert.equal((await act('start')).reason, 'busy');
    assert.equal(state.requests.length, 1);
    resolve(); assert.equal((await pending).ok, true);
});

test('certificate export escapes personal text and carries no scripts, external assets or account email', () => {
    const { f } = setup();
    const receipt = f.finish().enrollment.certificate;
    const hostile = { ...receipt, learner: '<img src=x onerror="alert(1)">', title: '<script>alert(1)</script>', scope: 'Learning & "practice" only' };
    const html = certificateDocument(hostile);
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&amp; &quot;practice&quot;'));
    assert.ok(!/<script|<img|<iframe|https?:|@/.test(html.replace('@media print', '')));
    assert.ok(html.includes("default-src 'none'"));
    assert.ok(html.includes(receipt.id));
    for (const bad of [null, {}, { ...receipt, learning_points: 900 }, { ...receipt, issued_at: 'not a date' },
        { ...receipt, content_digest: '' }, { ...receipt, id: '../file' }]) {
        assert.equal(validCertificate(bad), false);
        assert.throws(() => certificateDocument(bad), TypeError);
    }
});

test('learning API identities and query values are removed from browser telemetry', () => {
    assert.equal(classroomTelemetryLocation('/api/buildanddo/learning/private-lesson?page=2#checkpoint'), '/api/buildanddo/learning/:tutorial');
    assert.equal(classroomTelemetryLocation('https://example.com/hcgi/platform/api/buildanddo/learning/private-lesson?answer=1'),
        'https://example.com/hcgi/platform/api/buildanddo/learning/:tutorial');
    assert.equal(classroomTelemetryLocation('/api/buildanddo/learning/?page=2'), '/api/buildanddo/learning');
    const event = scrubClassroomProperties({ properties: { $current_url: '/api/buildanddo/learning/private-lesson',
        $set_once: { $initial_current_url: '/app/tutorials?lesson=private-lesson' } } });
    assert.ok(!JSON.stringify(event).includes('private-lesson'));
    assert.equal(classroomTelemetryLocation('/api/buildanddo/learning-tools'), '/api/buildanddo/learning-tools');
});
