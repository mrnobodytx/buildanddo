// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790700000_ocn_seat_users_fleet_boxes.js
// Stage:       05_DATA
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js (ocn_seat field, seat-user convention)
// EnumType:    Migration
// EnumEdges:   PRODUCES users records for OCN seats ray-tor1-1..4, mesh-memory, mesh-control;
//              VERIFIED_BY POST /api/ocn/login FROM THE BOX ITSELF -> 200 for each seat
// Intent:      Seat the six fleet boxes that hold their own CitadelKey private halves, so the
//              platform can be exercised from machines that are not rig1.
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THESE SIX, AND WHY THEY ARE NOT THE GUILDMASTERS
// 1789100002 seated the guildmaster personas (oracle, scholar, muse ...). Those are names in
// personas.yaml. The seats below are BOXES - the DigitalOcean fleet nodes in
// blueprints/FLEET_PLACEMENT.json - and the difference matters, because a box is the only thing
// that can actually sign. `enroll_guildmaster.py` issues each seat keypair ON its box and registers
// only the public half ("private key STAYS on the box"), so rig1 cannot produce a guildmaster
// envelope and never could. A login from a box is therefore the only OCN login that is real.
//
// MEASURED 2026-09-20, driving each box over the endorsed ssh -J hop:
//   - every box holds /opt/citadel/cbf/data/runtime/citadelkey/private/<seat>.key
//   - five of the six public keys in the staging sidecar registry did NOT match the key the box
//     signs with, so the sidecar answered 401 citadelkey_rejected:pubkey_fp mismatch. mesh-control
//     was the one correct entry. After reconciling the five, ray-tor1-1 signed from its own box
//     and the sidecar answered
//
//         403 {"message":"seat_not_provisioned"}
//
//     which is the hook working as designed: the key is believed, and it still refuses to invent an
//     account. This migration supplies the accounts it will not create.
//
// A migration runs once, so extending the seat list means a NEW migration; that is why this is
// 1790700000 rather than an edit to 1789100000/1/2.
//
// mesh-app and mesh-dev are deliberately absent: mesh-app did not answer the key read in this pass
// (UNMEASURED, not "no key"), and mesh-dev has no IP yet - FLEET_PLACEMENT records it as
// "TBD (operator-provisioned)". Seating a box whose key nobody has measured would create an account
// that can never be logged into.
//
// The password is random and immediately discarded, exactly as the three predecessors do, so
// password login for a seat stays impossible by construction and the CitadelKey envelope is the
// only way in.
//
// Reversible: down deletes exactly these six records (matched by email) and nothing else. It does
// not touch the ocn_seat field, which 1789100000 owns.
// ─────────────────────────────────────────────────────────────────────────────
migrate(
  (app) => {
    const SEATS = ["ray-tor1-1", "ray-tor1-2", "ray-tor1-3", "ray-tor1-4", "mesh-memory", "mesh-control"];
    const DOMAIN = "@ocn.buildanddo.invalid";
    const users = app.findCollectionByNameOrId("users");
    if (!users.fields.getByName("ocn_seat")) {
      throw new Error("1790700000: users.ocn_seat missing; 1789100000_ocn_seat_users.js must run first");
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
    const SEATS = ["ray-tor1-1", "ray-tor1-2", "ray-tor1-3", "ray-tor1-4", "mesh-memory", "mesh-control"];
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
