// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// EnumType:    Migration
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json; DEPENDS_ON apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// DAG Node:    none
// Intent:      Add one public broadcast repair lesson without replacing operator edits or learner history.
// ----------------------------------------------------------------

migrate((app) => {
    const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
    const curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'broadcast-classroom-lessons.json'))));
    if (!curriculum || curriculum.version !== '2026.09.broadcast.1' || !Array.isArray(curriculum.lessons) ||
        curriculum.lessons.length !== 1 || curriculum.lessons[0]?.id !== 'bdobroadcast001' ||
        curriculum.lessons[0]?.slug !== 'broadcast-classroom-repair')
        throw new Error('The expected broadcast classroom curriculum is missing or invalid.');
    const collection = app.findCollectionByNameOrId('tutorials');
    for (const field of ['slug', 'curriculum_version', 'lesson'])
        if (!collection.fields.getByName(field)) throw new Error('Install the existing business-learning schema first.');
    for (const seed of curriculum.lessons) {
        const rows = app.findRecordsByFilter('tutorials', 'slug = {:slug} || id = {:id}', '', 2, 0, { slug: seed.slug, id: seed.id });
        if (rows.length > 1 || rows[0] && (rows[0].id !== seed.id || rows[0].getString('slug') !== seed.slug))
            throw new Error('Resolve the broadcast curriculum identity collision before applying.');
        if (rows.length) continue;
        const record = new Record(collection); record.id = seed.id;
        for (const field of ['title', 'summary', 'category', 'effort_minutes', 'prerequisites', 'order', 'slug', 'lesson']) record.set(field, seed[field]);
        record.set('curriculum_version', curriculum.version); app.save(record);
    }
}, (_app) => {
    // Data-only rollback retains tutorial identities, progress, snapshots and
    // certificates. It neither deletes history nor rewrites an operator's lesson.
});
