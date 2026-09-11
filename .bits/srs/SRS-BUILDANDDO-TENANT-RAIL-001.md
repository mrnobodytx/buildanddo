# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-TENANT-RAIL-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-TENANT-RAIL-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     scripts/deploy/ship.py, .github/CODEOWNERS, .citadel/tenant.json,
#              config/tenants/buildanddo.tenant.json (controller estate),
#              tools/citadel_tenant_rail.py (controller estate)
# EnumType:    Doc
# EnumEdges:   VALIDATES scripts/deploy/ship.py; PRODUCES .citadel/tenant.json;
#              PRODUCES .github/CODEOWNERS
# Intent:      Specify the repo-side half of the Citadel tenant rail: a stage-only
#              ship mode, a controller pointer and a manifest-derived CODEOWNERS.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-TENANT-RAIL-001 — Tenant rail: stage-only ship, controller pointer, CODEOWNERS

**Status:** in_progress **Risk:** A2 **Seat:** C-ONE

## Problem

GitHub Actions on this repository do not run (every job annotation reads
"account is locked due to a billing issue", measured 2026-09-11), so the mirror
push, the evidence epoch and PR governance workflows are dead until billing is
fixed. The controller estate (Citadel Nexus, foundry worker `rig1`) has to
execute the develop -> stage -> promote rail itself.

`scripts/deploy/ship.py` could not be driven that way. It had one flag-less
`main()` that always ran the whole line through to production. A controller
that may stage at A2 (local, reversible) but must not promote without a human
A3 acknowledgement had no way to stop the line at staging, and no receipt it
could pick up other than parsing stdout.

Nothing in this repository said which controller owns it, and `CODEOWNERS`
listed one login for everything while the tenant's collaborators manifest
names six seats, four of them without a resolvable GitHub login.

## Intent

Give the controller exactly the surface it needs and nothing more: a
`--stage-only` mode and a `--json` receipt on the existing deploy line, a
pointer file naming the controller contract, and a `CODEOWNERS` derived from
the collaborators manifest that stays valid while logins are unresolved.

## Scope

- `scripts/deploy/ship.py`: argparse with `--stage-only` and `--json PATH`.
  The flag-less run is byte-for-byte the previous behaviour (same stages,
  same record shape, same exit codes). `--stage-only` stops after the staging
  probe, records `stopped_at: "stage_only"` and `stage_only: true`, exits 0 on
  a staging 200 and 1 otherwise; production, the epoch and the publication
  never run. `--json` writes the final record to the given path after
  `state/deploy/history.jsonl` and `latest.json`, so a receipt never exists
  for a run the ledger does not know about.
- `.citadel/tenant.json`: `citadel.tenant-pointer/v1` naming tenant_id,
  controller_id, the controller-side contract path, the foundry worker and
  the rail tool. A declaration, not a measurement.
- `.github/CODEOWNERS`: regenerated from
  `config/tenants/buildanddo.collaborators.json` (controller estate). Only
  resolvable logins appear as owners; unresolved seats are comments on their
  paths; `@mrnobodytx` is co-owner on every line.

## Out of scope

- The rail tool itself (`tools/citadel_tenant_rail.py`), the tenant contract
  and the collaborators manifest live in the controller estate, not here.
- Sending collaborator invites. Tooling never invites; the owner does it in
  GitHub and the rail's `collaborators` command verifies.
- Reviving GitHub Actions. That is a billing action by the owner (A3, human
  only).
- Any change to what the flag-less `ship.py` deploys.

## Authority

| Step     | Who        | Authority             |
|----------|------------|-----------------------|
| develop  | rig1       | A2_LOCAL_REVERSIBLE   |
| stage    | rig1       | A2_LOCAL_REVERSIBLE   |
| mirror   | rig1       | A3 (`--ack-authority`)|
| promote  | rig1       | A3 (`--ack-authority`)|
| invite   | mrnobodytx | A3_HUMAN_ONLY         |

## Acceptance evidence

1. `python scripts/deploy/ship.py --help` prints usage and exits 0 without
   building or touching a server.
2. With build, gate, sync and probe stubbed, `main(["--stage-only", "--json",
   P])` returns 0, never calls the production sync, records
   `stopped_at == "stage_only"`, and `P` is byte-identical to
   `state/deploy/latest.json`.
3. With the staging probe stubbed to fail, `main(["--stage-only"])` returns 1
   and records `stopped_at == "staging_probe"`.
4. With every stage stubbed to pass, `main([])` produces the same record keys
   as before this change (no `stage_only` key) and returns 0.
5. `.github/CODEOWNERS` contains no `@login` that is not a resolvable GitHub
   account (`GET https://api.github.com/users/<login>` -> 200 for each).
6. `python scripts/ci/agent_context.py --check` passes with this code
   registered.

## Verification

```bash
python -c "import ast;ast.parse(open('scripts/deploy/ship.py').read())"
python scripts/deploy/ship.py --help
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
npm test
```

## Notes for the implementing agent

`scripts/publish/activity_publish.py` imports `_SECRETS`, `_run` and
`_notify_guildmasters` from `ship`. Keep those names and signatures; the
argparse layer is confined to `_parse_args`, `main` and `_finish`.

The `--stage-only` failure path keeps the failing stage's name in
`stopped_at` (`build`, `gate`, `staging_sync`, `staging_probe`) rather than
`stage_only`; `stage_only: true` on the record says which mode ran. A
controller reading the record gets both facts.
