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
| 1 | Feed generator with a planted-history test and controls | `python -m unittest tests.upgrade.test_changelog_feed` | pending |
| 2 | The build runs it best-effort; its output is git-ignored | `npm run build`, then `dist/apps/web/changelog.xml` and `changelog.json` exist | pending |
| 3 | "What shipped" desk, feed link in the page head, stale Version log removed | `npm --prefix apps/web exec -- vitest run src/components/editorial/__tests__/ChangelogDesk.test.jsx` | pending |
| 4 | The built feed carries no address or machine name | `python scripts/ci/public_redaction.py scan dist/apps/web` | pending |
| 5 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `verify_public_boundary.py` | pending |

## Constraints

- Files this dispatch may touch: `scripts/ci/changelog_feed.py`, `tests/upgrade/test_changelog_feed.py`,
  `apps/web/tools/build.mjs`, `.gitignore`, `apps/web/src/components/editorial/ChangelogDesk.jsx` and its
  test, `apps/web/src/pages/HomePage.jsx`, this bookkeeping, and the readiness and context locks.
- Files it must not touch: `scripts/ci/changelog_gen.py` behaviour and `CHANGELOG.md` (the feed reuses the
  generator's rules and does not change them), and every other generator.
- No real machine name or address may enter this repository, including test fixtures.
- Raises the tier: any deploy, push or external write. None is performed here.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] The built site serves both files and the home page shows the desk.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
