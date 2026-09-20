// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js
// EnumType:    Migration
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json; DEPENDS_ON apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js
// DAG Node:    none
// Intent:      Add business planning fields and reviewed content receipts while hydrating 25 lessons without replacing edited content or progress identities.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    // PocketBase 0.39.x defines __hooks but never __migrations. Measured 2026-09-20 against the
    // staging binary (0.39.8): __hooks=string, __migrations=undefined, $filepath=object. This line
    // therefore threw ReferenceError and PocketBase ABORTS STARTUP on a failed migration, so this
    // file took staging down until it was quarantined. pb_hooks and pb_migrations are siblings by
    // convention, so derive the path instead of depending on a global that does not exist.
    const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
    const curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'starter-tutorials.json'))));
    if (curriculum.version !== '2026.09.1' || curriculum.lessons.length !== 25)
        throw new Error('The expected 25-lesson curriculum is missing or invalid.');
    const users = app.findCollectionByNameOrId('users');
    const objectives = app.findCollectionByNameOrId('erp_objectives');
    const contacts = app.findCollectionByNameOrId('erp_contacts');
    const definitions = {
        erp_objectives: [
            { name: 'success_metric', type: 'text', max: 600 },
            { name: 'due_date', type: 'date' },
        ],
        erp_tasks: [
            { name: 'description', type: 'text', max: 2000 },
            { name: 'priority', type: 'select', maxSelect: 1, values: ['low', 'normal', 'high'] },
            { name: 'due_date', type: 'date' },
            { name: 'contact', type: 'relation', collectionId: contacts.id, maxSelect: 1 },
        ],
        social_content: [
            { name: 'format', type: 'select', maxSelect: 1, values: ['blog', 'tutorial', 'social'] },
            { name: 'audience', type: 'text', max: 300 },
            { name: 'brief', type: 'text', max: 2000 },
            { name: 'call_to_action', type: 'text', max: 400 },
            { name: 'objective', type: 'relation', collectionId: objectives.id, maxSelect: 1 },
            { name: 'review_checks', type: 'json', maxSize: 1000 },
            { name: 'review_note', type: 'text', max: 1200 },
            { name: 'reviewed_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
            { name: 'reviewed_at', type: 'date' },
            { name: 'published_url', type: 'text', max: 2048 },
            { name: 'published_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
            { name: 'published_at', type: 'date' },
        ],
        tutorials: [
            { name: 'slug', type: 'text', max: 100 },
            { name: 'curriculum_version', type: 'text', max: 40 },
            { name: 'lesson', type: 'json', maxSize: 65536 },
        ],
    };
    for (const name of Object.keys(definitions)) {
        const collection = app.findCollectionByNameOrId(name);
        let changed = false;
        for (const definition of definitions[name]) {
            if (collection.fields.getByName(definition.name)) continue;
            collection.fields.add(new Field(definition));
            changed = true;
        }
        if (name === 'social_content') {
            const status = collection.fields.getByName('status');
            if (!status.values.includes('approved')) {
                status.values = [...status.values, 'approved'];
                changed = true;
            }
        }
        if (changed) app.save(collection);
    }
    const tutorials = app.findCollectionByNameOrId('tutorials');
    for (const seed of curriculum.lessons) {
        const matching = app.findRecordsByFilter('tutorials', 'slug = {:slug} || id = {:id}', '', 2, 0,
            { slug: seed.slug, id: seed.id });
        if (matching.length > 1) throw new Error(`Ambiguous curriculum identity: ${seed.slug}`);
        let record = matching[0];
        if (record && record.getString('slug') && record.getString('slug') !== seed.slug)
            throw new Error(`Curriculum identifier collision: ${seed.slug}`);
        if (!record && seed.legacy_summary) {
            const legacy = app.findRecordsByFilter('tutorials', 'title = {:title} && summary = {:summary} && order = {:order}', '', 2, 0,
                { title: seed.title, summary: seed.legacy_summary, order: seed.order });
            if (legacy.length === 1 && !legacy[0].getString('slug') &&
                ['', 'null'].includes(legacy[0].getString('lesson'))) record = legacy[0];
        }
        if (record && !['', 'null'].includes(record.getString('lesson'))) continue;
        if (!record) {
            record = new Record(tutorials);
            record.set('id', seed.id);
            for (const name of ['title', 'summary', 'category', 'effort_minutes', 'prerequisites', 'order']) record.set(name, seed[name]);
        }
        record.set('slug', seed.slug);
        record.set('curriculum_version', curriculum.version);
        record.set('lesson', seed.lesson);
        app.save(record);
    }
}, (app) => {
    // Retain lesson summaries and all per-account progress. Reapplying the
    // migration hydrates those same identities instead of replacing records.
    const definitions = {
        erp_objectives: ['success_metric', 'due_date'],
        erp_tasks: ['description', 'priority', 'due_date', 'contact'],
        social_content: ['format', 'audience', 'brief', 'call_to_action', 'objective', 'review_checks', 'review_note',
            'reviewed_by', 'reviewed_at', 'published_url', 'published_by', 'published_at'],
        tutorials: ['slug', 'curriculum_version', 'lesson'],
    };
    const content = app.findCollectionByNameOrId('social_content');
    // Keep the added approved select value so existing reviewed rows remain
    // readable. Removing receipt fields is destructive; retain the migration
    // for an ordinary application rollback and take a backup before down.
    for (const name of Object.keys(definitions)) {
        const collection = name === 'social_content' ? content : app.findCollectionByNameOrId(name);
        let changed = false;
        for (const name of definitions[collection.name]) {
            const field = collection.fields.getByName(name);
            if (!field) continue;
            collection.fields.removeById(field.id);
            changed = true;
        }
        if (changed) app.save(collection);
    }
});
