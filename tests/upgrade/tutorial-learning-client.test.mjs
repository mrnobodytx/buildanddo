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
// Depends:     tests/upgrade/tutorial-learning-fixture.mjs, apps/web/src/lib/tutorialLearning.js, apps/web/src/lib/tutorialLearnerLesson.js, apps/web/src/lib/navigationIntent.js, apps/web/src/lib/buddi.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/tutorial-learning-fixture.mjs; VALIDATES apps/web/src/lib/tutorialLearning.js; VALIDATES apps/web/src/lib/tutorialLearnerLesson.js; VALIDATES apps/web/src/lib/navigationIntent.js; CONSUMES apps/web/src/lib/buddi.js
// DAG Node:    none
// Intent:      Verify lost-response recovery, account isolation and safe certificate exports through the real client and command source.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createTutorialLearningClient, certificateDocument, validCertificate } from '../../apps/web/src/lib/tutorialLearning.js';
import { learningFixture } from './tutorial-learning-fixture.mjs';
import { plain } from './admin-fixture.mjs';
import { classroomTelemetryLocation, scrubClassroomProperties } from '../../apps/web/src/lib/navigationIntent.js';
import { validLesson } from '../../apps/web/src/lib/tutorialCurriculum.js';
import { validLearnerLesson } from '../../apps/web/src/lib/tutorialLearnerLesson.js';
import { installGovernment } from './government-fixture.mjs';
import { buddiAchievements } from '../../apps/web/src/lib/buddi.js';

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
        try { value = plain(request.method === 'POST' ? f.service.command(event) :
            id === 'states' ? f.service.states(event) : id ? f.service.detail(event) : f.service.list(event)); }
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
    assert.equal(passed.data.tutorial.lesson.check.answer, undefined);
    assert.equal((await client.read(tutorial.id)).data.tutorial.lesson.check.answer, undefined, 'earned lessons remain keyless');
    for (const mutate of [(value) => ({ ...value, feedback: { ...value.feedback, correct: true } }),
        (value) => ({ ...value, feedback: null }), (value) => ({ ...value, feedback: { ...value.feedback, retry_after: -1 } })]) {
        state.mutate = (value) => mutate({ ...value, enrollment: { ...value.enrollment, status: 'in_progress', points: 0, progress: 80, completed_at: '', certificate: null } });
        assert.equal((await act('answer', { choice: answer })).reason, 'uncertain', 'an unconfirmed grade never displays as a pass');
        state.mutate = (value) => value; await client.retry();
    }
});

test('the guided client requires keyless lessons while public rendering accepts stripped previews and server grading requires full source', async () => {
    const { f, state, client, tutorial, act } = setup();
    const check = f.lessons[0].lesson.check;
    const learner = (value) => {
        value.tutorial.lesson.check = { question: check.question, choices: check.choices };
        return value;
    };
    state.mutate = learner;
    assert.equal((await client.read(tutorial.id)).ok, true);
    assert.equal(validLesson(learner(plain({ tutorial })).tutorial.lesson), true, 'public rendering supports stripped previews');
    assert.equal(validLesson(f.lessons[0].lesson), true);
    const other = learningFixture();
    other.data.tutorials.find((row) => row.id === tutorial.id).lesson.check = plain(tutorial.lesson.check);
    assert.throws(() => other.detail(), /supported lesson/, 'the server never grades a stripped authored lesson');
    assert.equal((await act('start')).ok, true);
    for (let index = 0; index < tutorial.lesson.sections.length; index++) assert.equal((await act('section', { index })).ok, true);
    assert.equal((await act('practice', { checks: tutorial.lesson.exercise.checklist.map(() => true) })).ok, true);
    const wrong = await act('answer', { choice: (check.answer + 1) % check.choices.length });
    assert.equal(wrong.ok, true); assert.equal(wrong.data.feedback.correct, false);
    f.expire();
    const right = await act('answer', { choice: check.answer });
    assert.equal(right.ok, true); assert.equal(right.data.feedback.correct, true);
    assert.equal(right.data.enrollment.points, 100);
    for (const extra of [{ answer: check.answer }, { explanation: check.explanation }, { grading: { answer: check.answer } }]) {
        state.mutate = (value) => { learner(value); Object.assign(value.tutorial.lesson.check, extra); return value; };
        assert.equal((await client.read(tutorial.id)).ok, false, 'a full authored response is not a learner response');
    }
});

test('learner validation rejects malformed content, unsafe references and every grading-field variant', () => {
    const f = learningFixture(), body = f.detail().tutorial.lesson;
    assert.equal(validLearnerLesson(body), true);
    assert.equal(validLearnerLesson(f.lessons[0].lesson), false);
    for (const invalid of [null, false, {}, { ...body, schema_version: 2 }, { ...body, outcomes: [] },
        { ...body, why: ' ' }, { ...body, why: 'x'.repeat(5001) }, { ...body, preparation: [false] }, { ...body, sections: [] },
        { ...body, sections: [{ heading: 'Mixed', paragraphs: [false], steps: ['Step'] }] },
        { ...body, sections: [{ heading: '', paragraphs: ['Paragraph'] }] },
        { ...body, sections: [{ heading: 'Empty' }] },
        { ...body, exercise: null }, { ...body, exercise: { prompt: 'Try', checklist: [] } },
        { ...body, check: null }, { ...body, check: { ...body.check, question: '' } },
        { ...body, check: { ...body.check, answer: 0 } }, { ...body, check: { ...body.check, explanation: '' } },
        { ...body, check: { ...body.check, choices: ['Only one'] } },
        { ...body, check: { ...body.check, choices: Array(7).fill('Too many') } },
        { ...body, references: [{ label: 'Unsafe', url: 'javascript:alert(1)' }] },
        { ...body, references: [{ label: false, url: '/docs' }] },
    ]) assert.equal(validLearnerLesson(invalid), false);
    assert.equal(validLearnerLesson({ ...body, sections: [{ heading: 'Steps only', steps: ['Read'] }] }), true);
    assert.equal(validLesson({ ...f.lessons[0].lesson, check: body.check }), true);
});

test('answer feedback must be present, typed, and backed by saved practice and a certificate when correct', async () => {
    const { f, state, act, client } = setup(); f.finish();
    for (const feedback of [null, {}, { correct: 'true', explanation: 'No' }, { correct: true, explanation: '' },
        ...[-1, 0.5, 3601, '30'].map((retry_after) => ({ correct: false, explanation: 'Wait', retry_after }))]) {
        state.mutate = (value) => ({ ...value, feedback });
        assert.equal((await act('answer', { choice: f.lessons[0].lesson.check.answer })).reason, 'uncertain');
    }
    state.mutate = (value) => value;
    assert.equal((await client.retry()).ok, true);
    const another = setup(); another.f.command('start');
    const lesson = another.f.lessons[0].lesson;
    for (let index = 0; index < lesson.sections.length; index++) another.f.command('section', { index });
    another.f.command('practice', { checks: lesson.exercise.checklist.map(() => true) });
    const wrong = (lesson.check.answer + 1) % lesson.check.choices.length;
    another.state.mutate = (value) => ({ ...value, feedback: { correct: true, explanation: 'Unsupported success' } });
    assert.equal((await another.act('answer', { choice: wrong })).reason, 'uncertain');
    another.state.mutate = (value) => ({ ...value, enrollment: { ...value.enrollment, practiced: false,
        progress: Math.floor(lesson.sections.length * 100 / (lesson.sections.length + 2)) } });
    another.f.expire();
    assert.equal((await another.client.retry()).reason, 'uncertain');
    another.state.mutate = (value) => value;
    another.f.expire();
    assert.equal((await another.client.retry()).ok, true);
});

test('canonical state reads traverse every bounded page without relying on the first five certificates', async () => {
    const { f, state, client } = setup();
    for (const lesson of f.lessons.slice(0, 6)) f.finish({ id: lesson.id });
    for (const lesson of f.lessons.slice(6)) f.command('start', {}, { id: lesson.id });
    f.seed('tutorial_progress', { owner: 'owner', tutorial: f.lessons[6].id, status: 'completed', progress: 100 });
    assert.equal((await client.read()).data.certificates.items.length, 5);
    const result = await client.readStates();
    assert.equal(result.ok, true); assert.equal(result.data.items.length, 25);
    assert.equal(result.data.items.filter((row) => row.status === 'completed').length, 6);
    assert.equal(result.data.items.find((row) => row.tutorial === f.lessons[6].id).status, 'in_progress');
    assert.deepEqual(state.requests.filter((r) => r.path.endsWith('/states')).map((r) => r.query.page), [1, 2]);
});

test('Buddi keeps the server summary contract separate from canonical catalogue pages and historical reading', async () => {
    const { f, client, state } = setup();
    f.seed('tutorial_progress', { owner: 'owner', tutorial: f.lessons[0].id, status: 'completed', progress: 100 });
    const milestones = (result) => buddiAchievements({ learning: { data: result.ok ? result.data : null, loading: false } })
        .filter((item) => item.source === 'learning');
    assert.ok(milestones(await client.read('', 1)).every((item) => item.state === 'open'));
    for (const lesson of f.lessons.slice(0, 6)) f.finish({ id: lesson.id });
    const summary = await client.read('', 1);
    assert.equal(summary.data.certificates.items.length, 5);
    assert.equal(summary.data.certificates.has_more, true);
    assert.deepEqual(milestones(summary).map((item) => [item.id, item.state]),
        [['learning:first', 'earned'], ['learning:five', 'earned'], ['learning:ten', 'open']]);
    assert.equal((await client.readStates()).data.items.length, 6);
    assert.deepEqual(milestones(await client.read('', 1)), milestones(summary));
    state.error = { status: 403 };
    assert.equal(milestones(await client.read('', 1))[0].state, 'unmeasured');
});

test('a revoked restricted enrollment keeps aggregate progress unknown without blocking authorized public detail or commands', async () => {
    const { f, client, tutorial, act } = setup();
    installGovernment(f, ['owner']);
    const restricted = f.seed('tutorials', { ...f.lessons[1], id: 'restricted00001', slug: 'restricted-fixture', category: 'Government submissions' });
    const started = f.command('start', {}, { id: restricted.id });
    const saved = plain(f.data.tutorial_learning[0]);
    f.data.government_memberships[0].status = 'revoked';
    const aggregate = await client.readStates();
    assert.equal(aggregate.reason, 'forbidden'); assert.equal(aggregate.data, undefined);
    assert.equal((await client.read(restricted.id)).reason, 'forbidden');
    assert.equal((await client.command(restricted.id, 'section', started.tutorial.content_digest, { index: 0 })).reason, 'forbidden');
    assert.deepEqual(f.data.tutorial_learning[0], saved);
    assert.equal((await client.read(tutorial.id)).ok, true);
    assert.equal((await act('start')).ok, true);
    assert.equal((await act('section', { index: 0 })).data.enrollment.next_section, 1);
    const after = await client.readStates();
    assert.equal(after.reason, 'forbidden'); assert.equal(after.data, undefined, 'restricted rows cannot be skipped to infer zero or partial completion');
    assert.deepEqual(f.data.tutorial_learning.find((row) => row.tutorial === restricted.id), saved);
});

test('incomplete, repeated, foreign, or stale state pages never become partial catalogue authority', async () => {
    for (const change of ['foreign', 'page', 'duplicate', 'missing', 'short', 'late', 'corrupt']) {
        const { f, state, sdk, client } = setup();
        for (const lesson of f.lessons) f.command('start', {}, { id: lesson.id });
        const send = sdk.send;
        sdk.send = async (path, request) => {
            const value = await send(path, request);
            if (request.query.page === 1 && change === 'short') value.items.pop();
            if (request.query.page === 2) {
                if (change === 'foreign') value.items[0].owner = 'otherowner';
                if (change === 'page') value.page = 1;
                if (change === 'duplicate') value.items[0] = plain(f.service.states(f.event('owner')).items[0]);
                if (change === 'missing') throw { status: 403 };
                if (change === 'late') state.live = false;
                if (change === 'corrupt') value.items[0].status = 'verified';
            }
            return value;
        };
        const result = await client.readStates();
        assert.equal(result.ok, false, change); assert.equal(result.data, undefined);
    }
});

test('state pagination has a finite budget and never publishes a truncated catalogue', async () => {
    const { f, state, sdk, client } = setup();
    f.command('start'); const template = plain(f.detail().enrollment);
    let requests = 0;
    sdk.send = async (_path, request) => {
        requests++;
        return { schema_version: 1, account_id: 'owner', page: request.query.page, has_more: true,
            items: Array.from({ length: 20 }, (_, index) => ({ ...template,
                id: `record-${request.query.page}-${index}`, tutorial: `lesson-${request.query.page}-${index}` })) };
    };
    assert.equal((await client.readStates()).ok, false);
    assert.equal(requests, 100);
    state.live = false;
    assert.equal((await client.readStates()).reason, 'scope_changed');
    assert.equal(requests, 100);
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
    assert.match(html, /open-book tutorial completion; practice self-reported/);
    assert.match(html, /not independently verified mastery/i);
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
