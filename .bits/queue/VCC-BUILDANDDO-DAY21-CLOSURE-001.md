# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-DAY21-CLOSURE-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-DAY21-CLOSURE-001
# Intent:      Install and run the Day-21 closure lane, and fix the one declaration that points at
#              a host which does not exist.
# ───────────────────────────────────────────────────────────────

# VCC-BUILDANDDO-DAY21-CLOSURE-001 — Day-21 submission closure

| # | Task | Authority | State |
|---|------|-----------|-------|
| 1 | Install the closure lane (local materialization, 0 remote writes) | A1 | in_progress |
| 2 | Freeze one canonical origin so README and SITE_ORIGIN agree and the origin resolves | A1 | in_progress |
| 3 | Execute the 18-profile acceptance matrix against the current SHA | A2 | pending |
| 4 | Record the public entry -> auth -> challenge -> mission -> evidence -> readback journey | A2 | pending |
| 5 | Bind four separately observed Hostinger product receipts | A2 | pending |
| 6 | Validate one non-synthetic replay against the same SHA | A2 | pending |
| 7 | Compile the submission bundle and let it decide READY_FOR_OWNER_REVIEW | A2 | pending |

## Authority notes

Installation is local only. Remote GitLab milestone/issue creation is explicitly out of scope here:
it needs the real BuildAndDo project id, A3, an AAXP reference and a human approval reference, and
none of those exist yet. The submission itself is a human act; this dispatch produces the bundle a
human submits, and never submits anything.

## Blocking fact

`buildanddo.tech` has no DNS record. `SITE_ORIGIN` names it; `README.md` names `buildanddo.com`,
which resolves and serves. Task 2 resolves toward the origin that exists. If the intent is for the
`.tech` domain to be the competition URL, that is a registration and DNS action first, and this
dispatch must not paper over it in the meantime.
