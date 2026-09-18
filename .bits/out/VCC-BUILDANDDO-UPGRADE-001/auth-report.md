# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/auth-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/web/src/components/auth/AuthLayout.jsx, apps/web/src/pages/LoginPage.jsx, apps/web/src/components/auth/auth.css, apps/web/src/components/auth/__tests__/LoginPage.test.jsx
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/components/auth/AuthLayout.jsx; CONSUMES apps/web/src/pages/LoginPage.jsx; CONSUMES apps/web/src/components/auth/auth.css; CONSUMES apps/web/src/components/auth/__tests__/LoginPage.test.jsx
# DAG Node:    none
# Intent:      Record the editorial account-access changes, observed source and layout evidence, and outstanding React and live-auth acceptance.
# ───────────────────────────────────────────────────────────────

# Editorial account access — source report

## §1 SUMMARY

Status: PARTIAL — source complete; rendered application acceptance remains open.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001.
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps.
Tasks: AU1/AU4 source gates pass; AU2/AU3 runtime gates remain partial.
Smoke: 4/7 pass; three frontend gates cannot start.
CKS Gate: pending independent review. CKS: pending. CAPS: pending. CK: pending.

This owner-requested continuation redesigns login and shared signup/recovery
presentation, preserving the existing editorial palette and auth contracts.
The prior DORA and knowledge changes remain intact. The broader classroom,
canonical-domain and private-fabric proposals are separate scopes.

The supplied review reports Candidate-to-GitLab and Evidence-Epoch failures on
main at d0ed18d2. These are operator-reported baseline observations, not checks
remeasured here. The local dependency failures below are separate observations;
neither cause nor repair of hosted CI is inferred from this auth work.

## §2 TASK RESULTS

| Task | Result | Verify |
|---|---|---|
| AU1 — inspect current auth and brand | PASS: native auth, shared shell, theme tokens and safe return destination identified | `rg -n 'login\(|workspaceDestination|AuthLayout' apps/web/src/pages/LoginPage.jsx apps/web/src/pages/SignupPage.jsx` |
| AU2 — editorial auth and usable sign-in | PARTIAL: source complete; 16 component cases await Vitest | `npm --prefix apps/web test -- LoginPage` |
| AU3 — responsive and contract checks | PARTIAL: 36 static layout cases and 20 classroom cases pass; actual React/browser/auth unavailable | `node --test tests/upgrade/classroom-client.test.mjs tests/upgrade/classroom-system.test.mjs` |
| AU4 — evidence and retained memory | PASS: current context, public boundary and memory; all 108 prior events retained | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` |

### Local file contract

This table records the bounded source edits. It is not a platform_edit_fabric
EditContract: that private generator is not available in this repository session.

| File | Result and preserved boundary |
|---|---|
| `apps/web/src/components/auth/AuthLayout.jsx` | B&D masthead, learning illustration, account card, existing theme control and public classroom/docs links. Retain a single main landmark, noindex and child/footer contract. |
| `apps/web/src/components/auth/auth.css` | Scoped typography, paper illustration, double rules, form sizing, responsive composition and reduced motion. Consume existing light/dark tokens and Newsreader/Inter/IBM Plex Mono stacks. |
| `apps/web/src/pages/LoginPage.jsx` | Password reveal, email guidance, linked errors, first-invalid-field focus and pending-state input locking. Preserve native login, email trimming, error recovery and workspaceDestination. |
| `apps/web/src/components/auth/__tests__/LoginPage.test.jsx` | Six new behavior cases plus stronger existing error/busy assertions: visibility, keyboard validation, recovery, signup round-trip intent and unsafe return rejection. |
| SRS, dispatch, context lock, report and memory | Retain authority/history and record observed results and acceptance gaps. |

SignupPage and ForgotPasswordPage consume the shared shell; their account
creation, onboarding, password policy and reset requests are unchanged. Classroom
backend policy, presence, receipts, schema and telemetry are unchanged.

## §3 SMOKE TEST RESULTS

| Command | Expected | Observed | Result |
|---|---|---|---|
| `npm --prefix apps/web test -- LoginPage` | Execute 16 auth component cases | `vitest: not found`; zero cases executed | FAIL |
| `npm --prefix apps/web run lint` | Repository ESLint check | Missing `eslint-plugin-import` | FAIL |
| `npm --prefix apps/web run build` | Vite application build | `spawnSync vite ENOENT` | FAIL |
| `node --test tests/upgrade/*.test.mjs` | Source regressions pass | 345/345 pass | PASS |
| `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Python regressions pass with explicit native skips | 311 discovered; 293 pass, 18 skip | PASS |
| `python scripts/ci/agent_context.py --check` | Inventory matches lock | Matches; six retained findings, four unwired gates | PASS |
| `python scripts/ci/verify_public_boundary.py` | Public source/secret-pattern scan clean | 896 files; zero violations; actor label not inspected | PASS |

All three frontend failures occur before execution because the installed
dependencies are absent. No network installation, dependency replacement or
gate bypass was used. Rerun those same commands in the normal dependency-equipped
checkout. Component coverage and the 80% new-code target are not claimed.

`node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` parses 258 modules
with zero reported errors. Its initial missing mock binding in the pending-request
test was corrected before the passing run. This is a limited syntax/binding
diagnostic, not repository lint or a React runner.

`node --test tests/upgrade/classroom-client.test.mjs tests/upgrade/classroom-system.test.mjs`
passes 20/20, including safe classroom destinations, identity revocation, receipt
recovery and telemetry scrubbing, using explicit storage/transport doubles.

The session-only preview at `/tmp/buildanddo-auth-preview` evaluates actual JSX
with static component adapters, the new CSS and a small utility-style adapter.
Chrome checked login/signup/reset in both themes at 320, 390, 700, 768, 1024 and
1440 CSS pixels: 36/36 had no horizontal overflow or off-screen visible controls.
Desktop/mobile screenshots were inspected. These previews use fallback fonts;
they do not run React, Tailwind, routing, theme persistence or authentication.

Session diagnostic: `node /tmp/buildanddo-auth-preview.cjs`; serve with
`python -m http.server 4318 --bind 127.0.0.1 --directory /tmp/buildanddo-auth-preview`.
Measurements: `/tmp/buildanddo-auth-validation/layout-observations.json`.
The temporary preview is design evidence, not a shipped substitute application.

Rendered acceptance remains required using `npm --prefix apps/web run dev`
with normal dependencies: all three routes, both themes, desktop/mobile, keyboard
focus, reveal, pending/error recovery, signup/classroom return paths and reduced
motion. Native PocketBase requires an authorized test account. No live login,
independent verification or production deployment occurred.

## §4 MEMORY INGEST

Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
Type A count: 578. Type B count: 1224. Type C count: 111.
All 108 prior events are unchanged; three events record observed checks here.
IOO compliance: PASS. DKG orphans: 0.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## §5 CKET FILING

- 07_BUILD: new auth.css; existing AuthLayout and LoginPage.
- 08_TEST: existing LoginPage component suite.
- 04_HYPOTHESIZE: existing SRS continuation.
- 11_COMMIT: new report; existing dispatch, measured context and memory.
- 06_PLAN and 13_SAVE: no new files.

Both new files pass the CGRF header audit with declared relationships; the
memory verifier confirms their provenance and edge consistency. REFLEX remains
a post-merge check; CK and grades remain pending.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. License posture: unchanged.
Authority: existing A2 source dispatch; actor:agent.
Public boundary/secret-pattern scan: PASS, zero violations across 896 files.
Stripe mode: not applicable; no checkout work.
This continuation changes no credential, provider, database, external seat event,
domain, CI workflow or production control.

Rollback: restore the shared auth shell, LoginPage and its suite together, remove
the scoped stylesheet, and refresh context/memory. No backend migration or data
deletion is needed. Preserve earlier DORA and workspace knowledge changes.

## §7 NEXT ACTIONS

Run the authored React cases, lint, build and actual browser acceptance in the
dependency-equipped checkout. Independent rendered verification remains a gate
before staging/production. Public domain selection, shared Header/Footer branding,
classroom UX and private-fabric integration are separate scopes. The reported
hosted CI failures and cross-seat audit debt were not resolved by this redesign.
