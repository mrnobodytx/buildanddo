// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/lesson-keys.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES tutorials; CONSUMES BUILDANDDO_LESSON_KEYS_FILE;
//              CONSUMES BUILDANDDO_LESSON_KEYS_SYNTHETIC; VERIFIED_BY tests/upgrade/lesson-keys.test.mjs
// DAG Node:    none
// Intent:      Merge private knowledge-check keys into a lesson in memory only, and fail closed when a key is
//              missing, invalid or disagrees with the public lesson it grades.
// ───────────────────────────────────────────────────────────────

// WHERE THE ANSWER KEYS LIVE.
//
// A knowledge check's answer index and explanation are private golden data
// (SRS-BUILDANDDO-CURRICULUM-PRIVATE-001). The public curriculum files, and so the seeded
// `tutorials` records, keep each lesson's question and choices. One private key file
// (schema buildanddo.lesson-keys/1, written by scripts/ci/lesson_keys.py) supplies the rest. It is
// named by BUILDANDDO_LESSON_KEYS_FILE, or else is lesson-keys.json in the PocketBase data directory.
//
// This is a library, not a *.pb.js file: handlers require() it, and it keeps no module-level cache,
// so every call reads the file afresh. Nothing here writes a record. A key is merged into a copy
// of the lesson in memory, and only when the entry is bound to the lesson's curriculum_version and
// to sha256(canonical({question, choices})), and agrees with any key the database already holds.
//
// No message, log line or report from this file carries a key, an explanation or a hash of either.

const access = require(`${__hooks}/workspace-access.js`);

const SCHEMA = 'buildanddo.lesson-keys/1';
const FILE_VARIABLE = 'BUILDANDDO_LESSON_KEYS_FILE';
const SYNTHETIC_VARIABLE = 'BUILDANDDO_LESSON_KEYS_SYNTHETIC';
const DEFAULT_FILE = 'lesson-keys.json';
// The same limits scripts/ci/lesson_keys.py applies, so a file the tool passes is one this loads.
const LIMITS = Object.freeze({ bytes: 256 * 1024, entries: 500, answer: 5, explanation: 5000, version: 40, slug: 80, catalogue: 500 });
const STATES = Object.freeze({ PRIVATE: 'PRIVATE', SYNTHETIC: 'SYNTHETIC', ABSENT: 'ABSENT', INVALID: 'INVALID' });
// Member names, sorted, that each object in the file must carry exactly.
const TOP = ['integrity', 'lessons', 'schema_version', 'source', 'synthetic'];
const ENTRY = ['answer', 'check_sha256', 'curriculum_version', 'explanation', 'id'];
const SOURCE = ['kind', 'revision'];
const KINDS = ['git', 'pocketbase'];
// The slug rule community-quiz.js applies to a graded lesson.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const REVISION = /^[A-Za-z0-9 :._+-]{0,64}$/;
const MISSING = /no such file or directory|cannot find the (?:file|path)|does not exist/i;
const WARN_KEY = 'buildanddo.lesson_keys.warned_at';
const WARN_INTERVAL_MS = 60 * 1000;
const KEYS_REVIEW = 'Lesson grading keys need an operator review.';
const LESSON_REVIEW = 'This lesson\'s knowledge check needs an operator review.';

const own = (value, name) => Object.prototype.hasOwnProperty.call(value, name);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function exact(value, names) {
    if (!object(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === names.length && keys.every((key, index) => key === names[index]);
}

/** @returns {boolean} Whether text has no lone surrogate, which has no canonical form in the key tool. */
function wellFormed(text) {
    for (let index = 0; index < text.length; index++) {
        const unit = text.charCodeAt(index);
        if (unit >= 0xDC00 && unit <= 0xDFFF) return false;
        if (unit >= 0xD800 && unit <= 0xDBFF) {
            const next = text.charCodeAt(index + 1);
            if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
            index++;
        }
    }
    return true;
}

/** @returns {number} Length in code points, as the key tool counts it. */
function codePoints(text) {
    return Array.from(text).length;
}

function absent() {
    return { state: STATES.ABSENT, reason: 'absent', entries: {} };
}

function invalid(reason) {
    return { state: STATES.INVALID, reason, entries: {} };
}

function entryValid(slug, entry) {
    return slug.length <= LIMITS.slug && SLUG.test(slug) && exact(entry, ENTRY) &&
        typeof entry.id === 'string' && RECORD_ID.test(entry.id) &&
        typeof entry.curriculum_version === 'string' && wellFormed(entry.curriculum_version) &&
        codePoints(entry.curriculum_version) >= 1 && codePoints(entry.curriculum_version) <= LIMITS.version &&
        typeof entry.check_sha256 === 'string' && HEX64.test(entry.check_sha256) &&
        Number.isSafeInteger(entry.answer) && entry.answer >= 0 && entry.answer <= LIMITS.answer &&
        typeof entry.explanation === 'string' && wellFormed(entry.explanation) && access.text(entry.explanation, LIMITS.explanation);
}

/** @returns {object} The load result for a parsed key document. */
function parse(doc) {
    if (!exact(doc, TOP) || doc.schema_version !== SCHEMA || typeof doc.synthetic !== 'boolean' ||
        typeof doc.integrity !== 'string' || !HEX64.test(doc.integrity) || !exact(doc.source, SOURCE) ||
        !KINDS.includes(doc.source.kind) || typeof doc.source.revision !== 'string' || !REVISION.test(doc.source.revision) ||
        !object(doc.lessons)) return invalid('schema');
    const slugs = Object.keys(doc.lessons);
    if (slugs.length > LIMITS.entries) return invalid('too_many_entries');
    if (!slugs.every((slug) => entryValid(slug, doc.lessons[slug]))) return invalid('entry');
    let digest = '';
    try { digest = $security.sha256(access.canonical(doc.lessons)); } catch { return invalid('integrity'); }
    if (digest !== doc.integrity) return invalid('integrity');
    // Synthetic fixture keys would misgrade real learners, so they load only on an explicit opt-in.
    if (doc.synthetic && $os.getenv(SYNTHETIC_VARIABLE) !== '1') return invalid('synthetic_not_allowed');
    return { state: doc.synthetic ? STATES.SYNTHETIC : STATES.PRIVATE, reason: '', entries: doc.lessons };
}

function read(path, configured) {
    let raw;
    try {
        if (typeof $os.stat === 'function') {
            const info = $os.stat(path);
            if (info.isDir()) return invalid('unreadable');
            if (info.size() > LIMITS.bytes) return invalid('too_large');
        }
        raw = $os.readFile(path);
    } catch (error) {
        // Only the default file may be missing quietly; a file the operator named must be there.
        return !configured && MISSING.test(`${error && error.message} ${error}`) ? absent() : invalid('unreadable');
    }
    if (raw.length > LIMITS.bytes) return invalid('too_large');
    let text;
    try { text = toString(raw); } catch { return invalid('unreadable'); }
    if (typeof text !== 'string' || text.length > LIMITS.bytes) return invalid('too_large');
    let doc;
    try { doc = JSON.parse(text); } catch { return invalid('not_json'); }
    return parse(doc);
}

/** Log an unusable key file by reason code only, at most once a minute per process. */
function warn(app, reason) {
    const now = Date.now();
    let due = false;
    try {
        app.store().setFunc(WARN_KEY, (old) => {
            const last = Number(old) || 0;
            if (last > now || now - last >= WARN_INTERVAL_MS) { due = true; return now; }
            return old;
        });
        if (due) app.logger().warn('Lesson grading keys are not usable.', 'reason', reason);
    } catch { /* A failed log line never changes a grading outcome. */ }
}

/**
 * @param {object} app Native app. @param {{file?: string, log?: boolean}} options An explicit file, and whether to log.
 * @returns {{state: string, reason: string, entries: object}} PRIVATE or SYNTHETIC with entries by slug, or ABSENT or INVALID with none.
 */
function load(app, options = {}) {
    const named = typeof options.file === 'string' && options.file !== '' ? options.file : String($os.getenv(FILE_VARIABLE) || '');
    const result = read(named || $filepath.join(app.dataDir(), DEFAULT_FILE), named !== '');
    if (result.state === STATES.INVALID && options.log !== false) warn(app, result.reason);
    return result;
}

/** @param {object} check A knowledge check. @returns {string} sha256 of canonical({question, choices}): the public text a key grades. */
function binding(check) {
    return $security.sha256(access.canonical({ question: check.question, choices: check.choices }));
}

function carries(check, name) {
    return own(check, name) && check[name] !== null && check[name] !== undefined;
}

function usable(keys) {
    return Boolean(keys) && (keys.state === STATES.PRIVATE || keys.state === STATES.SYNTHETIC || keys.state === STATES.ABSENT) &&
        object(keys.entries);
}

/**
 * @param {object} keys A load() result. @param {object} record The tutorials record. @param {object} stored Its lesson as stored.
 * @returns {object} The lesson with its file key merged into a copy of the check, or the stored lesson when no entry applies.
 * Throws 503 when the file is unusable and the database holds no key, or when an entry disagrees with the lesson. Never saves.
 */
function resolve(keys, record, stored) {
    const check = object(stored) ? stored.check : null;
    if (!object(check)) return stored;
    if (!usable(keys)) {
        // An unusable file leaves lessons whose keys the database already holds gradable.
        if (carries(check, 'answer') && carries(check, 'explanation')) return stored;
        throw new ApiError(503, KEYS_REVIEW);
    }
    const slug = record.getString('slug');
    if (!slug || !own(keys.entries, slug)) return stored;
    const entry = keys.entries[slug];
    let bound = false;
    try {
        bound = typeof check.question === 'string' && Array.isArray(check.choices) && entry.check_sha256 === binding(check);
    } catch { bound = false; }
    const agrees = (!carries(check, 'answer') && !carries(check, 'explanation')) ||
        (check.answer === entry.answer && check.explanation === entry.explanation);
    if (!bound || entry.curriculum_version !== record.getString('curriculum_version') ||
        !(entry.answer < check.choices.length) || !agrees) throw new ApiError(503, LESSON_REVIEW);
    return { ...stored, check: { ...check, answer: entry.answer, explanation: entry.explanation } };
}

/** @returns {boolean} Whether a resolved check can be graded: an answer among its choices and an explanation. */
function complete(check) {
    return object(check) && Array.isArray(check.choices) && Number.isSafeInteger(check.answer) && check.answer >= 0 &&
        check.answer < check.choices.length && access.text(check.explanation, LIMITS.explanation);
}

/** @returns {object|null} The record's lesson when it carries a knowledge check, read through its string form. */
function knowledge(record) {
    let lesson = null;
    try { lesson = JSON.parse(record.getString('lesson') || 'null'); } catch { return null; }
    const check = object(lesson) ? lesson.check : null;
    return object(check) && typeof check.question === 'string' && Array.isArray(check.choices) ? lesson : null;
}

/** @returns {Array<object>} Authored lessons: tutorials records carrying a slug and a curriculum_version, as public-api.js reads them. */
function authored(app) {
    try {
        app.findCollectionByNameOrId('tutorials');
    } catch (error) {
        if (String(error).includes('no rows in result set')) return [];
        throw error;
    }
    return app.findRecordsByFilter('tutorials', "slug != '' && curriculum_version != ''", 'slug', LIMITS.catalogue, 0);
}

/**
 * @param {object} app Native app. @param {object} keys A load() result.
 * @returns {object} Counts only: every authored lesson with a knowledge check, how its key is sourced, and whether it can be graded.
 */
function survey(app, keys) {
    const counts = { lessons: 0, gradable: 0, unavailable: 0, stored_equal: 0, file_only: 0, db_only: 0, mismatch: 0 };
    for (const record of authored(app)) {
        const lesson = knowledge(record);
        if (!lesson) continue;
        counts.lessons++;
        const slug = record.getString('slug');
        const entry = usable(keys) && own(keys.entries, slug);
        const stored = carries(lesson.check, 'answer') && carries(lesson.check, 'explanation');
        let resolved = null;
        try { resolved = resolve(keys, record, lesson); } catch { resolved = null; }
        if (entry && !resolved) counts.mismatch++;
        else if (entry) counts[stored ? 'stored_equal' : 'file_only']++;
        else if (stored) counts.db_only++;
        counts[resolved && complete(resolved.check) ? 'gradable' : 'unavailable']++;
    }
    return counts;
}

/** @param {object} app Native app. @returns {object} The keys-health body: the key state and lesson counts, nothing else. */
function health(app) {
    const keys = load(app);
    const counts = survey(app, keys);
    return { schema_version: 1, keys: keys.state, lessons: counts.lessons, gradable: counts.gradable, unavailable: counts.unavailable };
}

/**
 * @param {object} app Native app. @param {string} file An explicit key file, or '' for the configured one.
 * @returns {{ok: boolean, body: object}} The read-only operator report: state, reason code and counts.
 */
function check(app, file = '') {
    const keys = load(app, { file, log: false });
    const counts = survey(app, keys);
    const body = { state: keys.state, reason: keys.reason, lessons: counts.lessons, stored_equal: counts.stored_equal,
        file_only: counts.file_only, db_only: counts.db_only, mismatch: counts.mismatch, unavailable: counts.unavailable };
    const ok = keys.state !== STATES.INVALID && counts.mismatch === 0 && counts.unavailable === 0 &&
        !(keys.state === STATES.SYNTHETIC && $os.getenv(SYNTHETIC_VARIABLE) !== '1');
    return { ok, body };
}

module.exports = { SCHEMA, FILE_VARIABLE, SYNTHETIC_VARIABLE, DEFAULT_FILE, LIMITS, STATES, KEYS_REVIEW, LESSON_REVIEW,
    load, binding, resolve, complete, survey, health, check };
