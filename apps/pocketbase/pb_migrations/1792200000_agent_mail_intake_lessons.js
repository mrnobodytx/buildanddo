// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_migrations/1792200000_agent_mail_intake_lessons.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-CN-GM-MAIL-INTAKE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-11-21
// Depends:     apps/pocketbase/pb_migrations/data/agent-mail-intake-lessons.json, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// EnumType:    Migration
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/agent-mail-intake-lessons.json; DEPENDS_ON apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// DAG Node:    none
// Intent:      Add one public AI-agent mail-intake lesson without replacing operator edits or learner history.
// ----------------------------------------------------------------

migrate((app) => {
    const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
    const curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'agent-mail-intake-lessons.json'))));
    if (!curriculum || curriculum.version !== '2026.11.mailintake.1' || !Array.isArray(curriculum.lessons) ||
        curriculum.lessons.length !== 1 || curriculum.lessons[0]?.id !== 'bdomailintake01' ||
        curriculum.lessons[0]?.slug !== 'agent-mail-intake-and-sender-proof')
        throw new Error('The expected agent mail-intake curriculum is missing or invalid.');
    const collection = app.findCollectionByNameOrId('tutorials');
    for (const field of ['slug', 'curriculum_version', 'lesson'])
        if (!collection.fields.getByName(field)) throw new Error('Install the existing business-learning schema first.');
    for (const seed of curriculum.lessons) {
        const rows = app.findRecordsByFilter('tutorials', 'slug = {:slug} || id = {:id}', '', 2, 0, { slug: seed.slug, id: seed.id });
        if (rows.length > 1 || rows[0] && (rows[0].id !== seed.id || rows[0].getString('slug') !== seed.slug))
            throw new Error('Resolve the agent mail-intake curriculum identity collision before applying.');
        if (rows.length) continue;
        const record = new Record(collection); record.id = seed.id;
        for (const field of ['title', 'summary', 'category', 'effort_minutes', 'prerequisites', 'order', 'slug', 'lesson']) record.set(field, seed[field]);
        record.set('curriculum_version', curriculum.version); app.save(record);
    }
}, (_app) => {
    // Data-only rollback retains tutorial identities, progress, snapshots and
    // certificates. It neither deletes history nor rewrites an operator's lesson.
});
