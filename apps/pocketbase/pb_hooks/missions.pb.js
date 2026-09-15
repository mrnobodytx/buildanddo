// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_hooks/missions.pb.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/pocketbase/pb_hooks/mission-policy.js
// EnumType:     Adapter
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/mission-policy.js
// DAG Node:     none
// Intent:       Apply mission policy through PocketBase request hooks while retaining the existing authentication and collection rules.
// ───────────────────────────────────────────────────────────────

onRecordCreateRequest((e) => {
    const policy = require(`${__hooks}/mission-policy.js`);
    return policy.enforce(e, true);
}, 'missions');

onRecordUpdateRequest((e) => {
    const policy = require(`${__hooks}/mission-policy.js`);
    return policy.enforce(e, false);
}, 'missions');
