# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/artwork-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/web/src/components/editorial/Engraving.jsx, apps/web/src/lib/editorialContent.js, apps/web/public/images/editorial/reference-engravings.png.cgrf.yaml, .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/components/editorial/Engraving.jsx; CONSUMES apps/web/src/lib/editorialContent.js; CONSUMES apps/web/public/images/editorial/reference-engravings.png.cgrf.yaml; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
# DAG Node:    none
# Intent:      Record reference fidelity and crop evidence for the artwork correction with explicit frontend execution limits.
# ───────────────────────────────────────────────────────────────

# Reference artwork correction

## §1 SUMMARY

Status: PARTIAL — requested artwork source complete; React acceptance unavailable.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Risk: A2. Actor: actor:agent.
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps.
Tasks: NP5 and NP6 pass; NP7 source/browser checks pass with frontend gaps.
Smoke: 4/7. CKS Gate: independent review pending. CKS/CAPS/CK: pending.
Observed: 2026-09-18T16:02:26.770024+00:00.
Commit reference: `git log -1 --format='%H %s'` after recording this correction.

The previous five vector scenes did not depict the eight supplied reference
subjects. The correction uses native-resolution crops of those exact subjects,
packed into one local PNG mask. Existing theme ink colors the mask; the supplied
sepia paper is not imposed on the site. Eight transparent pixels around each
crop protect the subject during the existing pan/zoom. Layout, copy, source
links, reel controls and motion policy remain unchanged.

## §2 TASK RESULTS

| Task | Result | Verify |
|---|---|---|
| NP5 — reference comparison | PASS: wireless, flight, medicine, automobile, storefront, gears, ship, typewriter recovered from the supplied reference | Inspect the eight source/sprite boxes in the PNG's provenance sidecar |
| NP6 — mapping and rendering | PASS: public columns use their corresponding reference subjects; extra practice uses gears; saved research uses a stable typewriter | `node --test tests/upgrade/editorial-frontpage.test.mjs`; inspect the source-generated comparison preview |
| NP7 — available checks | PASS for source/static checks; React/lint/build unavailable | Commands below; retained logs under `/tmp/buildanddo-artwork-validation/` |

The illustrations are decorative. Their subjects do not change article claims,
represent topic detection, establish platform popularity or identify customers.
Unknown variants use the typewriter. The phone reuses the same per-card mapping.

## §3 SMOKE TEST RESULTS

| Command | Expected | Actual | Result |
|---|---|---|---|
| `npm --prefix apps/web test -- EditorialReels HomePage` | Run actual React behavior | Vitest absent | FAIL |
| `npm --prefix apps/web run lint` | Run repository lint | eslint-plugin-import absent | FAIL |
| `npm --prefix apps/web run build` | Produce Vite output | Vite absent; ENOENT | FAIL |
| `node --test tests/upgrade/*.test.mjs` | Pass source regression | 361 pass | PASS |
| `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Pass available Python regression | 293 pass; 18 explicit dependency skips | PASS |
| `python scripts/ci/agent_context.py --check` | Match measured context | Matches after refreshing the tracked-file inventory | PASS |
| `python scripts/ci/verify_public_boundary.py` | Pass public boundary | 924 files; zero failures | PASS |

The first inventory check failed after the new asset/report became tracked.
Refreshing the lock after staging those files resolved the tracked-file count;
`python scripts/ci/agent_context.py --check` then passed. The six earlier
findings and four unwired gates are retained.

The frontend failures are missing dependencies, also reported by the previous
homepage wave. No dependency, gate or runtime behavior was substituted. Rerun the
same commands in the dependency-equipped environment; live React interaction,
application build and native backend acceptance remain unverified.

Focused selection/reel suite: 16/16 pass. Source diagnostic:
`node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` passes 276 modules.
No new unit tests were added for the decorative artwork replacement.

Browser evidence uses actual JSX with static hook/router/icon adapters, actual
scoped CSS and fallback fonts. It does not mount React or query a live workspace.

- `node /tmp/buildanddo-artwork-preview.cjs` generates local previews;
  `python -m http.server 4320 --bind 127.0.0.1 --directory /tmp/buildanddo-artwork-preview`
  serves them. The source screenshot is a temporary local input.
- `python /tmp/buildanddo-artwork-run-browser.py artwork /tmp/buildanddo-artwork-browser.js`:
  the browser independently decodes both PNGs. All 135,168 source pixels match
  the documented grayscale-to-alpha conversion exactly; all eight tile gutters
  are transparent. Native crop size is 128 by 132 pixels; atlas is 576 by 296.
- The same check samples eight subjects, five motion styles, three frame shapes
  (90x124, 128x152, 198x116), three animation times and both themes: 720/720 cases
  retain the entire crop and a stationary outer frame. Paused CSS and reduced
  motion pass. Theme ink is rgba(26,29,35,0.82) / rgba(235,232,224,0.82).
- `python /tmp/buildanddo-artwork-run-browser.py layout /tmp/buildanddo-frontpage-layout.js`:
  48/48 public/long-title layout cases pass across light/dark, 320–1440 px and
  normal/200% text. No horizontal overflow or clipped source links observed.
- Visual review compared every source crop with its rendered subject, the
  desktop homepage and the mobile dark research column. These are static
  previews, not deployed-site or React-interaction evidence.

Asset SHA-256: 1f5d9de6c7b79deaa41e6ed0b81a46ba2db868b2389e82fe5a768bf404f4e496 (164707 bytes).
Verify: `sha256sum apps/web/public/images/editorial/reference-engravings.png`.
Its sidecar records the source digest, crop boxes, tile boxes and conversion.

## §4 MEMORY INGEST

Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
Type A: 594. Type B: 1259. Type C: 117.
All 114 pre-existing Type C events are retained unchanged. IOO fields are
complete; every file is connected to a declared relationship.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

The first refreshed payload exposed four stale line counts inherited from the
merged baseline (App, Header, WorkspaceLayout and publicPages). Recounting the
existing file vectors resolves that check without changing those source files
or their historical events. The refresh also preserves metadata for the older
context lock, which predates the JSON-sidecar convention.

## §5 CKET FILING

07_BUILD: reference PNG and its provenance sidecar; existing artwork/mappings.
08_TEST: existing reel test fixture uses a current illustration variant.
04_HYPOTHESIZE / 11_COMMIT: existing SRS/dispatch and this evidence report/memory.
New source artifacts follow this repository's application-stage conventions.
PNG provenance lives in its sibling sidecar; the report has a CGRF header.
REFLEX: deferred to the private post-merge validator.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. Existing license posture unchanged.
A2 local public artwork/source only; no external writes, secrets or deployments.
Checkout/payment and Stripe mode: not applicable to this change.
Memory uses pending grades; no CK signature or verification status is minted.
Public boundary and provenance are checked with the commands above.

## §7 NEXT ACTIONS

Run the existing React, lint and build gates with the declared dependencies.
Confirm the animated page in the normal frontend runtime before release.
No new handoff, dispatch or out-of-scope bug is introduced by this correction.
Rollback: restore the preceding engraving component and illustration mappings
and remove the new atlas/sidecar together. No data migration is involved.
