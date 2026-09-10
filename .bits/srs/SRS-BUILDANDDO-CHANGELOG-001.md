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

**Status:** in_progress **Risk:** A0 **Seat:** BITS-CODEGEN

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
   `apps/web/src/pages/RoadmapPage.jsx` by day, title and planned value.

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
