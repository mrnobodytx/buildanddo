// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/business.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/business-policy.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/business-policy.js
// DAG Node:    none
// Intent:      Apply ERP relation, editorial review and learning-progress policies to native PocketBase requests.
// ───────────────────────────────────────────────────────────────

onRecordCreateRequest((e) => require(`${__hooks}/business-policy.js`).erp(e, true), 'erp_objectives', 'erp_tasks', 'erp_contacts');
onRecordUpdateRequest((e) => require(`${__hooks}/business-policy.js`).erp(e, false), 'erp_objectives', 'erp_tasks', 'erp_contacts');
onRecordCreateRequest((e) => require(`${__hooks}/business-policy.js`).content(e, true), 'social_content');
onRecordUpdateRequest((e) => require(`${__hooks}/business-policy.js`).content(e, false), 'social_content');
onRecordDeleteRequest((e) => require(`${__hooks}/business-policy.js`).removeContent(e), 'social_content');
onRecordCreateRequest((e) => require(`${__hooks}/business-policy.js`).progress(e, true), 'tutorial_progress');
onRecordUpdateRequest((e) => require(`${__hooks}/business-policy.js`).progress(e, false), 'tutorial_progress');
