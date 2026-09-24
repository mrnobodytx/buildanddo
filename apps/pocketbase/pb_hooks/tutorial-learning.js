// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/tutorial-learning.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js, apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js, apps/pocketbase/pb_hooks/government-access.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js; CONSUMES apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js; CONSUMES apps/pocketbase/pb_hooks/government-access.js
// DAG Node:    none
// Intent:      Award durable learning credit only after ordered checkpoints, recorded practice and a server-checked answer that is never sent before it is earned.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const government = require(`${__hooks}/government-access.js`);
const FIELDS = ['owner', 'tutorial', 'snapshot', 'content_digest', 'next_section', 'practiced', 'completed_at', 'certificate', 'protocol_version', 'answer_retry_at'];
const POINTS = 100;
// A wrong answer pauses further answers for this enrollment; longer stored waits are ignored so nobody is locked out.
const RETRY_SECONDS = 30;

function schema(app) {
    let collection;
    try { collection = app.findCollectionByNameOrId('tutorial_learning'); }
    catch (error) {
        if (!String(error.message).includes('no rows in result set')) throw error;
        throw new ApiError(503, 'Interactive learning is not installed yet. You can still read the lessons.');
    }
    if (FIELDS.some((key) => !collection.fields.getByName(key))) throw new ApiError(503, 'The interactive learning upgrade is not installed.');
    if (['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((key) => collection[key] !== null))
        throw new ApiError(503, 'Learning records need an operator review before they can be used.');
    const shape = (index) => String(index).toLowerCase().replace(/[`"[\]]/g, '')
        .replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
    if (!(collection.indexes || []).map(shape).includes(shape('create unique index idx_tutorial_learning_identity on tutorial_learning (owner, tutorial)')))
        throw new ApiError(503, 'Learning identity constraints need an operator review.');
    return collection;
}
function account(app, e) {
    access.authenticated(e);
    const user = access.find(app, 'users', e.auth.id);
    schema(app);
    return user;
}
function enrollment(app, owner, tutorial) {
    const rows = app.findRecordsByFilter('tutorial_learning', 'owner = {:owner} && tutorial = {:tutorial}', '', 2, 0, { owner, tutorial });
    if (rows.length > 1) throw new ApiError(503, 'Duplicate learning records need an operator review.');
    return rows[0] || null;
}
function strings(value, max = 20) {
    return Array.isArray(value) && value.length > 0 && value.length <= max && value.every((item) => access.text(item, 5000));
}
function supported(lesson) {
    return lesson && lesson.schema_version === 1 && strings(lesson.outcomes) && access.text(lesson.why, 5000) && strings(lesson.preparation) &&
        Array.isArray(lesson.sections) && lesson.sections.length > 0 && lesson.sections.length <= 20 && lesson.sections.every((section) => section &&
            access.text(section.heading, 200) && (section.paragraphs === undefined || strings(section.paragraphs)) &&
            (section.steps === undefined || strings(section.steps)) && (strings(section.paragraphs) || strings(section.steps))) &&
        lesson.exercise && access.text(lesson.exercise.prompt, 5000) && strings(lesson.exercise.checklist) && lesson.check &&
        access.text(lesson.check.question, 5000) && strings(lesson.check.choices, 6) && lesson.check.choices.length >= 2 &&
        Number.isInteger(lesson.check.answer) && lesson.check.answer >= 0 && lesson.check.answer < lesson.check.choices.length &&
        access.text(lesson.check.explanation, 5000) && Array.isArray(lesson.references) && lesson.references.length <= 12 &&
        lesson.references.every((reference) => reference && access.text(reference.label, 200) && access.text(reference.url, 2048));
}
function snapshot(record) {
    const lesson = access.json(record, 'lesson');
    if (!supported(lesson)) access.invalid('Choose a supported lesson with complete practice and a knowledge check.');
    const result = { title: record.getString('title'), summary: record.getString('summary'), category: record.getString('category'),
        effort_minutes: Number(record.get('effort_minutes') || 10), curriculum_version: record.getString('curriculum_version') || 'custom', lesson };
    if (access.canonical(result).length > 90000) access.invalid('This lesson exceeds the supported learning format.');
    return result;
}
function lessonFor(app, e, record) {
    const tutorial = access.find(app, 'tutorials', access.id(e.request.pathValue('id')));
    if (!government.lesson(app, e.auth, tutorial)) access.readable(app, tutorial, e.requestInfo());
    const body = record ? access.json(record, 'snapshot') : snapshot(tutorial);
    if (body?.category === 'Government submissions') government.requireMember(app, e.auth);
    const digest = $security.sha256(access.canonical(body));
    if (!supported(body?.lesson) || record && record.getString('content_digest') !== digest)
        throw new ApiError(503, 'The saved lesson needs an operator review.');
    return { id: tutorial.id, ...body, content_digest: digest };
}
function output(record) {
    if (!record) return null;
    const saved = access.json(record, 'snapshot');
    const sections = saved.lesson.sections.length;
    const next = Number(record.get('next_section'));
    const practiced = record.getBool('practiced');
    const completed = Boolean(record.getString('completed_at'));
    const certificate = access.json(record, 'certificate');
    if (!Number.isSafeInteger(next) || next < 0 || next > sections || practiced && next !== sections ||
        completed !== Boolean(certificate) || completed && (!practiced || certificate.content_digest !== record.getString('content_digest')))
        throw new ApiError(503, 'The saved checkpoints need an operator review.');
    return { id: record.id, owner: record.getString('owner'), tutorial: record.getString('tutorial'),
        content_digest: record.getString('content_digest'), next_section: next, practiced,
        completed_at: record.getString('completed_at'), certificate, points: completed ? POINTS : 0,
        status: completed ? 'completed' : 'in_progress', progress: completed ? 100 : Math.floor((next + (practiced ? 1 : 0)) * 100 / (sections + 2)) };
}
function projectProgress(app, record) {
    const collection = access.schema(app, 'tutorial_progress', ['owner', 'tutorial', 'status', 'progress']);
    const owner = record.getString('owner'), tutorial = record.getString('tutorial');
    const rows = app.findRecordsByFilter('tutorial_progress', 'owner = {:owner} && tutorial = {:tutorial}', '-updated,id', 101, 0, { owner, tutorial });
    if (rows.length > 100) throw new ApiError(503, 'Learning history needs an operator review.');
    const progress = rows.find((row) => row.getString('status') === 'completed') || rows[0] || new Record(collection);
    const state = output(record);
    progress.set('owner', owner); progress.set('tutorial', tutorial);
    const complete = progress.getString('status') === 'completed' || state.status === 'completed';
    progress.set('status', complete ? 'completed' : 'in_progress');
    progress.set('progress', complete ? 100 : Math.max(Number(progress.get('progress') || 0), state.progress));
    app.save(progress);
}
// The digest covers the full stored lesson; the answer and explanation return for review only after this learner earned them.
function reviewed(tutorial, record) {
    return record && record.getString('completed_at') ? tutorial : { ...tutorial, lesson: access.publicLesson(tutorial.lesson) };
}
function detailResult(owner, tutorial, record) { return { schema_version: 1, account_id: owner, tutorial: reviewed(tutorial, record), enrollment: output(record) }; }
function retryWait(record) {
    const wait = Math.ceil((Date.parse(record.getString('answer_retry_at').replace(' ', 'T')) - Date.now()) / 1000);
    return wait > 0 && wait <= RETRY_SECONDS ? wait : 0;
}

/** @param {object} e Native authenticated request. @returns {object} Current versioned lesson and personal checkpoints. */
function detail(e) {
    const user = account(e.app, e);
    const record = enrollment(e.app, user.id, access.id(e.request.pathValue('id')));
    return detailResult(user.id, lessonFor(e.app, e, record), record);
}

/** @param {object} e Native authenticated request. @returns {object} Monotonic checkpoint result and optional answer feedback. */
function command(e) {
    access.authenticated(e);
    const id = access.id(e.request.pathValue('id'));
    const body = e.requestInfo().body;
    access.exact(body, ['action', 'content_digest', 'payload']);
    const fields = { start: [], section: ['index'], practice: ['checks'], answer: ['choice'] };
    if (typeof body.action !== 'string' || !Object.prototype.hasOwnProperty.call(fields, body.action) ||
        typeof body.content_digest !== 'string' || !/^[a-f0-9]{64}$/.test(body.content_digest))
        access.invalid('Choose a supported learning action and the current lesson.');
    access.exact(body.payload, fields[body.action]);
    let result;
    e.app.runInTransaction((app) => {
        const user = account(app, e);
        let record = enrollment(app, user.id, id);
        const tutorial = lessonFor(app, e, record);
        if (tutorial.content_digest !== body.content_digest) access.conflict('This lesson changed. Reload it before starting.');
        if (!record && body.action !== 'start') access.conflict('Start the tutorial before saving checkpoints.');
        let changed = false, feedback = null;
        if (!record) {
            record = new Record(schema(app));
            const { id: _id, content_digest: _digest, ...saved } = tutorial;
            for (const [key, value] of Object.entries({ owner: user.id, tutorial: id, snapshot: saved, content_digest: tutorial.content_digest,
                next_section: 0, practiced: false, protocol_version: 1 })) record.set(key, value);
            app.save(record); changed = true;
        }
        const state = output(record);
        const sections = tutorial.lesson.sections.length;
        if (body.action === 'section') {
            const index = body.payload.index;
            if (!Number.isSafeInteger(index) || index < 0 || index >= sections) access.invalid('Choose a section in this lesson.');
            if (index > state.next_section) access.conflict('Complete the sections in order.');
            if (index === state.next_section) { record.set('next_section', index + 1); changed = true; }
        } else if (body.action === 'practice') {
            if (state.next_section !== sections) access.conflict('Finish the lesson sections before recording practice.');
            const checks = body.payload.checks;
            if (!Array.isArray(checks) || checks.length !== tutorial.lesson.exercise.checklist.length || checks.some((value) => value !== true))
                access.invalid('Work through every item in the practice checklist.');
            if (!state.practiced) { record.set('practiced', true); changed = true; }
        } else if (body.action === 'answer') {
            if (!Number.isSafeInteger(body.payload.choice) || body.payload.choice < 0 || body.payload.choice >= tutorial.lesson.check.choices.length)
                access.invalid('Choose a listed answer.');
            if (!state.practiced) access.conflict('Complete the sections and practice before the final check.');
            const wait = state.completed_at ? 0 : retryWait(record);
            if (wait) throw new ApiError(429, `Review the lesson, then try the knowledge check again in ${wait} second${wait === 1 ? '' : 's'}.`);
            const correct = body.payload.choice === tutorial.lesson.check.answer;
            feedback = correct || state.completed_at ? { correct, explanation: tutorial.lesson.check.explanation } :
                { correct, explanation: 'Not the expected answer. Review the lesson sections, then try again.', retry_after: RETRY_SECONDS };
            if (!correct && !state.completed_at) {
                record.set('answer_retry_at', new Date(Date.now() + RETRY_SECONDS * 1000).toISOString()); changed = true;
            }
            if (correct && !state.completed_at) {
                const issued = new Date().toISOString();
                record.set('completed_at', issued);
                record.set('certificate', { schema_version: 'buildanddo.learning-certificate/1', id: `BDO-${record.id.toUpperCase()}`,
                    issuer: 'BuildAndDo · Citadel Nexus Inc.', learner: user.getString('name').trim().slice(0, 120) || 'BuildAndDo learner',
                    title: tutorial.title, tutorial: id, curriculum_version: tutorial.curriculum_version, content_digest: tutorial.content_digest,
                    issued_at: issued, learning_points: POINTS,
                    achievement: 'Completed lesson sections, recorded the practice checklist and passed the knowledge check.',
                    scope: 'Course completion. No external accreditation or professional qualification.' });
                changed = true;
            }
        }
        if (changed) { app.save(record); projectProgress(app, record); }
        result = { ...detailResult(user.id, tutorial, record), feedback, replayed: !changed };
    });
    return result;
}

/** @param {object} e Native authenticated request. @returns {object} Persistent personal growth and paginated completion certificates. */
function list(e) {
    const user = account(e.app, e);
    const filter = 'owner = {:owner} && completed_at != ""';
    const params = { owner: user.id };
    // countRecords takes dbx expressions, not a filter string (PocketBase 0.28 and 0.39 alike).
    const completed = e.app.countRecords('tutorial_learning', $dbx.hashExp({ owner: user.id }), $dbx.not($dbx.hashExp({ completed_at: '' })));
    const number = access.page(e);
    const rows = e.app.findRecordsByFilter('tutorial_learning', filter, '-completed_at,-id', 6, (number - 1) * 5, params);
    const active = e.app.findRecordsByFilter('tutorial_learning', 'owner = {:owner} && completed_at = ""', '-updated,-id', 1, 0, params)[0];
    const levels = [
        { number: 1, name: 'Explorer', floor: 0, next: 100 },
        { number: 2, name: 'Practitioner', floor: 100, next: 500 },
        { number: 3, name: 'Builder', floor: 500, next: 1000 },
        { number: 4, name: 'Guide', floor: 1000, next: null },
    ];
    const points = completed * POINTS;
    return { schema_version: 1, account_id: user.id, completed, points,
        level: levels.filter((level) => points >= level.floor).pop(),
        milestones: [{ id: 'first', title: 'First finish', target: 1 }, { id: 'five', title: 'Five lessons', target: 5 },
            { id: 'ten', title: 'Ten lessons', target: 10 }].map((item) => ({ ...item, earned: completed >= item.target })),
        certificates: { items: rows.slice(0, 5).map(output), page: number, has_more: rows.length > 5 },
        resume: active ? { tutorial: active.getString('tutorial'), title: access.json(active, 'snapshot').title, progress: output(active).progress } : null };
}

/** @param {object} tutorial Catalogue record. @returns {boolean} Whether its lesson is served with a server-checked answer. */
function interactive(tutorial) {
    const raw = tutorial.getString('lesson');
    if (!raw || raw === 'null') return false;
    try { return Boolean(supported(JSON.parse(raw))); } catch { return false; }
}

/** @param {object} app Native app. @param {string} owner Account. @param {string} tutorial Lesson. @returns {boolean} Whether a server-issued certificate exists. */
function certified(app, owner, tutorial) {
    try { schema(app); } catch { return false; }
    return app.findRecordsByFilter('tutorial_learning', 'owner = {:owner} && tutorial = {:tutorial}', '', 2, 0, { owner, tutorial })
        .some((row) => Boolean(row.getString('completed_at')) && Boolean(access.json(row, 'certificate')));
}

/** @param {object} e Native record enrichment. Hides earned-only lesson fields from every client read of the catalogue. */
function enrich(e) {
    const auth = e.requestInfo && e.requestInfo.auth;
    if (auth && auth.isSuperuser()) return;
    const raw = e.record.getString('lesson');
    if (!raw || raw === 'null') return;
    let lesson;
    try { lesson = JSON.parse(raw); } catch { e.record.set('lesson', null); return; }
    e.record.set('lesson', access.publicLesson(lesson));
}

module.exports = { detail, command, list, interactive, certified, enrich };
