// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790500000_workspace_blueprints.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_migrations/1790100000_mission_research.js
// EnumType:    Migration
// EnumEdges:   EXTENDS apps/pocketbase/pb_migrations/1790100000_mission_research.js
// DAG Node:    none
// Intent:      Retain workspace blueprint observations on the existing protected research queue without opening native collection access.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    // PocketBase 0.39.8 does not expose a saved Field's properties as plain
    // values: `type` is a METHOD (reflect.methodValueCall) and numeric bounds
    // like `min` are *float64 POINTERS that read as typeof 'object'.
    // JSON.stringify returns undefined for the method and an opaque {} for the
    // pointer, so EVERY existing field compared as drift and re-applying this
    // migration threw - which aborted PocketBase startup on any rollback.
    // Resolve the bound value, then normalise both sides to comparable text.
    const norm = (holder, key) => {
        const raw = holder[key];
        const value = typeof raw === 'function' ? raw() : raw;
        const json = JSON.stringify(value);
        if (json === undefined) return String(value);
        if (json === '{}' && value !== null && typeof value === 'object') return String(value);
        return json;
    };
    const research = app.findCollectionByNameOrId('research_submissions');
    const mission = research.fields.getByName('mission');
    // In the PocketBase 0.39.x JSVM a field's `type` is a METHOD, not a property: measured
    // 2026-09-20 on 0.39.8, typeof mission.type === 'function' (reflect.methodValueCall), so
    // `mission.type !== 'relation'` was true no matter what the schema said and this guard refused
    // on every database. The rest of the shape was correct all along - collectionId matched
    // missions.id, maxSelect was 1, cascadeDelete was false and protocol_version existed - so the
    // migration was reporting a schema problem that did not exist. Read it through an accessor that
    // works whether the binding exposes a method or a plain value.
    const fieldType = (f) => String(typeof f.type === 'function' ? f.type() : f.type);
    if (!mission || fieldType(mission) !== 'relation' || mission.collectionId !== app.findCollectionByNameOrId('missions').id ||
        mission.maxSelect !== 1 || mission.cascadeDelete || !research.fields.getByName('protocol_version'))
        throw new Error('Review the research mission schema before adding blueprint mode.');
    const mode = { name: 'mode', type: 'select', values: ['blueprint'], maxSelect: 1, required: false };
    const savedMode = research.fields.getByName('mode');
    if (savedMode && Object.keys(mode).some((key) => JSON.stringify(typeof savedMode[key] === 'function' ? savedMode[key]() : savedMode[key]) !== JSON.stringify(mode[key])))
        throw new Error('Review custom research blueprint mode.');
    const locked = { type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (research[key] !== null) throw new Error(`Review custom research_submissions.${key}.`);
    if (!app.findCollectionByNameOrId('research_uploads').fields.getByName('asset')?.protected)
        throw new Error('Review research upload protection.');
    const relation = (name, target) => ({ name, type: 'relation', required: true, maxSelect: 1, cascadeDelete: false,
        collectionId: app.findCollectionByNameOrId(target).id });
    const text = (name, max) => ({ name, type: 'text', required: true, max });
    const marker = { name: 'protocol_version', type: 'number', min: 0, onlyInt: true };
    const definition = { ...locked, name: 'workspace_blueprints', fields: [marker,
        relation('workspace', 'workspaces'), relation('owner', 'users'), relation('submission', 'research_submissions'),
        text('request_key', 80), text('source_file', 180), text('input_sha256', 64),
        { name: 'result', type: 'json', maxSize: 524288 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }],
        indexes: ['create unique index idx_blueprint_submission on workspace_blueprints (submission)',
            'create unique index idx_blueprint_retry on workspace_blueprints (workspace, owner, request_key)',
            'create index idx_blueprint_workspace on workspace_blueprints (workspace, created desc, id)'] };
    let collection;
    try { collection = app.findCollectionByNameOrId(definition.name); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    if (collection) {
        for (const key of Object.keys(locked))
            if (collection[key] !== definition[key]) throw new Error(`Review custom workspace_blueprints.${key}.`);
        for (const field of definition.fields) {
            const actual = collection.fields.getByName(field.name);
            if (!actual && field.name === 'protocol_version') continue;
            if (!actual || Object.keys(field).some((key) => JSON.stringify(typeof actual[key] === 'function' ? actual[key]() : actual[key]) !== JSON.stringify(field[key])))
                throw new Error(`Review custom workspace_blueprints.${field.name}.`);
        }
        if (!definition.indexes.every((index) => collection.indexes.includes(index))) throw new Error('Review blueprint indexes.');
    }
    if (!savedMode) research.fields.add(new Field(mode));
    // Native writes remain locked. Ordinary research commands still require a
    // mission; only the workspace blueprint intake may omit it.
    mission.required = false;
    app.save(research);
    if (!collection) app.save(new Collection(definition));
    else if (!collection.fields.getByName('protocol_version')) {
        collection.fields.add(new Field(marker)); app.save(collection);
    }
}, (app) => {
    const collection = app.findCollectionByNameOrId('workspace_blueprints');
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[key] !== null) throw new Error(`Review custom workspace_blueprints.${key} before rollback.`);
    if (!app.findCollectionByNameOrId('research_uploads').fields.getByName('asset')?.protected)
        throw new Error('Review research upload protection before rollback.');
    // Retain PDFs, observations, request keys and the discriminator needed to
    // keep them separate from mission research. Removing the marker disables
    // blueprint commands, claims, completion and protected downloads.
    if (collection.fields.getByName('protocol_version')) {
        collection.fields.removeByName('protocol_version'); app.save(collection);
    }
});
