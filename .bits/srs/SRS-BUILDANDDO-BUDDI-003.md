# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-BUDDI-003.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-BUDDI-003
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-003
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/web/src/lib/communityLinks.js, apps/web/src/pages/HomePage.jsx, apps/web/nginx.conf
# EnumType:    Doc
# EnumEdges:   GOVERNS apps/web/src/components/voice/TalkToBuddi.jsx; GOVERNS apps/web/src/lib/voiceAgent.js;
#              GOVERNS apps/web/nginx.conf
# Intent:      Put Buddi's voice inside the home page with the official SDK, started by the visitor, and say
#              in words whenever the page cannot use the microphone.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-BUDDI-003 — Talk to Buddi on the home page

## Why this exists

Operator direction (2026-09-23): wire the ElevenLabs agent, Buddi, into the main page as the embedded,
professional setup rather than a link to ElevenLabs' own talk page. Today the site only links out
("Talk to our agent", SRS-BUILDANDDO-COMMUNITY-WEB-001), and an in-page session could not work anyway:
the live site sends `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

Measured 2026-09-23:
- On the production host, one shared nginx snippet sets that header for production, staging, the forum
  and the wiki. The snippet is not in this repository.
- The edge Worker passes the origin's header through, and would set the same default if the origin sent
  none.
- The repository's staging container nginx sends none.
- The live Content-Security-Policy is report-only, so it blocks nothing.

## Requirements

1. **R1 - started by the visitor.** A "Talk to Buddi" section on the home page. Nothing voice-related loads
   until the visitor presses Start: the SDK is its own chunk, fetched on that click.
2. **R2 - the official SDK and the published agent.** The session uses `@elevenlabs/react` (MIT,
   ElevenLabs). The agent id is read from the voice-agent link in `communityLinks.js`, the one source for
   community links, so the page and the link can never name different agents. The page holds no key.
3. **R3 - every state in words.** Starting, connecting, listening, speaking and ended are said in text
   as well as shown. Mute and End are real buttons, reachable by keyboard.
4. **R4 - never a dead button.** When the page cannot use the microphone, the section says why and offers
   the talk-to link instead. The causes are the page's permissions policy, a refused prompt, no device, or a
   session that fails to start. A policy that blocks the microphone is detected before anything loads,
   where the browser can tell.
5. **R5 - the header, where this repository owns it.** The staging container's nginx sends
   `Permissions-Policy: camera=(), microphone=(self), geolocation=()`: the microphone for this site only,
   nothing for frames or other origins.
6. **R6 - tests that fail without the behaviour.** With the SDK mocked:
   - nothing loads before the click;
   - the session starts with the published agent id;
   - a blocked microphone shows the link and starts nothing;
   - a failed start shows the link;
   - End stops the session;
   - a voice chunk that cannot load is reported, not thrown at the page;
   - the staging nginx sends the policy, and the document location does not drop it.

## Non-goals

- Deployment.
- The production host's nginx and the edge Worker's default header. These are operator steps, listed in the
  dispatch.
- Any change to the ElevenLabs agent: its allowed origins, and the switch to Buddi v2 after
  SRS-BUILDANDDO-BUDDI-002.
- Sending account or workspace context to the agent.
- Recording audio.

## Verification

```bash
npm --prefix apps/web exec -- vitest run src/components/voice
node --test tests/upgrade/staging-contract.test.mjs
npm run lint
npm run build
python scripts/ci/public_redaction.py scan dist/apps/web
python scripts/ci/verify_public_boundary.py
```
