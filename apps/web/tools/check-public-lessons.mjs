// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/tools/check-public-lessons.mjs
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json, apps/pocketbase/pb_migrations/data/government-submissions.json
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json; CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json; CONSUMES apps/pocketbase/pb_migrations/data/government-submissions.json; VALIDATES dist/apps/web/assets
// DAG Node:    none
// Intent:      Fail a build whose browser assets carry a knowledge-check explanation, the text that gives an interactive lesson's answer away.
// ───────────────────────────────────────────────────────────────

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** @param {string} directory Built output. @returns {Array<{file: string, slug: string}>} Script assets that reveal an explanation. */
export function findLessonAnswers(directory) {
    const fingerprints = explanationFingerprints();
    const files = readdirSync(join(directory, 'assets'), { recursive: true }).map(String).filter((name) => /\.m?js$/.test(name));
    return files.flatMap((name) => {
        const content = readFileSync(join(directory, 'assets', name), 'utf8');
        return fingerprints.filter(({ fingerprint }) => content.includes(fingerprint)).map(({ slug }) => ({ file: name, slug }));
    });
}
