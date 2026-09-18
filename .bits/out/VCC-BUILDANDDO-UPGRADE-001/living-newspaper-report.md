# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/living-newspaper-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/web/src/components/editorial/Engraving.jsx, apps/web/src/components/editorial/LivingStill.jsx, .bits/out/VCC-BUILDANDDO-UPGRADE-001/living-newspaper-validation.json
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/components/editorial/Engraving.jsx; CONSUMES apps/web/src/components/editorial/LivingStill.jsx; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/living-newspaper-validation.json
# DAG Node:    none
# Intent:      Explain the living-picture implementation and separate measured CSS motion from unavailable application acceptance.
# ───────────────────────────────────────────────────────────────

# Living newspaper — picture motion

## §1 SUMMARY

Status: PARTIAL — requested source and CSS motion complete; React acceptance open.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Risk: A2. Actor: actor:agent.
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps.
Tasks: NP8 pass; NP9 source/browser pass; NP10 recorded with frontend gaps.
Smoke: 4/7 after the governance gates below.
CKS Gate: independent review pending. CKS/CAPS/CK: pending.
Commit reference: `git log -1 --format='%H %s'` after recording this continuation.

The reference subjects now move within their pictures. The prior implementation
only animated the outer still with pan/zoom; its initial browser projection had
zero animations inside the SVG. The illustration wrapper is now stationary.
Existing photographs retain their optional pan/zoom, and reel motion remains
independent from picture motion. The exact original atlas remains unchanged.

## §2 TASK RESULTS

| Task | Result | Verify |
|---|---|---|
| NP8 — reference and motion policy | PASS: preserve eight source subjects and existing media activity inputs | Inspect `Engraving.jsx`, `LivingStill.jsx` and `VerticalNewsReel.jsx` |
| NP9 — internal scenes | PASS for observed CSS rendering; four new React cases await the runner | Browser commands below; `npm --prefix apps/web test -- EditorialReels HomePage` |
| NP10 — evidence and regression | Available source/browser checks pass; runtime gaps remain explicit | Smoke table, validation JSON and dispatch memory verifier |

| Illustration | In-picture activity |
|---|---|
| Wireless | Expanding transmission rings and a moving meter needle |
| Flight | A gently moving airframe and attached propeller |
| Medicine | Bubbles, liquid movement and glass reflection |
| Automobile | Wheel spokes and drifting exhaust |
| Storefront | Door movement, window light and reflection |
| Gears | Three independently timed rotating reference cutouts |
| Ship | Hull movement, water, steam and wake |
| Typewriter | Carriage travel, typed lines, typebar and key presses |

All motion uses CSS transforms/opacity in theme ink. Per-instance phases and
subject periods avoid a single synchronized sequence. No frame timer, media
service, external asset request or new runtime dependency is added. The only new
image is a 141,922-byte background atlas repaired locally from the existing ink
atlas. Its sidecar records source/output hashes, repair regions and conversion.
It prevents a stationary duplicate from remaining beneath a moving subject.

The first visual pass exposed cut-edge artifacts. Repairing the underlying
paper and correcting the layer extents removed the duplicate silhouettes;
the subsequent time-sampled checks cover the final layer composition.

Pause propagates to every nested layer through the existing figure activity
state. CSS clocks freeze and resume from their current position. Reduced motion,
disabled media and print render the untouched original reference. Hidden-slide,
hover, keyboard and activity inputs retain the existing React control path;
new component cases cover those inputs but cannot execute in this environment.

## §3 SMOKE TEST RESULTS

| Command | Expected | Observed | Result |
|---|---|---|---|
| `npm --prefix apps/web test -- EditorialReels HomePage` | Execute component behavior | Vitest unavailable; four added cases and the prior suite did not execute | FAIL |
| `npm --prefix apps/web run lint` | Run official lint | eslint-plugin-import unavailable | FAIL |
| `npm --prefix apps/web run build` | Produce the application | Vite cannot start (ENOENT) | FAIL |
| `node --test tests/upgrade/*.test.mjs` | Pass available Node regression | 361 pass | PASS |
| `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Pass available Python regression | 293 pass; 18 native-dependency skips | PASS |
| `python scripts/ci/agent_context.py --check` | Match the repository inventory | Inventory matches; six retained findings and four unwired gates | PASS |
| `python scripts/ci/verify_public_boundary.py` | Pass the public boundary | 929 files; zero failures | PASS |

The three frontend failures reproduce the prior missing-package limitations.
No dependency or gate was removed. Rerun the same commands with the declared
frontend dependencies; no application-build, React-event or live backend result
is inferred. The limited diagnostic `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`
parses 276 frontend modules with no reported errors; it does not replace lint.

Browser method: actual JSX rendered using static hook/router/icon adapters,
actual source CSS and raster assets, fallback fonts, and local Chrome. The
browser tests genuine CSS animation clocks and rendered PNG pixels, including
SVG masks and clipping. React itself and the full application are not mounted.

Session reproduction commands:

- `node /tmp/buildanddo-living-preview.cjs` generates the isolated source gallery
  and public/long-title homepage fixtures.
- `python -m http.server 4321 --bind 127.0.0.1 --directory /tmp/buildanddo-living-preview`
  serves the isolated fixtures.
- `python /tmp/buildanddo-living-run-browser.py motion /tmp/buildanddo-living-browser.js`
  runs the sampled-pixel and CSS clock checks in the living-newspaper browser.
- `python /tmp/buildanddo-living-run-browser.py layout /tmp/buildanddo-living-layout.js`
  runs the retained layout matrix.

Observed: 48/48 scene comparisons (eight subjects, two themes, three picture
sizes: 90x124, 128x152, 198x116) have changing interior pixels between 0 and
1,900 ms. None change their outer three-pixel edge or surrounding gallery pixels;
all wrapper transforms/animations are disabled and all frame rectangles are
stationary. Every subject has active interior layers. In both themes, every
clock pauses and resumes; reduced-motion output is pixel-identical to disabled
media output; print has no internal animation. These are twelve passing control
observations. The 48-case public/long-title layout matrix also passes at 320–1440
pixels, both themes and normal/200 percent text with no overflow or clipped links.

Raw command receipts, comparison counts, control observations, limitations and
SHA-256 fingerprints are retained in living-newspaper-validation.json. The
session harnesses above are temporary review tools, not a replacement for the
repository's normal React tests. Verify retained fingerprints with:

```bash
python - <<'PYVERIFY'
from pathlib import Path
import hashlib, json
p = Path('.bits/out/VCC-BUILDANDDO-UPGRADE-001/living-newspaper-validation.json')
v = json.loads(p.read_text())
for name, digest in v['source_sha256'].items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest, name
assert all(r['fixed'] and not r['outside'] for r in v['scene_comparisons'])
assert all(s['changed'] > 3 and not s['edgeChanges'] for r in v['scene_comparisons'] for s in r['regions'])
assert all(all(r[k] for k in ['stablePause','resumed','disabledStatic','sameStill','reducedStatic','printStatic']) for r in v['controls'])
print('PASS: retained observations and current source fingerprints agree.')
PYVERIFY
```

## §4 MEMORY INGEST

Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json.
Type A: 599. Type B: 1269. Type C: 120.
All 117 pre-existing Type C events are retained unchanged. IOO fields are
complete; no file is orphaned. Verify with:
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## §5 CKET FILING

07_BUILD: existing editorial code/CSS plus the new background PNG and sidecar.
08_TEST: four cases added to the existing component suite.
04_HYPOTHESIZE / 11_COMMIT: existing SRS/dispatch and new report/validation.
All five new artifacts have CGRF or sibling provenance under this repository's
existing application/evidence conventions. REFLEX remains a post-merge check.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. Existing license posture retained.
A2 local public source and review only. Public boundary/provenance checks are
listed above. No secret access, live seat event, deployment or external write.
Stripe/payment mode: not applicable. All grades and CK remain pending.

## §7 NEXT ACTIONS

Run the normal React, lint and build gates with their declared dependencies.
Confirm the full application's motion preferences, visibility and keyboard
controls before release. No new private handoff or out-of-scope fix is included.
Rollback: restore the preceding editorial renderer, wrapper selection and CSS,
and remove the background atlas/sidecar together. No data migration is needed.
