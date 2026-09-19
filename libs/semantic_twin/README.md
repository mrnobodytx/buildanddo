# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/__init__.py, libs/semantic_twin/schema.py
# EnumType:    Doc
# EnumEdges:   CONSUMES libs/semantic_twin/__init__.py; CONSUMES libs/semantic_twin/schema.py
# DAG Node:    semantic-twin.phase-0.documentation
# Intent:      Explain the frozen contracts, explicit version break and evidence trust boundary before runtime integration.
# ───────────────────────────────────────────────────────────────

# Living Semantic System Twin — Phase 0 contracts

Python 3.11+; standard library only. Import public types from
`libs.semantic_twin`. Contracts describe system state and externally produced
evidence. They perform no network requests, persistence, graph updates, policy
execution, hashing, signature checks, or deployment.

## Version 2

Object `schema_version`, event `version`, and transaction `schema_version` are
exactly `"2"`. Version 1 payloads are rejected: they lack enough information to
infer source revisions, independent verification, or authority safely. Rebuild
them from their original source and receipts; never relabel a version 1 payload
as version 2. The state enum spellings, 62 predicates, authority tiers and 15
design laws remain unchanged.

Every dataclass supports strict `from_dict`, `from_json`, `to_dict`, `to_json`,
and `json_schema`. Unknown fields, missing required fields, invalid enums,
duplicate JSON keys, naive timestamps, and non-finite numbers are rejected with
`ContractError`. Nested payloads are copied and frozen; wire output is detached.
Timestamps normalize to UTC. JSON uses sorted keys, ASCII escapes, compact
separators, finite numbers, and preserved array order. This is the named P0
serialization profile, **not RFC 8785**; numeric forms such as `1` and `1.0`
remain distinct. It does not compute digests.

Export the structural schema with:

```sh
python -m libs.semantic_twin.schema
```

Cross-field and evidence rules require the Python constructors in addition to
JSON Schema. The schema is generated from those same typed fields to avoid an
independently drifting copy.

## Identities and source boundaries

```python
from libs.semantic_twin import SemanticId, SubjectRef

identity = SemanticId.parse("CNI://SERVICE/classroom")
assert str(identity) == "cni://service/classroom"
subject = SubjectRef(identity, "release-2026-09-19")
assert SubjectRef.from_json(subject.to_json()) == subject
```

`NAMESPACE_REGISTRY` freezes section 46 namespaces plus explicit aliases for
section 34 entity classes. Scheme names and fixed namespace names normalize to
lowercase; entity paths retain case. Unreserved escapes normalize, while dot
segments, empty segments, encoded separators, credentials, ports, controls,
queries, and unknown namespaces fail. External Git IDs require a full immutable
revision: `ext-git://github.com/org/repo@<40-or-64-hex-commit>/path#symbol`.
Document references identify a document, version, and section.

`SubjectRef.version` means the **source/object revision**, never the contract
schema version. Every receipt and delta must match both ID and revision.
`SourceRevision`, `PayloadDigest`, `ArtifactDigest`, `DeploymentDigest`, and
semantic/context/evidence/source roots are distinct types. `MerkleBinding`
requires state-appropriate leaf, epoch, serialization, proof and lineage data.
An inclusion path is structurally checked; `INCLUSION_PROVEN` also requires an
typed external proof-verification receipt binding its result, verifier, version,
timestamp, subject and exact proof. Attestation signatures remain
external references.

## Relations and promotion

`RELATION_CONTRACTS` supplies domain/range and evidence disciplines for all 62
predicates. Section 35 requirements are marked separately from explicit P0
endpoint defaults where the source specification supplies no endpoint types.
Candidate edges may be `UNMEASURED`; a measured edge must cite scoped evidence.
Verified causal edges additionally require a hypothesis, temporal/mechanism and
confounder assessment, experiment, measured outcome, resolved contradictions and
independent verification. External patterns need a bounded Citadel experiment.

`allowed_transitions` reports adjacency; it grants no promotion.
`can_transition` and `require_transition` check receipts for consequential edges.
The former `direct_deterministic_verifier=True` argument is removed. The
`OBSERVED → VERIFIED` exception needs a `PromotionProof` whose policy names the
independent deterministic verifier and whose result contains sufficient evidence
and passed postconditions. Merkle, SHACL and authorization receipts never supply
factual truth by themselves. Unspecified automatic promotion phrases fail closed.

The evidence and SHACL graphs follow sections 36.2 and 25.4. Other adjacency
tables are a conservative P0 profile because their source sections do not give
exhaustive transition graphs. Authority and the open lifecycle axis have no
automatic transition policy.

`StateDelta` carries an axis, before/after values, reason, subject revision,
typed evidence and any prerequisite proof. `apply_state_deltas(current, deltas,
subject=subject)` checks every delta against the same original state, then
validates the resulting ten-axis vector. Duplicate axes, stale values, conflicting
records under one receipt ID, invalid edges or contradictory final states reject
the whole operation. This is a pure
in-memory operation, not a storage transaction or concurrency lock.

## Governed changes and receipts

`ChangeContract` contains all section 27.4 fields. `SemanticTransaction` binds
actor, intent, versioned targets, before/after roots, proposal, SHACL result,
policy, execution, verification and rollback. Stage prerequisites enforce
exact target/tool scope, evaluated preconditions, execution receipts, independent
verifiers, retained postconditions, and verified compensation. A3 records require
an explicit human grant with scope and expiry. A recorded grant grants this
package no external execution rights.

These contracts check **consistency of supplied evidence**, not its authenticity.
Callers must authenticate receipt producers, resolve evidence, enforce live
policy, verify signatures/proofs, and run actual tests at their execution boundary.
A caller constructing a dataclass has not verified reality. Claims of independent
measurement require externally observed evidence, beyond P0 unit tests.

```sh
python -m unittest tests.upgrade.test_semantic_twin tests.upgrade.test_semantic_twin_contracts
python -m mypy --strict libs/semantic_twin
```

## Existing ingestion consumers

The bounded release compiler and the local Phase 1 compiler emit strict v2
objects. Their outer payload versions are `semantic-twin.graph/v2` and
`semantic-twin.phase1-complete/v2`. Read each `objects` entry with
`CanonicalObjectEnvelope.from_dict`. Graph `leaf_digests` are separate typed
records containing the subject identity/revision and a SHA-256 digest of the
exact `to_json()` bytes. Serializing a graph does not change an object's Merkle
state or create an incomplete leaf binding.

Extractor categories such as `GitLabJob` remain in claim metadata;
`object_kind` reads both batch `ingestion_kind` and snapshot `ingestion.kind`
records. `object_type` always uses the frozen `EntityType`. Extractor-local keys
map to type-qualified canonical identities. This reconstructs captured inputs;
it does not decode version-one envelopes.

Batch adapters bind the SHA-256 revisions of the bytes actually parsed and
reject conflicting input revisions during resolution. `SourceSnapshot` also
supports caller-captured bytes, source paths, section selectors and timestamps
through the snapshot builder. A supplied repository commit remains context; it
does not assert that a dirty file or an external export matches that commit.
Observation timestamps describe capture, independently of Git author time,
deployment time or file mtime. Replaying the same inputs and capture time is
deterministic; a new observation time can change the graph digest.

Batch adapters assemble `GraphDraft` fragments and resolve them together with
their anchors. The snapshot builder can also assemble `SemanticGraph` fragments
with pending edges separate from canonical objects. Resolved batch graphs retain
their local aliases so both paths compose through `combine_graphs`. Combining
fragments binds actual endpoint types and revisions; conflicting aliases and
changed target revisions fail validation. Unresolved edges block serialization,
epoch creation and context compilation. The patch-free `phase1.compat` entry
points remain available for snapshot-builder callers.

The static release diagram uses capability nodes whose proposed sequence edges
remain `UNMEASURED`. They do not represent executed deployments. Documentation
classifications retain their AST/string origin, memory edges remain recorded
assertions, and provider `PASS` fields stay observations with `NOT_TESTED` TEVV.
None of those inputs mint verification receipts or a live runtime status.
Receipt-file I/O and event publication have distinct endpoints.

Run the combined contract and consumer acceptance suite:

```sh
python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py'
```
