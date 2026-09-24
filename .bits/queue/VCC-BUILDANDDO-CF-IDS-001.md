# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-CF-IDS-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CF-IDS-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CF-IDS-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs/SRS-BUILDANDDO-CF-IDS-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-CF-IDS-001-* branches;
#              DEPENDS_ON .bits/srs/SRS-BUILDANDDO-CF-IDS-001.md
# DAG Node:    none
# Intent:      Record the owner's request to scrub the Cloudflare ids and sweep for other sensitive
#              data, without deployment, history rewrites or external writes.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-CF-IDS-001

**SRS:** SRS-BUILDANDDO-CF-IDS-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

Owner request, 2026-09-24: "scrub the cloudflare ids, and look for additional sensitive data". This
answers the decision #83 left open. The change touches shared deploy configuration, so it is A2. This
dispatch records the request and does not self-authorize anything beyond it.

## Objective

No Cloudflare account or resource id in the tree, and a deploy path that still binds the right
database. Everything else the sweep found is recorded in the SRS for its owner.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Ids out of `wrangler.toml`; deploy resolves them, fail-closed | `cd apps/edge && npx vitest run && echo PASS` | done |
| 2 | Sweep tree and history; record findings | `! git grep -q -E "^account_id" -- apps/edge/wrangler.toml && echo PASS` | done |
| 3 | Locks, readiness, boundary | `python scripts/ci/agent_context.py --check && python scripts/ci/hostinger_readiness.py --check && python scripts/ci/system_growth.py --check && python scripts/ci/verify_public_boundary.py && echo PASS` | done |

## Constraints

- May touch:
  - `apps/edge/wrangler.toml`, `apps/edge/package.json` (the deploy script only),
    the deploy note in `apps/edge/src/index.js`;
  - new `apps/edge/tools/deploy.mjs` and `apps/edge/src/__tests__/deploy-config.test.js`;
  - `.gitignore`, `README.md`, one dated line in `.bits/queue/VCC-BUILDANDDO-BUDDI-002.md`;
  - `.bits/srs_registry.yml` (this entry, plus one reworded note that broke YAML), a registry test
    in `tests/upgrade/test_hygiene.py`;
  - this dispatch, the SRS, and the `.bits` locks.
- Must not touch: git history, migrations, other seats' specs, Cloudflare itself (no deploy and no
  `wrangler` call that reaches the account), or secrets.
