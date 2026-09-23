# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-BUDDI-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-BUDDI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/web/src/components/workspace/WorkspaceAssistant.jsx, apps/web/index.html,
#              scripts/publish/activity_publish.py
# EnumType:    Doc
# EnumEdges:   GOVERNS apps/web/src/components/workspace/WorkspaceAssistant.jsx;
#              GOVERNS apps/web/public/manifest.webmanifest; GOVERNS scripts/publish/activity_publish.py
# Intent:      Record three operator directions from 2026-09-22 as one reviewable scope with its
#              verification commands.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-BUDDI-001 — Buddi, the brand mark, and no addresses in public text

## Why this exists

Three operator directions from 2026-09-22, relayed by the C-ONE dispatch:

1. The in-app workspace assistant is called **Buddi**.
2. The site has no working icon. `apps/web/index.html` points the favicon at `/vite.svg`, which
   is not in `apps/web/public/` and so is never deployed. The brand mark - the red square with the
   pulse line the header and social card already draw - exists as files in the community brand kit.
3. No public text carries **any** IP address (IPv4 or IPv6, public or private) or any fleet machine
   name. `scripts/publish/activity_publish.py` publishes every production release to the wiki,
   Discord and Reddit, and its only address rule matched `10.x`.

## Requirements

1. **R1 - presentation-only rename.** Every user-visible string naming the assistant says Buddi,
   and the model instruction names the persona. Routes (`/assistant`), collections
   (`assistant_*`), environment variables (`BUILDANDDO_ASSISTANT_*`), file names and code
   identifiers do not change.
2. **R2 - the wording is pinned.** The component and hook tests assert the new strings, and a
   one-character mutation of the component makes them fail.
3. **R3 - the site serves its own icons.** `/favicon.svg`, `/apple-touch-icon.png`, a theme color
   and `/manifest.webmanifest` (start `/app`, standalone, 192 and 512 icons). CSP and
   Permissions-Policy are not changed; both icons and the manifest are same-origin.
4. **R4 - addresses are withheld, not held.** Every IPv4 and IPv6 literal becomes the black bar
   `**` + eight U+2588 + `**` before any adapter sees the event, and the IPv4 loopback address
   becomes `localhost`. Version numbers, clock times, C++ scope operators, `a::b` and five-part
   dotted numbers pass through unchanged.
5. **R5 - machine names never enter this repository.** The repository is public, so names are
   read at publish time from the private fleet map named by `CITADEL_FLEET_MAP`. Unset means names
   are skipped; set but unreadable holds the release with finding `fleet_map_unreadable`.

## Non-goals

Deployment, pushing, CSP or Permissions-Policy changes, renaming identifiers, routes or
collections, and any change to what the secret, Windows-path and control-plane-host rules do.

## Verification

```bash
node --test tests/upgrade/workspace-assistant.test.mjs
npm --prefix apps/web exec -- vitest run src/components/workspace/__tests__/WorkspaceAssistant.test.jsx
python -m unittest tests.upgrade.test_activity_publish
npm run build
```
