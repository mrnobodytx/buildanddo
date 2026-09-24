# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-DEPLOY-SWAP-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-DEPLOY-SWAP-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEPLOY-SWAP-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/deploy/ship.py
# EnumType:    Doc
# EnumEdges:   GOVERNS scripts/deploy/ship.py; GOVERNS tests/deploy/test_ship_swap.py
# Intent:      Make a deploy leave the live site whole: copy the build beside it, check it, then swap it in and
#              keep the previous release.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-DEPLOY-SWAP-001 — copy beside the live site, then swap it in

## Why this exists

`scripts/deploy/ship.py` writes each environment's webroot (staging, then production) with `_rsync()`, in
two steps:
1. an ssh command empties the live directory (`find <webroot> -mindepth 1 -delete`);
2. `scp -r` copies the new build into it.

For the whole copy, visitors get an empty or half-filled directory. If the copy fails (a dropped connection, a
full disk, an ssh refusal), the environment stays broken until someone ships again. The loop plan's trust
stage lists this as a deploy-safety fix, and the operator chose it on 2026-09-23.

## Requirements

1. **R1 - copy beside, not into.** The build is copied into a sibling directory, `<webroot>.incoming`, which is
   emptied first. Nothing touches the live directory before a complete copy is in place.
2. **R2 - check before the swap.** The swap refuses a copy without a non-empty `index.html`. A refusal leaves the
   live directory as it was.
3. **R3 - swap and keep the previous release.** The live directory is renamed to `<webroot>.previous`, replacing
   an older one, and the copy is renamed into place. Two renames on one filesystem leave only a gap of a few
   milliseconds, where the old flow was down for the whole copy. The copy takes the live directory's owner and
   mode where the server allows it. A first deploy, with no live directory yet, just moves the copy into place.
4. **R4 - a failure before the swap changes nothing live.** A failed preparation, copy or check returns
   `ok: false` with the stage that failed, and the live directory is untouched.
5. **R5 - dotfiles travel with the release.** `.well-known/` and `_version` move with the directory. The old
   `rm -rf dir/*` bug, where dotfiles survived a clear, cannot come back.
6. **R6 - tests that fail without the behaviour.**
   - Command-level tests show that nothing before the swap names the live directory, and that a failed copy
     issues no swap.
   - The swap script runs against real temporary directories under `bash`.
   - The previous `_rsync()` fails the new tests.

## Out of scope

- A strictly atomic exchange (`renameat2` / `mv --exchange`), which depends on the server's coreutils version.
- A rollback command. `.previous` makes one a single rename; it is not added here.
- nginx and the webroot paths. Deploying: the change takes effect the next time `ship.py` runs.

## Acceptance

`python -m unittest tests.deploy.test_ship_swap` passes, and fails against the previous `ship.py`. The repository
gates pass.
