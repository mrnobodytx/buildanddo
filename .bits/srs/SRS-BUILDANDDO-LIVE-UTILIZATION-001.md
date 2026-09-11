# SRS-BUILDANDDO-LIVE-UTILIZATION-001

## Objective
Prove actual BuildAndDo utilization across a room projection, SFU collaboration, experimental MoQ transport, evidence capture, and deterministic content generation.

## Acceptance
1. Systems Room renders measured projection data and does not infer health from absence.
2. Live Experiment Room renders one episode with truth-state labels and evidence references.
3. SFU canary records sessions, sent/received messages, media publish/receive and payload equality.
4. MoQ canary records relay/object counts, ordered sequence and digest equality; remains labeled EXPERIMENTAL.
5. `buildanddo.episode.verified` can produce a draft outbox containing Hostinger project-log, forum, wiki, Discord and lesson artifacts.
6. Content generation cannot publish externally.
7. Provider credentials are read from environment/vault only and never written to receipts.
8. Selftest results are explicitly labeled simulated and cannot promote provider runtime to VERIFIED.

## Authority
A2 bounded sandbox provider resources and local evidence writes. External publishing remains A3 and is out of scope.
