/// <reference path="../pb_data/types.d.ts" />

// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789000000_extend_workspace_operations.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js
// EnumType:    Migration
// EnumEdges:   EXTENDS apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js;
//              PRODUCES collection.operations;
//              PRODUCES collection.operation_runs
// Intent:      Add the fields and two collections the workspace pages need,
//              without invalidating a single existing row.
// ───────────────────────────────────────────────────────────────

// SRS-BUILDANDDO-WORKSPACE-001 — the fields and collections the workspace
// pages need to be usable rather than merely present.
//
// Additive and reversible by construction:
//   * every fields.add is guarded by getByName, so a partial re-run is a no-op
//   * no added field is required — existing rows stay valid without a backfill
//   * the down migration removes exactly what the up migration added
//
// Nothing here changes an existing field's type or its access rules. The two
// new collections copy the owner-scoped rule set already used by every other
// workspace collection.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const workspaces = app.findCollectionByNameOrId("workspaces");

    const addField = (collection, definition) => {
      if (collection.fields.getByName(definition.name)) return false;
      collection.fields.add(new Field(definition));
      return true;
    };

    const extend = (name, definitions) => {
      const collection = app.findCollectionByNameOrId(name);
      let touched = false;
      definitions.forEach((definition) => {
        if (addField(collection, definition)) touched = true;
      });
      if (touched) app.save(collection);
    };

    // ---- missions: triage and progress ----
    // Priority and due date make a list of twenty missions orderable; progress
    // records how far a running mission got without inventing a stage for it.
    extend("missions", [
      {
        name: "priority",
        type: "select",
        maxSelect: 1,
        values: ["low", "normal", "high", "urgent"],
      },
      { name: "progress", type: "number", min: 0, max: 100 },
      { name: "due_date", type: "date" },
    ]);

    // ---- workflows: the steps that make it a workflow ----
    // Stored as json rather than a child collection: a step has no identity
    // outside its workflow, is never queried on its own, and reordering must
    // not be a multi-row write.
    extend("workflows", [
      { name: "steps", type: "json", maxSize: 20000 },
      { name: "template", type: "text", max: 80 },
      { name: "last_run", type: "date" },
    ]);

    // ---- signals: triage state ----
    // Without these a feed only grows. `state` defaults to empty for existing
    // rows and is read as "new" by the client.
    extend("signals", [
      {
        name: "severity",
        type: "select",
        maxSelect: 1,
        values: ["info", "low", "medium", "high", "critical"],
      },
      {
        name: "state",
        type: "select",
        maxSelect: 1,
        values: ["new", "acknowledged", "dismissed"],
      },
      { name: "acknowledged_at", type: "date" },
    ]);

    // ---- evidence: attachments and categorisation ----
    // `url` is a link to evidence held elsewhere; BuildAndDo stores the
    // reference, not a copy, so nothing here becomes a file store.
    extend("evidence", [
      { name: "title", type: "text", max: 200 },
      { name: "url", type: "url" },
      { name: "category", type: "text", max: 80 },
      { name: "tags", type: "text", max: 300 },
    ]);

    const OWNER_RULES = {
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
    };

    const workspaceRelation = {
      name: "workspace",
      type: "relation",
      required: true,
      maxSelect: 1,
      collectionId: workspaces.id,
      cascadeDelete: true,
    };

    const ownerRelation = {
      name: "owner",
      type: "relation",
      required: true,
      maxSelect: 1,
      collectionId: users.id,
      cascadeDelete: true,
    };

    const timestamps = [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];

    const exists = (name) => {
      try {
        return app.findCollectionByNameOrId(name);
      } catch (e) {
        if (e.message.includes("no rows in result set")) return null;
        throw e;
      }
    };

    // ---- operations: the runbook surface ----
    // An operation is a written procedure the operator owns. BuildAndDo does
    // not execute it; it holds the text and the record of each time a human
    // ran it.
    let operations = exists("operations");
    if (!operations) {
      operations = new Collection({
        type: "base",
        name: "operations",
        ...OWNER_RULES,
        fields: [
          { name: "name", type: "text", required: true, max: 160 },
          { name: "summary", type: "text", max: 400 },
          { name: "runbook", type: "text", max: 8000 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["idle", "running", "healthy", "degraded", "blocked"],
          },
          { name: "owner_note", type: "text", max: 300 },
          { name: "last_run", type: "date" },
          workspaceRelation,
          ownerRelation,
          ...timestamps,
        ],
      });
      app.save(operations);
    }

    // ---- operation_runs: the execution log ----
    if (!exists("operation_runs")) {
      const runs = new Collection({
        type: "base",
        name: "operation_runs",
        ...OWNER_RULES,
        fields: [
          {
            name: "operation",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: operations.id,
            cascadeDelete: true,
          },
          {
            name: "result",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["succeeded", "failed", "partial", "skipped"],
          },
          { name: "notes", type: "text", max: 2000 },
          { name: "duration_seconds", type: "number", min: 0 },
          workspaceRelation,
          ownerRelation,
          ...timestamps,
        ],
      });
      app.save(runs);
    }
  },
  (app) => {
    const drop = (collectionName, fieldNames) => {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(collectionName);
      } catch (e) {
        if (e.message.includes("no rows in result set")) return;
        throw e;
      }
      let touched = false;
      fieldNames.forEach((fieldName) => {
        const field = collection.fields.getByName(fieldName);
        if (field) {
          collection.fields.removeById(field.id);
          touched = true;
        }
      });
      if (touched) app.save(collection);
    };

    // Child collection first — operation_runs cascades from operations.
    ["operation_runs", "operations"].forEach((name) => {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    });

    drop("evidence", ["title", "url", "category", "tags"]);
    drop("signals", ["severity", "state", "acknowledged_at"]);
    drop("workflows", ["steps", "template", "last_run"]);
    drop("missions", ["priority", "progress", "due_date"]);
  },
);
