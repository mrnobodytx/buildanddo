# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-CHANGELOG-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CHANGELOG-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/changelog_gen.py, CHANGELOG.md,
#              .github/workflows/pr-governance.yml
# EnumType:    Doc
# EnumEdges:   VALIDATES scripts/ci/changelog_gen.py; PRODUCES CHANGELOG.md;
#              PRODUCES state/changelog/latest.json
# Intent:      Specify a changelog derived from commits rather than written from memory.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-CHANGELOG-001 — Public record: changelog and roadmap mirror

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN **Dispatch:** VCC-BUILDANDDO-CHANGELOG-001

## Problem

There is no record of what shipped. The repository has no `CHANGELOG.md`, no
tags, and no release notes; answering "what changed between last Tuesday and
now" means reading `git log` and inferring intent from subject lines. The
commit messages already carry the structure needed — a conventional type, a
scope, and an `SRS:` footer on governed work — and nothing reads it.

The same gap exists on the telemetry side. CI measures bundle size, tests, lint
and boundary results per run, but nothing measures release throughput: how many
changes landed, over what period, under which SRS codes, in what proportion of
fixes to features. That is the shape of a repository's health, and it is
currently only inspectable by hand.

## Intent

Derive the changelog from the commits that actually landed, and emit the same
facts as machine-readable telemetry so a pipeline can consume them.

## Scope

- `scripts/ci/changelog_gen.py`, standard library only, matching the other
  scripts in `scripts/ci/`.
- Reads non-merge commits on `main` (or `origin/main` in a PR checkout), from
  the last tag or a configurable start date.
- Classifies each commit by conventional type into Keep a Changelog sections;
  an unrecognised prefix lands in `Other` rather than being dropped.
- Extracts SRS codes from the subject and footer.
- Writes `CHANGELOG.md` between managed markers. The block is a pure function
  of the commit range, so regeneration is idempotent and anything written
  outside the markers survives.
- Emits `state/changelog/latest.json`: entry count, date range, SRS codes
  touched and a category breakdown. `state/` is git-ignored and is a forbidden
  public prefix, so this file is run output, never source.
- `--check` mode: regenerate in memory, compare, fail when stale.
- Wired into `pr-governance.yml` with `continue-on-error: true`.
- A `## Roadmap` section in `README.md` mirroring the `MILESTONES` list in
  `apps/web/src/pages/RoadmapPage.jsx`: the forward-looking half of the same
  public record the changelog covers backwards. Hand-mirrored today; the two
  drifting apart is a known cost, recorded here rather than hidden.

### Extension, 2026-09-24 (owner request, VCC-BUILDANDDO-CHANGELOG-001)

Measured before the change: the README named 2 of the 11 directories under `apps/`, none of the
CI definitions, and had no roadmap section at all. `CHANGELOG.md` stopped at 2026-09-10 while 399
non-merge commits had landed on `main`. Nothing failed.

- `README.md` rewritten from a survey of the tree: every app and service, the connected external
  surfaces (by name and variable name only, never a value), the CI definitions and the docs index.
- The roadmap mirror becomes a generated block between `readme:roadmap` markers, rendered from
  `scripts/ci/sprint_cycle.py` `MILESTONES` (the canonical plan that `RoadmapPage.jsx` also mirrors)
  rather than hand-copied, so the "known cost" of drift above is now a failing check.
- `scripts/ci/readme_check.py`: relative links and anchors resolve; every `apps/*`, `services/*`,
  `.github/workflows/*.yml` and `.gitlab-ci.yml` is named; the roadmap block matches its source.
  Blocking in `pr-governance.yml` and in GitLab `integrity_gate`.
- `.github/workflows/changelog.yml`: on every push to `main`, regenerate `CHANGELOG.md` and commit
  it back, following `evidence-epoch.yml`'s precedent. Its commit carries a `Changelog: skip`
  trailer, which `changelog_gen.py` honours, so the file is not stale by its own refresh.
- A generated README catalogue: every `README.md` in the tree (49 at the time of writing), grouped
  by area, titled by its first heading and summarised by its CGRF `Intent:` line or opening
  paragraph. A README added anywhere fails `readme_check.py` until the catalogue carries it.

## Out of scope

- Tagging or version numbering. That is SRS-BUILDANDDO-RELEASE-TAG-001.
- Publishing the summary to Datadog. `telemetry_snapshot.py` or the
  `datadog-ci-report` action can consume `state/changelog/latest.json` when
  someone specifies which metrics are worth carrying.
- Blocking a build on a stale changelog.

## Acceptance evidence

1. `python scripts/ci/changelog_gen.py` writes a `CHANGELOG.md` whose entries
   match `git log --no-merges main` one for one.
2. Running it twice produces byte-identical output.
3. `--check` exits 0 on a current file and 1 after an entry is removed.
4. `state/changelog/latest.json` reports the same entry count as the document
   and lists only SRS codes that appear in real commit messages.
5. Every row of the README roadmap table matches a `MILESTONES` entry in
   `scripts/ci/sprint_cycle.py` by day, title and planned value
   (`python scripts/ci/readme_check.py --check`).
6. `python -m unittest tests.upgrade.test_readme_check` passes, including a control per rule
   (an undocumented app, a dead link, a dead anchor, a hand-edited roadmap row) that fails the check.
7. A commit with a `Changelog: skip` trailer is absent from the generated changelog; a commit that
   only mentions the phrase mid-sentence is present.
8. No changelog subject carries an address or a fleet machine name: `changelog_gen.py` applies
   `public_redaction.Rule().redact` to every subject, and
   `python scripts/ci/public_redaction.py scan CHANGELOG.md README.md` passes.

## Verification

```bash
python scripts/ci/changelog_gen.py
python scripts/ci/changelog_gen.py --check ; echo "check rc=$?"
git log --no-merges --oneline main | wc -l
python -c "import json;print(json.load(open('state/changelog/latest.json'))['entry_count'])"
```

## Notes for the implementing agent

The separator characters matter. ASCII unit and record separators (`\x1f`,
`\x1e`) are whitespace to Python's `str.strip()`, which silently dropped the
oldest commit from the first working version of this script. Use non-whitespace
control characters.

`commits_without_srs` in the summary is a real finding, not noise: it counts
changes that landed with no governed spec behind them.
