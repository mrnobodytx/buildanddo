# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-GROWTH-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-GROWTH-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GROWTH-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/system_growth.py, .bits/growth.lock.json, .bits/srs_registry.yml,
#              .github/workflows/growth.yml
# EnumType:    Doc
# EnumEdges:   VALIDATES scripts/ci/system_growth.py; PRODUCES .bits/growth.lock.json;
#              CONSUMES .bits/srs_registry.yml; CONSUMES .bits/queue
# Intent:      Specify a growth lock that records how each system develops, kept the way the
#              context lock is and appended to history on every merge.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-GROWTH-001 — System growth lock

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN **Dispatch:** VCC-BUILDANDDO-GROWTH-001

## Problem

The repository can say what it is right now. `.bits/context.lock.json` measures its pipelines,
gates and findings, and `tools/progression_anchor.py` measures the sprint's 33 criteria against
live sources. Neither can say how it got there. Nobody can answer "which systems grew this week,
which stalled, how many have tests or a README, and how far along is each dispatch" without
reading `git log` by hand. The progression anchor also depends on an assessment file that lives
outside the repository, so it cannot run in CI.

## Intent

Measure every system from the repository alone, commit the measurement as a lock, and refresh
it on every merge to `main`. The lock's git history is then the growth history: one point per
merge, dated by its commit and reproducible from source.

## Scope

- `scripts/ci/system_growth.py`, standard library only, matching `scripts/ci/`.
- **Systems.** Each directory under `apps/`, `services/` and `libs/`, plus `foundry`, `tools` and
  each directory under `scripts/`. For each: tracked files, source lines by language, test files
  (inside the system or under a `tests/` directory named after it), whether it has a README, the
  share of source files carrying a CGRF header, and the SRS codes those headers cite.
- **Progression.** SRS registry counts by status and risk; for every dispatch in `.bits/queue`,
  the rows of its task table that are `done` against the total; sprint milestones planned.
- **Surface.** GitHub workflows, GitLab jobs, docs pages and READMEs.
- `.bits/growth.lock.json` holds a deterministic measurement: no timestamp and no commit id,
  because it cannot contain its own commit. Dates come from the commits that change it.
- Modes: summary (default), `--write`, `--check`, `--json`, `--diff REF` (per-system delta
  against the lock at REF, as Markdown), `--history [N]` (the lock's own git history as a
  time series).
- `.github/workflows/growth.yml`: on every push to `main`, `--write` and commit the lock back,
  following `evidence-epoch.yml` and `changelog.yml`. The commit carries `Changelog: skip`.
- `pr-governance.yml` prints the PR's growth delta against `origin/main` to the job summary. It
  is reported, not blocking. GitLab `integrity_gate` prints the summary so the gate is wired
  where CI executes.

## Out of scope

- Judging quality. Line counts measure size, not value; the lock never scores a system.
- Replacing the progression anchor, which measures acceptance criteria against live sources.
  This lock measures development from source and makes no acceptance claim.
- Blocking a PR on growth. The owner chose auto-refresh on `main` (2026-09-24), because almost
  every PR changes line counts and a required lock would conflict across parallel PRs.
- Publishing to Datadog. The lock is JSON and a later spec can ship it.

## Acceptance evidence

1. `python scripts/ci/system_growth.py --write` followed by `--check` exits 0, and running
   `--write` twice produces byte-identical output.
2. Every directory under `apps/`, `services/` and `libs/` appears in `systems`, and the per-system
   file counts sum to the systems total.
3. Dispatch progress matches the task tables: for a fixture dispatch with 2 of 3 rows `done`,
   progress is 2/3.
4. `--diff REF` reports a new system as added and a changed line count as a signed delta.
5. `--history` lists one row per commit that changed the lock, oldest first.
6. The refresh commit leaves `--check` passing on the head it creates, and is absent from
   `CHANGELOG.md`.
7. `python -m unittest tests.upgrade.test_system_growth` passes, with a control per rule.

## Verification

```bash
python scripts/ci/system_growth.py --write && python scripts/ci/system_growth.py --check
python scripts/ci/system_growth.py --diff origin/main
python scripts/ci/system_growth.py --history 20
python -m unittest tests.upgrade.test_system_growth
```
