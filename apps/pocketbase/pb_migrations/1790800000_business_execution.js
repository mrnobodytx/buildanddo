// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_migrations/1790800000_business_execution.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_migrations/1790000000_workspace_administration.js, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// EnumType:     Migration
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_migrations/1790000000_workspace_administration.js; DEPENDS_ON apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// DAG Node:     none
// Intent:       Persist bounded business effects and provenance with retained rollback and durable effect identity.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const text = (name, max) => ({ name, type: 'text', max });
    const relation = (name, collection, required = false) => ({ name, type: 'relation', required, maxSelect: 1,
        collectionId: app.findCollectionByNameOrId(collection).id, cascadeDelete: false });
    // PocketBase 0.39.8 does not expose Field properties as plain values: `type`
    // is a METHOD (reflect.methodValueCall) and numeric bounds like `min` are
    // *float64 POINTERS that read as typeof 'object'. Strict equality therefore
    // reports every existing field as drift. Resolve, then compare as text.
    const bound = (field, key) => {
        const value = field[key];
        return String(typeof value === 'function' ? value() : value);
    };
    const sameField = (old, field) => old && Object.entries(field).every(([key, value]) => bound(old, key) === String(value));
    let jobs;
    try { jobs = app.findCollectionByNameOrId('business_jobs'); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    const fields = [relation('workspace', 'workspaces', true), relation('owner', 'users', true),
        relation('mission', 'missions'), relation('run', 'workflow_runs'), text('step_id', 64), text('provider', 30), text('binding', 64),
        text('effect_key', 64), text('status', 30), text('worker', 64), text('lease_id', 80), text('failure', 80),
        text('approval_at', 40), text('result_sha256', 64), relation('evidence', 'evidence'),
        { name: 'input', type: 'json', maxSize: 24000 }, { name: 'result', type: 'json', maxSize: 65536 }, { name: 'release_context', type: 'json', maxSize: 2000 },
        ...['revision', 'attempt', 'integration_revision', 'run_revision', 'protocol_version'].map((name) => ({ name, type: 'number', onlyInt: true, min: 0 })),
        ...['lease_until', 'started_at', 'finished_at'].map((name) => ({ name, type: 'date' })),
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    if (!jobs) {
        app.save(new Collection({ name: 'business_jobs', type: 'base', listRule: null, viewRule: null, createRule: null,
            updateRule: null, deleteRule: null, fields,
            indexes: ['create unique index idx_business_effect on business_jobs (workspace, effect_key)',
                'create index idx_business_evidence on business_jobs (evidence)'] }));
    } else {
        if (['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((key) => jobs[key] !== null))
            throw new Error('Review custom execution access before migrating.');
        for (const field of fields) {
            const old = jobs.fields.getByName(field.name);
            if (!old && field.name === 'protocol_version') jobs.fields.add(new Field(field));
            else if (!sameField(old, field)) throw new Error('Review custom execution schema before migrating.');
        }
        if (!jobs.indexes.includes('create unique index idx_business_effect on business_jobs (workspace, effect_key)'))
            throw new Error('Review custom execution identity before migrating.');
        if (!jobs.indexes.includes('create index idx_business_evidence on business_jobs (evidence)')) jobs.indexes.push('create index idx_business_evidence on business_jobs (evidence)');
        app.save(jobs);
    }
    for (const [name, additions] of [
        ['signals', [text('ingest_digest', 64), text('ingest_url', 2048), text('ingest_provider', 30), { name: 'ingested_at', type: 'date' }]],
        ['erp_tasks', [relation('mission', 'missions'), relation('execution', 'business_jobs'), relation('evidence', 'evidence')]],
    ]) {
        const collection = app.findCollectionByNameOrId(name);
        for (const field of additions) {
            const old = collection.fields.getByName(field.name);
            if (!old) collection.fields.add(new Field(field));
            else if (!sameField(old, field)) throw new Error('Review custom signal or ERP provenance before migrating.');
        }
        if (name === 'signals' && !collection.indexes.includes("create unique index idx_signal_ingest on signals (workspace, ingest_digest) where ingest_digest != ''"))
            collection.indexes.push("create unique index idx_signal_ingest on signals (workspace, ingest_digest) where ingest_digest != ''");
        app.save(collection);
    }
}, (app) => {
    let jobs;
    try { jobs = app.findCollectionByNameOrId('business_jobs'); }
    catch (error) { if (String(error.message).includes('no rows in result set')) return; throw error; }
    // Retain effects, provenance and task/evidence links; stop all new execution.
    jobs.fields.removeByName('protocol_version'); app.save(jobs);
});
