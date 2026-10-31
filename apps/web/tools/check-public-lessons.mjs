// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/tools/check-public-lessons.mjs
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-QUIZ-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001, VCC-BUILDANDDO-QUIZ-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/pocketbase/pb_migrations/data/government-submissions.json,
//              apps/pocketbase/pb_migrations/data/authority-repairs-lessons.json, apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json; CONSUMES apps/pocketbase/pb_migrations/data/government-submissions.json;
//              CONSUMES apps/pocketbase/pb_migrations/data/authority-repairs-lessons.json; CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json;
//              CONSUMES BUILDANDDO_LESSON_KEYS_FILE; CONSUMES BUILDANDDO_LESSON_KEYS_REQUIRED; VALIDATES dist/apps/web
// DAG Node:    none
// Intent:      Fail a build whose output carries a knowledge-check answer or explanation, the text that gives an interactive lesson's answer away.
// ───────────────────────────────────────────────────────────────

// The tracked curricula carry no answers or explanations (SRS-BUILDANDDO-CURRICULUM-PRIVATE-001), so explanation
// fingerprints come from the private key file a protected job names. Every build still scans every output file for
// an answer-bearing JSON check; without a key file that structural scan is all it can do, and it says so.
//
// Usage: node apps/web/tools/check-public-lessons.mjs <dist> [--keys <file>] [--require-keys]
// Exit 0 clean, 1 on a leak, an unusable key file or a require failure, 3 when keys are required but absent.
//
// It imports node built-ins only, so a protected job can run it on a built output without npm. It never prints a
// fingerprint, an explanation, an answer or the key file's path: findings name slugs, output files and counts.
// The key file's integrity seal is verified by `scripts/ci/lesson_keys.py verify`, which the keyed job runs first.

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEYS_VARIABLE = 'BUILDANDDO_LESSON_KEYS_FILE';
export const REQUIRED_VARIABLE = 'BUILDANDDO_LESSON_KEYS_REQUIRED';
const SCHEMA = 'buildanddo.lesson-keys/1';
const SYNTHETIC_PREFIX = 'SYNTHETIC FIXTURE:';
// Every curriculum whose lessons the server grades; used only to count the public lessons a key file must cover.
const CURRICULA = ['starter-tutorials.json', 'government-submissions.json', 'authority-repairs-lessons.json', 'broadcast-classroom-lessons.json'];
// The limits scripts/ci/lesson_keys.py and the PocketBase resolver apply to a key file.
const LIMITS = Object.freeze({ bytes: 256 * 1024, entries: 500, answer: 5, explanation: 5000, slug: 80, fingerprint: 24 });
const TOP = ['integrity', 'lessons', 'schema_version', 'source', 'synthetic'];
const ENTRY = ['answer', 'check_sha256', 'curriculum_version', 'explanation', 'id'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const USAGE = 'usage: node apps/web/tools/check-public-lessons.mjs <dist> [--keys <file>] [--require-keys]';

/** A refusal whose message names slugs, files and counts only. exitCode 3 means BLOCKED: keys required but absent. */
export class LessonScanError extends Error {
    constructor(message, exitCode = 1) {
        super(message);
        this.name = 'LessonScanError';
        this.exitCode = exitCode;
    }
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function exact(value, names) {
    if (!object(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === names.length && keys.every((key, index) => key === names[index]);
}

/** @returns {string[]} Slugs of every authored lesson with a knowledge check, across the four curricula. */
function publicSlugs() {
    return CURRICULA.flatMap((name) => {
        const curriculum = JSON.parse(readFileSync(new URL(`../../pocketbase/pb_migrations/data/${name}`, import.meta.url), 'utf8'));
        return (curriculum.lessons || []).filter((record) => object(record.lesson?.check)).map((record) => record.slug);
    });
}

function entryValid(slug, entry) {
    return slug.length <= LIMITS.slug && SLUG.test(slug) && exact(entry, ENTRY) &&
        Number.isSafeInteger(entry.answer) && entry.answer >= 0 && entry.answer <= LIMITS.answer &&
        typeof entry.check_sha256 === 'string' && HEX64.test(entry.check_sha256) &&
        typeof entry.explanation === 'string' && entry.explanation.length <= LIMITS.explanation && entry.explanation.trim() !== '';
}

/**
 * @param {string|null|undefined} keysFile The key file to read; empty or null names none.
 * @returns {{mode: 'private'|'synthetic'|'skipped', reason: string, document: object|null}}
 */
function readKeys(keysFile) {
    if (!keysFile) return { mode: 'skipped', reason: 'unnamed', document: null };
    const path = resolve(keysFile);
    let raw;
    try {
        const info = statSync(path);
        if (!info.isFile()) throw new LessonScanError('the lesson key file is not a readable file');
        if (info.size > LIMITS.bytes) throw new LessonScanError('the lesson key file is larger than a key file can be');
        raw = readFileSync(path, 'utf8');
    } catch (error) {
        if (error instanceof LessonScanError) throw error;
        if (error?.code === 'ENOENT') return { mode: 'skipped', reason: 'absent', document: null };
        throw new LessonScanError(`the lesson key file is not readable (${error?.code || 'error'})`);
    }
    if (!raw.trim()) return { mode: 'skipped', reason: 'absent', document: null };
    let document;
    // A JSON.parse message quotes the text around the fault, so it is never passed on.
    try { document = JSON.parse(raw); } catch { throw new LessonScanError('the lesson key file is not JSON'); }
    if (!exact(document, TOP) || document.schema_version !== SCHEMA || typeof document.synthetic !== 'boolean' ||
        !object(document.source) || !object(document.lessons)) throw new LessonScanError(`the lesson key file is not a ${SCHEMA} document`);
    const slugs = Object.keys(document.lessons);
    if (slugs.length > LIMITS.entries) throw new LessonScanError('the lesson key file has too many entries');
    const malformed = slugs.filter((slug) => !entryValid(slug, document.lessons[slug])).length;
    if (malformed) throw new LessonScanError(`${malformed} lesson key file entries are malformed`);
    // A relabelled fixture file is still fixture keys: its fingerprints could never match a real explanation.
    const synthetic = document.synthetic || slugs.some((slug) => document.lessons[slug].explanation.startsWith(SYNTHETIC_PREFIX));
    return { mode: synthetic ? 'synthetic' : 'private', reason: '', document };
}

/** @returns {Array<{slug: string, fingerprint: string}>} The longest escape-free run of each explanation in a key document. */
function fingerprintsOf(document) {
    const expected = publicSlugs();
    if (new Set(expected).size !== expected.length) throw new LessonScanError('a lesson slug appears in two curricula');
    const present = new Set(Object.keys(document.lessons));
    const missing = expected.filter((slug) => !present.has(slug));
    const extra = present.size - (expected.length - missing.length);
    if (missing.length || extra) {
        throw new LessonScanError(`the lesson key file covers ${expected.length - missing.length} of ${expected.length} public lessons` +
            `${extra ? ` and has ${extra} entries for no public lesson` : ''}${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
    }
    return expected.map((slug) => {
        // Minifiers may re-quote or escape non-ASCII text; this run survives either unchanged.
        const fingerprint = document.lessons[slug].explanation.split(/[^A-Za-z0-9 ,.;()-]/).sort((a, b) => b.length - a.length)[0];
        if (fingerprint.length < LIMITS.fingerprint) throw new LessonScanError(`Lesson ${slug} needs a longer explanation to verify the public bundle.`);
        return { slug, fingerprint };
    });
}

/**
 * @param {{keysFile?: string|null}} options The key file to read; BUILDANDDO_LESSON_KEYS_FILE when not given.
 * @returns {Array<{slug: string, fingerprint: string}>} One fingerprint per public lesson, or none without a key file.
 * Throws LessonScanError when a key file is unusable or does not cover exactly the public lessons.
 */
export function explanationFingerprints({ keysFile = process.env[KEYS_VARIABLE] } = {}) {
    const keys = readKeys(keysFile);
    return keys.document ? fingerprintsOf(keys.document) : [];
}

/** @param {unknown} value Parsed JSON. @returns {string[]} Slugs of lesson checks that still carry an answer or explanation. */
function answeredChecks(value, slug = '', depth = 0) {
    if (!value || typeof value !== 'object' || depth > 40) return [];
    if (Array.isArray(value)) return value.flatMap((item) => answeredChecks(item, slug, depth + 1));
    const owner = typeof value.slug === 'string' ? value.slug : slug;
    const found = Array.isArray(value.choices) && ('answer' in value || 'explanation' in value) ? [owner || '(unknown lesson)'] : [];
    return found.concat(Object.values(value).flatMap((item) => answeredChecks(item, owner, depth + 1)));
}

/**
 * @param {string} directory Built output.
 * @param {{keysFile?: string|null, requireKeys?: boolean}} options The key file (BUILDANDDO_LESSON_KEYS_FILE when not
 * given), and whether a private key file is required.
 * @returns {Array<{file: string, slug: string}>} Output files that reveal an answer or explanation. The list also carries
 * non-enumerable `mode` ('private', 'synthetic' or 'skipped'), `reason` ('unnamed' or 'absent' when skipped) and
 * `lessons` (fingerprinted lessons), so it still compares and serialises as a plain list.
 * Throws LessonScanError for an unusable key file, an unreadable output, or required keys that are absent (exitCode 3)
 * or synthetic.
 */
export function findLessonAnswers(directory, { keysFile = process.env[KEYS_VARIABLE], requireKeys = false } = {}) {
    const keys = readKeys(keysFile);
    if (requireKeys && keys.mode === 'skipped') {
        throw new LessonScanError(`a private lesson key file is required and ${keys.reason === 'absent' ? 'the named file is absent' : 'none is named'}`, 3);
    }
    if (requireKeys && keys.mode !== 'private') throw new LessonScanError('a private lesson key file is required and this one holds synthetic fixture keys');
    const fingerprints = keys.document ? fingerprintsOf(keys.document) : [];
    let leaks;
    try {
        // Every file is scanned, not only scripts: the community catalogue and any later feed are public too.
        const files = readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
            .map((entry) => relative(directory, join(entry.parentPath ?? entry.path, entry.name))).sort();
        leaks = files.flatMap((name) => {
            const content = readFileSync(join(directory, name), 'utf8');
            const found = fingerprints.filter(({ fingerprint }) => content.includes(fingerprint)).map(({ slug }) => ({ file: name, slug }));
            if (/\.json$/i.test(name)) {
                let parsed = null;
                try { parsed = JSON.parse(content); } catch { /* not JSON; the fingerprint scan still applies */ }
                for (const slug of answeredChecks(parsed)) if (!found.some((leak) => leak.slug === slug)) found.push({ file: name, slug });
            }
            return found;
        });
    } catch (error) {
        if (typeof error?.code !== 'string') throw error;
        throw new LessonScanError(`the build output is not readable (${error.code})`);
    }
    return Object.defineProperties(leaks, {
        mode: { value: keys.mode },
        reason: { value: keys.reason },
        lessons: { value: fingerprints.length },
    });
}

function parseArguments(argv) {
    const options = { directory: '', keysFile: undefined, requireKeys: false };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === '--require-keys') options.requireKeys = true;
        else if (argument === '--keys') {
            // An unquoted empty variable would otherwise take the next flag as the key file.
            if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) return null;
            options.keysFile = argv[++index];
        } else if (argument.startsWith('--keys=')) options.keysFile = argument.slice('--keys='.length);
        else if (argument.startsWith('-') || options.directory) return null;
        else options.directory = argument;
    }
    return options.directory ? options : null;
}

/**
 * The command line. --keys overrides BUILDANDDO_LESSON_KEYS_FILE, an empty --keys names no file, and
 * BUILDANDDO_LESSON_KEYS_REQUIRED=1 is the same as --require-keys.
 * @returns {number} The exit code.
 */
export function main(argv = process.argv.slice(2), env = process.env, out = console.log, err = console.error) {
    const options = parseArguments(argv);
    if (!options) {
        err(USAGE);
        return 1;
    }
    const keysFile = options.keysFile !== undefined ? options.keysFile : env[KEYS_VARIABLE];
    const requireKeys = options.requireKeys || env[REQUIRED_VARIABLE] === '1';
    let leaks;
    try {
        leaks = findLessonAnswers(resolve(options.directory), { keysFile: keysFile || '', requireKeys });
    } catch (error) {
        if (!(error instanceof LessonScanError)) throw error;
        err(`${error.exitCode === 3 ? 'BLOCKED' : 'FAIL'}: ${error.message}`);
        return error.exitCode;
    }
    if (leaks.mode === 'skipped') {
        out(`SKIP: lesson explanation fingerprints need ${KEYS_VARIABLE} or --keys; output scanned for answer-bearing JSON checks only.` +
            `${leaks.reason === 'absent' ? ' The named key file is absent.' : ''}`);
    } else out(`Lesson explanation fingerprints: ${leaks.lessons} lessons from ${leaks.mode} keys.`);
    for (const leak of leaks) err(`FAIL: lesson ${leak.slug} answer is in ${leak.file}; import curricula with ?public-lessons and keep checks answer-free.`);
    if (leaks.length) return 1;
    out(`OK: no lesson answer or explanation in ${options.directory} (${leaks.mode}).`);
    return 0;
}

function invokedDirectly() {
    if (!process.argv[1]) return false;
    try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (invokedDirectly()) process.exitCode = main();
