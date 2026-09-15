// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/evidence.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/evidence-policy.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/evidence-policy.js
// DAG Node:    none
// Intent:      Enforce shared evidence write boundaries on native collection requests while preserving server-owned workflow transactions.
// ───────────────────────────────────────────────────────────────

onRecordCreateRequest((e) => require(`${__hooks}/evidence-policy.js`).enforce(e, true), 'evidence');
onRecordUpdateRequest((e) => require(`${__hooks}/evidence-policy.js`).enforce(e, false), 'evidence');
onRecordDeleteRequest((e) => require(`${__hooks}/evidence-policy.js`).remove(e), 'evidence');
