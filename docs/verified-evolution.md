# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/verified-evolution.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/cli.py, libs/evolution/promotion.py, libs/evolution/compiler.py, libs/semantic_twin/phase1/compiler.py, libs/semantic_twin/transactions.py
# EnumType:    Doc
# EnumEdges:   CONSUMES libs/evolution/cli.py; CONSUMES libs/evolution/promotion.py; CONSUMES libs/evolution/compiler.py; CONSUMES libs/semantic_twin/phase1/compiler.py; CONSUMES libs/semantic_twin/transactions.py
# Intent:      Explain the executable learning lifecycle, evidence denominators and receiving authority boundary.
# ───────────────────────────────────────────────────────────────

# Citadel Verified Evolution Fabric v1

The local fabric connects captured experience, structured hypotheses, held-out
evaluation, typed competence promotion and deterministic action proposals. It uses
Python's standard library and the existing semantic-twin contracts. It adds no
application backend, model client, remote memory writer or executor.

**Competence may increase automatically; authority may not.** A capability's
authority is fixed by its captured scope. Promotion never creates a policy allow,
an authority grant, an execution receipt or a causal finding.

## Run the first corpus

From the repository, either entry point works without installation:

```bash
scripts/citadel-evolve --help
python -m libs.evolution --help

scripts/citadel-evolve observe --git . --limit 100
scripts/citadel-evolve episodes
scripts/citadel-evolve benchmark --repository . --limit 100 \
  --output state/evolution/history-first.json
scripts/citadel-evolve status --human
```

Global options precede the command: `--state <local-sqlite-file>`,
`--scope <tenant/workspace-boundary>` and `--actor <semantic-id>`.
The default scope is the public BuildAndDo repository. The journal belongs in
ignored `state/` or another explicitly selected local directory, never in Git.
A shared journal partitions records by exact scope, but it is not an authentication
server: its file owner can read the file. Receiving systems must establish actor
identity and tenant/workspace access before supplying captures or callbacks.

The historical benchmark reads the last 100 local commits through Phase 1 history
ingestion. Each prediction sees the first-parent tree and declared changed paths.
Merge changes come from first-parent tree metadata, without content-based rename
search. Python import closure selects affected modules and tests. Source bodies
come only from locally present Git objects; missing, oversized and unparseable
files remain named gaps. No historical checkout, build, test, repair or remote
fetch is performed.

Parent-path resolution and structural prediction coverage describe source
availability. They are not accuracy or verified competence. Outcome accuracy
requires independently reviewed labels bound to the exact result event and SHA.
A commit message, later fix, Type C memory assertion, passing provider string or
unsigned mission-learning record cannot supply that oracle. Predictions abstain
on future failures and repair classes without supporting evidence. Causal
identification remains unmeasured.

Optional model comparisons consume previously captured answers for the same
historical `input_id` via `benchmark --models captures.json`.
The command makes zero model calls. Saved report files retain all cases; a
subsequent benchmark compares epochs only when corpus, grading evidence and
scoring profile match. Missing denominators remain null.

## Capture contract

`observe --input capture.json --format capture` accepts
`citadel.evolution.capture/v1`. Its fields are:

| Capture field | Meaning |
|---|---|
| `scope_id` | Exact tenant/workspace or public-repository boundary |
| `source_kind` | `git`, `gitlab`, `datadog`, `posthog`, `supabase`, `pocketbase`, `aaxp`, `agent`, `test`, `deployment`, `tevv`, `graph`, `memory`, `mission`, `telemetry` or `evolution` |
| `source_ref`, `observed_at` | Export provenance and actual source observation time |
| `authority`, `risk` | Captured consequence boundary; neither grants permission |
| `records` | Typed `CapturedRecord` objects |

Each record requires `occurred_at`, `correlation_id`,
`actor_id`, `event_type`, `subject_id`,
`subject_version` and a narrative `phase`:
`PROBLEM`, `CONTEXT`, `HYPOTHESIS`,
`ACTION`, `RESULT`, or `VERIFICATION`.
Optional fields include full `source_sha`, mission, input/output IDs,
evidence references, string features, structured data and a P0
`VerificationReceipt`. `Capture.from_dict` and
`CitadelEvent.from_dict` reject unknown fields, invalid enums and
untyped receipts. All times must be aware and ordered. The input byte digest and
canonical event content identity survive persistence.

Named capture families are local export contracts, not installed provider
integrations. Native exporters remain with their existing receiving owners.
Only permitted, sanitized public exports belong in this repository session.

Existing repository exports also have direct adapters:

| `--format` | Existing input | Evidence retained |
|---|---|---|
| `events` | Array of canonical `CitadelEvent` wire objects | Exact IDs, time, scope and typed receipts |
| `mission-learning` | `missionLearning.js`'s `buildanddo.mission-learning/1` | Unsigned review assertion and linked evidence IDs |
| `memory` | Existing three-type `memory.json` | Dated Type C assertions; missing dates/revisions are gaps |
| `telemetry` | `telemetry_snapshot.py` JSON | Exact metrics, including nulls, source SHA and time |
| `phase1` | Phase 1 compilation or `semantic-twin.graph/v2` | Validated canonical objects and source claims |

The source kind does not change an event's evidentiary standing. Normalized
exports remain observations. A `VERIFIED` canonical event requires
a corresponding typed P0 receipt; receiver authentication remains external.

## Episodes and discovery

Events group by scope and correlation. A group cannot mix mission or authority.
Every attempt uses `data.attempt_id`. Its result must reference the
action's event ID in `inputs`; its review must reference the result.
A typed review binds the exact result subject/version and includes that immutable
result event ID as an evidence source. Its verifier differs from both producers.
Failed attempts are retained before later success.

An episode is `INCOMPLETE` when narrative stages or result/review
links are missing. `COMPLETE` only describes a complete narrative.
`VERIFIED` additionally requires the final attempt's independently
supported passing outcome. Source states are not writable verified booleans.

Discovery groups repeated exact trigger/response structures within an explicit
cutoff. Action data provides a `ResponseTemplate` in
`data.response` or a full `Rule` in `data.rule`.
It retains every observation and counts independent successes separately.
A rule uses exact string features, canonical relation predicates, scalar graph
lookups and finite parameter substitutions such as `$importer`.
There is no expression evaluator, generated Python or arbitrary command template.

```bash
scripts/citadel-evolve candidates --before <actual-discovery-cutoff> \
  --compatibility compatibility.json
scripts/citadel-evolve replay --candidate <candidate-id> --cases holdout.json
scripts/citadel-evolve shadow --candidate <candidate-id> \
  --cases shadow.json --teachers teacher-captures.json
```

`Compatibility` contains the full source SHA, typed context root,
graph schema `2` and optional typed SBOM digest.
`GraphSnapshot` constructs that context root from exact canonical
objects, scope and source/supply boundaries. Unknown supply context prevents
verified promotion. Ambiguous graph aliases and missing lookups abstain.

## Replay, shadow and promotion

Case arrays contain `ReplayCase(observation=DecisionInput, episode=Episode)`
wire objects. Features must exist before the captured action. Graph objects and
their evidence must be dated at or before the frozen decision boundary. Current
captures cannot be backdated into historical decision knowledge.

Holdout excludes discovery episode IDs, correlations and all discovery source
revisions, and must follow the entire discovery window. Duplicate/correlated
cases fail. Shadow uses later episodes distinct from replay, with a captured
teacher prediction for every exact input identity. No student action is executed.

`data.labels` on an independently verified result can contain
`OutcomeLabels`: exact rule digest and applicability, actual
structured action, tests, explicitly safe/unsafe action keys, observed false
mutation/rollback labels and historical subsystem/dependency/risk/failure/repair
labels. Unbound or missing labels are not graded. Safety labels concern exact
action keys, including target and parameters, not broad operation names.

Reports retain predictions, inputs, results, receipts, numerators, denominators,
measured tokenless latency and zero model usage. Captured teacher usage can be
missing. Agreement is reported separately from both engines' correctness. Resource
deltas use paired available measurements only.

The ladder is:

```text
DISCOVERED → HYPOTHESIS → CANDIDATE → REPLAY_PASS → SHADOW
           → VERIFIED_CAPABILITY → TOKENLESS_PREFERRED
```

The default immutable policy requires two discovery successes, ten replay cases
and five shadow cases, precision ≥ 0.95, recall ≥ 0.8, correct action selection
≥ 0.9 and test recall ≥ 0.8. Every proposed action needs reviewed applicability
and safety/side-effect labels; unsafe recommendations, observed false mutations
or required rollback disqualify promotion. Missing data cannot lower thresholds.
At least one shadow case must exercise the declared runtime compatibility boundary.

Verified promotion calls P0 `PromotionProof.validate_for` for both
evidence `VERIFIED` and TEVV `PASS`. The supplied independent
receipt must cover `replay`, `shadow`, `safety`
and `compatibility`, name the exact candidate revision, preserve its
authority, and reference both full evaluation artifact IDs. The CLI does not
create that receipt or authenticate the claimed verifier.

```bash
scripts/citadel-evolve promote --candidate <candidate-id> \
  --to TOKENLESS_PREFERRED --through --proof independent-promotion-proof.json
```

`--through` visits each intermediate gate. If a later gate holds,
the already qualified prefix remains inspectable in the journal. Promotion
policies cannot be weakened in an existing record. Revisions restart as
hypotheses and retain the previous version's history.

## Use and demotion

`use --input decision-input.json --mission <mission-id>` selects
one compatible preferred program and emits an `ActionProposal`.
Missing or ambiguous matches remain unresolved unless the embedding runtime
explicitly supplies local and then frontier `Reasoner` callbacks.
CLI model fallbacks are unconfigured. Every callback result is checked against
the same scope, source/context, authority, target and operation boundaries.

The proposal's `require_contract` and `draft_transaction`
methods bind it to P0 `ChangeContract` and `SemanticTransaction`.
The receiving caller supplies actor, executor, independent verifier, objective,
mission, policy version, explicit target revisions, evidence, preconditions,
postconditions, forbidden effects and compensation. The transaction revision is
the proposal ID's final digest segment; input evidence binds that revision.
Its state is `DRAFT`. Existing AAXP, policy, authority, adapter,
execution and verification stages still have to occur.

Use records an observation containing the proposal and usage. It is an attempt,
not a result. Subsequent actual result/review events reference it by event ID,
closing the loop through the same episode builder and discovery gates.

An incompatible actual request automatically moves a preferred record to
`SHADOW` before routing. `demote --health health.json`
accepts measured rolling evaluation, compatibility or typed TEVV regression:
quality degradation moves to `WATCH`, incompatibility to
`SHADOW`, unsafe recommendations/false mutations or TEVV failure
to `DISABLED`. Authority is unchanged. Restoring competence needs
fresh evaluations and new shadow cases; a disabled version is terminal and needs
a new hypothesis revision.

The SQLite journal uses append-only content artifacts and transactional
compare-and-swap registry updates. Retries preserve the first event ingestion;
conflicting identities, stale updates, deleted evidence and rewritten history
fail closed. Status epochs hash their predecessor and distinguish changing
request mix from fixed-corpus accuracy improvement.

## Verify and receiving integration

```bash
python -m unittest discover -s tests/upgrade -p 'test_evolution*.py' -v
python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py'
python -m mypy --strict libs/evolution
python -m ruff check libs/evolution tests/upgrade/test_evolution*.py scripts/citadel-evolve
```

The source suite contains explicitly synthetic receipts, model captures and
episodes. Its passing tests do not establish deployed learning, independent
runtime TEVV, model quality or authenticated identities. The real Git benchmark
is separately retained in this dispatch's evidence.

The receiving runtime owns authenticated exports, mission-completion triggers,
model adapters, AAXP execution and independent verification. Feed its permitted
captures into the same local commands/API and retain the returned artifacts.
Exported observations or prepared proposals confer no activation/deployment
authority. No live model, provider, NXC/DKG or application hook was activated by
this source change.

Rollback removes the additive package/entry point and registration. Archive the
local journal if desired; no executed effects require remote compensation.
