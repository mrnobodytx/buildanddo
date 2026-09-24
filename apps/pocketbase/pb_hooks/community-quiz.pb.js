// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/community-quiz.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-QUIZ-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-QUIZ-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/community-quiz.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/community-quiz.js
// DAG Node:    none
// Intent:      Expose bounded, uncached quiz grading to the community bot only.
// ───────────────────────────────────────────────────────────────

// Authorized by the bot bearer token inside the module, not by a PocketBase account.
routerAdd('POST', '/api/buildanddo/community/quiz/check', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/community-quiz.js`).check(e));
}, $apis.bodyLimit(2000));
