// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_migrations/1791800000_seat_display_is_persona.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:         pending
// CK:           pending
// Seat:         C-ONE
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-21
// Depends:      apps/pocketbase/pb_migrations/1790700000_ocn_seat_users_fleet_boxes.js
// EnumType:     Migration
// EnumEdges:    CORRECTS the display name of fleet-box seats created by 1790700000
// Intent:       Stop the product from showing which machine a guildmaster runs on.
// ───────────────────────────────────────────────────────────────

// WHAT WAS LEAKING. 1790700000 seated the six fleet boxes with name "OCN seat: <box>", and that
// name is what every other workspace member sees - in a classroom roster, on each message, beside
// every presence row. So opening a class published the fleet machine names, one per seat, to
// anyone in the room. Operator instruction 2026-09-21: the room system must not carry the location,
// address or housing of a guildmaster. A machine name is housing.
//
// WHY THE BOX IS THE GUILDMASTER, not a separate thing that hosts one. 1790700000 records it: a
// box is the only seat that can actually sign, because enroll_guildmaster.py issues each keypair ON
// its box and keeps the private half there. The persona accounts seated by 1789100002 cannot log in
// at all. So renaming a box seat to its guildmaster is not a disguise - it is the accurate name,
// and the machine was always the incidental half.
//
// WHY THE MAP IS NOT IN THIS FILE. This repository is PUBLIC. A literal
// { "<box>": "<persona>" } here would publish the very association the operator is removing from
// the product, and a migration in git is a worse hiding place than a database. The mapping is read
// from BUILDANDDO_SEAT_PERSONAS, which lives in a 0600 EnvironmentFile on the host beside the
// dossier keyring. Without it this migration does nothing and says so - it never invents a name.

migrate((app) => {
    const raw = $os.getenv("BUILDANDDO_SEAT_PERSONAS");
    if (!raw) {
        // Deliberately not fatal: an environment that has not been told the mapping should keep
        // serving, not refuse to start. A seat that keeps its box name is visible in the sweep.
        app.logger().warn("1791800000: BUILDANDDO_SEAT_PERSONAS absent; seat display names unchanged");
        return;
    }
    let map;
    try { map = JSON.parse(raw); } catch (_) {
        throw new Error("1791800000: BUILDANDDO_SEAT_PERSONAS is not JSON; review it before migrating.");
    }
    if (!map || typeof map !== "object" || Array.isArray(map))
        throw new Error("1791800000: BUILDANDDO_SEAT_PERSONAS must be an object of seat -> persona.");
    const keys = Object.keys(map);
    if (!keys.length || keys.length > 64)
        throw new Error("1791800000: BUILDANDDO_SEAT_PERSONAS must name between 1 and 64 seats.");
    const DOMAIN = "@ocn.buildanddo.invalid";
    const SAFE = /^[a-z0-9][a-z0-9-]{0,62}$/;
    for (const seat of keys) {
        const persona = map[seat];
        // A display name is rendered to other people. Keep it to a shape that cannot smuggle markup,
        // an address, or a second field, and that no reader could mistake for a hostname.
        if (!SAFE.test(seat) || typeof persona !== "string" || !SAFE.test(persona))
            throw new Error("1791800000: seat and persona must both be simple lowercase identifiers.");
        let record;
        try { record = app.findAuthRecordByEmail("users", seat + DOMAIN); }
        catch (_) { continue; }          // a seat this deployment does not have is not an error
        if (!record.getBool("ocn_seat")) continue;   // never touch a human account
        const shown = persona.charAt(0).toUpperCase() + persona.slice(1);
        if (record.getString("name") === shown) continue;
        record.set("name", shown);
        app.save(record);
    }
}, (app) => {
    // Rollback restores exactly what 1790700000 wrote, so the two migrations stay consistent.
    const raw = $os.getenv("BUILDANDDO_SEAT_PERSONAS");
    if (!raw) return;
    let map;
    try { map = JSON.parse(raw); } catch (_) { return; }
    if (!map || typeof map !== "object" || Array.isArray(map)) return;
    const DOMAIN = "@ocn.buildanddo.invalid";
    for (const seat of Object.keys(map)) {
        let record;
        try { record = app.findAuthRecordByEmail("users", seat + DOMAIN); }
        catch (_) { continue; }
        if (!record.getBool("ocn_seat")) continue;
        record.set("name", "OCN seat: " + seat);
        app.save(record);
    }
});
