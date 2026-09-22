# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/hostinger-sprint-closure.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     .bits/hostinger-readiness.json, scripts/ci/hostinger_readiness.py, scripts/ci/hostinger_replay.py, tools/day21/day21_acceptance.py, .bits/handoffs/2026-09-21-bits-codegen-cmax-b-governance-execution.md, docs/sprint-user-journey.md
# EnumType:    Doc
# EnumEdges:   CONSUMES .bits/hostinger-readiness.json; CONSUMES scripts/ci/hostinger_readiness.py; CONSUMES scripts/ci/hostinger_replay.py; CONSUMES tools/day21/day21_acceptance.py; EXTENDS docs/operator-plane.md; EXTENDS docs/mission-system.md; CONSUMES .bits/handoffs/2026-09-21-bits-codegen-cmax-b-governance-execution.md; CONSUMES docs/sprint-user-journey.md
# Intent:      Make the reason, acceptance boundary and next action for every sprint piece a required source review rather than a remembered plan.
# ───────────────────────────────────────────────────────────────

# Hostinger sprint closure

The demonstration is one small organization problem through observation,
approved bounded work, an actual action, independent review and visible evidence.
The owner requested closing the repository gaps and making next actions
mandatory governance. This continues SRS-BUILDANDDO-UPGRADE-001 and
VCC-BUILDANDDO-UPGRADE-001. Private runtime activation and deployment still need
their receiving authority. The first private loop is BuildAndDo; additional
federal domain packs are not prerequisites.

`scripts/ci/sprint_cycle.py` owns the eleven milestones, dates and weights.
`.bits/hostinger-readiness.json` owns each milestone's rationale, affected source,
checks, dependencies, acceptance requirements, owner and next step. It contains
no editable completion percentage. Its source binding is
`.bits/hostinger-readiness.lock.json`. Exact bytes of the tested application,
libraries, tests and script trees are covered so a changed helper invalidates
earlier acceptance too. Generated reports and operational evidence are excluded.

## Mandatory review

At the beginning of work, before selecting the next task, and before handoff:

```bash
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py
python scripts/ci/hostinger_readiness.py --json
```

Read the contract and follow its dependencies. A stale check means source changed
since review: inspect the change, update rationale, acceptance or next actions as
needed, then run `--refresh` and `--check`. Refreshing records source review only;
it cannot record passing tests or verify a milestone. After staging new files,
refresh the measured agent context with `python scripts/ci/agent_context.py --write`.
CI requires the readiness check and validator regression suite under
`governance:readiness`, shown in the contribution pipeline. A changed gate must
update its presentation too.

| Piece | Why it is needed | Evidence needed next |
|---|---|---|
| Foundations | Every demonstration must name a reproducible candidate | Executed CI and exact release readback |
| Auth and onboarding | A user must enter and resume under their own authority | Built-browser auth and revoked-access behavior |
| Workspace collections | Work must persist with current membership isolation | Both native versions, installed migrations and restart |
| Signals | A problem must retain its source when it becomes work | Saved signal revision, proposal and source snapshot |
| Missions | Scope and approval must precede work | Bounded execution and a separate result reviewer |
| Workflows | Ordered steps need durable observations and retry recovery | Native atomic receipts, plus the actual executor's result |
| Connectors | Configuration is insufficient to establish a connection | Fresh readback for the current binding/revision |
| ERP | The outcome must be useful to the business | Saved objectives, tasks and contacts with scoped links |
| Evidence | The exact claim must be inspectable | Consistent SHA/artifact receipts and observed verification |
| Edition and desks | Operators must see the actual result and uncertainty | Current mission/evidence readback and browser acceptance |
| Replay | The complete story must survive inspection | A consistent captured chain and official submission review |

The JSON contract is authoritative for the individual checks and next actions.
This explanatory table does not assert runtime completion.

## Run and retain acceptance

The runner executes fixed repository commands without a shell, downloads or
commands from the JSON contract. It retains the process outcome, test counts,
source fingerprint, UTC times, log digest and required artifact digests. An empty
successful test run, any skipped tests or a missing build/JUnit artifact cannot
produce passing acceptance. Native receipts also bind the observed PocketBase
version to either the package or compose declaration.
The Python source check preserves discovery's sibling-helper import path while
selecting native suites separately; missing source-test dependencies still
produce explicit failures or incomplete acceptance.

```bash
python scripts/ci/hostinger_readiness.py --run source_node
python scripts/ci/hostinger_readiness.py --run source_python
python scripts/ci/hostinger_readiness.py --run semantic_twin
python scripts/ci/hostinger_readiness.py --run web_lint
python scripts/ci/hostinger_readiness.py --run web_tests
python scripts/ci/hostinger_readiness.py --run web_build
python scripts/ci/hostinger_readiness.py --run native_workspace --runtime package
python scripts/ci/hostinger_readiness.py --run native_workspace --runtime compose
```

The provisioned runner sets `BUILDANDDO_TEST_POCKETBASE` to the corresponding
installed test binary. Native checks create disposable loopback instances and
synthetic accounts; they never migrate a shared database. Run all other
`native_*` checks required by the contract in both profiles too. `--run all
--runtime package` runs every local check for that profile; it does not stand in
for compose acceptance. The GitLab full-acceptance job provisions the declared
binaries and runs the complete matrix in one checkout. Receipts/logs remain job
artifacts, including failed runs. Jobs that cannot start have no test acceptance.

Default receipts live in ignored `state/hostinger/acceptance/`. To assess CI
exports, collect their receipt/log files in one directory and restore referenced
public JUnit/build artifacts to their recorded repository paths:

```bash
python scripts/ci/hostinger_readiness.py --evidence-dir state/hostinger/acceptance --json
```

The latest result for each check/profile wins, including failures. Changed source
or artifacts, future times, mismatched counts, altered logs and receipts older
than 48 hours cannot establish current acceptance. These are consistency checks,
not signed identity attestations. Private source bodies, credentials and shared
backend exports must not enter Git or public artifacts.

### Run with installed dependencies and binaries

`tools/day21/day21_acceptance.py` runs the eight source/build checks and all five
native checks for each declared runtime. It accepts a clean committed candidate
and exports receipts, logs and artifacts through the shared Day-21 validator.
Choose a new summary directory for each run; existing evidence is never replaced.

On a provisioned runner, supply both actual binaries explicitly:

```bash
python tools/day21/day21_acceptance.py --offline \
  --pocketbase-package /path/to/pocketbase-0.39.8 \
  --pocketbase-compose /path/to/pocketbase-0.28.4 \
  --evidence-dir state/day21/acceptance/run-001 \
  --summary-output state/day21/evidence/run-001/acceptance-summary.json
```

Recheck those versions against the declarations when provisioning. Each native
check measures `--version` before starting a disposable backend. An absent or
incorrect binary creates a BLOCKED receipt for every affected check, even when
older passing receipts exist. `--offline` disables installs and Docker builds;
it does not supply missing packages. The frontend needs `npm ci` from the lock,
and source Python needs `scripts/discordbot/requirements.txt` and
`apps/research/requirements.txt` in the runner's interpreter.

A connected runner can use `--install-deps` and the existing Docker provisioning
instead. `--source-only` and `--native-only` are mutually exclusive. A partial
selection still exits nonzero unless the shared validator accepts all eighteen
current profiles; a selected command's success cannot certify missing profiles.
GitLab executes this lane. The earlier GitHub billing observations are historical
evidence about GitHub and do not block the GitLab runner.

### GitLab execution and artifact handoff

The existing `.gitlab-ci.yml` includes `.gitlab/ci/day21-submission.yml`, which
includes `.gitlab/ci/source-validation.yml`. `day21_governance` checks source
bindings, public boundaries, review attribution, validator regressions and
worker/submission coverage. `day21_full_acceptance` runs on the `buildanddo`
shell runner. The separate source jobs retain required Discord/PDF and CPU
blueprint checks, and foundry/portfolio/mission coverage on Python 3.11 and 3.12.
These jobs are configured for main, sprint branches, merge requests, external
pull requests or `DAY21_FULL_ACCEPTANCE=1`.
The full job replaces the split source/native jobs: the shared runner requires
all eighteen profiles for success. Its Python virtual environment lives in
ignored `state/day21/venv`; npm installs development tools from the root lock
even if the shell inherited `NODE_ENV=production`. The runner
needs the Node major in `.nvmrc`, Python with venv/pip, Docker and access to the
declared package/image sources. A local provisioned machine can use the offline
command above instead.

Always download the entire `state/day21/evidence/` directory, plus
`reports/junit/web.xml` and `dist/apps/web/index.html` at their original paths.
The validator hashes exported copies and compares the original artifact paths;
a standalone summary is insufficient. Artifacts are retained even for HOLD or
failed acceptance. `day21_submission_bundle` explicitly needs the full job's
artifacts and all required governance/source jobs, including both Python
versions. It is manual when `DAY21_COMPILE_SUBMISSION=1`. The receiving owner
must provide the other same-candidate captures before that bundle can pass.

### Review attribution and public check status

`verify_public_boundary.py --gitlab-ci` reads the current merge request's
`CI_MERGE_REQUEST_IID` and `CI_MERGE_REQUEST_LABELS`. Exactly one of
`actor:human`, `actor:agent` or `actor:mixed` is required. `Bits AI` is a separate
label and does not satisfy this rule. For a GitHub external pull request, the
receiving integration sets `BUILDANDDO_GITHUB_PR_EVENT` to an authenticated
provider export shaped as `{"pull_request": <GitHub pull object>}`. The gate
checks the base repository, review number, labels and exact checked-out SHA;
missing or foreign exports fail. No tokens belong in that file. Default-branch
scans report review attribution as NOT_APPLICABLE, never as a reviewed actor.

The GitHub governance workflow runs automatically for public PR and label changes
and retains explicit manual diagnostics. The selected review resolves once to a
SHA used by every job; automatic runs also require that SHA to match the triggering
PR head. Governance
rechecks that review's labels and revision, so an updated PR cannot silently
supply labels for a different candidate. Old failed checks remain historical.

The private CI owner must verify that public candidates reach GitLab, supply
trusted review metadata, and publish actual job results against the same GitHub
SHA. Required-check configuration must then name those observed GitLab checks;
disabling an existing check cannot substitute for observed replacement enforcement.
The read-only coding session cannot activate this integration or change repository
settings. The receiving contract is
`.bits/handoffs/2026-09-21-bits-codegen-cmax-b-governance-execution.md`.
The separate Cloudflare Workers check requires its own build diagnostic.

The current ten-piece product continuation is documented in
`docs/sprint-user-journey.md`. It closes specific session, navigation, record
isolation, capture, review and export gaps while retaining all required CI gates.
The new complete mission export is a read-only observation bundle; the existing
same-candidate replay, deployment and submission validators still decide admission.

The stdlib source inspector follows literal local includes, rejects unresolved
or unsafe include paths and inventories executable command lists. It does not
resolve remote includes, YAML aliases, inherited command templates or merged
job overrides, evaluate GitLab rules, or attest that any hosted job ran. Such
configuration needs GitLab's merged-config review; actual acceptance still
requires the candidate-bound run export.

## Product connection

The Signals desk explicitly proposes a mission from a saved readable signal.
The existing authenticated research command stores the proposed mission and
source snapshot atomically, reusing its retry receipt store. A stable key binds
account/workspace scope and the saved signal revision, so closing an uncertain
dialog and reopening it recovers the original proposal. A changed revision needs
a new reviewed proposal. Creating one does not acknowledge the signal, approve
the mission or execute work.

Signal proposals enable `mission_plan.independent_review`. It is also an explicit
option in the mission builder. Verification of these plans requires a current
writer who is neither the proposer nor an author of selected evidence. The flag
is part of the approved, frozen plan. Older plans retain manual-review semantics.
Different account IDs enforce separation in this application; they do not prove
real-world identity independence or worker execution. Release the matching hooks
and frontend together. This connection requires no new collection.

The subsequent eleven-checkpoint continuation adds transactional onboarding,
locked business execution receipts and private assistant session/pattern stores.
Its new migrations must ship with the matching hooks and frontend. See
`docs/business-execution.md` for approved ERP/Firecrawl/n8n effects and uncertainty
reconciliation, `docs/workspace-assistant.md` for native permissions and personal
knowledge, and `docs/submission-guide.md` for the full checkpoint/entry contract.
The earlier no-new-collection statement applies only to the signal proposal link.

`tests/upgrade/test_workspace_native.py --require-binary` covers production public
migrations, login, signal proposals, workflow receipts/retries, separate mission
review, operator readback, restart persistence, revoked membership, foreign links,
business records and a saved daily edition. Existing suite, classroom, dossier
and learning native checks remain required. Rendered acceptance remains separate
from Node storage doubles and native backend execution.

## Capture and validate the demonstration

`scripts/ci/hostinger_replay.py` reads local capture exports only and reuses
Phase 1 release receipt/GitLab/Datadog reconciliation. It cannot dispatch a job,
activate a connector, approve a mission or query the private plane. The receiving
owner exports permitted public summaries into an ignored operational directory
and retains private originals under private authority. Do not invent receipts
to fill missing inputs.

The `buildanddo.hostinger-replay/v1` manifest requires `schema_version`,
`campaign_id`, full `candidate_sha`, current `source_sha256`,
`artifact_tree_sha256`, `workspace`, `mission`, `dispatch`, `environment`,
boolean `synthetic`, UTC `captured_at`, `records`, `action_output`,
`release_receipts`, `gitlab_exports` and `datadog_exports`. Every file reference
is `{ "path": "relative-name.json", "sha256": "<digest>", "observed_at":
"<UTC ISO-8601>" }`. References stay inside the capture directory without
symlinks and hash exact exported bytes. Tests contain explicitly synthetic
format examples, never live receipts.

`records` has these ordered observations, all in the selected workspace:

| Key | Required content |
|---|---|
| `context` | Sanitized summary with `state=MEASURED`, `source_ref`, `observed_at` |
| `signal` | Saved signal with ID, revision, title, description, source, type and owner |
| `proposal` | Actual mission-linked signal snapshot evidence from `signal.propose` |
| `approval` | Approved mission with owner, plan, approval account/time and independent review enabled |
| `action` | Receiver-exported job summary: `execution_kind=worker` or `native`, `status=PASS`, job/producer/mission/dispatch/release identities, environment, `limits.max_seconds`, start/completion times and `result_sha256` |
| `verification` | Review with matching job/result/scope, `status=PASS`, separate `verifier`, `verified_at` and passing `test/evaluate/verify/validate` checks |
| `evidence` | Result evidence with author, mission, source and exact result digest in its content |
| `outcome` | Verified mission retaining plan/owner, matching reviewer and four observed reviews referencing the result evidence |
| `operator` | Actual `buildanddo.operator-snapshot/v1` containing the reviewed mission and evidence |

Context/operator snapshots must have been fresh within 15 minutes when observed;
the whole capture must be within 48 hours. Action starts after approval, respects
its recorded runtime bound (at most one hour), and verification follows its result.
A recorded workflow step cannot replace the worker summary. Private action/review
summaries are an export contract for an existing receiving adapter, not a newly
implemented public executor.

The release/provider arrays use the existing semantic twin export formats. The
selected environment requires matching source SHA, artifact-tree digest and
passing external version/health/lesson readback. A staging demonstration may
retain unmeasured production/DORA fields; it cannot claim a production release.
Production acceptance follows `docs/BUILDANDDO_RELEASE_TRUTH.md`.

```bash
python scripts/ci/hostinger_replay.py state/hostinger/demo/capture.json --candidate-sha <full-sha> --workspace <id> --mission <id> --dispatch <receiving-dispatch>
```

The caller supplies expected identities independently of the capture. Results
are `CONSISTENT_CAPTURE`, `SYNTHETIC_CAPTURE` or `HOLD`; malformed chains fail.
The result describes consistency of supplied bytes. It does not establish live
verification, owner approval or a CK signature.

## Owner review and roadmap state

The sprint module still counts only manually verified milestones with evidence.
There is no CI auto-completion step. After reviewing an actual capture and all
local/native/browser/runtime requirements, the owner may provide a separate
`buildanddo.hostinger-owner-review/v1` receipt with exactly `schema_version`,
`reviewer`, `reviewed_at`, `capture_sha256`, and `decisions`. Every decision names
a canonical piece `id`, dated content-bound `evidence` references and the complete
list of reviewed `runtime_requirements` IDs from the contract. Evidence paths
are relative to the owner-review file's directory.

Explicit `--owner-review`, `--reviewer`, `--evidence-dir` and `--output` options
validate that receipt and create a **new** operational state file. Existing files
are refused. All required checks (both native versions), dependencies, exact
capture identity and current nonsynthetic replay must pass. Unapproved milestones
remain planned. The owner supplies review identity and semantic judgment; the
tool does not authenticate or grant that authority. The owner inspects the result
before using the existing operational process to replace ignored
`state/roadmap/sprint.json`. Never commit that state or claim completion from a
synthetic fixture.

## Receiving actions and rollback

GitHub annotations observed September 20 on check runs `105834583008` (candidate
mirror) and `106077221075` (stack telemetry) state that jobs did not start because
the account is locked due to a billing issue. The account owner must resolve this
and obtain executed checks. Cloudflare's separate build failure still needs its
own diagnostic; the billing observation does not explain it.

Follow `.bits/handoffs/2026-09-18-bits-codegen-cmax-b-operator-plane.md`: OP-00,
receiving dispatch and tenant/staging bounds, then one NXC read and one existing
bounded capability with distinct verification and readback. Private adapter source
is unavailable here. Connector activation, installed migrations, live hosting
proof and official Hostinger eligibility/deadline are separately owned contract
requirements. The internal September 9–29 plan is not an official submission date.

Roll back the new UI and command together through normal review, preserving
proposal/evidence/retry records. Retain the independent-review backend guard while
approved plans require it; retiring that guard needs explicit review of those
plans. The governance runner creates no infrastructure and never modifies
operational sprint state by default. Stale receipts remain useful history; do
not relabel them as current acceptance.
