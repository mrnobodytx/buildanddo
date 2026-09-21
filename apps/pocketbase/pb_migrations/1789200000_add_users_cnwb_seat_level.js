// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789200000_add_users_cnwb_seat_level.js
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/estate.pb.js
// EnumType:    Migration
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/estate.pb.js; CONSUMED_BY apps/web/src/lib/estateAccess.js
// Intent:      Carry the CNWB seat level on a user so estate surfaces (Fleet) can be gated per person, fail-closed.
// ───────────────────────────────────────────────────────────────
//
// `cnwb_seat_level` is written by the backend only: the seat login on the private plane sets it and estate.pb.js
// rejects any client change. Absent means "not a seat". Additive; the down migration removes the field.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    if (!users.fields.getByName("cnwb_seat_level")) {
      users.fields.add(new Field({ name: "cnwb_seat_level", type: "select", values: ["none", "member", "master"], maxSelect: 1 }));
      app.save(users);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const f = users.fields.getByName("cnwb_seat_level");
    if (f) {
      users.fields.removeById(f.id);
      app.save(users);
    }
  },
);
