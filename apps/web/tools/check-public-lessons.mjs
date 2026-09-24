// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/tools/check-public-lessons.mjs
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-QUIZ-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001, VCC-BUILDANDDO-QUIZ-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json, apps/pocketbase/pb_migrations/data/government-submissions.json
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json; CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json; CONSUMES apps/pocketbase/pb_migrations/data/government-submissions.json; VALIDATES dist/apps/web
// DAG Node:    none
// Intent:      Fail a build whose output carries a knowledge-check answer or explanation, the text that gives an interactive lesson's answer away.
// ───────────────────────────────────────────────────────────────

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const CURRICULA = ['starter-tutorials.json', 'broadcast-classroom-lessons.json', 'government-submissions.json'];

/** @returns {Array<{slug: string, fingerprint: string}>} The longest escape-free run of every authored explanation. */
export function explanationFingerprints() {
    return CURRICULA.flatMap((name) => {
        const curriculum = JSON.parse(readFileSync(new URL(`../../pocketbase/pb_migrations/data/${name}`, import.meta.url), 'utf8'));
        return (curriculum.lessons || []).filter((record) => typeof record.lesson?.check?.explanation === 'string').map((record) => {
            // Minifiers may re-quote or escape non-ASCII text; this run survives either unchanged.
            const fingerprint = record.lesson.check.explanation.split(/[^A-Za-z0-9 ,.;()-]/).sort((a, b) => b.length - a.length)[0];
            if (fingerprint.length < 24) throw new Error(`Lesson ${record.slug} needs a longer explanation to verify the public bundle.`);
            return { slug: record.slug, fingerprint };
        });
    });
}

/** @param {unknown} value Parsed JSON. @returns {string[]} Slugs of lesson checks that still carry an answer or explanation. */
function answeredChecks(value, slug = '', depth = 0) {
    if (!value || typeof value !== 'object' || depth > 40) return [];
    if (Array.isArray(value)) return value.flatMap((item) => answeredChecks(item, slug, depth + 1));
    const owner = typeof value.slug === 'string' ? value.slug : slug;
    const found = Array.isArray(value.choices) && ('answer' in value || 'explanation' in value) ? [owner || '(unknown lesson)'] : [];
    return found.concat(Object.values(value).flatMap((item) => answeredChecks(item, owner, depth + 1)));
}

/** @param {string} directory Built output. @returns {Array<{file: string, slug: string}>} Output files that reveal an answer or explanation. */
export function findLessonAnswers(directory) {
    const fingerprints = explanationFingerprints();
    // Every file is scanned, not only scripts: the community catalogue and any later feed are public too.
    const files = readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
        .map((entry) => relative(directory, join(entry.parentPath ?? entry.path, entry.name))).sort();
    return files.flatMap((name) => {
        const content = readFileSync(join(directory, name), 'utf8');
        const leaks = fingerprints.filter(({ fingerprint }) => content.includes(fingerprint)).map(({ slug }) => ({ file: name, slug }));
        if (/\.json$/i.test(name)) {
            let parsed = null;
            try { parsed = JSON.parse(content); } catch { /* not JSON; the fingerprint scan still applies */ }
            for (const slug of answeredChecks(parsed)) if (!leaks.some((leak) => leak.slug === slug)) leaks.push({ file: name, slug });
        }
        return leaks;
    });
}
