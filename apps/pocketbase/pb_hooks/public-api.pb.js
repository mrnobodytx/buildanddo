// CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/public-api.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-002
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/public-api.js, apps/pocketbase/pb_hooks/buddi-intake.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/public-api.js; DEPENDS_ON apps/pocketbase/pb_hooks/buddi-intake.js;
//              PRODUCES /api/v1/public/*; FRONTED_BY apps/edge/src/public-api.js
// DAG Node:    none
// Intent:      Mount the eight tool endpoints the public voice agent calls, with no auth for reads and no shared state.
// ───────────────────────────────────────────────────────────────

// The agent's tools call https://buildanddo.com/api/v1/public/...; the edge worker forwards that to
// /hcgi/platform/api/v1/public/..., which nginx hands to PocketBase as /api/v1/public/... - these
// routes. Before them, every one of those URLs answered 200 text/html: the site shell.
//
// Handlers run in a pooled VM and share nothing at top level, so each one requires its module
// inside the callback, matching the other routes in this directory. The write routes read and cap
// their own body so that every refusal, an oversized body included, carries the same stamped shape.

routerAdd('GET', '/api/v1/public/product-context', (e) => require(`${__hooks}/public-api.js`).productContext(e));
routerAdd('GET', '/api/v1/public/challenges/demo', (e) => require(`${__hooks}/public-api.js`).demoChallenges(e));
routerAdd('GET', '/api/v1/public/challenges/{challenge_id}/state', (e) => require(`${__hooks}/public-api.js`).challengeState(e));
routerAdd('GET', '/api/v1/public/evidence', (e) => require(`${__hooks}/public-api.js`).evidence(e));
routerAdd('GET', '/api/v1/public/replay/{challenge_id}', (e) => require(`${__hooks}/public-api.js`).replay(e));
routerAdd('POST', '/api/v1/public/challenges/request', (e) => require(`${__hooks}/buddi-intake.js`).submit(e, 'challenge_request'));
routerAdd('POST', '/api/v1/public/feedback', (e) => require(`${__hooks}/buddi-intake.js`).submit(e, 'feedback'));
routerAdd('POST', '/api/v1/public/support/handoff', (e) => require(`${__hooks}/buddi-intake.js`).submit(e, 'handoff'));
