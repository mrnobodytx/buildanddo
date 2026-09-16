// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790400000_government_submission_learning.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_migrations/data/government-submissions.json, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// EnumType:    Migration
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/government-submissions.json; DEPENDS_ON apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// DAG Node:    none
// Intent:      Install eight government-submission lessons under stable progress identities while preserving operator edits.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const curriculum = JSON.parse(toString($os.readFile(`${__migrations}/data/government-submissions.json`)));
    if (curriculum.version !== '2026.09.gov.1' || curriculum.lessons.length !== 8 ||
        new Set(curriculum.lessons.map((row) => row.id)).size !== 8 || new Set(curriculum.lessons.map((row) => row.slug)).size !== 8)
        throw new Error('The expected government-submission curriculum is missing or invalid.');
    const collection = app.findCollectionByNameOrId('tutorials');
    for (const field of ['slug', 'curriculum_version', 'lesson'])
        if (!collection.fields.getByName(field)) throw new Error('Install the existing business-learning schema first.');
    for (const seed of curriculum.lessons) {
        const rows = app.findRecordsByFilter('tutorials', 'slug = {:slug} || id = {:id}', '', 2, 0, { slug: seed.slug, id: seed.id });
        if (rows.length > 1 || rows[0] && (rows[0].id !== seed.id || rows[0].getString('slug') !== seed.slug))
            throw new Error('Resolve the government curriculum identity collision before applying.');
        if (rows.length) continue;
        const record = new Record(collection); record.id = seed.id;
        for (const field of ['title', 'summary', 'category', 'effort_minutes', 'prerequisites', 'order', 'slug', 'lesson']) record.set(field, seed[field]);
        record.set('curriculum_version', curriculum.version); app.save(record);
    }
}, (_app) => {
    // This data-only rollback intentionally retains lessons and tutorial_progress
    // identities. Roll back the catalogue source to remove the new entry points;
    // deleting learners' records is not part of an application rollback.
});
