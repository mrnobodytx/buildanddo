// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/tutorial-learning-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/tutorial-learning.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/tutorial-learning.js
// DAG Node:    none
// Intent:      Exercise actual learning commands against the existing explicit transactional storage double.
// ───────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { fixture, plain, source } from './admin-fixture.mjs';

export const MIGRATION = 'apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js';

export function learningFixture() {
    const f = fixture({
        runtime: {
            $security: { sha256: (text) => createHash('sha256').update(text).digest('hex') },
            // countRecords takes dbx expressions, so the double has to hand out dbx expressions too.
            $dbx: { exp: (sql, params) => ({ __dbx: true, sql, params: params ?? {} }) },
        },
    });
    for (const name of ['lesson', 'curriculum_version']) f.collections.tutorials.fields.add({ name });
    const curriculum = JSON.parse(source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'));
    const lessons = curriculum.lessons.map((lesson) => ({ ...lesson, curriculum_version: curriculum.version }));
    lessons.forEach((lesson) => f.seed('tutorials', lesson));
    f.seed('users', { id: 'owner', name: 'Test Learner' });
    // THIS DOUBLE USED TO REPRODUCE THE DEFECT IT WAS SUPPOSED TO CATCH.
    // It was `(name, filter, params) => findRecordsByFilter(...)`, i.e. exactly the wrong signature
    // the hook was calling with. So the hook and its test agreed with each other and both disagreed
    // with PocketBase, and `GET /api/buildanddo/learning` answered 400 to every signed-in account on
    // BOTH environments while this suite stayed green. Real countRecords takes dbx expressions and
    // throws on anything else; so does this now, which is what makes the green mean something.
    f.app.countRecords = (name, ...exprs) => {
        for (const expr of exprs) {
            if (!expr || expr.__dbx !== true)
                throw new TypeError(
                    `could not convert function call parameter 1: could not convert ${expr} to dbx.Expression`);
        }
        // dbx speaks SQL, findRecordsByFilter speaks PocketBase filter syntax. Translate only the
        // two differences this double can honour, and REFUSE anything else rather than quietly
        // evaluating a filter that does not mean what the SQL meant.
        const filters = exprs.map(({ sql }) => {
            const translated = sql.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/''/g, '""');
            if (/\b(JOIN|SELECT|LIKE|IN\s*\(|CASE|COALESCE)\b/i.test(translated))
                throw new Error(`countRecords double cannot faithfully evaluate this SQL: ${sql}`);
            return translated;
        });
        const params = Object.assign({}, ...exprs.map((expr) => expr.params));
        return f.app.findRecordsByFilter(name, filters.join(' && '), '', 0, 0, params).length;
    };
    f.migration(MIGRATION).up();
    const service = f.load('tutorial-learning.js');
    const detail = (id = lessons[0].id, actor = 'owner') => plain(service.detail(f.event(actor, {}, { id })));
    const list = (actor = 'owner', query = {}) => plain(service.list(f.event(actor, {}, { query })));
    const command = (action, payload = {}, { id = lessons[0].id, actor = 'owner', digest } = {}) =>
        plain(service.command(f.event(actor, { action, payload, content_digest: digest ?? detail(id, actor).tutorial.content_digest }, { id })));
    const finish = (options = {}) => {
        const started = command('start', {}, options);
        for (let index = 0; index < started.tutorial.lesson.sections.length; index++) command('section', { index }, options);
        command('practice', { checks: started.tutorial.lesson.exercise.checklist.map(() => true) }, options);
        return command('answer', { choice: started.tutorial.lesson.check.answer }, options);
    };
    return { ...f, get data() { return f.data; }, lessons, service, detail, list, command, finish };
}
