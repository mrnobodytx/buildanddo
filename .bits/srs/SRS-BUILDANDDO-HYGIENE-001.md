# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-HYGIENE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-HYGIENE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-HYGIENE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/agent_context.py, scripts/ci/public_redaction.py, knip.json,
#              apps/web/package.json, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   VALIDATES scripts/ci/agent_context.py; VALIDATES knip.json;
#              CONSUMES scripts/ci/public_redaction.py
# Intent:      Act on a verified audit of unused and scattered parts of the repository, and make
#              the tools that should have caught them report the truth.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-HYGIENE-001 — Verified repository hygiene

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN **Dispatch:** VCC-BUILDANDDO-HYGIENE-001

## Problem

An audit on 2026-09-24 was re-verified finding by finding, and two survey claims were withdrawn
(below). Four things were broken, and nothing reported them:

1. **Public text named machines.** `docs/RBAC_ACCEPTANCE_2026-09-20.md` (6 distinct names) and
   `docs/architecture/BUILDANDDO_OCN_LOGIN.md` (1) fail `public_redaction.py`. The operator rule
   of 2026-09-22 forbids this, and `055bb8f` scrubbed these very files yesterday but missed these.
   Nothing in CI runs the redaction scanner over `docs/`, so the miss was silent.
2. **The context lock misreported.** 7 scripts that GitHub workflows run
   (`candidate_manifest`, `changelog_gen`, `datadog_publish`, `emit_datadog_metrics`,
   `evidence_epoch`, `telemetry_delta`, `telemetry_snapshot`) were reported as "referenced by:
   nothing in this repo". The lock's own `configured_providers` field said `github`; the finding
   text ignored it.
3. **Governance state went stale without a finding:**
   - 20 dispatches on other work have every task `done` while their SRS stays `in_progress`. The registry defines
     `in_progress` as "a branch is claiming this code right now".
   - `SEMANTIC-TWIN-INGESTION-001` is `delivered`, yet its dispatch is still queued, and TEMPLATE.md
     says to delete it.
   - 3 specs are unregistered.
   - Two governance texts still say the site origin is `buildanddo.tech`, which has no DNS record.
4. **Dead web code, and a dead-code metric that could not see it.**
   - 51 web source files are reachable from no production entry point. That covers 45 of the 55
     `components/ui/*`, `ComponentCatalog` and its data (the tab was deliberately removed), `Reveal`,
     `site/Hero`, `buddi/LogoMark` and `hooks/use-toast`.
   - 32 runtime dependencies (21 `@radix-ui/*` and 11 others) are used only by those files, or by
     nothing.
   - `knip.json`, which feeds the Datadog `knip.*` dead-code metrics, lists 28 entry files that no
     longer exist, a workspace that does not exist, and every `components/ui/*` as an entry. So the
     metric reported about 4 unused files where there were 54.

## Withdrawn after verification

- `classroom_access` / `classroom_audit` were reported unused. They are task 2 of the in-progress
  `VCC-BUILDANDDO-CLASSROOM-GLOBAL-001`, and its task 5 reads them.
- `dd-trace` (and the other devDependencies) were reported unused by knip. `dd-trace` loads through
  `NODE_OPTIONS=-r dd-trace/ci/init` in `pr-governance.yml`; the others load implicitly through
  config.

## Scope

- Replace the machine names in the two docs with their roles. Add
  `public_redaction.py scan docs README.md CHANGELOG.md CLAUDE.md AGENTS.md CONTRIBUTING.md` to
  `pr-governance.yml` and GitLab `integrity_gate`.
- `agent_context.py`:
  - a gate that GitHub runs says so in its finding;
  - new findings for a dispatch whose tasks are all done while its SRS is not `delivered`, a
    `delivered` SRS whose dispatch is still queued, and a dispatch with no task table.
- `system_growth.py`: read a dispatch's SRS from its CGRF header when the `**SRS:**` line is absent.
- Governance data:
  - delete the delivered dispatch;
  - register the 3 specs with the status their own headers state;
  - append a dated correction to the two stale `.tech` statements.
- Delete the 51 dead web files and the stale `ComponentCatalog` test mock. Remove the 32 unused
  runtime dependencies and regenerate the lockfile with npm. Rewrite `knip.json` so it only names
  real entries.

## Out of scope: verified, recorded here, not changed

- **Not closing specs.** 20 fully-done dispatches on other work are reported (this PR's own three join them until merged), not flipped to `delivered`: at least
  TRUST-001, PUBLIC-REDACTION-001 and PURPOSE-001 have fresh work on branches outside this checkout,
  and closing a code is its owner's call.
- **Python tools no automation calls.** Humans may run these, so each needs its owner's decision:
  - `tools/day19_evidence.py`, `tools/evidence_verify.py`,
    `tools/buildanddo_release_gate_preflight.py`, `tools/day21_closure.py`
  - `scripts/ci/curriculum_link_gate.py`, `workspace_readiness.py`, `classroom_media_roundtrip.py`
  - five `ocn_*` probes
  - `libs/semantic_twin/phase1/compat.py`
  - `scripts/deploy/apply_production_runtime_config.py`, which is held deliberately until production
    has its own keys.
- **Test-only web libraries:** `lib/signalDerivation.js`, `lib/signalSync.js`, `lib/suiteWorker.js`.
- **Scattered clusters, each a refactor of its own:**
  - 17 `ocn_*` probes with no shared module (`def http` in 16 copies with 5 signatures);
  - two release paths that both emit Datadog deploy events;
  - four Datadog senders;
  - Day-21 material across 7 locations;
  - 8 local date formatters beside `lib/format.js`;
  - `can_write` computed inline in 18 files;
  - two Buddi mascot components;
  - community links in 4 copies;
  - two submission manifests with different schemas.
- **Stale snapshots:**
  - `docs/PROGRESSION_ANCHOR.md`, whose source JSON is gitignored;
  - `BUILDANDDO_CANDIDATE_PROVENANCE.json`, which CI says should be an artifact;
  - `docs/SPRINT_DAY15_MEASURED.md`.
- **13 files under `.bits/` fail the same redaction scan:** 4 handoffs, 2 specs, 2 dispatches,
  3 generated `.bits/out` files, and the branch-archive lists. Scrubbing them belongs to
  SRS-BUILDANDDO-PUBLIC-REDACTION-001, whose dispatch deliberately scoped "the other tracked files
  that name a machine" out and whose owner has fresh work outside this checkout. The new CI scan
  therefore covers `docs/` and the top-level Markdown, which pass, and not `.bits/`.
- **Header references to paths that do not exist on this branch:** 4 truly missing, in
  `ocn-login.pb.js` (2), migration `1789100001` and `useRoomsLive.js`.
- **Unread configuration:** `config/day21/challenge_rules_2026.json`, `demo_journey.json` and
  `config/workflows/agent_working_loop.json`.

## Acceptance evidence

1. `public_redaction.py scan docs README.md CHANGELOG.md CLAUDE.md AGENTS.md CONTRIBUTING.md`
   passes, and a planted family-shaped name in a doc fails it.
2. `agent_context.py` reports no GitHub-run gate as "referenced by: nothing". It reports each fully
   done in-progress dispatch, and a test covers each new finding.
3. `apps/web`: `npm run lint`, `npm run build` (with its answer gate) and the full Vitest suite pass,
   with the same pre-existing failures and no new ones. The import graph from production entries
   reaches every remaining `src` file except test infrastructure and the 3 test-only libraries.
4. `npx knip` names no missing entry file, and its unused-file count matches the import graph
   (0 after the removal). Unused dependencies and unresolved imports are also 0. `dd-trace` is
   declared as a runtime-loaded dependency and the ESLint formatter as a CLI path. The 74 unused
   exports and 4 duplicate exports it now reports are real, and recorded here for a follow-up.
5. `agent_context --check`, `hostinger_readiness --check`, `readme_check`, `system_growth --check`
   and `verify_public_boundary` all pass on a clean clone.
