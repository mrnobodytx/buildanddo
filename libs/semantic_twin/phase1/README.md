# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/phase1/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/phase1/compiler.py, libs/semantic_twin/phase1/context.py
# EnumType:    Doc
# EnumEdges:   CONSUMES libs/semantic_twin/phase1/compiler.py; CONSUMES libs/semantic_twin/phase1/context.py; CONSUMES libs/semantic_twin/ingestion/drafts.py
# Intent:      Document reproducible v2 ingestion, evidence inputs and the limits of release and context proof claims.
# ───────────────────────────────────────────────────────────────

# BuildAndDo Phase 1 ingestion

Compile the local BuildAndDo release subsystem into Phase 0 v2 envelopes,
an evidence graph, a release-truth matrix, a semantic epoch and a context bundle.
Runtime dependencies are Python 3.11+ and the standard library.

```bash
python -m libs.semantic_twin.phase1 --repo . --history-limit 100 --output /tmp/buildanddo-twin.json
```

The compiler parses `tools/buildanddo_release.py` with `ast`; it never imports
or executes that controller. It reads SRS claims, `.bits/out` reports and memory,
bounded local Git history, the root npm lock and discovered SBOMs. Local controller
receipts are discovered under `state/**/release/` and `.citadel-release/*.json`.
GitLab and Datadog exports must be explicitly supplied. An absent Git directory
or optional input remains `UNMEASURED` in `input_status` and in the graph.

Explicit paths override receipt/SBOM/memory discovery:

```bash
python -m libs.semantic_twin.phase1 --repo . \
  --release-receipt /tmp/public-capture/pipeline_production.latest.json \
  --gitlab-export /tmp/public-capture/gitlab.json \
  --datadog-export /tmp/public-capture/datadog.json \
  --sbom /tmp/public-capture/sbom.json \
  --memory /tmp/public-capture/memory.json \
  --output /tmp/buildanddo-twin.json
```

These flags accept repeated paths. Use caller-supplied public evidence only;
the compiler has no provider credentials, network client or deployment authority.
Full graph output can contain source text from claims and memory, so choose its
destination according to the input's visibility. Generated captures are not
automatically committed or published.

## Capture and release identity

`Source.version` hashes the exact bytes parsed, including documentation and
provider exports. Repository HEAD is recorded separately as context. Parsing
dirty files therefore cannot falsely claim their bytes came from HEAD.
Conflicting snapshots of one input within a compile are rejected.

The default capture time is the current UTC time. Save the complete JSON payload
to preserve that observation boundary. To reproduce the same output, preserve
all input bytes, Git history, parameters and parser version, then reuse the saved
`capture_time` with `--observed-at`. This option declares the original snapshot's
capture time; using an old timestamp for newly collected data is not historical
verification. Different capture times intentionally produce different roots.

Use `--expected-sha` to reconcile a particular release instead of the checkout's
HEAD. `--expected-artifact-digest` compares the controller's `manifest.tree_sha256`
by default. `--artifact-digest-field` can instead select `artifact_sha256` or
`artifact_digest` when the expected value uses that format. Tree, archive,
payload and input-file hashes are distinct identities.

The truth matrix uses the latest dated observation per record category, role and
environment, retaining undated records because their order is unknown. Earlier
observations stay in the graph and are identified in `superseded_observations`.
A pipeline or deployment `PASS` cannot establish a verified environment. A
readback needs the expected and deployed SHA, timestamp, health, SHA-match and
lesson checks. DORA needs a captured acknowledgment or a provider record for
`buildanddo-public`; its timestamp must follow production readback. Results are
`CONSISTENT_CAPTURE`, `INCOMPLETE` or `CONFLICT`, never independent `VERIFIED` truth.

## Provider export shapes

GitLab exports wrap the original records in named arrays:

```json
{"pipelines": [], "jobs": [], "artifacts": []}
```

Datadog exports use:

```json
{"dora": [], "traces": [], "events": [], "verifications": []}
```

Individual JSON:API records may contain `id` and `attributes`; DORA's nested
`git.commit_sha` and GitLab's nested pipeline/environment fields are supported.
At least one category key must exist. Empty arrays explicitly mean no records;
they do not prove a successful deployment. Malformed categories, duplicate JSON
keys and non-finite numbers fail validation. Release-relevant scalar fields are
projected; request bodies and unrelated provider fields are excluded.

Documentation classification supports explicit AST/string presence propositions
such as “defines `verify_environment`” or “never calls `write_receipt`”. Unsupported
behavioral assertions stay `UNMEASURED`. Memory Type B relationships are captured
as claims with references, rather than reasserted as observed code or runtime edges.

## Canonical graphs and proofs

`compile_release_twin` and `compile_phase1` return canonical graphs. Individual
Phase 1 adapters and bounded `extract_*` functions build `GraphDraft` fragments;
combine those with their anchors and call
`resolve(repository_root=..., observed_at=...)` to validate the full graph.
Resolution supplies typed semantic IDs, endpoint types and exact revisions,
subject-scoped evidence, and all ten state axes. No factory is monkeypatched.

The snapshot builder API from Phase 0 remains available: `SourceSnapshot`,
`ingestion.builder.make_object`, and `SemanticGraph` fragments with pending
edges. Resolved batch graphs retain local aliases so `combine_graphs` can join
them with snapshot fragments. Conflicting aliases and changed endpoint revisions
are rejected. Serialization, epoch creation and context compilation require all
edges to be resolved. `phase1.compat` retains its patch-free builder and bounded
compiler entry points.

The eight static release nodes describe capabilities. Their proposed order has
`UNMEASURED` edges and no runtime verification evidence; captured receipts are
separate observations used by the release-truth matrix.

The JSON graph uses `semantic-twin.graph/v2`. Every item in `objects` round-trips
through `CanonicalObjectEnvelope.from_json`. Leaf metadata is separate from the
envelope: SHA-256 covers its complete Phase 0 canonical serialization (sorted
keys, compact JSON, ASCII escapes, finite numbers). Envelope evidence or
provenance changes therefore invalidate its leaf. Objects keep `UNHASHED` state;
the separate typed epoch and proofs bind those exact bytes without recursively
embedding a leaf digest in itself.

Each `leaf_digests` entry contains `subject` and `digest` records, binding a
semantic ID and source revision to a typed content digest. Consumers of the
earlier ID-to-digest mapping must read these records instead.

The epoch uses Phase 0 `MerkleEpoch`, `MerkleLeaf`, `MerkleRoot` and
`InclusionProof`. Leaves are sorted by semantic ID. Parent hashes use `0x01 ||
left || right`, with duplicate-last padding for odd populations.

Context bundles include the selected canonical objects, membership proofs,
question, selection reasons and capture boundary. A consumer can verify them:

```python
from libs.semantic_twin.phase1.context import ContextProofBundle, verify_context_bundle

bundle = ContextProofBundle.from_dict(payload["context"])
valid = verify_context_bundle(
    bundle,
    expected_root=trusted_semantic_root,
    expected_query=original_question,
    expected_context_root=trusted_context_root,
)
```

Supply trusted roots from the intended saved capture; accepting roots supplied
only by an untrusted bundle cannot authenticate that capture. Proofs establish
membership and payload integrity, not factual correctness, search completeness,
authorization or attestation.

`--historical-cutoff` excludes objects observed after the cutoff, objects without
an observation time, and objects whose references would expose excluded targets.
Git author dates describe history but do not backdate today's capture. Replaying
an old decision requires its saved epoch/context; filtering today's graph is not
a reconstruction of evidence that was available then.

## Validation

```bash
python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py' -v
python -m mypy --strict libs/semantic_twin/ingestion libs/semantic_twin/phase1
```

The focused integration suite exercises controller receipt shapes, unavailable
inputs, false-success cases, exact source versions, malformed exports, canonical
round trips, odd/single-leaf trees, altered payloads and historical exclusions.
