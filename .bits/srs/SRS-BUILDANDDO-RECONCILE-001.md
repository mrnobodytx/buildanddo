# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-RECONCILE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-RECONCILE-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-RECONCILE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GOVERNS the merge of main into bits/SRS-BUILDANDDO-WORKSPACE-001-fleet-master-seat-gate;
#              GOVERNS the pull request that then takes that line into main
# Intent:      Make main and the staging line one line again, without losing either side's work: main first
#              merges into the staging line, then the staging line merges into main.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-RECONCILE-001 — one line: main into the staging line, then the staging line into main

## Why this exists

Staging is built from the integration line, `bits/SRS-BUILDANDDO-WORKSPACE-001-fleet-master-seat-gate`. Pull
requests also merge into `main`, and the two lines have drifted apart since `916507f` (2026-09-20). At the start
of this work:
- `main` was 67 commits ahead of the staging line. It had the semantic twin, research and government work, the
  career evidence (CAREER-001), the live classroom and its security repair, Buddi and the brand mark, the readme
  and the submission scrub.
- The staging line was 152 commits ahead of `main`. It had the educational purpose copy (PURPOSE-001), the
  presence echo, the deploy swap, the header and redaction work, and other seats' work.
- A trial merge had 53 conflicting files.

The operator chose on 2026-09-23 to do the staging line first, and to resolve public copy as "the staging
line's wording plus main's additions".

## Requirements

1. **R1 - all of main arrives.** One merge commit on a branch from the staging line takes `origin/main` as its
   second parent. Afterwards `git merge-base --is-ancestor origin/main HEAD` holds, so no main commit is left out.
2. **R2 - public copy.** The staging line's educational wording stays: its single source and the guard against
   retired phrases. Main's additions around it stay too: Buddi, the brand mark, the career passport links and
   the submission scrub. Where main's text brings back a retired phrase, the staging wording replaces it.
3. **R3 - live classroom.** The staging line took main's live classroom as a cherry-pick (`069ca74`, from
   `62b8859` and `14edddb`). Those files merge against `62b8859`, not the older common ancestor, so each side's
   real change is visible. `14edddb`, the seat-name follow-up, never reached main, so it counts as the staging
   line's own change:
   - main's later security repair (`2778730`) is kept;
   - the staging line's own later changes are kept, the seat names included.

   One adaptation goes away. The class record route dropped main's government membership check only because its
   helper was missing on this line; the merge brings the helper, so the check comes back.
4. **R4 - presence keeps both guarantees.**
   - Main's binding stays: an advertisement needs the publisher's current attendance and tracks the provider
     confirmed in a media session that the publisher owns.
   - The staging line's echo on read stays: a row is `verified: true` only when the SFU holds every advertised
     track, with the same named reasons otherwise. The write path answers `NOT_YET_ECHOED`.
5. **R5 - one code, two Buddi scopes.** Both lines created `SRS-BUILDANDDO-BUDDI-001`, for different work:
   - C-ONE, 2026-09-22: Buddi, the brand mark, and no addresses in public text.
   - BITS-CODEGEN, 2026-09-23: the brand mark and the Buddi mascot.

   The spec and the dispatch keep both scopes, each under its own heading with its own seat and date. No source
   file changes the SRS it names.
6. **R6 - bookkeeping is a union.** The registry, and any spec or dispatch that both lines extended, keep both
   lines' entries. The readiness and context locks are regenerated on the merged tree, with LF line endings.
7. **R7 - tests on the merged tree.** On the merged tree, three suites pass: the web suite, the node suites in
   `tests/upgrade/*.test.mjs` and the Python native suites. A failure counts as environmental only when both
   parents fail it the same way.
8. **R8 - staging, then main.**
   - After the operator merges the pull request, a staging-only deploy (web and backend) shows the combined site.
   - A second pull request then takes the staging line into `main`. It must merge without conflicts, and it
     waits for the operator.

## Found while merging (2026-09-24)

Running each line's suites on the merged tree, natively on the release workstation, turned up four more
requirements. Each is shown by a test that fails without its change.

9. **R9 - a chatroom stays usable behind the government gate.** main's `roomMembership()` looks up the room's
   lesson, and a chatroom has none. Without a guard, every chatroom answered 404: hidden from the list, and join,
   detail and heartbeat failing. A room without a lesson skips the lesson-category check.
10. **R10 - migrations re-apply after a rollback on native PocketBase.** A Go-bound field exposes `type` as a
    method. Four migrations compared raw values, so re-applying one after a rollback refused every field, and one
    failing migration aborts startup. They now read values through the `norm()` the older classroom migrations
    use.
11. **R11 - the native suites run on Windows.** main's newer suites are kept, with fixes so that they run on
    Windows:
    - `SystemRoot` for Winsock;
    - no console window;
    - a log tail without `os.pread`;
    - database readers that close their connection;
    - `revert()` paired with `restore()`;
    - fixture migrations that sort before the migration under test;
    - every hook a copied module requires.
12. **R12 - recorded evidence is re-run, never relabeled.** main's broadcast lesson carries a dated source
    regression run bound to a digest of the files it covered. After the merge changed those files, the command
    is re-run on the final merged sources, and that run is what is recorded.

Scanning every line the merge adds, with the private fleet map, turned up one more.

13. **R13 - the merge adds no address and no machine name to the staging line.** The staging line already keeps
    them out: `ship.py` has no default host, and its copy of the broadcast-classroom handoff names the release
    seat. Where main spells one, the merged file takes a form that needs none:
    - the praxis target guard refuses every globally reachable address, so production's address is refused
      without being written down;
    - the handoff both lines carried under two names becomes one file at the staging line's path, with main's
      added section, and main's references point at it.

    One family match stays: a hosting plan's product key in recorded evidence. The staging line's generator
    already carries the same key, and changing the record would relabel it (R12).

## Two reconciliations (2026-09-24)

#106 took main into the staging line at 22:31 CDT on 2026-09-23. Two minutes later #105
(`SRS-BUILDANDDO-RECONCILE-002`, another session) took the staging line into main. The two resolved the same
conflicts differently, so the lines still differed in 52 files.

14. **R14 - converge on #106's resolutions.** Operator decision, 2026-09-24. main at `4c60b79` is merged into the
    staging line, and:
    - where #106 and #105 resolved the same conflict differently, #106's form stays;
    - everything main gained beyond #105's resolutions stays, meaning #103's career evidence and #105's
      follow-ups, handoffs and ported tests;
    - where #105 kept something from either side that #106 had lost, it comes back, because losing it was never
      a choice;
    - recorded evidence is re-run on the converged sources (R12), and the locks are regenerated.

    Afterwards main is an ancestor of the staging line, so the pull request into main merges without conflicts.

## Out of scope

- Production, and any server change other than the staging-only deploy in R8.
- Open pull requests. If one lands on `main` before the second pull request, a small follow-up merge brings it
  over.

## Acceptance

- The merge commit has `origin/main` as a parent.
- The three suites pass on the merged tree.
- `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check` and
  `verify_public_boundary.py` pass, also in a fresh LF checkout.
- No line the merge adds carries an address or a machine name, apart from the one R13 names.
