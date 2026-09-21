<!-- ─── CGRF Header ───────────────────────────────────────────────
File:        docs/SPRINT_DAY15_MEASURED.md
Stage:       07_BUILD
SRS:         SRS-BUILDANDDO-SPRINT-TRUTH-001
Seat:        C-ONE
Owner:       Citadel Nexus Inc.
Created:     2026-09-18
Intent:      Replace the Sep 17 sprint sheet's asserted states with measured ones, so the last
             six days are not spent rebuilding work that already passes its own gate.
─────────────────────────────────────────────────────────────── -->

# BuildAndDo — Day 15 sprint sheet, MEASURED

**Supersedes:** the Sep 17 "comprehensive operating sheet" (learn-by-doing reframe).
**Measured:** 2026-09-18, seat C-ONE, against the live estate.

The reframe itself — BuildAndDo as learn-by-doing for everyone, not an SMB product — is
**correct, and already canonical in the code**. Only the status columns were wrong, and they
were wrong in both directions: the product work is further along than the sheet says, and the
test suite is in worse shape than the sheet says.

---

## 0 · How to read a state here

| Label | Meaning |
|---|---|
| `MEASURED-PASS` / `MEASURED-FAIL` | A probe ran today and returned the result quoted beside it. |
| `REFUTED` | The Sep 17 sheet asserted this; measurement contradicts it. |
| `CONFIRMED` | The Sep 17 sheet asserted this; measurement agrees. |
| `UNMEASURED` | No probe run. The probe that would settle it is named. Never read as pass or fail. |

No row says PASS without the command that produced it. Rows the Sep 17 sheet marked
`PASS SOURCE` are treated as `UNMEASURED` unless re-probed here.

---

## 1 · The corrections that change what to do next

### 1.1 The identity / homepage / onboarding / flagship P0 block is already done — `REFUTED`

The repo ships a gate purpose-built for this campaign:
`tools/buildanddo_release.py` v1.0.1, `campaign=citadel-21-day-2026-09`.

`py -3.13 tools/buildanddo_release.py doctor` →

```
P0 SOURCE
  identity_pass                  PASS
  homepage_pass                  PASS
  onboarding_pass                PASS
  flagship                       PASS
  release_truth_source_pass      PASS
  legacy_matches                 0
```

The four business-framing phrases the Sep 17 sheet quotes as live copy —
"Your business changed today", "business newspaper for your own operations",
"Which business should BuildAndDo understand?", "Try a business challenge" — occur in exactly
one place in the tree: as `LEGACY_*` constants **inside the detector**, split across string
concatenation (`"business newspaper" + " for your own operations"`) so the gate does not match
its own source. `apps/web/src/pages/HomePage.jsx` carries `Created: 2026-09-15`.

**Consequence:** these Sep 17 P0 rows are stale and must not be worked as written —
*Product identity update · Homepage rewrite · General onboarding · Flagship deployment lesson.*

**Caveat, and it matters:** this gate checks *copy*, not *behavior*. `HomePage.test.jsx` is
currently failing 5 tests (§1.7). The framing converged; the surface is not proven to work.

### 1.2 The flagship lesson exists, and it is good — `REFUTED`

Sep 17 says `MISSING`. Measured: `apps/web/public/lessons/deploy-my-first-website.json`, present
in source, in `dist/`, and inside the built release artifact.

```
schema     buildanddo.lesson/v1
kind       flagship-sprint-seed
promise    Learn by doing real work.
objective  Deploy a real website and prove the deployed version is the intended commit.
```

Its 10-step path is precisely the Sep 17 §7 vertical slice:

```
1 choose an objective              6 verify staging by external readback
2 learn the prerequisites          7 promote the same artifact to production
3 create a bounded mission         8 verify production SHA and health
4 build the site                   9 attach deployment evidence to the mission
5 deploy to staging               10 record demonstrated capability
```

Verification: `external URL health · commit identity readback · artifact hash · rollback target`,
under `truth_rule: candidate success is not production verification`.

This is content, not proven traversal. See §1.6.

### 1.3 Production DOES identify its SHA — `REFUTED`

Sep 17 lists "Production SHA proof: HOLD".

`GET https://buildanddo.com/.well-known/citadel-release.json` → `200 application/json`, naming
its commit. The defect is not that production is unidentifiable. It is that production's
identity came from a **different, unverified deploy path**.

### 1.4 The real defect: staging and production run two different release regimes

| | staging | production |
|---|---|---|
| manifest schema | **v2** | v1 |
| commit | `c07ca7e` | `0b9faeb` |
| built | **2026-09-18 15:14Z** | 2026-09-11 22:36Z |
| executor | `tools/buildanddo_release.py` | `scripts/deploy/ship.py` |
| artifact identity | `artifact_tree_sha256` + 173 files | **absent** |

Staging already enforces the artifact-identity discipline the Sep 17 sheet asks for in §16.
Production is seven days behind it on the legacy script. Controller `status` reads
`VERIFIED_PRODUCTION_PRIOR_SHA`.

### 1.5 Neither environment is deployed through CI — `CONFIRMED`, with the proof

Staging's own v2 manifest leaves every lane field null, and is right to:

```
lane                   github-staging      github_ref             null
lane_version           2.0.0               github_sha             null
                                           gitlab_intake_sha      null
                                           gitlab_pipeline_id     null
                                           gitlab_project_id      null
```

Staging was shipped **from the desktop**. The manifest does not fake a pipeline it did not use —
that honesty is the instrument working correctly. Sep 17 §16 "GitLab actual continuation /
runner execution: P0" is confirmed, and those null fields are the evidence.

### 1.6 The promote leg is blocked on ONE absent file, and it blocks the demo too

`doctor` holds both environments for a single reason:

```
staging      HOLD   missing: BUILDANDDO_STAGING_URL, BUILDANDDO_STAGING_DEPLOY_MODE
production   HOLD   missing: BUILDANDDO_PRODUCTION_URL, BUILDANDDO_PRODUCTION_DEPLOY_MODE
```

Those come from `D:\citadel_secrets\BuildAndDo\release.env`, which **does not exist**. The tool
ships its own scaffold at `.citadel/release.env.example`. This is operator credential
placement, not engineering.

**The Sep 17 sheet tracks the flagship demo and the release-truth P0 as two items. They are
one.** Flagship steps 7–8 — *promote the same artifact to production*, *verify production SHA
and health* — execute through this controller. Until `release.env` exists, the flagship lesson
cannot be completed end-to-end, so the headline demo and the release proof unblock together or
not at all.

This is the single highest-leverage fact in this sheet.

### 1.7 The test suite is RED, and the release path never looks at it — `MEASURED-FAIL`

The Sep 17 sheet rates most learning surfaces `PASS SOURCE`. Measured, full run, 2026-09-18
(`reports/junit/web.xml`, `tests=423 failures=66`):

```
Test Files   24 failed | 25 passed   (49)
Tests        65 failed | 343 passed | 14 skipped   (422)
```

Failing suites include the surfaces the sheet marks converged:

```
  9  pages/workspace/__tests__/OverviewPage.test.jsx
  7  pages/workspace/__tests__/BlueprintPage.test.jsx
  6  pages/workspace/__tests__/SuiteFlow.test.jsx
  5  pages/__tests__/HomePage.test.jsx
  5  pages/workspace/__tests__/PolicyPage.test.jsx
  4  __tests__/AppRoutes.test.jsx
  4  components/editorial/__tests__/EditorialReels.test.jsx
  3  pages/workspace/__tests__/DossierFlow.test.jsx
  3  pages/workspace/__tests__/SettingsPage.test.jsx
  2  components/workspace/missions/__tests__/MissionFlow.test.jsx
  2  hooks/__tests__/useClassrooms.test.jsx
  1  components/workspace/__tests__/TutorialCatalog.test.jsx
  … 12 more
```

Exit-code propagation was checked separately and is **healthy** — an isolated failing file
returns `1`. There is no broken gate here; the suite is simply red.

**But the release controller does not run tests at all.** It gates on `npm run build`
(`raise ReleaseError("BuildAndDo build failed")`); there is no `npm test` invocation anywhere in
`tools/buildanddo_release.py`. A red suite therefore cannot block a release through the
controller path. That is a gap in the gate, not a false green from it.

---

## 2 · The corrected critical path

```
release.env placed (operator, minutes)
        |
        v
doctor clears both environments
        |
        +--> production promoted onto the v2 controller (leaves ship.py)
        |            |
        |            v
        |    production carries artifact_tree_sha256  --> release truth P0 closes
        |
        +--> flagship lesson traversable end-to-end   --> headline demo closes
                     |
                     v
             evidence + verification + capability progression exercised for real

  (parallel, independent)
  66 test failures triaged --> the converged surfaces are proven, not just reframed
  submission package built --> the four-product proof exists at all
```

Everything else in the Sep 17 P0 table is either already passing or downstream of these three.

---

## 3 · Sep 17 P0 table, restated with measurement

| Sep 17 P0 item | Sep 17 said | Measured today | Evidence |
|---|---|---|---|
| Product identity update | HOLD | **REFUTED — PASS** | `doctor: identity_pass PASS` |
| Homepage rewrite | HOLD | **REFUTED — copy PASS, behavior RED** | `homepage_pass PASS`, `legacy_matches 0`; `HomePage.test.jsx` 5 failing |
| General onboarding | HOLD | **REFUTED — PASS** | `doctor: onboarding_pass PASS` |
| Flagship deployment lesson | MISSING | **REFUTED — content PASS** | `lessons/deploy-my-first-website.json`, 10 steps, 4 checks |
| Production SHA proof | HOLD | **REFUTED — prod self-identifies** | `citadel-release.json` → 200 JSON, commit `0b9faeb` |
| GitLab pipeline | HOLD | **CONFIRMED** | staging manifest: all `gitlab_*` null |
| Rig 1 deployment control | HOLD | **CONFIRMED** | `doctor`: both environments HOLD on `release.env` |
| Production artifact promotion | P0 | **CONFIRMED** | prod manifest v1, no `artifact_tree_sha256` |
| Tutorials / learning surfaces | PASS SOURCE | **REFUTED — RED** | 24 of 49 test files failing |
| Main CI green | HOLD | `UNMEASURED` | probe: `gh run list` — `gh` absent from PATH on this box |
| Rollback test | HOLD | `UNMEASURED` | probe: `buildanddo_release.py rollback-staging` (gated on `release.env`) |
| Datadog DORA correction | HOLD | `UNMEASURED` | probe: inspect `.github/workflows/datadog-dora.yml` trigger point |
| Classroom live session | NOT DOGFOODED | `UNMEASURED`, **and in flight today** | 1,546 uncommitted lines, `Created: 2026-09-18` |
| Bits/Claude BuildAndDo seat | HOLD BINDING | `UNMEASURED` — creds present | `claude_workseat.env` (Sep 17) holds the 6 expected keys |
| Four Hostinger products | PARTIAL | **CONFIRMED — no artifact exists** | no submission/competition file in the tree |
| Demo video | MISSING | **CONFIRMED** | same |
| Submission package | MISSING | **CONFIRMED** | same |
| Mobile / desktop demo | UNMEASURED | `UNMEASURED` | honest in the original; unchanged |

---

## 4 · Divergence that needs a decision

**Classroom voice/video.** Sep 17 §29 says `DEFER`. As of today there are **1,546 uncommitted
lines** implementing exactly that — Cloudflare Realtime join/publish/subscribe with the
renegotiation leg, plus a PocketBase presence hook — `SRS-CN-PERSONA-RUNTIME-001`, created
2026-09-18:

```
apps/web/src/pages/workspace/ClassroomPage.jsx          455
apps/web/src/lib/classroomRealtime.js                   678
apps/pocketbase/pb_hooks/classroom-presence.pb.js       413
```

Someone is building the thing the sheet says to defer, and it is not committed. With six days
left, either the defer decision is stale or this work is off-plan. It should not stay ambiguous.

---

## 5 · What the Sep 17 sheet got right and should be kept

- **The reframe.** Learn-by-doing for everyone is the correct product identity, and the code
  already agrees — the flagship seed's own `promise` field reads *"Learn by doing real work."*
- **§11's truth ladder** (`attempted ≠ completed ≠ verified`, `receipt ≠ truth`). The flagship
  lesson encodes it as `truth_rule`; the release manifest's null lane fields honor it.
- **§35's north star.**
- **The judgment that submission packaging is real, unstarted, and competition-critical.** It is
  the one MISSING row that measurement confirms rather than refutes.

---

## 6 · Method, and what this sheet does not claim

Run against the live estate, 2026-09-18, seat C-ONE. Instruments:
`tools/buildanddo_release.py {doctor,status}`, live HTTPS readback of both
`/.well-known/citadel-release.json`, the full `vitest` suite plus its JUnit XML, `git` state,
source inspection, and Layer-1 substrate recall over the HTTP transport.

Three traps this run hit, recorded so the next one does not:

- **The `/api` trap.** BuildAndDo's backend base is `/hcgi/platform`, **not** `/api`. Probing
  `/api/*` returns SPA-fallback `200 text/html`, so `response.ok` is true and the surface reads
  as "no backend deployed". Correct probe: `/hcgi/platform/api/health` → `200 application/json`.
- **The 401 trap.** An unauthenticated probe of the memory MCP returns `401`, which reads as
  down. Authenticated, it answers with 234 tools on both the mesh and `mcp.*`. The store was
  healthy throughout; only the session connector was not.
- **The pipe trap.** `npm test | tail` reports `tail`'s exit code, not npm's. A red suite read
  as exit 0 on the first pass here. Exit codes must be taken unpiped, or via `PIPESTATUS`.

Not claimed: that any `UNMEASURED` row is fine; that the flagship is *traversable* (only that it
exists as content and is blocked at step 7); or that production is unhealthy — it serves `200`
on both probes.
