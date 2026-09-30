# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-30-bits-codegen-cmax-b-buddi-activation.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     apps/web/src/components/voice/TalkToBuddi.jsx, apps/web/src/components/voice/VoiceSession.jsx, .bits/srs/SRS-BUILDANDDO-BUDDI-002.md, .bits/srs/SRS-BUILDANDDO-BUDDI-003.md
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/components/voice/TalkToBuddi.jsx; CONSUMES apps/web/src/components/voice/VoiceSession.jsx; CONSUMES .bits/srs/SRS-BUILDANDDO-BUDDI-002.md; CONSUMES .bits/srs/SRS-BUILDANDDO-BUDDI-003.md
# DAG Node:    none
# Intent:      Give the receiving owner concrete candidate, voice, public-tool and post-call acceptance work without treating source repairs as live activation.
# ───────────────────────────────────────────────────────────────

# Buddi website and integration activation handoff

From: BITS-CODEGEN. To: CMAX-B / IDE1 and the private integration owner.
Authority: public A2 source changes only. Live configuration and release require
the receiving human dispatch. Nothing was deployed or activated in this run.

The website now cancels pending microphone and voice-code requests, ignores old
callbacks after cancellation or navigation, and bounds connection startup to 30
seconds. Hang-up waits for confirmation; rejection or a ten-second timeout asks
the visitor to reload. The published agent, lazy loading, consent notice, public
tool routes and bounded telemetry remain the existing integration owners.

## Candidate acceptance

Use Node 22 from `.nvmrc` and the dependencies from `package-lock.json` on the
receiving runner. Run:

```bash
node --test tests/upgrade/public-action-telemetry.test.mjs tests/upgrade/public-api.test.mjs tests/upgrade/staging-contract.test.mjs
npm --prefix apps/web test -- src/components/voice
npm --prefix apps/web run test:coverage -- src/components/voice --coverage.include='src/components/voice/*.jsx'
npm run lint
npm run build
```

The first command passed 143 cases locally on Node 22.17.0, including 23 voice
handler cases. Handler tests use SDK, clock and hook doubles. React/Vitest/Vite
and the SDK are absent here, so rendered execution, component coverage and the
production build remain pending. Verify at least 80% coverage of the new code
with the rendered suite. Do not accept the empty Node VM coverage report as
component coverage.

## Runtime acceptance

1. The release owner installs the reviewed candidate through the existing rail
   and retains the exact artifact and version readback. This file is not release
   permission.
2. The integration owner verifies the five public read routes return the defined
   JSON contract through the edge. An HTTP 200 HTML shell is a failure. Exercise
   the three write tools only under the receiving test authority; keep
   `BUDDI_TOOL_SECRET` and the `x-buddi-tool-secret` header in the server-side
   provider configuration, never in the browser.
3. The website owner confirms the actual response permits the same-origin
   microphone and the enforced browser policy permits the official SDK's
   transport. Source nginx configuration does not prove the serving host's
   headers. Confirm the public agent identity still matches the community link.
4. On desktop and mobile, exercise denied permission, an unanswered prompt,
   Cancel, delayed loading, an interrupted connection, timeout, retry, Mute, End
   and navigation away. Check the browser microphone indicator actually stops,
   including a connection that finishes opening after cancellation. An old
   session must not replace the new session's status.
5. Under the private receiver's existing dispatch, observe one permitted real
   conversation, its tool receipt and its post-call receipt. Retain correlation
   and exact candidate evidence in the owning private plane. Verify signature,
   duplicate handling and data boundaries there; do not add a second receiver or
   publish recordings, conversation content or private evidence here.

The owner's report of 84 supporting-system test passes is attributed context.
It does not establish website validation or current live activation. The
workspace assistant and Firecrawl/n8n bindings retain their separate acceptance
requirements; this voice change does not grant workspace access or verify those
providers.
