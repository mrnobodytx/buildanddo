// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789100002_ocn_seat_users_guildmasters.js
// Stage:       05_DATA
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js (ocn_seat field, seat-user convention)
// EnumType:    Migration
// EnumEdges:   PRODUCES users records for OCN seats oracle, scholar, muse, sterling, quill, alex, director;
//              VERIFIED_BY POST /api/ocn/login -> 200 for each seat
// Intent:      Seat the seven remaining BuildAndDo guildmasters so they can log in as
//              themselves, because the platform has no users and cannot demonstrate
//              anything multi-user without them.
// ─────────────────────────────────────────────────────────────────────────────
//
// MEASURED 2026-09-20 on staging, and it is the same finding 1789100001 recorded for
// c-two and vcc. All eight guildmasters were issued CitadelKeys and registered in the
// rooms sidecar (registry_seats 29 -> 37, sidecar reachable). Their envelopes verify:
// the sidecar answers 200. `forge` then logged in and received a session token, because
// 1789100000 happens to seed "forge" among its five. The other seven answered
//
//     403 {"message":"seat_not_provisioned"}
//
// which is the hook working exactly as designed - it mints a token for a PRE-PROVISIONED
// service identity and deliberately never creates one. A verified key is not an account.
//
// A migration runs once, so extending the seat list means a NEW migration; that is why
// this is 1789100002 rather than an edit to either predecessor.
//
// Why these seven and no others: they are the guildmasters `buildanddo_guild_users.py`
// binds to sprint milestones D5-D21, each owning one deterministic skill. `forge` is
// absent from the list below because 1789100000 already provisioned it - adding it again
// would be a no-op the `exists` guard would skip anyway, but leaving it out keeps the
// down-migration honest: this file must delete only what it created.
//
// The password is random and immediately discarded. There is no reset path and no OTP
// mail for these records, so password login for a seat remains impossible by construction -
// the CitadelKey envelope is the only way in.
//
// Reversible: down deletes exactly these seven records (matched by email) and nothing else.
// It does not touch the ocn_seat field, which 1789100000 owns.
// ─────────────────────────────────────────────────────────────────────────────
migrate(
  (app) => {
    const SEATS = ["oracle", "scholar", "muse", "sterling", "quill", "alex", "director"];
    const DOMAIN = "@ocn.buildanddo.invalid";
    const users = app.findCollectionByNameOrId("users");
    if (!users.fields.getByName("ocn_seat")) {
      throw new Error("1789100002: users.ocn_seat missing; 1789100000_ocn_seat_users.js must run first");
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
    const SEATS = ["oracle", "scholar", "muse", "sterling", "quill", "alex", "director"];
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
