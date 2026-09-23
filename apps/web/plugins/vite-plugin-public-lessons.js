// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/plugins/vite-plugin-public-lessons.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/tutorialCurriculum.js, apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json
// EnumType:    Plugin
// EnumEdges:   CONSUMES apps/web/src/lib/tutorialCurriculum.js; CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json; CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json
// DAG Node:    none
// Intent:      Ship authored lessons to the browser without knowledge-check answers, so a certificate cannot be earned by reading the bundle.
// ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicCurriculum } from '../src/lib/tutorialCurriculum.js';

export const PUBLIC_LESSONS_QUERY = '?public-lessons';
// A virtual id outside Vite's JSON handling: the prefix marks it private, the suffix makes it a module.
const PREFIX = '\0public-lessons:';
const SUFFIX = '.public.js';
const DATA = resolve(fileURLToPath(new URL('../../pocketbase/pb_migrations/data', import.meta.url))) + sep;

/** @param {string} path Absolute authored curriculum file. @returns {object} The curriculum's public projection. */
export function loadPublicLessons(path) {
    if (!path.startsWith(DATA) || !path.endsWith('.json')) throw new Error(`Public lessons come only from authored curriculum data: ${path}`);
    const curriculum = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(curriculum?.lessons)) throw new Error(`Public lessons need a curriculum with lessons: ${path}`);
    return publicCurriculum(curriculum);
}

/**
 * Resolve `curriculum.json?public-lessons` to its public projection. The raw
 * file stays importable for tests; application code must use the query.
 *
 * @returns {import('vite').Plugin}
 */
export default function publicLessonsPlugin() {
    return {
        name: 'buildanddo:public-lessons',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!source.endsWith(PUBLIC_LESSONS_QUERY) || !importer) return null;
            return PREFIX + resolve(dirname(importer.split('?')[0]), source.slice(0, -PUBLIC_LESSONS_QUERY.length)) + SUFFIX;
        },
        load(id) {
            if (!id.startsWith(PREFIX) || !id.endsWith(SUFFIX)) return null;
            const path = id.slice(PREFIX.length, -SUFFIX.length);
            this.addWatchFile?.(path);
            return `export default ${JSON.stringify(loadPublicLessons(path))};\n`;
        },
    };
}
