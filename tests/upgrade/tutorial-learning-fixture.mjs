// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/tutorial-learning-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-LEARNING-NATIVE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js, apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/tutorial-learning.js; CONSUMES apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js; CONSUMES apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js
// DAG Node:    none
// Intent:      Exercise actual learning commands against the existing explicit transactional storage double.
// ───────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { fixture, plain, source } from './admin-fixture.mjs';

export const MIGRATION = 'apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js';
export const PROGRESS_MIGRATION = 'apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js';
export const WAIT_MIGRATION = 'apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js';

// PocketBase's countRecords takes dbx expressions only; a filter string is a native
// TypeError on 0.28 and 0.39, so the double refuses one too.
export const DBX = { hashExp: (value) => ({ hash: value }), not: (expression) => ({ not: expression }) };
const matches = (row, expression) => expression.not ? !matches(row, expression.not) :
    Object.entries(expression.hash).every(([key, value]) => (row[key] ?? '') === value);
export function nativeCount(f) {
    return (name, ...expressions) => {
        if (expressions.some((expression) => !expression || typeof expression !== 'object'))
            throw new TypeError('could not convert function call parameter 1 to dbx.Expression');
        return (f.data[name] || []).filter((row) => expressions.every((expression) => matches(row, expression))).length;
    };
}

export function learningFixture() {
    const f = fixture({ runtime: { $dbx: DBX, $security: { sha256: (text) => createHash('sha256').update(text).digest('hex') } } });
    for (const name of ['lesson', 'curriculum_version']) f.collections.tutorials.fields.add({ name });
    const curriculum = JSON.parse(source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'));
    const lessons = curriculum.lessons.map((lesson) => ({ ...lesson, curriculum_version: curriculum.version }));
    lessons.forEach((lesson) => f.seed('tutorials', lesson));
    f.seed('users', { id: 'owner', name: 'Test Learner' });
    f.app.countRecords = nativeCount(f);
    f.migration(MIGRATION).up();
    if (progressAuthority) f.migration(PROGRESS_MIGRATION).up();
    f.migration(WAIT_MIGRATION).up();
    const service = f.load('tutorial-learning.js');
    const detail = (id = lessons[0].id, actor = 'owner') => plain(service.detail(f.event(actor, {}, { id })));
    const list = (actor = 'owner', query = {}) => plain(service.list(f.event(actor, {}, { query })));
    const command = (action, payload = {}, { id = lessons[0].id, actor = 'owner', digest } = {}) =>
        plain(service.command(f.event(actor, { action, payload, content_digest: digest ?? detail(id, actor).tutorial.content_digest }, { id })));
    // Responses withhold the answer, so tests grade from the authored source.
    const answerFor = (id = lessons[0].id) => lessons.find((lesson) => lesson.id === id).lesson.check.answer;
    const finish = (options = {}) => {
        const started = command('start', {}, options);
        for (let index = 0; index < started.tutorial.lesson.sections.length; index++) command('section', { index }, options);
        command('practice', { checks: started.tutorial.lesson.exercise.checklist.map(() => true) }, options);
        const saved = f.data.tutorial_learning.find((row) => row.id === started.enrollment.id);
        return command('answer', { choice: saved.snapshot.lesson.check.answer }, options);
    };
    // Ends a pending wrong-answer wait as if it had elapsed.
    const expire = () => { for (const row of f.data.tutorial_learning) row.answer_retry_at = ''; };
    return { ...f, get data() { return f.data; }, lessons, service, detail, list, command, finish, answerFor, expire };
}
