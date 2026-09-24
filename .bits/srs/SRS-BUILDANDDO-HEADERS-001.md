# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-HEADERS-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-HEADERS-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-HEADERS-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/web/nginx.conf, tests/upgrade/staging-contract.test.mjs
# EnumType:    Doc
# EnumEdges:   GOVERNS apps/web/nginx.conf; GOVERNS tests/upgrade/staging-contract.test.mjs
# Intent:      Keep the staging web container's security headers on every response, including the built
#              scripts and stylesheets, and make the contract test fail when a location drops them.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-HEADERS-001 — security headers on every location, assets included

## Why this exists

nginx inherits `add_header` from the enclosing level only when a level declares none of its own. The
staging web container's `apps/web/nginx.conf` sets three security headers at server level:
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and, since
SRS-BUILDANDDO-BUDDI-003, `Permissions-Policy: camera=(), microphone=(self), geolocation=()`.

`location /assets/` declares its own `add_header Cache-Control "public, immutable"`. Measured 2026-09-23
while building SRS-BUILDANDDO-BUDDI-003: every response from that location therefore went out without all
three. That location serves every built script and stylesheet. Without `nosniff`, a browser may
reinterpret a response's type. Without the referrer policy, requests that a stylesheet starts fall back to
the browser's default. The document location declares none, so pages were unaffected;
SRS-BUILDANDDO-BUDDI-003's test pins that.

## Requirements

1. **R1 - assets keep the headers.** `location /assets/` sends the same three security headers, with the
   same values as the server level, alongside its caching header.
2. **R2 - a test that fails when any location drops them.** The staging contract test reads every
   location that declares its own `add_header` and fails when it lacks any server-level security header,
   `nosniff` first among them. The failure names the location and the missing header. The document
   location must still declare none.
3. **R3 - one policy, repeated.** The microphone policy may appear once per level that sends headers, and
   every copy must be the same policy.
4. **R4 - proven by controls.** On the unchanged configuration the new test fails. With the fix it passes.
   Removing `nosniff` from `/assets/` fails it again, and a new location that sends only a caching header
   fails it too.

## Out of scope

- The live hosts. Production and staging are served by the production host's own nginx, whose shared
  snippet is not in this repository. Measured 2026-09-23: live staging sends `nosniff` on a built script
  but no `Referrer-Policy`. That is an operator step.
- Deployment of the container.

## Acceptance

`node --test tests/upgrade/staging-contract.test.mjs` passes with the fix and fails under each control in
R4. The repository gates pass.
