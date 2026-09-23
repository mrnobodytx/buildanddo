# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-PUBLIC-REDACTION-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-PUBLIC-REDACTION-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PUBLIC-REDACTION-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/ci/fleet_report.py, scripts/ci/capability_inventory.py,
#              scripts/deploy/roadmap_status.py, apps/web/src/lib/operatorPlane.js
# EnumType:    Doc
# EnumEdges:   GOVERNS scripts/ci/public_redaction.py; GOVERNS scripts/ci/fleet_report.py;
#              GOVERNS apps/web/src/lib/operatorPlane.js; GOVERNS tests/upgrade/test_public_redaction.py
# Intent:      Record the 2026-09-23 direction that nothing the site publishes carries a fleet
#              machine name or an IP address, as one reviewable scope with its verification commands.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-PUBLIC-REDACTION-001 — No fleet machine name or IP address in what the site publishes

## Why this exists

Operator rule (2026-09-22): no public BuildAndDo surface may carry any IP address or any fleet
machine name. Measured 2026-09-23 with the estate's redaction rule over the live site:

1. `https://buildanddo.com/platform-health.json` carries one fleet machine name and no IP address.
   It comes from `scripts/ci/fleet_report.py`, where two GitLab entries say which host the runner is
   on. `activity-status.json`, `roadmap-status.json` and `capabilities.json` carry none.
2. The site bundle ships a fleet machine name. `apps/web/src/lib/operatorPlane.js` uses one as a
   system id and as its label on the Operator page.
3. The rule lives outside this repository, so nothing in this repository's build checks what the
   build publishes. The repository's own disclosure scan rates a machine name as a warning, not a
   block, and never looked at `platform-health.json`.
4. At `da1b57f`, 33 tracked files name a fleet machine (scripts, docs, migrations and test
   fixtures). They are this repository's own public text; see Non-goals.

## Requirements

1. **R1 - one rule in this repository.** `scripts/ci/public_redaction.py` finds and redacts IPv4 and
   IPv6 addresses and fleet machine names with the estate's boundaries. In published text, loopback
   becomes `localhost` and everything else becomes a solid bar. This repository carries name
   *families* only, never a real machine name. The exact fleet list is read at run time from the
   private map named by `CITADEL_FLEET_MAP`. When it is unset, only the families apply, and the
   report says so.
2. **R2 - the generators publish nothing that matches.** The platform entries in `fleet_report.py`
   name no host. `fleet_report.py`, `capability_inventory.py` and `roadmap_status.py` pass every
   public document through the rule before writing it. Each prints how many values it withheld,
   never which.
3. **R3 - the bundle names no machine.** `operatorPlane.js` uses a neutral system id and label. A
   comment in `publicPages.js` no longer names a machine.
4. **R4 - a test that fails before the fix.** `tests/upgrade/test_public_redaction.py` builds
   `platform-health.json` and scans it, the web source that can ship, and the built site
   (`dist/apps/web`) with the rule. Controls plant a family name, an exact name through a fake map,
   and an IP address, and prove each is caught. SVG geometry, and a loopback hostname comparison in
   code, are not flagged.

## Continuation (2026-09-23): a name joined into a slug

The first version of the rule counted a hyphen as part of a name, so a machine name joined into a slug
passed it. A handoff file named `...-codegen-<machine>-broadcast-...`, and a shipping source header naming
its seat `<machine>-release`, both went unflagged.

5. **R5 - a name joined into a slug is still that machine.** For the specific families (`ray-`, `kvm`,
   `rig`, `srv`, `DESKTOP-`, `CNI-SERVICE-BOX-`) and for every exact name from the private fleet map, a
   hyphen separates the name from the words around it. The broad `mesh-` family keeps the hyphen as part
   of the word, so a compound word that merely contains it (`capability-mesh-fallback`) is not flagged.
   A test fails on the previous rule and passes now, and the near-name control still holds.
6. **R6 - the shipping source that the stricter rule catches is corrected.** `useRoomsLive.js` names its
   seat, not a machine, in its header.

## Continuation (2026-09-23): the unspecified address

PR #85 (SRS-BUILDANDDO-BUDDI-003) added the ElevenLabs voice SDK. Its session-description code carries the
unspecified IPv4 address, the all-zeros one, which a WebRTC offer uses before any candidate is known. A scan
of the built site therefore failed on one address in the voice chunk, where the build had been clean before.
The all-zeros address means "no particular address": like loopback, it identifies no machine. A scan that
fails on every build teaches everyone to ignore it.

7. **R7 - a scan lets the unspecified address through, as it does loopback.** With the scan allowance,
   `find_ips` reports neither loopback nor the all-zeros IPv4 address, and neither do `scan_tree` and the
   `scan` command. The exemption is named for what it is (`UNSPECIFIED`). Without the allowance both are still
   reported, and `redact()` is unchanged, so a published document still withholds the address.
8. **R8 - every other address is still caught.** The documentation address 203.0.113.9, in the same place,
   still fails the scan. The new test fails on the previous rule and passes now.

## Non-goals

- The 33 tracked files that name a machine in scripts, docs, migrations or test fixtures, and the
  already published git history. They need their own dispatch; a commit cannot change history.
- Changing what the estate's rule matches.
- Deploying, pushing, or any external write.

## Verification

```bash
python -m unittest tests.upgrade.test_public_redaction
CITADEL_FLEET_MAP=<path to the private fleet map> python -m unittest tests.upgrade.test_public_redaction
npm --prefix apps/web exec -- vitest run src/pages/workspace/__tests__/OperatorPage.test.jsx
npm test
npm run build
python scripts/ci/verify_public_boundary.py
```
