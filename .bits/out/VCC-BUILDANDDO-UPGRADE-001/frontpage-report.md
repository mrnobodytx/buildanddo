# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/frontpage-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/web/src/pages/HomePage.jsx, apps/web/src/components/editorial/EditorialFrontPage.jsx, .bits/out/VCC-BUILDANDDO-UPGRADE-001/frontpage-validation.json
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/pages/HomePage.jsx; CONSUMES apps/web/src/components/editorial/EditorialFrontPage.jsx; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/frontpage-validation.json
# DAG Node:    none
# Intent:      Record the newspaper front-page implementation and distinguish observed source and layout checks from unavailable rendered acceptance.
# ───────────────────────────────────────────────────────────────

# Newspaper front page — source report

## §1 SUMMARY

Status: PARTIAL — source complete; React and live workspace acceptance are open.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001.
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps.
Tasks: NP1/NP4 source gates pass; NP2/NP3 rendered acceptance remains partial.
Smoke: 4/7; frontend test, lint and build cannot start.
CKS Gate: pending independent review. CKS: pending. CAPS: pending. CK: pending.

The owner requested the three-column newspaper reference in the current colors:
researched news, daily highlights and platform areas. The follow-up adds slow
living engravings, independent vertical reels and a CSS Android phone containing
interactive web content. This pass implements that source scope.

## §2 TASK RESULTS

| Task | Result | Verify |
|---|---|---|
| NP1 — map reference and existing contracts | PASS: current theme, scoped records, research adapter and motion policy reused | `rg -n 'useMissionResearch|EditorialFrontPage|user.id.*active.id' apps/web/src/pages/HomePage.jsx` |
| NP2 — newspaper, reels and phone | PARTIAL: source complete, 16 helper cases pass; 13 authored component cases await Vitest | `node --test tests/upgrade/editorial-frontpage.test.mjs`; `npm --prefix apps/web test -- EditorialReels HomePage` |
| NP3 — responsive and regression evidence | PARTIAL: 48 static layout cases, source checks and available regressions pass; actual application gates unavailable | Commands and method below |
| NP4 — provenance and retained history | PASS: measured context, public boundary and dispatch-memory checks | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` |

The source contract:

- HomePage retains the keyed account/workspace/demo tree, private telemetry mask,
  challenge submission, detailed desks and learning catalogue. The existing
  research hook mounts only in an authenticated workspace; old responses are
  handled by its existing scope guard.
- EditorialFrontPage composes the three columns, dated highlights, retained
  account counts and workspace selector. Public archive reading stays separate
  from completed research. Failed reads expose retry rather than stale cards.
- LivingStill contains the original line engravings within fixed crops. Pans span
  3 percent and zooms span 4 percent over 16–24 seconds for the supplied cards.
  Existing media policy, visibility, local pause and reduced motion govern them.
- VerticalNewsReel has per-instance clocks, manual previous/next/play/pause,
  stable-ID wrap, inactive link exclusion and cancelled timers. Pointer focus
  cannot reverse a Pause click; keyboard entry stops rotation until explicit play.
- AndroidPhoneFrame contains real children, a scrollable screen and no second
  main landmark. Its Explore/Research control and reel are independent of the
  sidebars. It is a web preview, not a released native application.
- editorialContent supplies original-source research selections and real platform
  links; daily selectors exclude future, unavailable and demonstration records.
  No public news service, popularity analytics or customer results are invented.
- editorial.css consumes existing paper/ink/red and dark-theme tokens. Column
  stacking, text-sized reel frames and narrow-container rules retain access to
  links with enlarged text. The illustrations are authored vector drawings.

## §3 SMOKE TEST RESULTS

| Command | Expected | Observed | Result |
|---|---|---|---|
| `npm --prefix apps/web test -- EditorialReels HomePage` | Execute component behavior and existing home regression cases | Vitest is missing; no React cases executed | FAIL |
| `npm --prefix apps/web run lint` | Official ESLint checks | Missing eslint-plugin-import | FAIL |
| `npm --prefix apps/web run build` | Vite application output | Vite cannot be spawned | FAIL |
| `node --test tests/upgrade/*.test.mjs` | Source regression | 361/361 pass | PASS |
| `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Python regression | 293 pass, 18 explicit native skips | PASS |
| `python scripts/ci/agent_context.py --check` | Inventory matches lock | Current inventory; six retained findings and four unwired gates | PASS |
| `python scripts/ci/verify_public_boundary.py` | Public source boundary | 909 files; zero violations; hosted actor label not inspected | PASS |

The three frontend failures are missing installed dependencies, not observed
application test failures. No dependency substitution or gate bypass was used.
Rerun those commands in the normal dependency-equipped environment. Component
coverage, actual React events/routing, native PocketBase and live motion behavior
are not established by the source tests or static previews.

Focused coverage command:
`node --experimental-test-coverage --test --test-coverage-include='apps/web/src/lib/editorial*.js' --test-coverage-lines=80 --test-coverage-functions=80 --test-coverage-branches=80 tests/upgrade/editorial-frontpage.test.mjs`.

Observed: 16/16 pass; both helper modules have 100 percent lines/functions.
editorialContent has 98.25 percent branches; editorialReel has 100 percent.
The initial direct Node import failed because the relative extension was absent;
adding .js corrected the import and all cases passed.

Limited source diagnostic:
`node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`.
Observed: 266 modules parsed, zero reported syntax/binding errors. This does not
replace official lint, component testing or an application build.

Browser layout method: actual JSX evaluated with static hook/router/icon
adapters, actual scoped CSS, existing theme variables and fallback fonts.
Temporary navigation chrome provides page context. Chrome measured public and
long-title workspace fixtures in both themes at eight widths (320–1440 px), plus
four widths at 200 percent root text size: 48 cases. No fixture is a live record.

The enlarged-text run initially failed 16/48 cases: fixed pixel frame heights
clipped links and large controls/masthead content overflowed. Frames now scale
with text, bounded controls wrap, and narrow columns give enlarged copy their
full width. The final run passes 48/48; CSS reduced-motion suppression also passes.
The phone screen can scroll rather than hide content. Static adapters do not
execute application event handlers, theme persistence or provider reads.

Retained measurements, exact commands/timestamps and source fingerprints:
`.bits/out/VCC-BUILDANDDO-UPGRADE-001/frontpage-validation.json`.
Session-only reproduction: `node /tmp/buildanddo-frontpage-preview.cjs`, serve
`/tmp/buildanddo-frontpage-preview` on port 4320, then run the saved browser script
`/tmp/buildanddo-frontpage-layout.js` using playwright-cli. These temporary tools
are design diagnostics; they are not a replacement application shipped in the PR.

## §4 MEMORY INGEST

Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
Type A count: 591. Type B count: 1253. Type C count: 114.
All 111 prior Type C events are retained exactly.
IOO compliance and DKG orphan status are checked by
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## §5 CKET FILING

- 07_BUILD: seven new JavaScript/JSX modules, one scoped stylesheet; HomePage integration.
- 08_TEST: one Node source suite and one React component suite.
- 04_HYPOTHESIZE: existing SRS continuation.
- 11_COMMIT: report and validation record/sidecar; existing dispatch, context and memory.

New files carry CGRF headers (the JSON record has its sibling header). Header
relationships are the source of memory edges. REFLEX is deferred to post-merge;
CK, CAPS and CKS remain pending.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. License posture: unchanged.
Authority: existing A2 source dispatch; actor:agent.
Public boundary/secret-pattern scan: no violations in the completed check.
Stripe mode: not applicable. No checkout, credential, database migration, provider
write, deployment control, canonical domain or external seat message changed.

Rollback: restore the preceding HomePage composition and remove the new editorial
components/helpers and their tests together; refresh derived context and memory.
No backend migration or data deletion is required. Earlier account access,
knowledge assembly and DORA behavior are independent of this front-page change.

## §7 NEXT ACTIONS

Run the 13 authored component cases, existing HomePage tests, official lint and
Vite build with normal dependencies. Verify both themes, keyboard reading,
independent rotation, source switching, phone tabs and account/workspace changes
in the actual app before deployment. Native workspace checks need an authorized
test account. A live public news feed and measured popularity source remain
operator choices; the delivered public reel clearly identifies archive reading
and the platform reel identifies editorial selections.
