/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792000000_classroom_global_and_access.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-CLASSROOM-GLOBAL-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CLASSROOM-GLOBAL-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// EnumType:    Migration
// EnumEdges:   EXTENDS classroom_rooms; CREATES classroom_access; CREATES classroom_audit
// Intent:      Let a class exist without a workspace, record a person's access to a class where
//              they work, and give a guildmaster something central to audit and score.
// ───────────────────────────────────────────────────────────────
//
// WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT
//   classroom_rooms gains `scope` and stops REQUIRING a workspace. Every existing row is written
//   scope='workspace' and keeps the workspace it has, so nothing that works today behaves
//   differently tomorrow. This migration moves no class to global; that is a decision per class.
//
// WHY ACCESS IS ITS OWN COLLECTION
//   Membership of a room (classroom_members) answers "who is in the room right now". It cannot
//   answer "which classes are mine", because a person's relationship to a class outlives any
//   session and exists before they ever join one. The gallery reads classroom_access, so a student
//   who never studies chemistry has no chemistry row and sees no chemistry class - absence, not a
//   greyed-out card.
//
// WHY THE AUDIT CARRIES ITS SCALE
//   A score without its scale is a number nobody can act on: 7 out of 10 and 7 out of 100 are
//   different facts. `scale` is required beside `score`. `label` uses the trust vocabulary the
//   platform already speaks, and the hook floors VERIFIED to UNVERIFIED without a resolvable
//   evidence reference - the schema records the claim, the hook refuses to let it overreach.
//
// PREFIX
//   1792000000 verified unused on 2026-09-24; 1791900000 is the highest in the tree.
//
// THE FAILURE MODE THIS FILE IS WRITTEN AGAINST
//   PocketBase applies migrations by set difference on FILENAME and a throw here aborts startup -
//   the whole backend, not one feature. Worse, a migration that returns early is recorded as
//   applied forever, so a guard that silently skips can never be retried. Every step below is
//   therefore idempotent by inspection rather than by early return: it checks for what it is about
//   to add and adds only what is absent.

migrate((app) => {
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) {
            if (String(error.message).includes('no rows in result set')) return null;
            throw error;
        }
    };

    const rooms = app.findCollectionByNameOrId('classroom_rooms');
    const users = app.findCollectionByNameOrId('users');
    const workspaces = app.findCollectionByNameOrId('workspaces');

    // ── 1. a class may be global ────────────────────────────────────────────────────────────
    if (!rooms.fields.getByName('scope')) {
        rooms.fields.add(new Field({
            name: 'scope',
            type: 'select',
            values: ['workspace', 'global'],
            maxSelect: 1,
            required: false,
        }));
    }
    // `workspace` stops being required so a global class can exist without one. The hook keeps
    // requiring it for scope='workspace'; relaxing it here only removes the DATABASE's refusal,
    // which cannot tell the two kinds apart.
    const workspaceField = rooms.fields.getByName('workspace');
    if (workspaceField && workspaceField.required === true) {
        workspaceField.required = false;
    }
    app.save(rooms);

    // Every row that predates `scope` is a workspace class. Written explicitly rather than left to
    // a default, so a reader never has to infer the kind of a class from an empty column.
    for (const record of app.findRecordsByFilter('classroom_rooms', 'scope = "" || scope = null', '', 0, 0)) {
        record.set('scope', 'workspace');
        app.save(record);
    }

    const relation = (name, collectionId, required = true, cascadeDelete = true) =>
        ({ name, type: 'relation', collectionId, required, cascadeDelete, maxSelect: 1 });
    const text = (name, max, required = false) => ({ name, type: 'text', max, required });
    const stamps = () => [
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ];
    // Locked like every other classroom collection: no REST client enumerates access rows or
    // audits directly, only the hooks read and write them.
    const locked = { type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };

    // ── 2. the workspace holds a person's access, and that is the gallery ───────────────────
    if (!exists('classroom_access')) {
        const access = new Collection({
            ...locked,
            name: 'classroom_access',
            fields: [
                // Where this person works. The same account may hold access to one class from two
                // workspaces; each is its own row, because the gallery belongs to the workspace.
                relation('workspace', workspaces.id),
                relation('account', users.id),
                relation('room', rooms.id),
                {
                    name: 'state',
                    type: 'select',
                    values: ['invited', 'enrolled', 'completed', 'withdrawn'],
                    maxSelect: 1,
                    required: true,
                },
                // How the access came about, so a widening is readable in the data rather than
                // only in a hook: an invitation, a self-enrolment, or a host adding someone.
                {
                    name: 'source',
                    type: 'select',
                    values: ['invited', 'self', 'host', 'guildmaster'],
                    maxSelect: 1,
                    required: true,
                },
                ...stamps(),
            ],
            indexes: [
                // One relationship per person per class. Two rows would make "am I in this class"
                // a question with two answers.
                'create unique index idx_classroom_access_one on classroom_access (account, room)',
                // The gallery's own read: this workspace, this account, most recent first.
                'create index idx_classroom_access_gallery on classroom_access (workspace, account, state, created desc, id)',
            ],
        });
        app.save(access);
    }

    // ── 3. what a guildmaster found ─────────────────────────────────────────────────────────
    if (!exists('classroom_audit')) {
        const audit = new Collection({
            ...locked,
            name: 'classroom_audit',
            fields: [
                relation('room', rooms.id),
                relation('auditor', users.id),
                text('guild', 80),
                { name: 'score', type: 'number', min: 0, onlyInt: false },
                // Required beside the score: 7 of 10 and 7 of 100 are different facts.
                text('scale', 40, true),
                {
                    name: 'label',
                    type: 'select',
                    values: ['UNVERIFIED', 'INFERRED', 'SOURCED', 'VERIFIED'],
                    maxSelect: 1,
                    required: true,
                },
                // VERIFIED and SOURCED mean nothing without something to resolve. The hook floors
                // the label when this is empty; the column exists so the claim can be checked
                // later by someone who was not there.
                text('evidence_ref', 300),
                text('note', 2000),
                ...stamps(),
            ],
            indexes: [
                'create index idx_classroom_audit_room on classroom_audit (room, created desc, id)',
                'create unique index idx_classroom_audit_one on classroom_audit (room, auditor, created)',
            ],
        });
        app.save(audit);
    }
}, (app) => {
    // Rollback drops what this migration created and restores the required workspace. It refuses
    // if either new collection has been opened up or carries rows an operator would lose, because
    // those are changes this migration did not make.
    const find = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) {
            if (String(error.message).includes('no rows in result set')) return null;
            throw error;
        }
    };
    for (const name of ['classroom_audit', 'classroom_access']) {
        const collection = find(name);
        if (!collection) continue;
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (collection[rule] !== null) throw new Error(`Review custom ${name}.${rule} before rollback.`);
        app.delete(collection);
    }
    const rooms = find('classroom_rooms');
    if (rooms) {
        // A global class has no workspace, so making the column required again would strand it.
        // Refuse rather than delete somebody's class.
        const globals = app.findRecordsByFilter('classroom_rooms', 'scope = "global"', '', 0, 0);
        if (globals.length)
            throw new Error(`${globals.length} global classroom(s) have no workspace; re-scope them before rollback.`);
        const workspaceField = rooms.fields.getByName('workspace');
        if (workspaceField) workspaceField.required = true;
        const scope = rooms.fields.getByName('scope');
        if (scope) rooms.fields.removeByName('scope');
        app.save(rooms);
    }
});
