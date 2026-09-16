# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     AGENTS.md, .buildanddo/public/path-policy.json, foundry/registry/opportunity.schema.json
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .buildanddo/public/path-policy.json; OWNS foundry/registry/opportunity.schema.json; OWNS foundry/shared/federal_foundry/portfolio.py
# DAG Node:    foundry.plan
# Intent:      Define an isolated evidence-first workflow for five public federal research lanes.
# ───────────────────────────────────────────────────────────────

# Citadel Federal R&D Foundry

Run five isolated research lanes through the same executable evidence workflow:
frozen inputs → real local trials → candidate comparisons → checked evidence →
review reports, technical briefs, slides and a portable review archive.

Python 3.11+ and PyYAML are the only runtime requirements. The CLI runs locally,
without PocketBase, a GPU, provider credentials or a service account.

## Run the complete portfolio

From the repository root:

~~~bash
python -m pip install -r foundry/shared/requirements.txt
python -m foundry.shared.federal_foundry status
python -m foundry.shared.federal_foundry run --all --jobs 4 --output /tmp/federal-foundry-runs
python -m foundry.shared.federal_foundry verify /tmp/federal-foundry-runs
python -m foundry.shared.federal_foundry compile --runs /tmp/federal-foundry-runs --output /tmp/federal-foundry-review --archive /tmp/federal-foundry-review.zip
python -m foundry.shared.federal_foundry verify /tmp/federal-foundry-review
~~~

Open /tmp/federal-foundry-review/index.html for the standalone portfolio view.
Each lane has a measured benchmark report, requirement and claim matrices, a gap
report, five technical briefing slides, a technical white-paper source and the
complete run evidence. Authored paper and slide sources are retained separately.
The ZIP includes everything needed to read and check the exported artifacts.

The default design runs 60 attempts: five lanes × two candidates × three seeds ×
two repetitions. Concurrency is bounded to 1–8 children. Choose new output paths
for subsequent runs; existing outputs and authored source are never overwritten.

To run and compile only one lane:

~~~bash
python -m foundry.shared.federal_foundry run --lane navair-acquisition-analysis --output /tmp/navair-runs
python -m foundry.shared.federal_foundry compile --lane navair-acquisition-analysis --runs /tmp/navair-runs --output /tmp/navair-review
python -m foundry.shared.federal_foundry replay /tmp/navair-runs/navair-acquisition-analysis/runs/bm25/seed-17/repeat-1 --output /tmp/navair-replay
python -m foundry.shared.federal_foundry status --runs /tmp/navair-runs
~~~

Replay compares computational output bytes. It excludes measured timing and
Python allocation peaks, which vary between executions. Two exports from the
same saved campaign and unchanged authored sources have identical bytes,
including their ZIPs. A new campaign has new timestamps and resource observations.

## Executable reference workloads

| Lane | Implemented candidate comparison | Recorded evidence | Remaining research boundary |
|---|---|---|---|
| DARPA DV026 Influence | Truthful vs shaded unit-demand auctions; seeded agent heterogeneity and factual/counterfactual news | Bids, clearings, allocations, achieved/optimal value, allocation changes | Scripted agents; LLM-agent behavior, influence classification and provider-cost studies still require a lane dispatch |
| NAVAIR Acquisition Analysis | BM25 vs cosine TF-IDF on the same frozen corpus and graded judgments | Stable rankings, term contributions, citations, precision/recall@k, nDCG@k and MRR | Authored synthetic acquisition descriptions; official corpus, expert judgments, embeddings and Docker acceptance remain open |
| DAF NV027 Low-SWaP | Dense temporal projection vs event-gated projection | Labelled predictions, accuracy, multiplication counts, gate-check overhead and Python resources | Fixed simulation; trained heterogeneous architecture and power/edge-device measurements remain open |
| DARPA Semantic ISR | Full-scene JSON vs quantized ROI delta packets | Actual wire-byte counts, receiver reconstruction, relevant-object recall and position error | Supplied annotation/relevance truth; EO/video detectors, conventional video codecs, hardware and DP2 qualification remain open |
| DIU Sentinel Maritime | Ordered vs shuffled observations through the existing public mission-suite engine | Entity/candidate analysis, deterministic replay, proof fingerprints and HOLD outcomes | Reuses the existing source; private Sentinel/NNC, live feeds and operating-demo evidence remain open |

All bundled datasets are explicitly public and synthetic. The code generates
measurements from the datasets; no numerical result is prefilled in a results
file. The opportunities retain the supplied Phase I, page/slide, funding, Docker
and hardware constraints as planning facts pending official-source confirmation.

## Layout and extension points

- registry/<lane>/opportunity.yaml: requirements, eligibility, claims, deadlines,
  deliverables and evidence gaps, checked against opportunity.schema.json.
- lanes/<lane>/experiment.yaml: registered candidates, pinned dataset digest,
  seeds, repetitions, timeout, scoped requirement IDs, metrics and thresholds.
- fixtures/<lane>.json: versioned public input bytes, explicit rights and scope.
- shared/federal_foundry/: concrete runner, benchmark harness, algorithms,
  schema checks, requirement/claim policies, reports and compiler.
- templates/: reusable proposal authoring structure.
- lanes/<lane>/: authored architecture, experiment plan, SOW, commercialization,
  risk and proposal sources. results.json accepts separately reviewed evidence.

An experiment plan selects registered candidate IDs. It cannot supply a shell
command, provider URL or arbitrary plugin. Extend the reviewed Python candidate
registry under a lane SRS before selecting a new implementation. The Python
ExperimentRunner and BenchmarkHarness protocols remain available for separately
reviewed integrations; LocalExperimentRunner and ReferenceBenchmarkHarness are
their working local implementations.

The schema validator implements the vocabulary used in the published foundry
schemas, including closed objects, local references and value bounds. It rejects
unsupported validation keywords and remote schema references. YAML aliases,
duplicate keys, unsafe tags, non-string keys and non-finite values are rejected.

## Attempts, comparisons and evidence

Every started attempt retains input.json, request.json, stdout/stderr logs,
measurement.json when produced, and receipt.json. The request pins source bytes,
input digest, interpreter version, command, seed and resource bounds. The receipt
records actual start/finish times, exit status, failure reason and artifact
hashes. Children receive a minimal environment and explicit argv without a shell.
This runs reviewed local code; it is not an OS security sandbox.

Timeout, cancellation, output overflow and nonzero exits are failed or cancelled
attempts, never successful measurements. Cancelling a campaign stops its children
and publishes the started receipts with a cancelled campaign state. Unstarted
attempts remain unstarted. Such a campaign can be inspected and verified, but it
cannot produce a completed review bundle.

Each candidate comparison reports attempted/successful denominators, repeated
computational agreement and local acceptance checks. The statistics average
repetitions within each seed, then summarize those seed means with n, mean,
standard deviation, min/max and p50/p95. Incomplete seed groups are excluded
from averages and keep the candidate failed. Fixed deterministic workloads reuse
the same corpus across seeds; these are descriptive fixture statistics, not
independent scientific samples or a population confidence interval.

Timing uses perf_counter while tracemalloc is active. Python allocation peaks
are not process RSS, GPU memory, watts or energy. Receipt elapsed time additionally
includes child startup; workload timing covers the measured algorithm.

Compilation verifies campaign hashes and recomputes summaries from the individual
runs. Copied evidence is digest-checked and exported with local locators. Missing,
changed, linked, unbounded or foreign evidence fails before output publication.
SHA-256 manifests detect changes; they are unsigned content fingerprints and do
not establish authorship, CK authority or an independent review.

Evidence can be planned, observed, verified or rejected. A verified record needs
the exact artifact digest and an explicit reviewer, method, scope, timezone-aware
review time and passing outcome. Satisfying a requirement or verifying a claim
also requires that identity in the evidence's declared scope. Review assertions
are not authentication credentials. Local reference runs remain observed and can
only support partial scoped requirements; they never automatically verify claims.

## Branch and acceptance model

~~~text
research/common-federal-evidence
research/darpa-dv026-influence
research/navair-acquisition-analysis
research/daf-nv027-low-swap
research/darpa-semantic-isr
research/diu-sentinel-maritime
~~~

These are the proposed research integration branches. Each implementation still
uses the repository's authorized bits/<SRS-CODE>-<slug> branch and its dispatch.
A lane follows registered SRS → branch → measurable acceptance → isolated
experiments → PR → independent verifier → reviewed research integration branch.
Shared changes pass all five reference workloads before adoption; one lane's
evidence never implicitly satisfies another's requirements. Branch creation and
promotion follow repository ownership and the normal review flow.

~~~bash
python tests/foundry/check_foundry.py
python -m mypy --strict --follow-imports=silent foundry/shared/federal_foundry
python -m ruff check foundry/shared/federal_foundry tests/foundry
python -m ruff format --check foundry/shared/federal_foundry tests/foundry
~~~

The checker executes actual child processes and a complete 60-attempt campaign,
checks tamper/failure/cancellation and portable exports, and requires at least
80% trace statement coverage in every executable shared module. Source typing
targets the foundry; imported pre-existing modules keep their own checks.
CI runs this independently on Python 3.11 and 3.12 and retains a generated review
archive. A configured workflow is not a claim that hosted checks have passed.

## Submission review

The generated HTML, Markdown and ZIP are technical review artifacts. A named
human must supply and approve current official topic sources, eligibility,
deadline, data/IP rights, cost, team, certifications, company/customer claims and
any physical test evidence. Final PDF pagination, slide rendering, Docker
acceptance where required, signing and portal submission remain separate gates.
The compiler reports these blockers and leaves final approval boxes unchecked.
