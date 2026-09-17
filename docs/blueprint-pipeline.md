# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/blueprint-pipeline.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/adapters/server.py, apps/research/blueprints.py
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON apps/decision/adapters/server.py; DEPENDS_ON apps/research/blueprints.py
# DAG Node:    none
# Intent:      Explain local blueprint analysis, source provenance, review boundaries and reproducible verification.
# ───────────────────────────────────────────────────────────────

# Blueprint analysis and mission review

The workspace Blueprints page at /app/blueprints accepts a PDF, runs CPU
scan/parse/assess extraction, evaluates requirements through Python BDR, and
presents component dependencies and an ordered mission draft. Session prompts
are generated only for human review. Analysis does not create missions, start
sessions, execute document instructions, or mark anything verified.

The original blueprint files described in the source conversation were absent
from this checkout. This implementation uses the existing research contracts,
pypdf declaration, BDR entry point, PocketBase account policy and workspace shell.

## Local application contract

Install the repository's existing Python document requirements and apply the
reviewed PocketBase migration through the normal local migration flow. Run the
bridge from the repository root:

    python -m apps.decision.adapters.server

The process listens only on 127.0.0.1:8091. The PocketBase process must share
that loopback network namespace. An operator can choose another local port with
the server's --port option and the matching BUILDANDDO_DECISION_PORT setting.
The public hook never accepts a host, URL, executable, or command from a caller.
The bridge is a source-level local application adapter, not a deployment.

Requests to the application use existing PocketBase users authentication:

- POST /api/buildanddo/workspaces/{workspace}/decide accepts the existing state,
  typed questions, evidence, authority and trace_id fields. It invokes Python
  instead of approximating BDR in JavaScript. The authority argument remains an
  upper bound for a decision backend; a decision grants no action authority.
- GET /api/buildanddo/workspaces/{workspace}/decisions/{decision} retrieves the
  current member's own receipt, source state, question contract and reserved
  outcome field. The result's decision_id is the stable lookup key.
- POST /api/buildanddo/workspaces/{workspace}/blueprints accepts name,
  pdf_base64, authority="A0", and include_prompts=false. Setting include_prompts
  to true returns review prompts from the same pipeline. The page reanalyzes
  the selected PDF when this button is pressed; deterministic evaluation IDs
  reuse stored receipts.

Every completed BDR evaluation is saved in workspace_decisions, with state,
questions, answers, confidence, route, latency, cost, trace and identity.
Generic decision calls record measured Python execution latency. Blueprint
evaluation receipts retain the existing BDR backend latency estimates.
Console telemetry contains only bounded IDs, hashes and operational metadata.
Native collection APIs remain locked; the command rechecks current membership
inside the transaction. A repeated trace_id with different input returns a
conflict. Reusing a trace_id after a lost response returns the stored receipt.

Blueprint analysis keeps the original PDF and full rendered analysis in the
browser's current view. It persists the per-requirement decision receipts, not
the PDF itself or an activated mission. Download the JSON mission plan to retain
the review draft. Changing the account, workspace, PDF or demonstration mode
clears the visible results.

## Extraction and planning limits

The three extraction passes use only pypdf and the Python standard library.
For identical PDF bytes, filename and parser version, extraction output is
deterministic. No model, network service, GPU, OCR or diagram interpretation is
used. Sparse pages are explicitly flagged as possible scans or diagrams.
PDF positions can be approximate; missing positions use the PDF's text order.

The scanner identifies numbered, capitalized and short-line heading candidates,
prose columns, aligned/delimited tables and indented lists. Parsing builds a
heading tree, requirement candidates, tables, component mentions, acronym
definitions, open items and uniquely resolved section/requirement references.
Ambiguous section numbers and external references remain unresolved.

Assessment ratios are fractions from 0 to 1 with numerator/denominator counts.
Coverage counts direct requirements in each section, so a parent containing
only subsections remains descriptive. A metric with no applicable observations
is displayed as not applicable. Confidence scores are heuristic pattern/context
scores, not calibrated probabilities or verification. Duplicate candidates use
normalized trigram overlap; component consistency flags ambiguous names and
kind changes without asserting synonym equivalence.

Components follow source entities and BDR component_type answers. Dependencies
retain their inference reason and source requirements, plus the provider's
requirement contracts and provenance. Explicit dependencies, shared producer/
consumer data phrases and resolved references can establish an edge.
Unspecified dependency components are reported for review. Cycles and missing
graph nodes prevent mission ordering while preserving the extraction result.

Mission challenges carry source requirements, evaluation receipts and complexity
estimates. Prompt data is JSON-escaped and explicitly untrusted. Every prompt
retains the PDF digest, page/block IDs, requirement, evaluation, component,
challenge and mission identifiers. Prompt authority is always A0; implementation
requires a separate authorized dispatch for the actual effects.

Inputs are limited to 20 MiB, 200 pages, 240,000 extracted characters and 6,000
text blocks. Planning accepts at most 500 requirements. Each HTTP request runs
in a disposable child process with a 30-second deadline and, on supported hosts,
25 CPU seconds and 512 MiB address space. Responses are bounded to 12 MiB.
Parser diagnostics are discarded or reduced to typed failure codes. Browser
Origins are rejected by the loopback RPC; public callers use PocketBase.

## Verification

Run the native end-to-end test and per-module coverage gate:

    python tests/upgrade/check_blueprint_pipeline.py --require-pdf

It loads tests/fixtures/sample-blueprint.pdf and proves extraction, real BDR
evaluation, component planning, mission ordering and prompt provenance without
network/model/GPU calls. The flag fails the gate if pypdf is unavailable. The
existing native research CI job installs the declared parser and runs this gate.

Additional focused checks:

    python tests/upgrade/check_decision_runtime.py
    node --test tests/upgrade/decision-runtime.test.mjs tests/upgrade/blueprint-client.test.mjs
    npm --prefix apps/web test -- BlueprintPage

The Node bridge tests execute the actual PocketBase policy and Python BDR with
an explicit storage double. They do not establish an applied native PocketBase
migration. Layout-double tests are distinct from the native PDF tests.
The initial sandbox lacks pypdf, Vite and Vitest, so local native PDF and rendered
UI acceptance must be reported separately from source coverage. No live runtime
or hosted deployment is claimed.

## Rollback

Revert the application source and the new CI step together. The migration's down
step retains decision history, keeps native collection access locked and removes
the protocol marker used by the route's schema gate. Reapplying the migration
restores that marker after validating the existing schema. No migration deletes
decision receipts, evidence or mission records.
