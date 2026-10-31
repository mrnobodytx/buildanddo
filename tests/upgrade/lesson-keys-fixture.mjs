// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/lesson-keys-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     tests/upgrade/admin-fixture.mjs, scripts/ci/lesson_keys.py
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json;
//              CONSUMES apps/pocketbase/pb_migrations/data/government-submissions.json;
//              CONSUMES apps/pocketbase/pb_migrations/data/authority-repairs-lessons.json;
//              CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json; VALIDATES scripts/ci/lesson_keys.py
// DAG Node:    none
// Intent:      Build synthetic lesson key files at test time from public lesson text only, byte for byte as
//              lesson_keys.py synthetic writes them, plus absent, invalid and tampered variants, and serve them to hook fixtures.
// ───────────────────────────────────────────────────────────────

// SYNTHETIC KEYS ONLY.
//
// Every key this module produces is generated at test time from a lesson's public slug, question
// and choices: answer = int(sha256(salt + ':' + slug)[:8], 16) % len(choices), with a labelled
// placeholder explanation. The curriculum files are read for their public text; any answer or
// explanation they still carry is dropped as the file is parsed and is never returned, compared or
// printed. Nothing here is written to the repository.
//
// dump() mirrors Python's json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n", and
// canonical() mirrors scripts/ci/lesson_keys.py canonical(), so tests/upgrade/lesson-keys.test.mjs
// can require the two languages to agree on every byte.

import { createHash } from 'node:crypto';
import { source } from './admin-fixture.mjs';

export const SCHEMA = 'buildanddo.lesson-keys/1';
export const SYNTHETIC_PREFIX = 'SYNTHETIC FIXTURE:';
export const SYNTHETIC_REVISION = 'worktree';
export const FILE_VARIABLE = 'BUILDANDDO_LESSON_KEYS_FILE';
export const SYNTHETIC_VARIABLE = 'BUILDANDDO_LESSON_KEYS_SYNTHETIC';
export const DATA_DIR = 'apps/pocketbase/pb_migrations/data';
export const CURRICULA = Object.freeze([
    'starter-tutorials.json',
    'government-submissions.json',
    'authority-repairs-lessons.json',
    'broadcast-classroom-lessons.json',
]);
export const KEY_MEMBERS = Object.freeze(['answer', 'explanation']);
// Where hook fixtures serve the key file: the resolver's default path, lesson-keys.json in the PocketBase data directory.
export const KEY_DATA_DIR = '/pb_data';
export const KEY_PATH = `${KEY_DATA_DIR}/lesson-keys.json`;

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

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

/** json.dumps(text, ensure_ascii=False): the escapes JSON.stringify uses, and no lone surrogates. */
function quote(text) {
    if (!wellFormed(text)) throw new Error('a string holds a lone surrogate, which has no canonical form');
    return JSON.stringify(text);
}

function integer(value) {
    if (!Number.isSafeInteger(value)) throw new Error('only whole numbers have a canonical form');
    return String(value);
}

/** lesson_keys.py canonical(): keys sorted by UTF-16 code unit, compact separators, non-ASCII kept. */
export function canonical(value, depth = 0) {
    if (depth > 6) throw new Error('nesting exceeds the canonical format');
    if (value === null || typeof value === 'boolean') return String(value);
    if (typeof value === 'string') return quote(value);
    if (typeof value === 'number') return integer(value);
    if (Array.isArray(value)) return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.keys(value).sort().map((name) => quote(name) + ':' + canonical(value[name], depth + 1)).join(',') + '}';
    throw new Error('only strings, whole numbers, booleans, null, lists and objects have a canonical form');
}

/** sha256 of canonical({question, choices}): the public text an entry grades. */
export const binding = (check) => sha256(canonical({ question: check.question, choices: check.choices }));
export const integrity = (lessons) => sha256(canonical(lessons));

// Python's sort_keys orders by code point; JavaScript's default sort orders by UTF-16 code unit.
function byCodePoint(left, right) {
    const a = Array.from(left), b = Array.from(right);
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
        const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
        if (difference) return difference;
    }
    return a.length - b.length;
}

function pretty(value, level) {
    if (value === null || typeof value === 'boolean') return String(value);
    if (typeof value === 'string') return quote(value);
    if (typeof value === 'number') return integer(value);
    const inner = '  '.repeat(level + 1), outer = '  '.repeat(level);
    if (Array.isArray(value))
        return value.length ? '[\n' + value.map((item) => inner + pretty(item, level + 1)).join(',\n') + '\n' + outer + ']' : '[]';
    const names = Object.keys(value).sort(byCodePoint);
    return names.length
        ? '{\n' + names.map((name) => inner + quote(name) + ': ' + pretty(value[name], level + 1)).join(',\n') + '\n' + outer + '}'
        : '{}';
}

/** lesson_keys.py dump(): json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n". */
export const dump = (doc) => pretty(doc, 0) + '\n';

/** A copy of a knowledge check carrying its public text only. */
export const publicCheck = (check) => ({ question: check.question, choices: check.choices });

/** A copy of a lesson body whose check carries its public text only. */
export const publicLesson = (lesson) => ({ ...lesson, check: publicCheck(lesson.check) });

/**
 * @returns {Array<object>} Every curriculum lesson as a tutorials seed: public text only, with its curriculum_version
 * and the curriculum file it came from. Whatever keys a file still carries are dropped here.
 */
export function curriculumRecords(read = source) {
    const records = [];
    for (const name of CURRICULA) {
        const curriculum = JSON.parse(read(`${DATA_DIR}/${name}`));
        for (const lesson of curriculum.lessons)
            records.push({ ...lesson, curriculum_version: curriculum.version, lesson: publicLesson(lesson.lesson), curriculum: name });
    }
    return records;
}

/** lesson_keys.py public_lessons(): {slug: {id, version, check}} over the four curricula, refusing a repeated slug. */
export function publicLessons(records = curriculumRecords()) {
    const lessons = {};
    for (const record of records) {
        if (Object.prototype.hasOwnProperty.call(lessons, record.slug)) throw new Error(`a slug appears in two curricula: ${record.slug}`);
        lessons[record.slug] = { id: record.id, version: record.curriculum_version, check: publicCheck(record.lesson.check) };
    }
    return lessons;
}

export const syntheticAnswer = (slug, choices, salt = 'synthetic') =>
    Number.parseInt(sha256(`${salt}:${slug}`).slice(0, 8), 16) % choices;
export const syntheticExplanation = (slug) => `${SYNTHETIC_PREFIX} explanation placeholder for ${slug}.`;

export const entryFor = (id, version, check, answer, explanation) =>
    ({ id, curriculum_version: version, check_sha256: binding(check), answer, explanation });

export const keyDocument = (entries, { synthetic, kind = 'git', revision = SYNTHETIC_REVISION }) =>
    ({ schema_version: SCHEMA, synthetic, source: { kind, revision }, integrity: integrity(entries), lessons: entries });

let curriculumLessons = null;
/** publicLessons() over the tracked curricula, read once per process: fixtures build many documents from the same text. */
const defaultLessons = () => curriculumLessons || (curriculumLessons = publicLessons());

/** lesson_keys.py synthetic_document(): the same entries, salt and labels, from public text only. */
export function syntheticDocument({ salt = 'synthetic', lessons = defaultLessons() } = {}) {
    const entries = {};
    for (const [slug, lesson] of Object.entries(lessons)) {
        if (!lesson.check.choices.length) throw new Error(`a lesson has no choices: ${slug}`);
        entries[slug] = entryFor(lesson.id, lesson.version, lesson.check,
            syntheticAnswer(slug, lesson.check.choices.length, salt), syntheticExplanation(slug));
    }
    return keyDocument(entries, { synthetic: true });
}

/** The same document with its integrity recomputed after a change, so only the change itself can fail. */
export function resealed(doc, change) {
    const copy = JSON.parse(JSON.stringify(doc));
    change(copy);
    copy.integrity = integrity(copy.lessons);
    return copy;
}

/**
 * @param {'synthetic'|'private'|'absent'|'invalid'|'tampered'} variant Which key file to serve.
 * @param {object} options salt and lessons for the document; slug and field for 'tampered'.
 * @returns {string|null} The key file text, or null for an absent file.
 * 'private' is the synthetic document relabelled synthetic:false, for tests of the PRIVATE state. 'invalid'
 * breaks the integrity seal. 'tampered' changes one entry's check_sha256 (or curriculum_version) and reseals
 * the file, so it loads and only that lesson fails its binding.
 */
export function keyFile(variant = 'synthetic', { salt, lessons, slug, field = 'check_sha256' } = {}) {
    if (variant === 'absent') return null;
    const doc = syntheticDocument({ salt, lessons });
    if (variant === 'synthetic') return dump(doc);
    if (variant === 'private') return dump(resealed(doc, (copy) => { copy.synthetic = false; copy.source.revision = '0'.repeat(40); }));
    if (variant === 'invalid') return dump({ ...doc, integrity: doc.integrity.replace(/^./, (first) => (first === '0' ? '1' : '0')) });
    if (variant === 'tampered') {
        const target = slug ?? Object.keys(doc.lessons).sort()[0];
        return dump(resealed(doc, (copy) => {
            const entry = copy.lessons[target];
            if (field === 'curriculum_version') entry.curriculum_version += '-tampered';
            else entry.check_sha256 = entry.check_sha256.replace(/^./, (first) => (first === '0' ? '1' : '0'));
        }));
    }
    throw new Error(`unknown key file variant: ${variant}`);
}

/** A lesson body whose check carries the synthetic key of its entry, as a database-held key would. */
export const keyedLesson = (lesson, entry) =>
    ({ ...lesson, check: { ...publicCheck(lesson.check), answer: entry.answer, explanation: entry.explanation } });

/**
 * PocketBase globals for a hook VM that serve key files from memory: $os.getenv, $os.stat, $os.readFile and
 * toString. files maps a path to its text (or to 'unreadable', which refuses reads like a permission error);
 * env maps variable names to values. Both stay live, so a test can add, change or delete a file mid-flow.
 */
export function keyRuntime({ files = {}, env = {} } = {}) {
    const notFound = (verb, path) => new Error(`${verb} ${path}: no such file or directory`);
    const denied = (verb, path) => new Error(`${verb} ${path}: permission denied`);
    const reads = [];
    const runtime = {
        $os: {
            getenv: (name) => (Object.prototype.hasOwnProperty.call(env, name) ? String(env[name]) : ''),
            stat: (path) => {
                if (!Object.prototype.hasOwnProperty.call(files, path)) throw notFound('stat', path);
                const value = files[path];
                const directory = value && typeof value === 'object' && value.directory === true;
                const size = typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : 0;
                return { isDir: () => directory, size: () => size };
            },
            readFile: (path) => {
                reads.push(path);
                if (!Object.prototype.hasOwnProperty.call(files, path)) throw notFound('open', path);
                const value = files[path];
                if (value === 'unreadable') throw denied('open', path);
                if (typeof value !== 'string') throw new Error(`read ${path}: is a directory`);
                return Uint8Array.from(Buffer.from(value, 'utf8'));
            },
        },
        toString: (bytes) => Buffer.from(bytes).toString('utf8'),
    };
    return { runtime, files, env, reads };
}

/**
 * A synthetic key file served to a hook fixture at KEY_PATH, with the synthetic opt-in set, as a contributor would run locally.
 * @param {'synthetic'|'private'|'absent'|'invalid'|'tampered'} variant Which file to serve first (see keyFile).
 * @param {object} options env: more variables; salt, lessons, slug, field: as for keyFile.
 * @returns {object} The keyRuntime pieces (runtime, files, env, reads), plus document (the synthetic set every variant is built
 * from), serve(variant, options) to switch the file mid-test, answerFor(slug) and explanationFor(slug) from that set,
 * keyed(slug, lesson) for a lesson body carrying its synthetic key as a database-held key would, and attach(app) to give a
 * fixture app the data directory the resolver reads.
 */
export function lessonKeyServer(variant = 'synthetic', { env = {}, ...options } = {}) {
    const served = keyRuntime({ env: { [SYNTHETIC_VARIABLE]: '1', ...env } });
    let document = null;
    const serve = (next = 'synthetic', more = {}) => {
        const settings = { ...options, ...more };
        document = syntheticDocument({ salt: settings.salt, lessons: settings.lessons });
        const text = keyFile(next, settings);
        if (text === null) delete served.files[KEY_PATH]; else served.files[KEY_PATH] = text;
    };
    serve(variant);
    const entry = (slug) => {
        if (!Object.prototype.hasOwnProperty.call(document.lessons, slug)) throw new Error(`no synthetic key for lesson ${slug}`);
        return document.lessons[slug];
    };
    return {
        ...served,
        get document() { return document; },
        serve,
        answerFor: (slug) => entry(slug).answer,
        explanationFor: (slug) => entry(slug).explanation,
        keyed: (slug, lesson) => keyedLesson(lesson, entry(slug)),
        attach: (app) => { app.dataDir = () => KEY_DATA_DIR; return app; },
    };
}
