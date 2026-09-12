// CGRF: SRS=SRS-BUILDANDDO-MISSION-CHAIN-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789200000_mission_chain.js
// Stage:       05_DATA
// SRS:         SRS-BUILDANDDO-MISSION-CHAIN-001
// CAPS:        B
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-12
// Depends:     apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js (missions, evidence, workspaces);
//              apps/pocketbase/pb_migrations/1789000000_extend_workspace_operations.js (operations, operation_runs)
// EnumType:    Migration
// EnumEdges:   EXTENDS collection.missions;
//              EXTENDS collection.operations;
//              PRODUCES collection.mission_events
// Intent:      The H05 chain — CHALLENGE -> EVENT -> MISSION -> BOUNDED ACTION ->
//              VERIFICATION -> REPLAY — already has every piece except the links.
//              A mission does not record where the challenge arrived from, an
//              operation does not say which mission it acts for, and no ordered
//              trace exists, so the chain cannot be replayed for a stranger.
//              This migration adds the three links and nothing else: an origin on
//              missions, a mission on operations, and mission_events as the
//              ordered trace a replay is reconstructed from.
// Truth:       A mission row is DECLARED INTENT. Recording a stage on it is never
//              evidence the stage happened; only an evidence row of type
//              "verified" (and the receipt named in its source) carries proof.
//              `stage` therefore names where the chain HAS GOT TO, and a stage
//              with no matching mission_events row is UNMEASURED, never complete.
// Reversible:  down() drops exactly the fields up() added and deletes the one
//              collection it created; nothing else is touched.
// ─────────────────────────────────────────────────────────────────────────────

// Additive and reversible by construction, in the same shape as
// 1789000000_extend_workspace_operations.js:
//   * every fields.add is guarded by getByName, so a partial re-run is a no-op
//   * no added field is required — existing missions and operations rows stay
//     valid without a backfill
//   * the new collection takes the owner-scoped rule set used verbatim by
//     evidence and operations; nothing here widens read access
//   * the down migration removes exactly what the up migration added

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const workspaces = app.findCollectionByNameOrId("workspaces");
    const missions = app.findCollectionByNameOrId("missions");

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

    // The stages of the chain, in order. Kept as one list so the missions field
    // and the mission_events field can never drift apart; `closed` is the
    // terminal stage for a chain that ended without reaching replay.
    const STAGES = [
      "challenge",
      "event",
      "mission",
      "action",
      "verification",
      "replay",
      "closed",
    ];

    // Where a challenge arrived from. The first four are the public-record
    // channels the integrations bridge already publishes to; `sprint` is a
    // sprint obligation; `internal` is an operator-raised challenge.
    const ORIGIN_CHANNELS = ["wiki", "forum", "reddit", "discord", "sprint", "internal"];

    // ---- missions: the origin of the challenge, and how far the chain got ----
    // origin_ref is the reference as it was observed (a URL, a thread id, a
    // permalink); origin_observed_at is when it arrived, not when the row was
    // written, so a replay can order arrivals against mission creation.
    // requirement_id names the obligation the mission DECLARES it serves
    // (e.g. "H05-CHALLENGE-REPLAY") — declaring it is not evidence of it.
    // replay_id groups every row of one chain so a replay can be fetched with a
    // single filtered read instead of a graph walk.
    extend("missions", [
      {
        name: "origin_channel",
        type: "select",
        maxSelect: 1,
        values: ORIGIN_CHANNELS,
      },
      { name: "origin_ref", type: "text", max: 500 },
      { name: "origin_observed_at", type: "date" },
      { name: "requirement_id", type: "text", max: 60 },
      {
        name: "stage",
        type: "select",
        maxSelect: 1,
        values: STAGES,
      },
      { name: "replay_id", type: "text", max: 80 },
    ]);

    // ---- operations: the bounded action belongs to a mission ----
    // Optional and non-cascading on purpose: an operation is a runbook the
    // operator owns and it outlives any one mission, so deleting the mission
    // must not delete the procedure or its run log.
    extend("operations", [
      {
        name: "mission",
        type: "relation",
        maxSelect: 1,
        collectionId: missions.id,
        cascadeDelete: false,
      },
    ]);

    // The owner-scoped rule set, verbatim from evidence (1788474000) and
    // operations (1789000000). MEASURED, and deliberately NOT what missions
    // carries: 1788900000_create_workspace_members_rbac.js re-scoped missions
    // (and 15 sibling collections) to `owner || verified workspace_members`,
    // and 1788950002_updated_missions.js re-affirmed it. mission_events is
    // therefore STRICTLY NARROWER than the missions it traces.
    // The consequence a reader must not miss: PocketBase answers a rule denial
    // with an EMPTY LIST, not an error. A workspace member who is not the owner
    // can list the mission and reads zero events, so a MEASURED chain renders as
    // UNMEASURED for them. Any replay surface must therefore say "owner-only"
    // rather than draw an empty trace as a chain that never ran. Widening this
    // to match missions is an access-boundary decision for the operator, not
    // something a migration takes on its own; it fails closed until then.
    const OWNER_RULES = {
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
    };

    const exists = (name) => {
      try {
        return app.findCollectionByNameOrId(name);
      } catch (e) {
        if (e.message.includes("no rows in result set")) return null;
        throw e;
      }
    };

    // ---- mission_events: the ordered trace a replay is rebuilt from ----
    // One row per stage transition, append-only by convention. `observed_at` is
    // the time the stage was observed to happen (the arrival, the run, the
    // verification), which is what a replay orders by — `created` only records
    // when the row was written. `ref` points at the receipt or the source that
    // backs the row; a stage row with no ref is UNMEASURED, and a replay must
    // render it as such rather than as a completed step.
    if (!exists("mission_events")) {
      const missionEvents = new Collection({
        type: "base",
        name: "mission_events",
        ...OWNER_RULES,
        fields: [
          {
            name: "mission",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: missions.id,
            cascadeDelete: true,
          },
          {
            name: "stage",
            type: "select",
            required: true,
            maxSelect: 1,
            values: STAGES,
          },
          { name: "actor", type: "text", max: 120 },
          { name: "summary", type: "text", required: true, max: 600 },
          { name: "ref", type: "text", max: 500 },
          { name: "observed_at", type: "date", required: true },
          { name: "payload", type: "json", maxSize: 20000 },
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
      });
      app.save(missionEvents);
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

    // The trace first — mission_events cascades from missions, and dropping the
    // collection before the missions fields keeps the order symmetric with up().
    try {
      app.delete(app.findCollectionByNameOrId("mission_events"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }

    drop("operations", ["mission"]);
    drop("missions", [
      "origin_channel",
      "origin_ref",
      "origin_observed_at",
      "requirement_id",
      "stage",
      "replay_id",
    ]);
  },
);
