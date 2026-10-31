// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guild-classes.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/guild-classes.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/guild-classes.js; VERIFIED_BY tests/upgrade/guild-classes.test.mjs; VERIFIED_BY tests/upgrade/test_classroom_native.py
// Intent:      Run the weekly guild class rota hourly and let workspace members read the schedule.
// ----------------------------------------------------------------

// Hourly and idempotent: a run that finds the coming week already scheduled creates nothing, and with
// BUILDANDDO_GUILD_CLASS_WORKSPACE unset it does nothing at all. The callback runs in its own VM, so it
// requires the module inside itself; a failure is logged and the next hour tries again.
cronAdd('guild_class_rota', '17 * * * *', () => {
    try { require(`${__hooks}/guild-classes.js`).schedule($app, new Date()); }
    catch (error) { $app.logger().warn('guild class rota failed', 'error', String(error?.message || error).slice(0, 200)); }
});

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/guild-classes', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/guild-classes.js`).list(e));
}, $apis.requireAuth('users'));
