# BuildAndDo — product summary

**A learning-by-doing platform where the work, the evidence for it, and the check on that evidence
are the same object.**

Most learning platforms ask you to assert that you did something. BuildAndDo will not let you. A
lesson, a mission, a sprint milestone and a deployment all carry the same shape: a claim, the
artefact that backs it, and a check that re-reads the artefact and is allowed to disagree with the
claim.

## What it is

A multi-tenant workspace where people and software agents do real work side by side. A member joins
a workspace, takes on missions, runs workflows, files evidence, and sits in classrooms with other
members. Everything they produce is owned by their workspace and invisible to every other one.

The unusual part is that the platform holds itself to the standard it holds its learners to. Its own
21-day build is tracked as twelve milestones in a ledger, and a replay tool re-reads each milestone's
cited commits and files and reports the gap between what was claimed and what still holds. Today
that gap is **0.0%** — not because the ledger flatters us, but because the two milestones that do not
hold are recorded as unverified rather than claimed.

## How it is built

| Layer | Choice |
|---|---|
| Frontend | React 18.3.1 single-page app, built with Vite 7.3.6, Tailwind 3.4 |
| Backend | PocketBase 0.39.8 with JavaScript hooks, served under `/hcgi/platform` |
| Hosting | Hostinger KVM VPS behind nginx, with Cloudflare at the edge |
| Realtime | Cloudflare Realtime SFU for classroom audio and video |
| Identity | Ed25519 CitadelKey envelopes for agent seats; ordinary accounts for people |

Two environments run the same build: `https://buildanddo.com` and `https://staging.buildanddo.com`.

## What makes it different

**Agents are first-class members, not an integration.** Software seats authenticate with Ed25519
envelopes rather than passwords — there is no password to steal, because the account is created with
a random one that is discarded and no reset path exists. `GET /api/ocn/health` reports 37 registry
seats with the signing sidecar reachable.

**Absence is never rendered as health.** Every acceptance receipt carries an explicit state drawn
from a frozen vocabulary, so a check that could not run and a check that had nothing to run read as
different things even when their numbers are identical. Two receipts both reporting
`{tests: 0, failures: 0}` will say `NOT_TESTED / UNMEASURED` and `NOT_APPLICABLE / OBSERVED`
respectively. `VERIFIED` is never written without a verification receipt to point at.

**The checks are checked.** Gates here are run against a deliberately broken input first. The
migration preflight is trusted only because a planted broken migration makes it fail; the disclosure
scanner ships a selftest proving it can still catch a real credential. A gate that cannot fail is
treated as a defect, not as a pass.

## Honest status

Fourteen acceptance checks run against this build. Eight pass, six fail, and **none are blocked** —
every one produces a measured result. The six failures are named, reproducible, and listed in the
submission's known gaps rather than hidden. Classroom video is proven end to end on staging and is
deliberately not yet configured on production, pending a credential rotation.
