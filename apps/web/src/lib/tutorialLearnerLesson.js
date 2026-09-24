// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/lib/tutorialLearnerLesson.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Validate keyless guided lessons without weakening the full authored lesson contract used by public reading and classrooms.
// ----------------------------------------------------------------

import { lessonLink } from './tutorialCurriculum.js';

/** @param {unknown} value Learner projection, not an authored lesson. @returns {boolean} Whether it is bounded and keyless. */
export function validLearnerLesson(value) {
    const text = (item, max = 5000) => typeof item === 'string' && item.trim().length > 0 && item.length <= max;
    const strings = (items, max = 20) => Array.isArray(items) && items.length > 0 && items.length <= max && items.every((item) => text(item));
    return Boolean(value && value.schema_version === 1 && strings(value.outcomes) && text(value.why) && strings(value.preparation) &&
        Array.isArray(value.sections) && value.sections.length > 0 && value.sections.length <= 20 && value.sections.every((section) => section &&
            text(section.heading, 200) && (section.paragraphs === undefined || strings(section.paragraphs)) &&
            (section.steps === undefined || strings(section.steps)) && (strings(section.paragraphs) || strings(section.steps))) &&
        text(value.exercise?.prompt) && strings(value.exercise.checklist) && value.check &&
        Object.keys(value.check).length === 2 && Object.keys(value.check).every((key) => ['question', 'choices'].includes(key)) &&
        text(value.check.question) && strings(value.check.choices, 6) && value.check.choices.length >= 2 &&
        Array.isArray(value.references) && value.references.length <= 12 && value.references.every((reference) =>
            reference && text(reference.label, 200) && Boolean(lessonLink(reference.url))));
}
