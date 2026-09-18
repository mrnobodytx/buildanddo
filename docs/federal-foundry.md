# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/federal-foundry.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/federal_foundry/__main__.py, apps/federal_foundry/protocol.py, apps/federal_foundry/evidence.py, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, docs/operator-plane.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON apps/federal_foundry/__main__.py; DEPENDS_ON apps/federal_foundry/protocol.py; DEPENDS_ON apps/federal_foundry/evidence.py; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md; CONSUMES docs/operator-plane.md
# DAG Node:    none
# Intent:      Make the five model-independent Bits research lanes callable while preserving actual-evidence and human-submission boundaries.
# ───────────────────────────────────────────────────────────────

# Federal research portfolio for Bits

The portfolio compiler prepares five separately governed research lanes for the
existing Datadog Bits workflow. It runs on Python 3.11+ with the standard library
and is included in the portable mission-suite archive. Each lane has a proposed
SRS, an opportunity specification, a builder packet, a verifier packet and
proposal projections driven by inspected evidence.

| Lane | Initial scope | External acceptance |
| --- | --- | --- |
| Influence benchmarks | Auction kernel, ten or more LLM stock agents, seeded news, behavior controls and alternative implementations | Official DV026 scope, permitted model spending, labeled experiments and independent statistics |
| NAVAIR acquisition analysis | Parser, deterministic retrieval, BM25/vector/hybrid/graph/clustering/reranker comparison and package | Official topic, rights-cleared corpus, relevance labels and resource targets |
| Brain-inspired low-SWaP | Fixed baseline, heterogeneous runtime, compute gate and ablations | Scientific novelty review and instrumented physical measurements |
| Semantic ISR | Codec baselines, temporal scene memory, semantic packets and receiver evaluation | Official DP2 eligibility and actual video/device feasibility evidence |
| Sentinel Maritime | Harden the existing public suite against the SM-BL-1.1 contracts | Private runtime discovery, feed rights, NNC binding and live operational acceptance |

The lane definitions come from the owner's brief. Topic identifiers, deadlines,
eligibility, funding and page/slide limits remain unverified. xTech Search 10 is
inactive: its submission is reported by the owner and was not independently
observed here. Existing mission-suite tests remain evidence about their tested
source behavior; they are not automatically assigned to any lane claim.

The read-first operator loop reuses this catalog and task protocol. See
`docs/operator-plane.md` for compiling a source-backed build proposal and
reviewing it at `/app/operator` without launching hosted work.

## Prepare the work packages

From a repository checkout or freshly extracted mission-suite archive:

```bash
python -m apps.federal_foundry compile --output /tmp/federal-portfolio
python -m apps.federal_foundry task influence --role builder
python -m apps.federal_foundry task influence --role verifier
```

Choose a new output directory for each run. Compilation refuses an existing
target and validates all evidence before creating output. Use `--at` with the
same explicit UTC evaluation time to reproduce the same projection. The
`portfolio-manifest.json` records file hashes and source/catalogue identity.

Every lane directory contains:

- `opportunity.yaml`, `bits-task.md`, `builder-task.json`, `verifier-task.json`.
- `requirements_matrix.md`, `claim_evidence_matrix.md`, `architecture.md`,
  `experiment_plan.md`, `results.json`, `benchmark_report.md`,
  `gap_report.md`, `risk_register.md`.
- `SOW.md`, `commercialization.md`, `whitepaper.md`, `slides/outline.md`
  and `submission_checklist.md`.

The proposals have concrete scope and experimental plans. Unknown measurements,
customers, team commitments, budgets and official terms remain open. Markdown
draft generation does not establish pagination or final proposal conformity.

The root `bits_tasks.json` is the repository's portable intake contract,
`federal.bits-intake/v1`. It contains ten tasks: five builders with independent
lanes, and five verifiers that depend on the corresponding builders. The limit
is five parallel lanes. This is a source artifact for the existing Bits intake;
it is not a claim about a Datadog-hosted API endpoint.

CI adds an independent `ci:test / Federal portfolio` job on Python 3.11 and
3.12, checks behavior and per-module statement coverage, and retains generated
packets as `buildanddo-federal-portfolio-python-<version>`. The existing
mission-suite artifact also includes the compiler, catalogue and proposed
specifications. Hosted artifact availability must be observed in that run.

## Model-independent execution contract

Execution identity and model choice are separate:

| Field | Supplied by | Meaning |
| --- | --- | --- |
| Executor seat | Existing agent runtime | Bits seat responsible for the task |
| Execution dispatch | Verified VCC dispatch in the runtime | Ready/In-progress authorization scoped to the lane SRS |
| Provider, model, version | Runtime model binding | Actual model used, including a local model where supported |
| Configuration SHA-256 | Runtime model binding | Fingerprint of generation settings, prompt/tool policy and adapter version; never a secret |
| Capabilities | Runtime model binding | Requires code and structured-output support |
| Builder/verifier identity | Runtime dispatch binding | A verifier must use a seat different from the producer |
| Task/request/response SHA-256 | Repository adapter | Prevents stale tasks and response substitution |

`ModelAdapter.complete(request)` is the only model-specific seam. A runtime
implements this async method using its already approved provider client and
credentials. It returns a strict JSON string with this shape:

```text
schema_version: federal.agent-output/v1
request_sha256: exact fingerprint from the request
status: completed | partial | blocked
summary: bounded factual text
artifact_paths: public relative paths
claim_ids: identifiers from the selected lane
```

Use `make_task`, `request_for` and `run_task` in
`apps/federal_foundry/protocol.py`. The caller supplies a `ModelBinding`,
a `DispatchBinding` verified by the existing runtime and its `ModelAdapter`.
No model or provider is hardcoded, and no alternative authentication or
credential store is added. Runtime dispatch verification remains the caller's
responsibility; the binding object is not a new VCC authentication mechanism.

A call is limited to one completion, 180,000 input bytes, 64,000 output bytes,
8,192 requested output tokens and at most 120 seconds. The adapter must honor
the output-token and tool/spending limits through its real runtime. Timeouts
and provider failures produce typed failures; caller cancellation propagates.
The compiler/adapter performs no automatic retries, external commands, branch
creation, PR creation or submission.

Model output is an `unreviewed_model_output` draft even if the provider says
`completed`. The recorded provider/version comes from the runtime binding,
and responses cannot replace it. Adapter contract tests use explicit in-process
test adapters; actual model calls and hosted Bits dispatches are separate
acceptance steps.

## Evidence and candidate comparisons

Use only explicitly reviewed public exports. Evidence is read from an
operator-selected directory; each reference must name a bounded, regular JSON
file inside it with an exact SHA-256. Absolute paths, traversal, symlinked
components, unknown fields, duplicate identities and non-finite values are
rejected. The compiler never executes a command found in a receipt.

An evidence manifest has these fields:

```text
schema_version: federal.evidence/v1
lane_id: one catalogue lane
evaluated_at: explicit UTC timestamp
receipts: [{path, sha256}, ...]
reviews: [{path, sha256}, ...]
```

A measurement receipt uses `federal.measurement/v1`:

| Fields | Required meaning |
| --- | --- |
| `record_id`, `lane_id`, `requirement_id`, `candidate_id` | Unique receipt and current catalogue scope |
| `kind` | `source_test`, `simulation`, `empirical`, or `physical` |
| `outcome`, `measured_at` | Observed `pass`, `fail`, or `inconclusive`, and explicit UTC time |
| `producer` | `{seat, model}`; model is null for non-LLM code, otherwise `{provider, model, version, configuration_sha256}` |
| `source_sha256`, `benchmark_sha256` | Candidate source and frozen common benchmark identities |
| `dataset_sha256`, `scenario_id` | Exact dataset hash and experiment scenario; dataset required for numeric metrics |
| `environment` | `{hardware, runtime}`, describing the actual execution conditions |
| `seeds` | Sorted unique integers; metric evaluation must cover the declared seed plan |
| `metrics` | `[{metric_id, unit, samples: [{seed, value}]}]`; finite values and exact units |
| `measurement_mode`, `method` | `observed` or `estimated`, plus the actual measurement method |
| `command` | Argument list that reproduces the check; stored for review, never executed by the compiler |
| `classification`, `rights` | `PUBLIC` and `public_use_reviewed`; supplied declarations still require operator review |

A review receipt uses `federal.review/v1` with `record_id`, `lane_id`,
`receipt_sha256`, `reviewer_seat`, `reviewed_at`, `verdict` and `notes`.
Verdicts are `accepted`, `rejected` or `needs_work`. The reviewer must differ
from the producer, the review must follow the measurement, and its fingerprint
must match the exact bytes. Conflicting reviews and contrary results remain
visible. Every receipt must precede its manifest's evaluation time.

```bash
python -m apps.federal_foundry evaluate /tmp/public-receipts/influence.json --evidence-root /tmp/public-receipts
python -m apps.federal_foundry compare /tmp/public-receipts/influence.json --evidence-root /tmp/public-receipts --metric allocative_efficiency --candidate auction-baseline --candidate event-sourced
python -m apps.federal_foundry compile --output /tmp/federal-reviewed --manifest /tmp/public-receipts/influence.json --evidence-root /tmp/public-receipts
```

Repeat `--manifest` to include other lanes. A missing lane generates explicit
missing-evidence states. Evaluation exits zero when inputs validate; use
`--require-supported` to require one candidate to support the entire requirement
matrix. Malformed inputs exit two.
An incomparable bakeoff exits one, and a valid comparison exits zero.

A positive result requires a matching evidence kind, observed measurement,
accepted independent declared review and the catalogue's metric/seed policy.
Physical claims stay open for simulated or estimated results. Unset metric
targets stay `TARGET_UNSET`; they do not become zero. A claim cannot combine
disjoint successes from different candidates. The tables list which candidates
support each claim, with all failures and contrary reviews retained.

A bakeoff requires exactly one reviewed measurement per explicitly requested
candidate, the same benchmark and dataset hashes, scenario, environment, seeds,
kind and measurement mode. It reports the configured aggregate, mean, sample
standard deviation and sample count. Missing/ambiguous measurements or mismatched
conditions produce `INCOMPARABLE`; ties have no leading candidate. Descriptive
statistics do not establish significance, causal influence or promotion.

Hashes prove the inspected bytes. Seat fields and experimental outcomes remain
declarations until the existing runtime and independent human review substantiate
them. The compiler does not authenticate reviewer identities, certify physical
measurements or approve solicitation eligibility. Every proposal projection
remains `HOLD` with explicit human gates.

## Existing mission and private runtime integration

Use the current government-submission mission starter and suite desk to manage
the resulting scope and reviewed evidence. The compiler runs locally; this
change does not add a new PocketBase mutation route or bypass mission approval.
The existing suite command protocol and reviewed attachment workflow remain the
authority for saved workspace evidence. The portfolio alone creates no shared
mission or seat event.

Private Bits scheduler wiring, provider/client bindings, resource quotas and
actual experiment execution belong to the receiving operator's existing runtime.
The source handoff is
`.bits/handoffs/2026-09-16-bits-codegen-cmax-b-federal-foundry.md`. Prepared
packets carry no assigned execution dispatch. Assign each lane its own verified
dispatch and repository session; do not switch a shared checkout under another
seat, create extra worktrees here or directly publish refs.

Rollback the public feature by reverting the focused source change and stopping
intake of its packets. Preserve all experiment and review receipts. This package
changes the suite's source fingerprint, so an installed worker needs its normal
operator-reviewed source binding update; stale bindings must remain fenced.

## Verification

```bash
python tests/upgrade/check_federal_foundry.py
mypy --strict --explicit-package-bases --follow-imports=silent apps/federal_foundry
ruff check apps/federal_foundry tests/upgrade/test_federal_foundry.py tests/upgrade/check_federal_foundry.py
python tests/upgrade/check_mission_suite.py
python -m unittest discover -s tests/upgrade -p 'test_*.py'
node --test tests/upgrade/*.test.mjs
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
```

The foundry behavior tests use labeled synthetic receipts solely to test
validation, matched comparisons and failure behavior. Fresh archive execution
checks portability with the same source/catalogue identity. It does not run a
research campaign, physical device or hosted LLM.
