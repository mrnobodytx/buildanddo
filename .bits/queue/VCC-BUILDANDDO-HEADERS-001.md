# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-HEADERS-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-HEADERS-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-HEADERS-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-HEADERS-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-HEADERS-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that keeps the staging container's security headers on its built
#              assets, with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-HEADERS-001

**SRS:** SRS-BUILDANDDO-HEADERS-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

## Objective

Every response from the staging web container carries its security headers, including the built scripts and
stylesheets under `/assets/`. The contract test fails when any location drops them.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Register the SRS, its spec and this dispatch | `env -u PYTHONPATH py -3.13 scripts/ci/agent_context.py --check` | done |
| 2 | Contract test: a location with its own `add_header` repeats every server-level security header | `node --test tests/upgrade/staging-contract.test.mjs` fails on the unchanged `nginx.conf` | done: failed 1 of 5 |
| 3 | `location /assets/` repeats `nosniff`, `Referrer-Policy` and `Permissions-Policy` | the same test passes; removing `nosniff` from `/assets/` fails it | done: 5 of 5; 4 of 4 controls caught |
| 4 | Repository gates and the public boundary | `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`, `verify_public_boundary.py`, `public_redaction.py scan` on the changed files | done |

## Constraints

- Files this dispatch may touch: `apps/web/nginx.conf`, `tests/upgrade/staging-contract.test.mjs`, this
  bookkeeping, and the readiness and context locks.
- The live hosts' nginx is not in this repository and is not changed here.
- No real machine name or address in any file, commit message or pull request text.
- Raises the tier: deploy, push, and any change to a live host. None is performed here.

## Evidence (2026-09-23, local run on Windows, LF checkout)

- **The test fails on the old configuration.** On the unchanged `nginx.conf` the new test failed 1 of 5 and
  named the three headers `/assets/` dropped. With the fix, 5 of 5 pass.
- **Controls.** Each break was applied to the real file, and the file was then restored byte for byte. All
  four were caught:
  - removing `nosniff` from `/assets/`;
  - a new location that sends only a caching header;
  - an `/assets/` copy of the policy that allows no microphone;
  - a header in the document location.
- **Real nginx.** Both configurations ran in the official `nginx:1.27-alpine` image (the Dockerfile's
  runtime) on a loopback port, and `nginx -t` accepts both. With the old one, a built script and a
  stylesheet came back with none of the three headers. With the new one, both carry all three, and the page
  is unchanged.
- **Gates.** `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`
  and `verify_public_boundary.py` (1,316 files, 0 failures) pass.
- **Redaction.** The seven changed files are clean against the private fleet map. `public_redaction.py scan`
  does not read `.conf` files, so `nginx.conf` was checked directly with the same rule.

## Operator step (not performed here)

- **The live hosts.** Production and staging are served by the production host's own nginx, whose shared
  snippet is not in this repository. Measured 2026-09-23: a built script on live staging carries `nosniff`
  but no `Referrer-Policy`. The same kind of fix belongs there.
