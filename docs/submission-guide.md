# ─── CGRF Header ───────────────────────────────────────────────
# File:         docs/submission-guide.md
# Stage:        06_PLAN
# SRS:          SRS-BUILDANDDO-UPGRADE-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-21
# Depends:      .bits/submission-policy.json, .bits/hostinger-readiness.json, scripts/ci/submission_readiness.py, scripts/ci/day21_submission.py, docs/business-execution.md, docs/workspace-assistant.md
# EnumType:     Doc
# EnumEdges:    DEPENDS_ON .bits/submission-policy.json; DEPENDS_ON .bits/hostinger-readiness.json; DEPENDS_ON scripts/ci/submission_readiness.py; DEPENDS_ON scripts/ci/day21_submission.py; DEPENDS_ON docs/business-execution.md; DEPENDS_ON docs/workspace-assistant.md
# DAG Node:     none
# Intent:       Define provisional submission rules, exhaustive checkpoint acceptance and a verifiable owner-reviewed entry package.
# ───────────────────────────────────────────────────────────────

# Governed day 1–21 submission

The provisional rules in `.bits/submission-policy.json` are internal acceptance
standards requested by the owner. They are not official Hostinger or BuildAndDo
competition terms. Eligibility, entry deadline/time zone, required host, judging
criteria, permitted AI use and submission method remain unknown until an actual
organizer source is captured and reviewed. September 29 in the internal sprint
plan is not an asserted competition deadline.

## Internal entry rules

Submit one working, bounded small-business journey with current evidence. Every
advertised feature must have an executed acceptance result on the submitted
candidate. Distinguish source tests, rendered browser tests, native backend tests,
deployed observations and independent verification. A failed/skipped/unavailable
check never becomes a pass because code was merged or a document was refreshed.

Use demonstration data that the operator has rights to use; obtain consent for
any real-person data. Keep secrets, private deployment controls and raw private
exports outside the public entry. State the role of AI, the model/provider used
and material limitations. Preserve original source/license attribution. The
current README states a proprietary license posture; this work does not change
that posture or invent redistribution permission. Rights and any required
competition license need owner review against the actual terms.

Approval precedes effects. Each workflow has frozen inputs, bounded execution,
reviewable outcomes, retry recovery and a compensation path. Human authority
controls stay separate from assistant inference. A distinct verifier reviews the
producer's exact result. No automatic form submission, deployment, external
message, billing change or invented success claim is authorized by this guide.

## The eleven checkpoints

| ID / day | Source behavior implemented | Required deployed acceptance |
|---|---|---|
| HS-01 / 1 | Required source, web, native and source-fingerprint gates; submission policy required in CI | Jobs actually execute; same candidate/artifact is installed and read back |
| HS-02 / 3 | Atomic onboarding with durable account/input retry identity; account-scoped UI | Fresh signup, setup retry/concurrency, logout/login and actual password recovery |
| HS-03 / 5 | Locked protocol stores, native membership/record rules, retained down-migrations | Both declared PocketBase versions, installed schema, restart and role-revocation denial |
| HS-04 / 7 | Worker-backed source capture, exact text digest, signal deduplication and proposal snapshot | Actual permitted source reaches one durable proposal after response-loss retry |
| HS-05 / 9 | Native ERP effect and registered external jobs with bounded leases/dispatch/HOLD | Actual approved business effect; revoked scope cannot dispatch; uncertainty never causes a blind retry |
| HS-06 / 11 | Frozen executable workflow steps, human checkpoint, atomic run/evidence events | Approve, execute, fail, cancel, reconcile and resume without duplicate effects |
| HS-07 / 13 | Firecrawl/n8n worker adapters, current-revision health and read-only receipt reconciliation | Both live bindings work; stale/disabled/unavailable paths retain their true state |
| HS-08 / 15 | Objective/contact/task editing and executed-task mission/evidence references | Browser create/edit/link/reload, foreign relation rejection and inspected business outcome |
| HS-09 / 17 | Exact reviewed evidence snapshots and immutable execution/review receipts | Producer differs from verifier; source/artifact/provider captures reconcile |
| HS-10 / 19 | Correct review dates/error states, eight working specialist links, personal assistant and knowledge graph | Accurate edition and real assistant request → reviewed form action → native result, with tenant/account isolation |
| HS-11 / 21 | Retained execution replay, native receipt/release comparison, owner-reviewed submission manifest | Full real journey and eleven decisions plus materials and captured official-rule review |

`.bits/hostinger-readiness.json` remains the source/check/dependency/owner contract.
The operational percentage is projected only from independently reviewed evidence.
Local fixture successes cannot fill runtime or official-rule gaps. Living Rooms
now offers source-backed workspace projections and meaningful inspect, operate,
teach and receipt-replay modes; estate projections are separately published data.
Missing estate feeds remain unavailable. Private fleet/NXC connections, voice/video,
automated social publishing and live policy delivery are not advertised as active
by this entry. If added to the submitted promise, each needs its own real acceptance.

## Evaluator journey

Use a staging workspace and three distinct authorized identities: proposer,
worker/producer where applicable, and verifier. For the first bounded business
action, create an ERP follow-up task; separately demonstrate the registered n8n
operation and Firecrawl connector required by HS-07. The receiving owner supplies
the actual operation, allowed public source and data rights.

1. Sign up or use an operator-provisioned evaluator account. Create a workspace
   without a website or select a domain for analysis only. Repeat a lost setup
   response and confirm the same workspace. Domain selection is not ownership.
2. Capture the permitted source in Signals. Inspect its saved source reference;
   propose the mission and complete its independent-review plan.
3. A human approves the plan and starts work. Create/start a workflow with the
   first approval checkpoint and one bounded Execute step. Inspect frozen input.
4. Complete the checkpoint, execute and inspect the native task/provider receipt.
   Exercise a deliberate controlled failure with separate fixture/test scope,
   then verify the recovery path. Do not intentionally break production.
5. Have the verifier inspect the exact evidence and record four TEVV observations.
   Attempt an unauthorized evidence rewrite and verify denial. Open ERP, the
   Daily Edition and the operator snapshot to read the same outcome.
6. Open Assistant on ERP, request help preparing a follow-up, review its proposed
   steps, apply them and confirm the native saved result. Inspect personal
   session knowledge, switch accounts/workspaces and confirm isolation. Observe
   a missing provider or rejected control as an unavailable/failed state.
7. Export the real execution receipt page and the ordered capture. Run the local
   validators, inspect every blocked requirement and retain the independent review.

Existing learning/classroom acceptance remains required where included in the
journey: resume checkpoints, grading, certificate/credit exactly once, lesson and
text-discussion isolation. A certificate of lesson completion is not a verified
business outcome or professional qualification.

## Commands and captured entry package

After source review and in a provisioned acceptance environment:

```bash
python scripts/ci/submission_readiness.py --check
python tests/upgrade/check_sprint_execution.py
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/hostinger_readiness.py --run all --runtime package
python scripts/ci/hostinger_readiness.py --run all --runtime compose
```

The runtime versions come from the repository package and compose declarations.
Do not treat a local missing binary or missing frontend package as a passing gate.
The CI source checks and native matrix retain failures. Praxis live-backend
acceptance and actual release/controller readback remain separate receiving work.

Prepare a new ignored output directory for the selected exact revision:

```bash
python scripts/ci/submission_readiness.py --prepare state/submission/new-candidate --candidate <full-candidate-sha>
```

Preparation creates a draft only. Populate six material references:
`product_summary`, `evaluator_journey`, `walkthrough`, `license_and_attribution`,
`privacy_and_permissions`, and `rollback_and_support`. Each reference is a local
nonempty file with `{path, sha256, observed_at}`; the validator hashes exact bytes
in bounded chunks, including videos up to 1 GB. Keep private originals private.
A sanitized export must identify that it is a redacted derivative and must not
invent a provider attestation.

The manifest also requires `candidate_evidence`, a content reference to the
Day-21 `candidate-evidence.json` index. This joins the existing packaging and
final readiness paths: owner milestone decisions alone cannot replace browser
observations or the four separately observed product proofs.

Run acceptance on the selected committed revision. New check receipts retain
the revision and whether source remained unchanged; local dirty-tree results
remain useful diagnostics but cannot establish candidate acceptance. Older
receipts without that binding must be rerun for final submission.

```bash
python scripts/ci/day21_submission.py acceptance --root . \
  --acceptance state/hostinger/acceptance --candidate <full-candidate-sha> \
  --evidence state/submission/new-candidate/day21
python scripts/ci/day21_submission.py templates \
  --evidence state/submission/new-candidate/day21
```

The exporter preserves all observed check history, including later failures,
and copies the actual JUnit/build artifacts. Missing or failed profiles produce
a HOLD summary. Templates are unmeasured input descriptions; they do not fill
any proof requirement. Populate them with authorized captures:

- Every public URL, browser and product document carries the exact candidate,
  reviewed source fingerprint and artifact-tree digest from the release capture.
- Public URL evidence retains its response body as `body: {path, sha256,
  observed_at}`. Browser evidence retains its URL, console log reference and six
  ordered steps: public entry, auth, challenge, mission, evidence, operator readback.
  Screenshots must be captured during that journey; console errors remain HOLD.
- Each Hostinger product needs its own observed evidence. One repeated proof
  cannot stand in for four product uses.
- `demo-replay.json` retains the existing replay result and a `capture` reference
  to its raw capture manifest. The auditor revalidates the full release and
  execution chain; a written `CONSISTENT_CAPTURE` label cannot replace it.
- Architecture and build-journey documents reference actual dated source evidence.
  Official dates come from the separately reviewed organizer capture.

```bash
python scripts/ci/day21_submission.py audit --root . \
  --evidence state/submission/new-candidate/day21 --json
python scripts/ci/day21_submission.py index \
  --evidence state/submission/new-candidate/day21
```

Reference that new index in `submission.json` using the same content-reference
format as the materials. The final audit checks every pinned document and its
underlying bytes, the actual named acceptance profiles, the shared candidate
and artifact identities, the observed demo URL and the exact replay used by
the owner review. A Day-21 bundle remains `READY_FOR_OWNER_REVIEW`; only the
separate final audit can return `READY_FOR_OWNER_SUBMISSION`.

Add the actual HTTPS `demo_url`, selected workspace/mission/dispatch,
`replay` (the existing hostinger capture), `execution_receipts` (the native
business replay page), and `owner_review` references. The replay uses the capture
contract in `docs/hostinger-sprint-closure.md`. Copy the native action's exact
result, start/finish, runtime bound, evidence ID and worker; `source_sha256` is
the reviewed readiness fingerprint. The release context frozen in the native
receipt must equal the independent release capture. Missing context is a gate,
not permission to rewrite the exported native receipt.

The `official_review` references an owner-authored JSON document:

```json
{
  "schema_version": "buildanddo.official-rules-review/v1",
  "reviewer": "<independently selected owner identity>",
  "candidate_sha": "<full candidate SHA>",
  "source_url": "<actual organizer HTTPS URL>",
  "source_copy": {"path": "rules-capture.txt", "sha256": "<exact digest>", "observed_at": "<UTC time>"},
  "reviewed_at": "<UTC time after capture>",
  "deadline": "<actual deadline with time-zone offset>",
  "requirements": {"eligibility": true, "hosting": true, "rights": true, "materials": true, "submission_method": true}
}
```

This is a format description, not a completed review. Each true value requires
actual owner review of the captured terms. Keep the provisional policy's official
fields unknown; the separate dated record carries external requirements.

```bash
python scripts/ci/submission_readiness.py --manifest state/submission/new-candidate/submission.json --acceptance state/hostinger/acceptance --candidate <full-candidate-sha> --reviewer <selected-owner>
```

The result is HOLD, invalid evidence, or READY_FOR_OWNER_SUBMISSION. It compares
captured evidence and does not attest external identities, publish an entry or
change the operational sprint state. The owner performs final submission and
retains the organizer's actual confirmation; the validator never fabricates one.

## Receiving owners and remaining acceptance

The public source dispatch has no shared runtime credentials or activation grant.
The GitLab runner owner executes the complete Day-21 acceptance lane with the
declared dependencies and retains its full candidate-bound export. GitHub's
historical billing failure is not evidence about GitLab availability. The separate
Cloudflare diagnostic still requires the hosting owner; it does not gate local
source checks or establish their failure.
IDE1 executes native/browser acceptance and migration recovery. CMAX-B binds the
existing Firecrawl, n8n, assistant and private operator adapters under the receiving
dispatch. The private release owner deploys and captures source/artifact/health
and DORA readbacks. An independent verifier reviews the demonstrated result.
The repository owner resolves official rules and entry rights.

See `.bits/handoffs/2026-09-21-bits-codegen-cmax-b-submission-runtime.md` for the
concrete receiving checklist. Public source completion and a passing contract
check do not establish 100% deployed readiness.
