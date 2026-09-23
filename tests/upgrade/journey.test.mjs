// ─── CGRF Header ──────────────────────────────
// File:        tests/upgrade/journey.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-JOURNEY-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/journey.js, apps/web/src/lib/authSession.js, apps/web/src/lib/workspaceControl.js, apps/web/src/lib/workspaceAssistant.js, apps/pocketbase/pb_migrations/data/starter-tutorials.json
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/journey.js; VALIDATES apps/web/src/lib/authSession.js; VALIDATES apps/web/src/lib/workspaceControl.js; VALIDATES apps/web/src/lib/workspaceAssistant.js
// DAG Node:    none
// Intent:      Prove every answer combination compiles to a shipped lesson and a proposed draft that still needs the person's own baseline and target.
// ───────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JOURNEY_QUESTIONS, assistantDraft, compileJourney, journeyComplete } from '../../apps/web/src/lib/journey.js';
import { planIssues } from '../../apps/web/src/lib/missionLearning.js';
import { createAuthSession } from '../../apps/web/src/lib/authSession.js';
import { createAssistantClient } from '../../apps/web/src/lib/workspaceAssistant.js';
import * as controls from '../../apps/web/src/lib/workspaceControl.js';

const shipped = new Set(JSON.parse(readFileSync(new URL('../../apps/pocketbase/pb_migrations/data/starter-tutorials.json', import.meta.url)))
    .lessons.map((lesson) => lesson.slug));

function* combinations(index = 0, answers = {}) {
    if (index === JOURNEY_QUESTIONS.length) { yield { ...answers }; return; }
    for (const item of JOURNEY_QUESTIONS[index].choices) yield* combinations(index + 1, { ...answers, [JOURNEY_QUESTIONS[index].id]: item.id });
}

test('every combination compiles to a shipped lesson and an unapprovable-until-measured draft', () => {
    let count = 0;
    for (const answers of combinations()) {
        count += 1;
        assert.equal(journeyComplete(answers), true);
        const compiled = compileJourney(answers);
        assert.ok(shipped.has(compiled.lesson.slug), compiled.lesson.slug);
        assert.equal(compiled.mission.status, 'proposed');
        assert.equal(compiled.mission.mission_plan.baseline, '');
        assert.equal(compiled.mission.mission_plan.target, '');
        assert.deepEqual(compiled.remaining, ['Baseline', 'Success criterion']);
        assert.deepEqual(planIssues(compiled.mission.mission_plan), compiled.remaining);
        assert.equal(compiled.mission.mission_plan.independent_review, answers.proof === 'reviewer');
        assert.ok(compiled.mission.title.length <= 200);
        assert.match(assistantDraft(compiled), /baseline I can measure/);
    }
    assert.equal(count, 2 * 5 * 3 * 3 * 2);
});

test('unknown or missing answers are refused', () => {
    assert.equal(journeyComplete({ mode: 'build' }), false);
    assert.throws(() => compileJourney({ mode: 'build' }), TypeError);
    assert.throws(() => compileJourney({ mode: 'fly', area: 'software', experience: 'new', time: 'day', proof: 'self' }), TypeError);
});

// Explicit native transport/auth-store doubles exercise the production controller
// and client. These are not a replacement for the unexecuted rendered suites.
function sessionFixture() {
    const listeners = new Set(), refreshes = [], reads = [], states = [];
    const authStore = { record: { id: 'editor' }, token: 'synthetic-session', isValid: true,
        save(token, record) { Object.assign(this, { token, record, isValid: true }); listeners.forEach((listener) => listener(token, record)); },
        clear() { Object.assign(this, { token: '', record: null, isValid: false }); listeners.forEach((listener) => listener('', null)); },
        onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
    const client = { authStore, send: (path) => new Promise((resolve, reject) => {
        (path.endsWith('/auth-refresh') ? refreshes : reads).push({ resolve, reject });
    }) };
    const controller = createAuthSession(client, (state) => states.push(state));
    const refresh = async (promise = controller.refresh(), account = 'editor') => {
        refreshes.at(-1).resolve({ record: { id: account, name: 'Fresh native record' }, token: `synthetic-refresh-${refreshes.length}` });
        assert.equal(await promise, true);
    };
    const assistant = () => {
        const epoch = states.at(-1).sessionEpoch;
        return createAssistantClient({ client, workspaceId: 'ws1', accountId: 'editor',
            isCurrent: () => controller.isCurrent(epoch) });
    };
    return { authStore, controller, states, refreshes, reads, refresh, assistant };
}

test('native same-account record and token refresh keeps the draft lifetime stable', async () => {
    const f = sessionFixture(); await f.refresh(f.controller.start());
    try {
        const before = f.states.at(-1), api = f.assistant(), read = api.snapshot();
        assert.equal(Number.isSafeInteger(before.sessionEpoch), true);
        await f.refresh();
        assert.notEqual(f.states.at(-1).user, before.user);
        assert.equal(f.states.at(-1).sessionEpoch, before.sessionEpoch);
        f.reads[0].resolve({ workspace: 'ws1', owner: 'editor' });
        assert.equal((await read).ok, true);
    } finally { f.controller.stop(); }
});

test('native authorization fences callbacks before a replacement session is rendered', async () => {
    const f = sessionFixture(); await f.refresh(f.controller.start());
    const epoch = f.states.at(-1).sessionEpoch;
    assert.equal(f.controller.isCurrent(epoch), true);
    f.authStore.save('synthetic-replacement', { id: 'editor' });
    assert.equal(f.controller.isCurrent(epoch), false);
    await f.refresh();
    assert.equal(f.controller.isCurrent(epoch), false);
    assert.equal(f.controller.isCurrent(f.states.at(-1).sessionEpoch), true);
    f.controller.stop();
    assert.equal(f.controller.isCurrent(f.states.at(-1).sessionEpoch), false);
});

for (const boundary of ['replace', 'logout-relogin', 'account-switch', 'revoked']) {
    test(`${boundary} fences old same-account responses after native authorization returns`, async () => {
        const f = sessionFixture(); await f.refresh(f.controller.start());
        try {
            const api = f.assistant(), read = api.snapshot();
            if (boundary === 'logout-relogin') f.authStore.clear();
            if (boundary === 'account-switch') f.authStore.save('synthetic-other', { id: 'other' });
            if (boundary === 'revoked') {
                const check = f.controller.refresh(); f.refreshes.at(-1).reject({ status: 403 });
                assert.equal(await check, false);
            }
            f.authStore.save('synthetic-replacement', { id: 'editor' });
            assert.equal(f.states.at(-1).status, 'checking');
            assert.equal((await api.command('session.start', {}, 'synthetic-no-write')).stale, true);
            assert.equal(f.reads.length, 1);
            await f.refresh();
            f.reads[0].resolve({ workspace: 'ws1', owner: 'editor' });
            assert.equal((await read).stale, true);
            assert.equal((await api.chat({})).stale, true);
            assert.equal(f.reads.length, 1);
        } finally { f.controller.stop(); }
    });
}

test('the production UI lifecycle key ignores refresh objects/loading but changes at private-work boundaries', () => {
    const input = { accountId: 'editor', workspaceId: 'ws1', sessionEpoch: 1, demo: false,
        access: { data: { role: 'editor', can_write: true, can_admin: false, can_grant_admin: false }, loading: false, error: '' } };
    const before = controls.workspaceLifecycleKey(input);
    assert.equal(controls.workspaceLifecycleKey({ ...input, access: { ...input.access, loading: true, data: { ...input.access.data } } }), before);
    for (const change of [
        { accountId: 'other' }, { workspaceId: 'ws2' }, { sessionEpoch: 2 }, { demo: true },
        { access: { data: null, error: 'Membership revoked', loading: false } },
        { access: { data: { ...input.access.data, role: 'viewer', can_write: false }, loading: false, error: '' } },
        { access: { ...input.access, accessEpoch: 2 } },
    ]) assert.notEqual(controls.workspaceLifecycleKey({ ...input, ...change }), before);
});
