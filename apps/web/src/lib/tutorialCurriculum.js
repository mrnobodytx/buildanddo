// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/tutorialCurriculum.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/data/starter-tutorials.json
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json
// DAG Node:    none
// Intent:      Merge authored lesson previews with persistent catalogue identities without claiming unsaved or unreadable progress.
// ───────────────────────────────────────────────────────────────

/** @param {unknown} value Lesson body. @returns {boolean} Whether a bounded structured lesson can be rendered. */
export function validLesson(value) {
    const strings = (items, max = 20) => Array.isArray(items) && items.length > 0 && items.length <= max &&
        items.every((item) => typeof item === 'string' && item.trim() && item.length <= 5000);
    return Boolean(value && typeof value === 'object' && value.schema_version === 1 &&
        strings(value.outcomes) && typeof value.why === 'string' && value.why.trim() && value.why.length <= 5000 &&
        strings(value.preparation) && Array.isArray(value.sections) && value.sections.length > 0 && value.sections.length <= 20 &&
        value.sections.every((section) => section && typeof section.heading === 'string' && section.heading.trim() &&
            section.heading.length <= 200 && (section.paragraphs === undefined || strings(section.paragraphs)) &&
            (section.steps === undefined || strings(section.steps)) && (strings(section.paragraphs) || strings(section.steps))) &&
        value.exercise && typeof value.exercise.prompt === 'string' && value.exercise.prompt.trim() && value.exercise.prompt.length <= 5000 &&
        strings(value.exercise.checklist) && value.check && typeof value.check.question === 'string' && value.check.question.trim() && value.check.question.length <= 5000 &&
        strings(value.check.choices, 6) && value.check.choices.length >= 2 && Number.isInteger(value.check.answer) &&
        value.check.answer >= 0 && value.check.answer < value.check.choices.length &&
        typeof value.check.explanation === 'string' && value.check.explanation.trim() && value.check.explanation.length <= 5000 &&
        Array.isArray(value.references) && value.references.length <= 12 && value.references.every((reference) =>
            reference && typeof reference.label === 'string' && typeof reference.url === 'string' && Boolean(lessonLink(reference.url))));
}

/** @param {unknown} value Reference path. @returns {string} Safe local or HTTPS destination. */
export function lessonLink(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) return '';
    if (/^\/(?!\/)/.test(value)) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
}

/** @param {Array<object>} saved Backend catalogue. @param {Array<object>} seeds Authored lessons. @returns {Array<object>} Catalogue with explicit persistence identity. */
export function mergeTutorials(saved, seeds) {
    const used = new Set();
    const catalogue = seeds.map((seed) => {
        const record = saved.find((item) => item.slug === seed.slug || item.id === seed.id) ||
            saved.find((item) => !item.slug && item.title === seed.title && item.summary === seed.legacy_summary && item.order === seed.order);
        if (record) used.add(record.id);
        const hasBody = record?.lesson !== null && record?.lesson !== undefined && record?.lesson !== '';
        return { ...seed, ...record, lesson: hasBody ? record.lesson : seed.lesson,
            catalogueKey: seed.slug, persistedId: record?.id || '', starter: true };
    });
    for (const record of saved) {
        if (!used.has(record.id)) catalogue.push({ ...record, catalogueKey: record.id, persistedId: record.id, starter: false });
    }
    return catalogue;
}

/** @param {Array<object>} records Account-scoped progress. @param {string} id Persisted lesson ID. @returns {object|undefined} Most advanced real progress, ignoring other lessons. */
export function lessonProgress(records, id) {
    if (!id) return undefined;
    const rank = { not_started: 0, in_progress: 1, completed: 2 };
    return records.filter((record) => record.tutorial === id).sort((a, b) =>
        (rank[b.status] || 0) - (rank[a.status] || 0) || String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')))[0];
}

/** @param {Array<object>} lessons Catalogue. @param {{query?: string, category?: string}} filters Selection. @returns {Array<object>} Matching lessons. */
export function selectTutorials(lessons, { query = '', category = 'all' } = {}) {
    const search = query.trim().toLowerCase();
    return lessons.filter((lesson) => (category === 'all' || lesson.category === category) &&
        `${lesson.title || ''} ${lesson.summary || ''} ${lesson.category || ''}`.toLowerCase().includes(search));
}
