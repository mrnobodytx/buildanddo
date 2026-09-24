// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/logs-forwarder.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/telemetry.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/telemetry.js
// Intent:      Preserve native log records and forward only bounded sanitized stdout observations when explicitly configured.
// ----------------------------------------------------------------

onModelCreate((e) => {
    // Delivery is best-effort, never an acknowledgement that permits dropping
    // the native record. No journal, raw request dump or configuration mutation.
    const result = e.next();
    try { require(`${__hooks}/telemetry.js`).forwardLog(e.model); }
    catch (_) { /* Keep database retention even if the helper or stdout is unavailable. */ }
    return result;
}, '_logs');
