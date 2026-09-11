// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789100001_ocn_seat_users_extend.js
// Stage:       05_DATA
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js (ocn_seat field, seat-user convention)
// EnumType:    Migration
// EnumEdges:   PRODUCES users records for OCN seats c-two, vcc, forge-verifier;
//              VERIFIED_BY tools/citadel_ocn_login.py login (estate) -> 200 for each seat
// Intent:      Measured 2026-09-11 on staging: seats C-TWO and vcc signed valid
//              CitadelKey envelopes (verifier 200) but /api/ocn/login answered 403
//              seat_not_provisioned because 1789100000 only provisioned five seats.
//              A migration runs once, so extending the seat list means a NEW
//              migration, never an edit of the applied one. Same convention:
//              <seat_id>@ocn.buildanddo.invalid, verified, ocn_seat, random
//              discarded password (password login for a seat stays impossible).
// Reversible:  down deletes exactly these records (matched by email) and nothing else.
// ─────────────────────────────────────────────────────────────────────────────
migrate(
  (app) => {
    const SEATS = ["c-two", "vcc"];
    const DOMAIN = "@ocn.buildanddo.invalid";
    const users = app.findCollectionByNameOrId("users");
    if (!users.fields.getByName("ocn_seat")) {
      throw new Error("1789100001: users.ocn_seat missing; 1789100000_ocn_seat_users.js must run first");
    }
    for (const seat of SEATS) {
      const email = seat + DOMAIN;
      let exists = false;
      try {
        app.findAuthRecordByEmail("users", email);
        exists = true; // idempotent re-run
      } catch (_) {
        exists = false;
      }
      if (exists) continue;
      const record = new Record(users);
      record.set("email", email);
      record.set("emailVisibility", false);
      record.set("verified", true);
      record.set("name", "OCN seat: " + seat);
      record.set("ocn_seat", true);
      record.set("password", $security.randomString(48));
      app.save(record);
    }
  },
  (app) => {
    const SEATS = ["c-two", "vcc"];
    const DOMAIN = "@ocn.buildanddo.invalid";
    for (const seat of SEATS) {
      try {
        app.delete(app.findAuthRecordByEmail("users", seat + DOMAIN));
      } catch (e) {
        if (!String(e.message).includes("no rows in result set")) throw e;
      }
    }
  }
);
