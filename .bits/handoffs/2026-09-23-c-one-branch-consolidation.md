# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-23-c-one-branch-consolidation.md
# Stage:       11_COMMIT
# SRS:         SRS-BRANCH-CONSOLIDATOR-001, SRS-BUILDANDDO-WORKSPACE-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/handoffs/branch-archive-2026-09-23/archive_merged_branches.sh
# EnumType:    Doc
# EnumEdges:   CONSUMES .bits/handoffs/branch-archive-2026-09-23/; SUPERSEDES nothing
# Intent:      Record the 2026-09-23 branch sweep: which names are already in main, which land with the converge PR, which still hold unique work, and the operator step that closes the merged names.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-09-23 C-ONE: branch consolidation

Sweep of 126 branch names (GitHub `origin/*`, GitLab `gitlab/*`, and the local-only branches on the
release workstation) against GitHub `main`, run with `tools.cbf.branch_consolidator sweep` (CNWB):
**83 already in main · 42 divergent · 1 clean merge** (PR #102, merged by the operator the same evening).

The divergent set collapsed once the live trunk itself was merged: the converge branch
`c-one/SRS-BUILDANDDO-RECONCILE-002-trunk-into-main` carries the trunk and the RC into `main`, and
18 more names are already in that trunk. The rest is listed under "still holds unique work".

## Closing the names is an operator step

The release seat's classifier refused `git push --delete` (Git Destructive), so nothing was deleted.
`branch-archive-2026-09-23/archive_merged_branches.sh` closes them in three tiers, refusing any name
that gained commits since this ledger was written:

```
bash .bits/handoffs/branch-archive-2026-09-23/archive_merged_branches.sh tier1   # 77 GitHub + 3 GitLab names, 0 ahead of main
bash .bits/handoffs/branch-archive-2026-09-23/archive_merged_branches.sh tier2   # 18 GitHub c-one/* names, after the converge PR merges
bash .bits/handoffs/branch-archive-2026-09-23/archive_merged_branches.sh local   # clean worktrees and merged local branches on the workstation
```

Every deletion is recoverable from the tips recorded below: `git push origin <tip>:refs/heads/<name>`.


Every branch below is 0 commits ahead of `main`: its whole history is reachable from `main`, so closing the
name loses nothing. To restore a name: `git push origin <sha>:refs/heads/<name>`.

| where | branch | tip | last commit | merged via |
|---|---|---|---|---|
| gitlab | `bits/SRS-BUILDANDDO-LIVE-UTILIZATION-001-controller-rig1-deploy` | `6086a63ca` | 2026-09-18 | #42 (2026-09-18) |
| gitlab | `fix/dora-ns-timestamps` | `5688a0921` | 2026-09-18 | #43 (2026-09-18) |
| gitlab | `sprint/p0-release-20260918-1027-92ebc84` | `4b376f048` | 2026-09-18 | #41 (2026-09-18) |
| local | `bits/SRS-BUILDANDDO-ROADMAP-001-canonical-ledger-activity` | `0c1c90716` | 2026-09-18 | - |
| local | `bits/SRS-BUILDANDDO-UPGRADE-001-learning-brand-front-page` | `d9b55ff8c` | 2026-09-18 | - |
| local | `bits/SRS-BUILDANDDO-UPGRADE-001-sprint-closeout` | `3c976ab0f` | 2026-09-13 | - |
| origin | `bits/SRS-BUILDANDDO-LIVE-UTILIZATION-001-controller-rig1-deploy` | `6086a63ca` | 2026-09-18 | #42 (2026-09-18) |
| origin | `dd/bits/SRS-BUILDANDDO-BOOTSTRAP-001-agents-md` | `90a8111be` | 2026-09-09 | #1 (2026-09-09) |
| origin | `dd/bits/SRS-BUILDANDDO-CAREER-001-career-evidence` | `4caa2fa41` | 2026-09-22 | #73 (2026-09-23) |
| origin | `dd/bits/SRS-BUILDANDDO-CAREER-001-career-evidence-16Ukkr` | `5a796c6ed` | 2026-09-23 | #74 (2026-09-23) |
| origin | `dd/bits/SRS-BUILDANDDO-CAREER-001-career-evidence-7twP1I` | `174df886e` | 2026-09-23 | #75 (2026-09-23) |
| origin | `dd/bits/SRS-BUILDANDDO-CAREER-001-career-evidence-BsITyT` | `277873098` | 2026-09-23 | #90 (2026-09-23) |
| origin | `dd/bits/SRS-BUILDANDDO-CAREER-001-career-evidence-oN6Pux` | `d8b569fad` | 2026-09-23 | #81 (2026-09-23) |
| origin | `dd/bits/SRS-BUILDANDDO-CAREER-001-career-evidence-pAbvad` | `355886214` | 2026-09-23 | #76 (2026-09-23) |
| origin | `dd/bits/SRS-BUILDANDDO-CHANGELOG-001-roadmap-and-changelog` | `e73017a4c` | 2026-09-10 | #14 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-CI-001-ci-visibility` | `b6226178c` | 2026-09-10 | #3 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-CI-001-ci-visibility-AUrBSQ` | `bee3d3784` | 2026-09-10 | #4 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-CI-001-ci-visibility-l5fbob` | `dc0e685b4` | 2026-09-10 | #6 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-COMMUNITY-001-contributor-infra` | `385e77d3d` | 2026-09-10 | #12 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-CRAWL-001-public-crawl-check` | `8c34688d7` | 2026-09-17 | #35 (2026-09-17) |
| origin | `dd/bits/SRS-BUILDANDDO-DECISION-001-decision-runtime` | `250054757` | 2026-09-16 | #36 (2026-09-17) |
| origin | `dd/bits/SRS-BUILDANDDO-DEVENV-001-local-stack` | `06a5ecb84` | 2026-09-10 | #9 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-ESTATE-001-estate-intelligence` | `25c5b9cbf` | 2026-09-17 | #39 (2026-09-17) |
| origin | `dd/bits/SRS-BUILDANDDO-PLATFORM-001-platform-visuals` | `5129c2f75` | 2026-09-13 | #17 (2026-09-13) |
| origin | `dd/bits/SRS-BUILDANDDO-ROADMAP-001-sprint-plan-consolidation` | `e8a50bf60` | 2026-09-10 | #15 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-RUM-001-rum-sdk` | `6ec608bdf` | 2026-09-10 | #2 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-RUM-001-rum-sdk-OKZ3Kt` | `f9c0ba8d0` | 2026-09-10 | #5 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-RUM-ACTIONS-001-observability-specs` | `691e58dc2` | 2026-09-10 | #7 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-001-phase-0` | `c7d870925` | 2026-09-18 | #49 (2026-09-19) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-001-phase-0-ANHx6o` | `7544f67cd` | 2026-09-19 | #52 (2026-09-19) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-001-phase-0-EL31Lf` | `ff6870cf0` | 2026-09-19 | #54 (2026-09-19) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-001-phase-0-V8nqtn` | `86a9758c1` | 2026-09-19 | #50 (2026-09-19) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion` | `92093b504` | 2026-09-18 | #51 (2026-09-19) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-SHQnMt` | `bc5d451dc` | 2026-09-18 | #53 (2026-09-19) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm` | `af12d5b9d` | 2026-09-19 | #55 (2026-09-19) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-8TtJD2` | `d67724dc1` | 2026-09-21 | #64 (2026-09-21) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-ElqXay` | `cc4940309` | 2026-09-19 | #56 (2026-09-19) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-I6dTHf` | `88ee32425` | 2026-09-22 | #72 (2026-09-23) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-LoU0Lc` | `f1d823c1d` | 2026-09-21 | #65 (2026-09-21) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-OqjC8Z` | `2f90b2ebd` | 2026-09-22 | #70 (2026-09-22) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-P4cEZJ` | `9d85aafbc` | 2026-09-22 | #69 (2026-09-22) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-TEoyZ3` | `d88b43ea0` | 2026-09-22 | #68 (2026-09-22) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-TdL2Dl` | `615000a91` | 2026-09-22 | #66 (2026-09-22) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-ZBFPqR` | `d30b9ac33` | 2026-09-22 | #71 (2026-09-22) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-bYJ9zW` | `b0aa94ef9` | 2026-09-20 | #59 (2026-09-21) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-hPNRsb` | `e5ffb66dd` | 2026-09-20 | #60 (2026-09-21) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-i9XicT` | `89657d0c4` | 2026-09-21 | #61 (2026-09-21) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-mxKQQV` | `913fd48d6` | 2026-09-22 | #67 (2026-09-22) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-rEaTgK` | `6d4bbc1d8` | 2026-09-21 | #63 (2026-09-21) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-ruxGsQ` | `a3d179806` | 2026-09-21 | #62 (2026-09-21) |
| origin | `dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm-tPO3tj` | `c3d47c59b` | 2026-09-20 | #57 (2026-09-20) |
| origin | `dd/bits/SRS-BUILDANDDO-TEST-001-web-test-harness` | `9932f32c4` | 2026-09-10 | #11 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-blueprint-phase-a-20260917` | `ae5816665` | 2026-09-17 | #37 (2026-09-17) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-blueprint-phase-a-20260917-R9HXJV` | `a8398e21b` | 2026-09-18 | #40 (2026-09-18) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-blueprint-pipeline` | `3b84b0894` | 2026-09-17 | #38 (2026-09-17) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-federal-foundry` | `21900f28b` | 2026-09-16 | #31 (2026-09-16) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps` | `328fa8cef` | 2026-09-18 | #44 (2026-09-18) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps-HlLSv1` | `731d74522` | 2026-09-18 | #48 (2026-09-18) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps-HoxwMF` | `ce83c7c4e` | 2026-09-18 | #47 (2026-09-18) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps-MlwUT1` | `d74dcf4e1` | 2026-09-18 | #46 (2026-09-18) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps-ge8eGw` | `9bbcbc2af` | 2026-09-18 | #45 (2026-09-18) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-governance-telemetry` | `e705e85e9` | 2026-09-16 | #33 (2026-09-16) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-governance-telemetry-uCx7Ws` | `a7d482201` | 2026-09-16 | #34 (2026-09-17) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924` | `8a1c407d1` | 2026-09-14 | #19 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-2twDDr` | `a155e24a1` | 2026-09-15 | #27 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-4A9PyR` | `e820f8f22` | 2026-09-15 | #21 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-7S1xcc` | `b609039af` | 2026-09-15 | #24 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-8bFbXH` | `295725ac4` | 2026-09-15 | #25 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-KrP73R` | `c84008b5b` | 2026-09-15 | #20 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-bnGR8H` | `c2bb9ddb3` | 2026-09-16 | #29 (2026-09-16) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-cMDoy4` | `58772dee3` | 2026-09-15 | #26 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-dXp1Th` | `f22bbc787` | 2026-09-16 | #30 (2026-09-16) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-qE4ZTB` | `203a08ced` | 2026-09-15 | #22 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-sHlvqz` | `858ccf52c` | 2026-09-15 | #23 (2026-09-15) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924-yxrZuh` | `b1e81ac2b` | 2026-09-16 | #28 (2026-09-16) |
| origin | `dd/bits/SRS-BUILDANDDO-UPGRADE-001-staging-contract` | `46b24c07c` | 2026-09-16 | #32 (2026-09-16) |
| origin | `dd/bits/SRS-BUILDANDDO-WITNESS-001-capability-passport` | `6b9e5c86f` | 2026-09-10 | #10 (2026-09-10) |
| origin | `dd/bits/SRS-BUILDANDDO-WORKSPACE-001-fleet-platform-health` | `638493569` | 2026-09-11 | #16 (2026-09-11) |
| origin | `dd/bits/SRS-BUILDANDDO-WORKSPACE-001-workspace-pages` | `3170e8466` | 2026-09-10 | #8 (2026-09-10) |
| origin | `feat/about-header-rooms-live` | `abc10c9e8` | 2026-09-18 | - |
| origin | `fix/dora-finished-after-started` | `d0ed18d21` | 2026-09-18 | - |
| origin | `fix/dora-ns-timestamps` | `5688a0921` | 2026-09-18 | #43 (2026-09-18) |
| origin | `sprint/p0-release-20260918-1027-92ebc84` | `4b376f048` | 2026-09-18 | #41 (2026-09-18) |

## Already in the live trunk (0 ahead of it) - they land in `main` with the converge PR

| branch (origin) | tip | last commit | merged via |
|---|---|---|---|
| `c-one/SRS-BUILDANDDO-BUDDI-001-rename-brand-ip` | `5c622b71a` | 2026-09-23 | #78 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-BUDDI-003-voice-in-page` | `aa2a526d7` | 2026-09-23 | #85 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-COMMUNITY-WEB-001-links-personas-health` | `763a8529a` | 2026-09-23 | #77 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-DEPLOY-SWAP-001-rebind-context` | `ff070d31a` | 2026-09-23 | #99 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-DEPLOY-SWAP-001-ship-swap-in` | `3a4786d91` | 2026-09-23 | #98 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-HEADERS-001-assets-keep-security-headers` | `7bdcc1895` | 2026-09-23 | #91 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PRESENCE-001-echo-outcomes` | `d836a03c2` | 2026-09-23 | #101 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PRESENCE-001-rebind-locks` | `7c5d86ea7` | 2026-09-23 | #96 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PRESENCE-001-verification-labels` | `13535ecc4` | 2026-09-23 | #95 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PUBLIC-REDACTION-001-hyphen-names` | `c33d4e015` | 2026-09-23 | #82 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PUBLIC-REDACTION-001-no-fleet-names` | `eaaa80f99` | 2026-09-23 | #79 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PUBLIC-REDACTION-001-scan-sources` | `cf4933726` | 2026-09-23 | #94 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PUBLIC-REDACTION-001-test-fixture-names` | `7bf742a29` | 2026-09-23 | #97 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PUBLIC-REDACTION-001-unspecified-address` | `64a973238` | 2026-09-23 | #92 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PURPOSE-001-challenge-entry` | `410c4cab7` | 2026-09-23 | #87 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-PURPOSE-001-educational-copy` | `8676242e0` | 2026-09-23 | #86 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-ROADMAP-001-guildmaster-activity` | `50f9bae51` | 2026-09-23 | #88 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |
| `c-one/SRS-BUILDANDDO-UPGRADE-001-live-classroom-staging` | `79dae5b15` | 2026-09-23 | #89 (2026-09-23, into SRS-BUILDANDDO-WORKSPACE) |

## Local-only branches on this workstation (no remote to close; delete locally once the converge lands)

| local branch | tip | ahead of main | ahead of trunk |
|---|---|---|---|
| `c-one/SRS-BUILDANDDO-BUDDI-001-rename-brand-ip` | `f44ac2980` | 78 | 0 |
| `c-one/SRS-BUILDANDDO-COMMUNITY-WEB-001-links-personas-health` | `2f20ad199` | 77 | 0 |
| `c-one/SRS-BUILDANDDO-PUBLIC-REDACTION-001-no-fleet-names` | `eaaa80f99` | 76 | 0 |
| `candidate/web-release-20260923` | `05028f391` | 82 | 1 |
| `c-one/SRS-BUILDANDDO-BUDDI-002-platform-tools` | `f52691fe6` | 80 | 6 |
| `c-one/SRS-BUILDANDDO-RECONCILE-001-merge-main-into-staging` | `37b75e0d3` | 179 | 95 |
| `c-one/SRS-BUILDANDDO-UPGRADE-001-seat-names` | `14edddb64` | 1 | 64 |
| `candidate/d7b18a8-gitlab-intake` | `92ebc8479` | 0 | 0 |
| `feat/about-header-rooms-live` | `abc10c9e8` | 0 | 0 |
| `fix/dora-finished-after-started` | `d0ed18d21` | 0 | 0 |
| `fix/dora-ns-timestamps` | `5688a0921` | 0 | 0 |
| `sprint/p0-release-20260918-1027-92ebc84` | `4b376f048` | 0 | 0 |
| `bits/SRS-BUILDANDDO-LIVE-UTILIZATION-001-controller-rig1-deploy` | `6086a63ca` | 0 | 0 |


## Still holds unique work (not closed, not merged here)

| branch | ahead of main | what it is | verdict |
|---|---|---|---|
| `c-one/SRS-BUILDANDDO-BUDDI-002-tool-endpoints` (PR #83, base = trunk) | +8 over the trunk | Buddi's tool endpoints | rebase onto the converge; conflicts on the `.bits` locks and `docker-compose.yml` |
| `c-one/SRS-BUILDANDDO-CHANGELOG-001-rss-feed` (PR #84, base = trunk) | +3 over the trunk | RSS feed + "What shipped" desk | rebase onto the converge; conflicts on the `.bits` locks and `HomePage.jsx` |
| `gitlab/main`, `gitlab/operations/select-popper-never-settles-under-jsdom`, `gitlab/operations/gitlab-native-release-pipeline`, `gitlab/set-sast-config-1` | +12 / +13 / +3 / +1 | GitLab CI, test reporting and fixture fixes (2026-09-19/20, another seat); the newspaper front page they carry is already in main | harvest onto a review branch; conflicts with main on `EditorialFrontPage.jsx` and its tests |
| `origin/feat/m02-release-manifest`, `origin/feat/estate-surfaces-gate`, `c-one/estate-surface-gate`, `release/converge-a5bdcad`, `vcc/editorial-living-still` | +2 / +1 each | the 2026-09-18 estate-surface gate (`a5bdcad`) and the M02 served release manifest | main has its own estate gate (`EstateOnly` + `estateAccess`) and its own manifest write in `ship.py`; close-stale unless the M02 readback is wanted |
| `origin/fix/ci-unblock-lockfile-and-roadmap-duplicate` | +4 (2026-09-13) | lint measured/excluded, `SpecialistDeskPage` route, social meta, lockfile desync | the route exists on main; the rest is superseded; close-stale |
| `origin/staging/integration-2026-09-13` (PR #18), `origin/c-one/progression-20260914`, `origin/bits/SRS-BUILDANDDO-LIVE-UTILIZATION-001-rooms-sfu-moq-content` | +49 / +39 / +31 (10 to 12 days old, 150 to 180 files each) | the pre-09-14 lineage: release lane v2/v2.1, Living Rooms overlay, OCN seats for c-two and vcc, public-record bridge, roadmap staleness | harvest-plan says manual-review for the bulk and cherry-pick for four small clusters; deletion needs the operator's word |
| `c-one/SRS-BUILDANDDO-RECONCILE-001-merge-main-into-staging` (local) | +179 main / +95 trunk | the earlier reconcile attempt | superseded by the converge branch; delete locally once it lands |
| `c-one/SRS-BUILDANDDO-UPGRADE-001-seat-names` (local, worktree bnd-pr80) | +1 | | check the one commit, then close |

## Seat identity, as the FLOOR requires

Every claim above is `[MEASURED]` from `git rev-list` / `git merge-tree` on 2026-09-23 between 21:00 and 22:30 local, on the release workstation, against `origin/main` at `1d1ffaa` (after PR #102). The memory MCP was unreachable on every transport for the whole session (probe: read timeouts on `mcp.*`, not-an-MCP on `memory.*`), so no substrate recall backed this; the Layer-2 file memory did.
