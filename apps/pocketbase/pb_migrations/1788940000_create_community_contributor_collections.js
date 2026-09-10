/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1788940000_create_community_contributor_collections.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js
// EnumType:    Migration
// EnumEdges:   PRODUCES seat_events; PRODUCES contributors;
//              DEPENDS_ON apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js
// Intent:      Create the coordination log and contributor catalog the community surface reads.
// ───────────────────────────────────────────────────────────────

// Community contributor infrastructure (SRS-BUILDANDDO-COMMUNITY-001).
//
// Two real gaps closed:
//
// 1. seat_events — nothing recorded that work happened. Two contributors, or
//    two agent seats working the same workspace, could pick up the same
//    mission with no way to discover the collision. This is the append-only
//    record that makes "has anyone worked this before" answerable, and it is
//    what apps/web/src/lib/seatComms.js publishes to and subscribes from.
//    Owner-scoped like every other workspace collection: a seat announcement
//    is workspace activity, not public activity.
//
// 2. contributors — the contributor hub leaderboard had no source. Deliberately
//    a shared read-only catalog (same shape as `tutorials`): the web client can
//    read it, only a maintainer or a server-side job writes it. Counters are
//    left at zero rather than seeded, because inventing contribution history
//    is exactly the kind of fake data this product refuses to render.
//
// The down leg removes both collections and tolerates their absence, so the
// migration is safe to re-run and safe to revert.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const workspaces = app.findCollectionByNameOrId("workspaces");

    // ---- seat_events (owner-scoped seat coordination log) ----
    try {
      app.findCollectionByNameOrId("seat_events");
    } catch (_) {
      const seatEvents = new Collection({
        type: "base",
        name: "seat_events",
        listRule: "@request.auth.id != '' && @request.auth.id = owner",
        viewRule: "@request.auth.id != '' && @request.auth.id = owner",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id != '' && @request.auth.id = owner",
        deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
        fields: [
          {
            name: "event",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["joined", "progress", "completed", "blocked", "handoff"],
          },
          { name: "seat", type: "text", required: true, max: 80 },
          {
            name: "actor_type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["human", "agent", "mixed"],
          },
          {
            name: "subject_type",
            type: "select",
            maxSelect: 1,
            values: ["mission", "workflow", "page", "issue", "pull_request", "other"],
          },
          { name: "subject", type: "text", max: 200 },
          { name: "summary", type: "text", required: true, max: 400 },
          { name: "detail", type: "json", maxSize: 20000 },
          { name: "pr_url", type: "url" },
          { name: "handoff_to", type: "text", max: 80 },
          {
            name: "workspace",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: workspaces.id,
            cascadeDelete: true,
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_seat_events_subject ON seat_events (workspace, subject_type, subject)",
          "CREATE INDEX idx_seat_events_seat ON seat_events (workspace, seat)",
        ],
      });
      app.save(seatEvents);
    }

    // ---- contributors (shared catalog; any signed-in user can read) ----
    try {
      app.findCollectionByNameOrId("contributors");
    } catch (_) {
      const contributors = new Collection({
        type: "base",
        name: "contributors",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: "handle", type: "text", required: true, max: 80 },
          { name: "display_name", type: "text", max: 120 },
          {
            name: "actor_type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["human", "agent", "mixed"],
          },
          { name: "merged_prs", type: "number", min: 0 },
          { name: "reviews", type: "number", min: 0 },
          { name: "issues_opened", type: "number", min: 0 },
          { name: "pages_enhanced", type: "number", min: 0 },
          { name: "first_contribution_at", type: "date" },
          { name: "last_contribution_at", type: "date" },
          { name: "profile_url", type: "url" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_contributors_handle ON contributors (handle)"],
      });
      app.save(contributors);
    }
  },
  (app) => {
    for (const name of ["seat_events", "contributors"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    }
  },
);
