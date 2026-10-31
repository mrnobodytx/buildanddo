// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/tutorial-learning-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-LEARNING-NATIVE-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     tests/upgrade/admin-fixture.mjs, tests/upgrade/lesson-keys-fixture.mjs, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js, apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/lesson-keys-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/tutorial-learning.js; CONSUMES apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js; CONSUMES apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js
// DAG Node:    none
// Intent:      Exercise actual learning commands against the existing explicit transactional storage double, grading from
//              synthetic lesson keys generated at test time.
// ───────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { fixture, plain, source } from './admin-fixture.mjs';
import { lessonKeyServer, publicLesson } from './lesson-keys-fixture.mjs';

export const MIGRATION = 'apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js';
export const PROGRESS_MIGRATION = 'apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js';
export const WAIT_MIGRATION = 'apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js';

// countRecords takes dbx expressions, so a double has to hand out dbx expressions too.
export const DBX = { exp: (sql, params) => ({ __dbx: true, sql, params: params ?? {} }) };

/** Give a fixture App the countRecords PocketBase has: dbx expressions only, never a filter string. */
export function faithfulCountRecords(app) {
    // THIS DOUBLE USED TO REPRODUCE THE DEFECT IT WAS SUPPOSED TO CATCH.
    // It was `(name, filter, params) => findRecordsByFilter(...)`, i.e. exactly the wrong signature
    // the hook was calling with. So the hook and its test agreed with each other and both disagreed
    // with PocketBase, and `GET /api/buildanddo/learning` answered 400 to every signed-in account on
    // BOTH environments while this suite stayed green. Real countRecords takes dbx expressions and
    // throws on anything else; so does this now, which is what makes the green mean something.
    app.countRecords = (name, ...exprs) => {
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
        return app.findRecordsByFilter(name, filters.join(' && '), '', 0, 0, params).length;
    };
}

/**
 * @param {object} options progressAuthority: install the progress migration; keys: the key file variant to serve
 * ('synthetic' by default, or 'absent', 'invalid', 'tampered' or 'private'); keyOptions: salt, slug, field or env for it.
 * Tutorials are seeded with public text only. Grading keys come from a synthetic key file generated at test time from
 * that text, served at the resolver's default path with the synthetic opt-in set. No real key is ever read.
 */
export function learningFixture({ progressAuthority = true, keys = 'synthetic', keyOptions = {} } = {}) {
    const served = lessonKeyServer(keys, keyOptions);
    const f = fixture({
        runtime: {
            ...served.runtime,
            $security: { sha256: (text) => createHash('sha256').update(text).digest('hex') },
            $dbx: DBX,
        },
    });
    served.attach(f.app);
    for (const name of ['lesson', 'curriculum_version']) f.collections.tutorials.fields.add({ name });
    const curriculum = JSON.parse(source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'));
    // The data file carries no keys; any a copy still held would be dropped here, so tutorials hold public text only.
    const lessons = curriculum.lessons.map((lesson) => ({ ...lesson, curriculum_version: curriculum.version, lesson: publicLesson(lesson.lesson) }));
    lessons.forEach((lesson) => f.seed('tutorials', lesson));
    f.seed('users', { id: 'owner', name: 'Test Learner' });
    faithfulCountRecords(f.app);
    f.migration(MIGRATION).up();
    if (progressAuthority) f.migration(PROGRESS_MIGRATION).up();
    f.migration(WAIT_MIGRATION).up();
    const service = f.load('tutorial-learning.js');
    const detail = (id = lessons[0].id, actor = 'owner') => plain(service.detail(f.event(actor, {}, { id })));
    const list = (actor = 'owner', query = {}) => plain(service.list(f.event(actor, {}, { query })));
    const command = (action, payload = {}, { id = lessons[0].id, actor = 'owner', digest } = {}) =>
        plain(service.command(f.event(actor, { action, payload, content_digest: digest ?? detail(id, actor).tutorial.content_digest }, { id })));
    // Responses withhold the answer and the curriculum no longer carries it, so tests grade from the synthetic key set.
    const slugOf = (id) => {
        const found = lessons.find((lesson) => lesson.id === id);
        if (!found) throw new Error(`no seeded lesson ${id}`);
        return found.slug;
    };
    const answerFor = (id = lessons[0].id) => served.answerFor(slugOf(id));
    const explanationFor = (id = lessons[0].id) => served.explanationFor(slugOf(id));
    // The lesson body a frozen snapshot holds: public text plus the synthetic key, as a database-held key would be.
    const keyed = (id = lessons[0].id) => served.keyed(slugOf(id), lessons.find((lesson) => lesson.id === id).lesson);
    const finish = (options = {}) => {
        const started = command('start', {}, options);
        for (let index = 0; index < started.tutorial.lesson.sections.length; index++) command('section', { index }, options);
        command('practice', { checks: started.tutorial.lesson.exercise.checklist.map(() => true) }, options);
        const saved = f.data.tutorial_learning.find((row) => row.id === started.enrollment.id);
        return command('answer', { choice: saved.snapshot.lesson.check.answer }, options);
    };
    // Ends a pending wrong-answer wait as if it had elapsed.
    const expire = () => { for (const row of f.data.tutorial_learning) row.answer_retry_at = ''; };
    return { ...f, get data() { return f.data; }, lessons, service, detail, list, command, finish, answerFor, explanationFor, keyed, keys: served, expire };
}
