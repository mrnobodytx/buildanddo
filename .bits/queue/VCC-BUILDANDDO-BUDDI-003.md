# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-BUDDI-003.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-BUDDI-003
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-003
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-BUDDI-003.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-BUDDI-003
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that puts Buddi's voice inside the home page, with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-BUDDI-003

**SRS:** SRS-BUILDANDDO-BUDDI-003 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

A visitor can talk to Buddi without leaving the home page. They start it themselves, see what is happening
in words, and get the talk-to link whenever the page cannot use their microphone.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Add `@elevenlabs/react` (operator approved 2026-09-23: MIT, about 16 MB unpacked with its dependencies) | `npm ci` from the updated lock | done |
| 2 | Agent id from the one source; microphone policy check | `vitest run src/components/voice` | done |
| 3 | "Talk to Buddi" section, lazy session, fallback link | same tests | done |
| 4 | The repository's staging container nginx sends `microphone=(self)` (the live hosts: operator step 1) | `node --test tests/upgrade/staging-contract.test.mjs` | done |
| 5 | Build splits the SDK into its own chunk; no leak in the build | `npm run build`, `public_redaction.py scan dist/apps/web` | done, one explained match |
| 6 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `verify_public_boundary.py` | done |

## Operator steps (not performed here)

1. **Production header.** The production host's nginx serves both production and staging. One shared snippet,
   `snippets/security-headers.conf`, sends `microphone=()` for them and for the forum and the wiki. A prepared
   operator script makes the three BuildAndDo hosts send `microphone=(self)` through a map on the Host header,
   and leaves the forum and the wiki as they are.
   - It has a read-only plan mode. The plan ran on 2026-09-23 and nginx accepted the change on a scratch copy.
   - `-Apply` restores the old configuration by itself if any check fails.
   - `-Revert` undoes it.
   - The edge Worker passes the origin's header through, so it needs no change. Its own default still says
     `microphone=()`, which matters only if the origin ever stops sending the header.
2. **Allowed origins: none needed.** The agent has authentication off and an empty allowlist (read
   2026-09-23), so it accepts sessions from any site. That was already true through the public talk-to link.
   Restricting the allowlist to BuildAndDo's hosts is optional hardening. If it is done, test that the
   ElevenLabs talk-to page, which is the section's fallback, still works.
3. **Deploy:** the web build, through the release rail.
4. **Buddi v2:** switch the agent to its v2 workflow after SRS-BUILDANDDO-BUDDI-002 is deployed and its tool
   secret is set.

## Constraints

- Files this dispatch may touch: `apps/web/package.json`, `package-lock.json`, `apps/web/src/lib/voiceAgent.js`,
  `apps/web/src/components/voice/*` and its tests, `apps/web/src/pages/HomePage.jsx`, `apps/web/nginx.conf` and
  its check in `tests/upgrade/staging-contract.test.mjs`, this bookkeeping and the readiness and context locks.
- No key, token or secret in the page or the repository; the agent is public.
- No real machine name or address may enter this repository, including test fixtures.
- Raises the tier: deploy, push, any change to the live agent or to production headers. None is performed here.

## Evidence (2026-09-23, local run on Windows, LF checkout)

- **Tests:** `vitest run src/components/voice` 15 of 15 (`TalkToBuddi.test.jsx` 13, `VoiceChunk.test.jsx` 2).
  `staging-contract.test.mjs` 4 of 4. The whole web suite: 609 of 609 in 70 files. `npm run lint` clean.
- **Controls:** each behaviour was broken once and the tests were run again. All 11 breaks were caught, and
  the tests were green again after each restore:
  - the policy check removed;
  - a different agent id;
  - the SDK imported eagerly;
  - a failed start not reported;
  - End that does not end the session;
  - a chunk failure not caught;
  - Buddi's hang-up not said;
  - the microphone test stream left open;
  - the policy header removed;
  - `microphone=*`;
  - an `add_header` in the document location, which drops the policy.
- **Build:** the SDK is in `VoiceSession-*.js` alone (630 KB, 167 KB gzip). A control build with the base
  home page puts the other two chunks side by side:
  - the entry chunk is 763,185 bytes before and 763,202 after, the 17 bytes being the new chunk's name;
  - the home chunk grows from 59,916 to 65,559 bytes;
  - `index.html` preloads nothing from the voice chunk;
  - a clean rebuild reproduces the same file names.
- **Served build** (vite preview): the section renders right after the front page and fetches no voice code
  before the click.
  - **Refused microphone** (stubbed in the page): the section gives the reason, Try again and the talk-to
    link, and still fetches no voice code.
  - **Granted, with every route to the provider blocked:** the click fetched the voice chunk and nothing
    else. The SDK's only outbound call was the conversation-token request for the published agent, which
    was blocked. The section then said "The voice session could not start." with the SDK's reason and the
    link.
  - No console errors. At 375 px there is no horizontal overflow.
- **No live session was opened.** Every check refused the microphone or blocked the provider. A real
  conversation is the operator's check after steps 1 and 2.
- **Redaction:** the changed sources PASS. The build has one match: the unspecified (all-zeros) IPv4
  address inside the SDK chunk's WebRTC session-description code. It names no machine. The scanner exempts
  loopback but not the unspecified address, and no CI job scans the build.
- **Gates:** all pass.
  - `hostinger_readiness.py --check`: all 12 milestones current.
  - `agent_context.py --check`: the lock matches.
  - `submission_readiness.py --check` passes.
  - `verify_public_boundary.py`: 1,293 files, no failures.

## Findings, not fixed here

- **`/assets/` responses carry none of the server's security headers.** nginx drops every server-level
  `add_header` in a location that declares its own, and `location /assets/` declares `Cache-Control`. So
  scripts and styles are served without `X-Content-Type-Options: nosniff` or `Referrer-Policy`.
  Pre-existing; the document location is unaffected, and the new test pins that.
- **The redaction scanner counts the unspecified (all-zeros) address as an address.** It identifies a
  machine no more than loopback does. Exempting it belongs with the scanner's owner, beside the loopback
  rule.
- **The production host's security headers are not under version control.** `snippets/security-headers.conf`
  sets the headers for four sites and exists only on that host, next to a hand-made backup from 2026-09-22.
  A change there is invisible to review and to this repository's tests. `apps/web/nginx.conf` describes the
  container, not what serves the live sites.
- **Enforcing either CSP would stop the voice session.** The two report-only policies are the edge Worker's
  on the apex and the nginx snippet's on staging. Neither allows `https://api.elevenlabs.io` or
  `wss://livekit.rtc.elevenlabs.io` in `connect-src`. Neither allows the SDK's audio worklet, which loads from
  a `data:` or `blob:` URL. Until they do, voice sessions show up as violations in the report-only stream.
- **The agent keeps recordings.** Its privacy settings, read 2026-09-23, record voice and keep transcripts,
  with zero-retention off. The section says so: "may be recorded".

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] The built page loads no voice code before Start.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
