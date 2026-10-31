/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792200000_guildmaster_seat_display.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js,
//              apps/pocketbase/pb_migrations/1789100002_ocn_seat_users_guildmasters.js
// EnumType:    Migration
// EnumEdges:   CORRECTS the display name of the eight guildmaster persona seats;
//              MIRRORS apps/pocketbase/pb_hooks/guildmasters.js; VERIFIED_BY tests/upgrade/guildmaster-registry.test.mjs
// Intent:      Show each guildmaster persona seat under its persona name instead of its account id.
// ───────────────────────────────────────────────────────────────
//
// 1789100000 and 1789100002 named every seat "OCN seat: <seat>". For the eight PERSONA seats the
// public name is already canon (apps/web/src/data/personas.js), so showing it reveals nothing new.
// Box seats are not in this list and are not touched; their display is 1791800000's concern.
//
// The map below is a frozen snapshot of the guildmaster registry (guildmasters.js) as of this
// migration. A migration runs once and must not change meaning when the registry later does, so
// it is a literal here; guildmaster-registry.test.mjs proves the two agree.
//
// Only an account still carrying the name its seat migration gave it is renamed, so a name an
// operator chose since is kept. Only verified ocn_seat accounts are touched - a human account that
// happened to use the reserved domain is not a seat. Down restores "OCN seat: <seat>" only where
// the name is still the one this migration wrote. Both directions are idempotent and read no
// environment.

migrate((app) => {
    const DISPLAY = {
        forge: "Forge", scholar: "Scholar", oracle: "Oracle", alex: "Alex",
        sterling: "Sterling", muse: "Muse", quill: "Quill", director: "Director Nexus",
    };
    const DOMAIN = "@ocn.buildanddo.invalid";
    for (const seat of Object.keys(DISPLAY)) {
        let record;
        try { record = app.findAuthRecordByEmail("users", seat + DOMAIN); }
        catch (_) { continue; }          // a seat this deployment does not have is not an error
        if (!record.getBool("ocn_seat") || !record.getBool("verified")) continue;
        if (record.getString("name") !== "OCN seat: " + seat) continue;
        record.set("name", DISPLAY[seat]);
        app.save(record);
    }
}, (app) => {
    const DISPLAY = {
        forge: "Forge", scholar: "Scholar", oracle: "Oracle", alex: "Alex",
        sterling: "Sterling", muse: "Muse", quill: "Quill", director: "Director Nexus",
    };
    const DOMAIN = "@ocn.buildanddo.invalid";
    for (const seat of Object.keys(DISPLAY)) {
        let record;
        try { record = app.findAuthRecordByEmail("users", seat + DOMAIN); }
        catch (_) { continue; }
        if (!record.getBool("ocn_seat") || !record.getBool("verified")) continue;
        if (record.getString("name") !== DISPLAY[seat]) continue;
        record.set("name", "OCN seat: " + seat);
        app.save(record);
    }
});
