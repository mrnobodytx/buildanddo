// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js
// Stage:       09_RUNTIME
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/pocketbase/pb_hooks/ocn-login.pb.js
// EnumType:    Migration
// EnumEdges:   PRODUCES users.ocn_seat (bool); PRODUCES users records for OCN seats;
//              CONSUMED_BY apps/pocketbase/pb_hooks/ocn-login.pb.js
// Intent:      Provision the service identities Citadel Nexus seats log in as,
//              reversibly, without ever creating a usable password.
// ───────────────────────────────────────────────────────────────
//
// Seat users:  <seat_id>@ocn.buildanddo.invalid, verified:true, ocn_seat:true,
//              name "OCN seat: <seat_id>".
//
// Password:    48 random characters from $security.randomString at migration
//              time, set on the record and discarded. Nobody knows it, it is
//              never logged, and the .invalid mailbox can never receive a reset
//              or OTP mail, so password login for a seat is IMPOSSIBLE by
//              construction. The only way in is POST /api/ocn/login with a
//              CitadelKey envelope the sidecar verifies against the public
//              registry copy.
//
// Reversible:  down deletes exactly these five records (matched by email) and
//              removes the ocn_seat field this migration added. It touches no
//              other users record and no other field.

migrate(
  (app) => {
    const SEATS = ["rig1", "forge", "c-one", "bits-codegen", "datadog-bits"];
    const DOMAIN = "@ocn.buildanddo.invalid";

    let users = app.findCollectionByNameOrId("users");
    if (!users.fields.getByName("ocn_seat")) {
      users.fields.add(new Field({ name: "ocn_seat", type: "bool" }));
      app.save(users);
      users = app.findCollectionByNameOrId("users");
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
      // Generated, applied, forgotten. See the header.
      record.set("password", $security.randomString(48));
      app.save(record);
    }
  },
  (app) => {
    const SEATS = ["rig1", "forge", "c-one", "bits-codegen", "datadog-bits"];
    const DOMAIN = "@ocn.buildanddo.invalid";

    for (const seat of SEATS) {
      try {
        app.delete(app.findAuthRecordByEmail("users", seat + DOMAIN));
      } catch (e) {
        if (!String(e.message).includes("no rows in result set")) throw e;
      }
    }

    const users = app.findCollectionByNameOrId("users");
    if (users.fields.getByName("ocn_seat")) {
      users.fields.removeByName("ocn_seat");
      app.save(users);
    }
  },
);
