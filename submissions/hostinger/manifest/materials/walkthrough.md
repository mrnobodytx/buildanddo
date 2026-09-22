# Walkthrough

The platform as a member experiences it, with the reviewable artefact each step leaves behind.

## Joining a workspace

A new account completes onboarding atomically: retrying, or opening a second tab mid-setup, creates
**one** workspace, not two. Signing out and back in restores the same workspace. Every record the
member creates from then on carries their workspace, and the backend rule
`@request.auth.id = owner` is what enforces that — not the interface.

*What to look at:* authenticate as two members, list the same collection, observe disjoint sets. A
foreign-workspace write is rejected by the backend even when the request is well formed.

## Taking on a mission

Missions are the unit of work: a plan, bounded actions the platform will actually execute, and
evidence slots. A draft that has not been approved stays a draft — approval and completion are
separate states, and the platform will not let one stand in for the other.

Educational rewards attach to answers that are *checked*, not answers that are submitted. A rejected
answer earns no credit; a corrected one does, and the learner keeps their working.

*What to look at:* the mission flow tests cover exactly these distinctions — incomplete drafts
versus saved approval, and credit that follows correctness rather than submission.

## Running a workflow

Workflows are definitions a member composes and the platform runs. Deleting one asks first, and
refuses when execution history depends on it, because that history is evidence and evidence is not
collateral damage.

*What to look at:* the live agent working loop, workflow `nb90a4jf6t1uqrr`, is a ten-step workflow
proven by a governed run whose replayed revision was correctly refused with a 409 — the platform
declined to let a replay masquerade as a new result.

## Sitting in a classroom

Classrooms are live rooms carrying audio and video over Cloudflare Realtime, with membership,
presence and messages held in the platform's own database rather than in the transport. That split
matters: the SFU moves packets, but the durable record of who was in the room belongs to us.

Media is proven end to end — 453 frames pulled back through the platform route on staging, with a
control track that returned zero frames, so the number means something rather than merely being
large. The publisher allowlist is a deliberate fail-closed default: `publishers_configured: 0` means
nobody is authorised, not that the feature is broken.

*What to look at:* `/api/classroom/health` on each environment. Staging is configured, production is
not, and both say which.

## Filing evidence

Every artefact the platform produces — an acceptance receipt, a migration preflight, a disclosure
scan — carries state from one frozen vocabulary, so a state written by one component is a state
another can trust.

The distinction that carries the most weight: a check that was meant to run and did not is
`NOT_TESTED` and `UNMEASURED`; a check that ran with nothing of its kind to test is `NOT_APPLICABLE`
and `OBSERVED`. Both may report zero tests and zero failures. Without the state they are
indistinguishable, and a reader would be free to treat a hole as health.

`VERIFIED` is never written by a tool that has no verification receipt to cite, and a declaration
that contradicts the numbers beside it is itself reported as a defect — so writing the field cannot
become a way to silence the checker.

## Watching the platform mark its own homework

The 21-day build is tracked exactly the way a member's work is: twelve milestones, each citing
commits and files, re-read by a replay tool that prints the gap between claim and reality. It
currently reports 0.0% overstatement with two milestones openly unverified.

During this build the replay caught us out once, which is the best argument for it. Resolving a
double-booked milestone moved one piece of work to a new day, and the ledger was left claiming that
day's predecessor as verified on evidence that described the work that had moved. The replay made
that visible; the claim was moved to the day it actually describes and the vacated day returned to
planned.
