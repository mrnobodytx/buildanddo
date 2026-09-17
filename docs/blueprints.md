# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/blueprints.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprints.py, apps/pocketbase/pb_hooks/blueprint.pb.js, apps/decision/workloads/blueprint_evaluation.py, apps/web/src/pages/workspace/BlueprintPage.jsx
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/research/blueprints.py; CONSUMES apps/pocketbase/pb_hooks/blueprint.pb.js; CONSUMES apps/decision/workloads/blueprint_evaluation.py; CONSUMES apps/web/src/pages/workspace/BlueprintPage.jsx
# DAG Node:    none
# Intent:      Explain the asynchronous blueprint review contract, extraction limits and evidence required before claiming native acceptance.
# ───────────────────────────────────────────────────────────────

# Blueprint extraction, Phase A

Open **Blueprints** in the workspace navigation at `/app/blueprints`. Editors,
administrators and owners can upload a PDF, review extracted requirements and
component dependencies, and export a proposed mission or challenge definition.
Viewers can inspect existing blueprints. Account and workspace changes clear
private page state, in-flight responses and prepared download links.

The existing research worker performs extraction. A configured, enabled document
capability is required, using the same research bindings and integration revision
as mission research. This source change does not start a worker or install a
migration in an existing deployment. See `docs/mission-research.md` for the
existing worker configuration. No additional Python dependency is introduced.

## API and processing lifecycle

All routes use native PocketBase `users` authentication and current workspace
membership. Responses carry `Cache-Control: no-store`.

| Request | Input | Response |
|---|---|---|
| `POST /api/buildanddo/workspaces/{workspace}/blueprints` | Multipart `asset` (one PDF), `input_sha256` (SHA-256 of its bytes), `request_key` (16–80 letters, digits, underscores or hyphens) | `202` with `{workspace, record, replayed}` while queued or blocked; replaying a ready upload returns `200` |
| `GET /api/buildanddo/workspaces/{workspace}/blueprints?page=1` | One-based page, maximum 9999 | `{workspace, role, items, page, has_more, capabilities}`; at most 20 summaries |
| `GET /api/buildanddo/workspaces/{workspace}/blueprints/{id}` | Saved blueprint ID | `{workspace, record}` with status, raw excerpt, Blueprint, evaluation and extraction outcomes |
| `POST /api/buildanddo/workspaces/{workspace}/blueprints/{id}/commands` | JSON `{action, revision, request_key}`, action `retry` or `cancel` | Current saved record after the existing research command completes |

The browser computes the byte hash and retains the same multipart request after
an uncertain response. Replaying a key returns its original receipt; a changed
source hash or filename conflicts. The worker independently checks the actual
downloaded bytes against that hash before parsing.

Intake atomically creates one protected `research_uploads` file, a shared
`research_submissions` job with `mode: "blueprint"`, and a linked
`workspace_blueprints` record. Blueprint jobs need no mission because the
proposal has not been authored yet. Ordinary research still requires a readable
mission. Native collection writes cannot supply this discriminator or forge a
saved result.

The normal worker queue, claim, attempt counter, lease, current owner role and
integration binding checks apply. `queued` progresses through `processing` to
`ready` or `failed`. Missing processing capability produces `blocked`, with the
input retained. Retry uses the current configuration; cancellation fences late
results. A complete result and its receipt are saved atomically. The event stores
a digest of the structured payload to retain the existing small event budget;
the complete observations are stored in `workspace_blueprints`.

The upload response is asynchronous because Python already runs in the research
worker. Poll the detail endpoint to obtain `record.blueprint` and
`record.evaluation`. The page polls pending work every three seconds while
visible and also offers a manual refresh.

## Extraction contract

`Processor.process()` recognizes document jobs with `mode: "blueprint"`.
`Processor.process_blueprint(data, name)` offers the same explicit path. Both
use the existing temporary-file/subprocess wrapper with a 30-second deadline
and the existing CPU/memory limits. `documents.py` is unchanged. Its `pypdf`
extraction performs PDF admission and text extraction; the extension reads page
metadata inside that same child process.

`Blueprint` contains the requested title, filename, byte hash, ISO timestamp,
sections, requirements, components, constraints, assumptions, open questions,
confidence, parser version, page count and truncation marker. `Requirement.section`
refers to a `Section.id`; sections also retain a heading, hierarchy level and
one-based line range in the **extracted text**, not PDF coordinates. Requirement
context is a bounded excerpt of the original extracted paragraph. Explicit IDs
are preserved; other IDs use normalized requirement content hashes. Conflicting
explicit IDs remain separate observations and create an open question.

Numbered headings, uppercase headings and text bold/heading markers identify
sections. Normative wording and MoSCoW headings identify requirements. Domain
keywords classify their types. Named architectural phrases and explicit relation
verbs produce components and outgoing dependencies. This is a heuristic: it does
not establish that an inferred dependency or requirement is correct.

Limits remain explicit: 20 MiB per source, at most 200 PDF pages and the existing
16,000 UTF-16-unit text excerpt. The structure caps requirements at 80 and sections
and components at 64; context excerpts are at most 800 units. Truncation is shown
on the page and retained in proposal exports. Oversized structured output falls
back to the flat excerpt. Encrypted, empty, unsupported and unreadable PDFs
remain rejected; the uploaded source is retained with its failure state.

If no requirements are detected or structuring fails after document admission,
the job retains its flat excerpt, with `blueprint: null` and a bounded
`blueprint_failure` code. Evaluation failure retains the Blueprint and sets
`evaluation_failure: "decision_failed"`. Neither diagnostic serializes source
text or parser exceptions. Original downloads use the existing protected-file
client and current access checks.

Confidence measures structural regularity, detected headings, requirement count
and section attribution, with a truncation penalty. It is not a calibrated
probability of correctness. Phase A does not perform OCR, read diagrams, execute
PDF actions, follow document URLs, or interpret document instructions.

## BDR and proposal exports

`evaluate_blueprint(blueprint, decide_fn)` calls the existing decision contract
for each requirement with feasibility, complexity and risk scores (0–10), a
component-type choice and an automatable Noul. Calls explicitly use A0. Source
fields remain nested untrusted data and cannot become runtime `answers`, an
authority override or a system prompt. Elevated or verified results are rejected.

The current Phase 1 runtime has no matching blueprint scoring rules. Its A0
answers therefore abstain. These appear as **Needs review**, with null scores;
unknown answers do not become zeroes or contribute to averages. A caller-bound
A0 decision function may supply typed scores, which the adapter and storage
boundary validate. An assessment never creates an evidence record or changes a
mission's verification state.

Exports use `buildanddo.blueprint-proposal.v1` and contain the source fingerprint,
full extracted lists and assessment. The `definition` reuses the existing mission
plan shape, with status `proposed`, an A0 review objective and empty approval,
baseline and verification-plan fields. `kind` distinguishes mission and challenge
proposals; the Challenge Desk already uses the mission lifecycle. The export is a
local JSON download. Import, review, design decisions and implementation remain
explicit subsequent work.

## Verification and rollback

```bash
python tests/upgrade/blueprint_fixture.py
python tests/upgrade/check_blueprints.py
node --test tests/upgrade/blueprint-*.test.mjs
npm --prefix apps/web test -- --run src/pages/workspace/__tests__/BlueprintPage.test.jsx
python -m mypy --strict --explicit-package-bases apps/research/blueprints.py apps/research/processing.py apps/research/worker.py apps/decision/workloads/blueprint_evaluation.py
```

The sample fixture is `tests/upgrade/fixtures/sample-blueprint.pdf`; its generator
uses standard PDF text operators and adds no dependency. Parser and policy tests
run with existing standard-library and Node tools. The connected round-trip test
runs the actual worker and application handlers, with explicit storage and
transport doubles when native dependencies are absent. The native suite uses the
existing disposable PocketBase fixture, native authentication and real PDF bytes.
Set `BUILDANDDO_TEST_POCKETBASE` to a local test binary and install the already
declared research dependencies, then run the checker with `--require-native` to
require actual PDF and PocketBase acceptance. Rendered tests require the existing
frontend packages. The dispatch report distinguishes executed tests from skips.

The new migration's down step removes the blueprint capability marker while
retaining source files, observations and retry keys. Blueprint operations and
protected downloads then fail closed; ordinary mission research continues. Reapply
the migration to restore review access. Roll back the matching source change with
the capability disabled; do not delete uploaded documents or rewrite the original
research migration.
