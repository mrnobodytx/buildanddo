# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-CHANGELOG-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-CHANGELOG-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CHANGELOG-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-CHANGELOG-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-CHANGELOG-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that publishes the changelog as a feed and shows it on the home page.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-CHANGELOG-001

**SRS:** SRS-BUILDANDDO-CHANGELOG-001 (continuation R6-R8) **Risk:** A0 **Seat:** C-ONE **Status:** in_progress

## Objective

Anyone can follow what ships: an RSS feed of the reader-facing changes, built from the commits the site
is made from, and a "What shipped" desk on the home page that reads the same feed.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Feed generator with a planted-history test and controls | `python -m unittest tests.upgrade.test_changelog_feed` | done |
| 2 | The build runs it best-effort; its output is git-ignored | `npm run build`, then `dist/apps/web/changelog.xml` and `changelog.json` exist | done |
| 3 | "What shipped" desk, feed link in the page head, stale Version log removed | `npm --prefix apps/web exec -- vitest run src/components/editorial/__tests__/ChangelogDesk.test.jsx` | done |
| 4 | The built feed carries no address or machine name | `python scripts/ci/public_redaction.py scan dist/apps/web` | done |
| 5 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `verify_public_boundary.py` | done |

## Constraints

- Files this dispatch may touch: `scripts/ci/changelog_feed.py`, `tests/upgrade/test_changelog_feed.py`,
  `apps/web/tools/build.mjs`, `.gitignore`, the feed link in `apps/web/index.html`, `apps/web/src/components/editorial/ChangelogDesk.jsx` and its
  test, `apps/web/src/pages/HomePage.jsx`, this bookkeeping, and the readiness and context locks.
- Files it must not touch: `scripts/ci/changelog_gen.py` behaviour and `CHANGELOG.md` (the feed reuses the
  generator's rules and does not change them), and every other generator.
- No real machine name or address may enter this repository, including test fixtures.
- Raises the tier: any deploy, push or external write. None is performed here.

## Evidence (2026-09-23, local run on Windows, LF checkout)

- **Generator:** `tests.upgrade.test_changelog_feed` 6 of 6. The planted history has a housekeeping
  commit, a merge, a fix that arrives through the merge, and a subject with a made-up machine name and a
  documentation address. The feed keeps the four reader-facing commits, newest first, and withholds both
  values. Mutation controls: letting `chore` into the feed fails the ordering test; switching the
  redaction off fails the withholding test.
- **On this history:** 40 changes (23 fixes, 16 additions, 1 change), 0 values withheld with the private
  fleet map, byte-identical on a second run. The RSS parses with 40 items.
- **Build:** `npm run build` writes both files into `dist/apps/web` (17 KB JSON, 21 KB RSS), and the
  worktree stays clean because both outputs are git-ignored. `public_redaction.py scan dist/apps/web`
  PASS with the private fleet map.
- **Desk:** `ChangelogDesk.test.jsx` 7 of 7. It shows the newest entries with kind, date, SRS code and a
  link, offers the RSS feed, and says so in words when the feed is missing, malformed or empty.
  `HomePage.test.jsx` and `PublicPages.test.jsx` pass 20 of 20 with the desk and 20 of 20 without it.
- **Served page** (vite preview of the build): the desk renders the 6 newest entries after Corrections;
  `/changelog.json` answers `application/json` and `/changelog.xml` answers XML; no console errors. The
  Subscribe link is a plain anchor. A `<Button href>` makes a path into a router link, which would have
  opened an app page instead of the feed.
- **Feed discovery:** the `<link rel="alternate">` sits in the static `index.html` head, so a feed reader
  finds it without running scripts, and all 26 prerendered pages carry it. Declared through the home page's
  Helmet block first, it never reached the head.

## Findings, not fixed here

- **The home page's own head block never reaches the page.** Its structured data (`application/ld+json`)
  and its description are missing from the live head; only the `Seo` component's tags arrive. Found while
  placing the feed link, measured on a preview of the build. It needs its own look.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] The built site serves both files and the home page shows the desk.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
