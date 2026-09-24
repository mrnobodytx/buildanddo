# --- CGRF Header ------------------------------------------------
# File:        .bits/handoffs/2026-09-23-bits-codegen-cmax-b-world-events.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     docs/world-events.md, apps/world_twin/capture.py, apps/world_twin/projection.py, .bits/handoffs/2026-09-22-bits-codegen-cmax-b-day21-activation.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/world-events.md; CONSUMES apps/world_twin/capture.py; CONSUMES apps/world_twin/projection.py; CONSUMES .bits/handoffs/2026-09-22-bits-codegen-cmax-b-day21-activation.md
# Intent:      Define receiving identity, authorization, evidence and replay obligations for the connected public world-event compiler without authorizing private runtime activation.
# ----------------------------------------------------------------

# World-event receiving contract

To CMAX-B, IDE1 and the Citadel/CSEG canonical-state owner. This records requested
integration work, not a provider notification, deployment or launched agent.

The public repository now supplies `buildanddo.world-event/v1`, a strict wrapper
over the existing CitadelEvent, and scoped episode/semantic-graph compilation.
The native complete mission export is the first connected producer. Its exact
canonical strings survive JavaScript/Python number and Unicode boundaries.
See `docs/world-events.md` for APIs, fields and the local CLI.

Required receiving work:

1. Authenticate the native account-to-semantic-actor mapping. Preserve human,
   agent, requester and executor distinctions. Neither a matching name nor an
   email is an authenticated CNI identity mapping.
2. Fetch only currently readable native captures under existing PocketBase
   membership and linked-record policies. Retain private originals in Citadel's
   authorized stores. The compiler creates no database or canonical record owner.
3. Derive `ProjectionScope` from current access, explicit event permissions,
   publication consent, age policy and approved entity visibility. Never accept
   scope/policy files from a browser as authorization. Unknown-age/minor public
   projections are withheld by default; deny private trace access separately.
4. Map actual provider observations into existing CitadelEvent fields and opaque
   TraceReference handles. Preserve recorded tenant, mission, correlation,
   release and observation time. Use telemetry SourceKind where there is no
   dedicated canonical provider kind; do not extend the frozen v2 vocabulary.
   Do not invent joins based on approximate timestamps or attach a trace to an
   unrelated mission because its vendor ID happens to match.
5. Resolve actual supporting evidence, authenticate independent reviews, and pin
   complete receipt content through existing ReviewPolicy. A submitted verifier
   ID, PASS label or unkeyed hash is not a trusted review. Observe failed and
   conflicting reviews too. Keep rewards, capability promotion and authority with
   their current owners; this compiler grants none.
6. Validate one authorized native mission -> export -> world events -> episode ->
   graph/view chain against the accepted release. Check replaying the capture does
   not duplicate activity; account/tenant changes and visibility restrictions do
   not reveal foreign events; missing vendor layers remain partial; a changed
   result cannot retain an old review. Re-run the original eighteen acceptance
   profiles and retain actual hosted/native/browser/provider evidence.

PostHog, Datadog, Cloudflare, Ray, NATS and security transport/retention remain
unconnected in this public source change. Nothing subscribes to a private feed,
runs a browser session, deploys containers, mutates a shared world graph or issues
mission approval. Correlated replay is a record of observations, not causal proof
or re-execution. The previous deployment acceptance HOLD remains history, not a
claim that these new bytes are installed.
