// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/tools/generate-community.mjs
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/publicPages.js, apps/web/src/lib/tutorialCurriculum.js, apps/pocketbase/pb_migrations/data/starter-tutorials.json
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/web/src/lib/publicPages.js; DEPENDS_ON apps/web/src/lib/tutorialCurriculum.js; DEPENDS_ON apps/pocketbase/pb_migrations/data/starter-tutorials.json
// DAG Node:    none
// Intent:      Keep Discord documentation and teaching content on the same authored curriculum and release as the public site.
// ───────────────────────────────────────────────────────────────

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC_PAGES, SITE_ORIGIN } from '../src/lib/publicPages.js';
import { validLesson } from '../src/lib/tutorialCurriculum.js';

const starter = JSON.parse(readFileSync(
    new URL('../../pocketbase/pb_migrations/data/starter-tutorials.json', import.meta.url), 'utf8',
));

function text(value, max) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/** Produce an explicit public projection of authored source, never workspace records. */
export function buildCommunityCatalogue(release, { pages = PUBLIC_PAGES, curriculum = starter } = {}) {
    if (!release || !/^[a-f0-9]{40}$/.test(release.commit_sha) ||
        !/^[0-9]+\+[a-f0-9]{7}$/.test(release.version) ||
        !release.version.endsWith('+' + release.commit_sha.slice(0, 7))) {
        throw new Error('Community catalogue needs the same complete release identity as version.json.');
    }
    if (!text(curriculum?.version, 40) || !Array.isArray(curriculum?.lessons) ||
        curriculum.lessons.length < 1 || curriculum.lessons.length > 100) {
        throw new Error('Community catalogue needs a bounded authored curriculum.');
    }
    if (!Array.isArray(pages) || pages.length < 1 || pages.length > 20) {
        throw new Error('Community catalogue needs the public route catalogue.');
    }
    const publicPages = pages.map((page) => {
        if (!/^\/(?:[a-z0-9-]+\/?)*$/.test(page.path) ||
            /^\/(?:app|login|signup|forgot-password|onboarding|api|hcgi)(?:\/|$)/.test(page.path) ||
            !text(page.label, 80) || !text(page.description, 600)) {
            throw new Error('Community catalogue rejects private routes and invalid public descriptions.');
        }
        return { path: page.path, label: page.label, description: page.description };
    });
    const slugs = new Set();
    const lessons = curriculum.lessons.map((record) => {
        const lesson = record.lesson;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug) || record.slug.length > 80 ||
            slugs.has(record.slug) || !text(record.title, 150) || !text(record.summary, 600) ||
            !text(record.category, 60) || !Number.isInteger(record.effort_minutes) ||
            record.effort_minutes < 1 || record.effort_minutes > 180 || !validLesson(lesson) ||
            !text(lesson.check.question, 500) || !text(lesson.check.explanation, 1000) ||
            !lesson.check.choices.every((choice) => text(choice, 200))) {
            throw new Error('Community catalogue rejects malformed, duplicated or oversized lessons.');
        }
        slugs.add(record.slug);
        // Select nested fields too: later seed/migration metadata cannot leak into this public feed.
        return {
            slug: record.slug,
            title: record.title,
            summary: record.summary,
            category: record.category,
            effort_minutes: record.effort_minutes,
            lesson: {
                schema_version: 1,
                outcomes: [...lesson.outcomes],
                why: lesson.why,
                preparation: [...lesson.preparation],
                sections: lesson.sections.map((section) => ({
                    heading: section.heading,
                    ...(section.paragraphs ? { paragraphs: [...section.paragraphs] } : {}),
                    ...(section.steps ? { steps: [...section.steps] } : {}),
                })),
                exercise: { prompt: lesson.exercise.prompt, checklist: [...lesson.exercise.checklist] },
                check: {
                    question: lesson.check.question, choices: [...lesson.check.choices],
                    answer: lesson.check.answer, explanation: lesson.check.explanation,
                },
                references: lesson.references.map(({ label, url }) => ({ label, url })),
            },
        };
    });
    const catalogue = {
        schema_version: 1,
        site_origin: SITE_ORIGIN,
        curriculum_version: curriculum.version,
        release: { version: release.version, commit_sha: release.commit_sha },
        pages: publicPages,
        lessons,
    };
    if (Buffer.byteLength(JSON.stringify(catalogue)) > 500_000) {
        throw new Error('Community catalogue exceeds the bot response budget.');
    }
    return catalogue;
}

/** Write the public community projection beside the build's existing version.json. */
export function generateCommunityCatalogue(directory, release) {
    const catalogue = buildCommunityCatalogue(release);
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'community-catalog.json'), JSON.stringify(catalogue) + '\n');
}
