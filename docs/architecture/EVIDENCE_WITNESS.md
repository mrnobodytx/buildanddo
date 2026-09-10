# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/architecture/EVIDENCE_WITNESS.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-WITNESS-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     docs/architecture/CAPABILITY_PASSPORT.md,
#              apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js,
#              services/praxis_evidence/claims.py
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js;
#              PRODUCES buildanddo.public-anchor/v1;
#              GATES docs/architecture/CAPABILITY_PASSPORT.md
# Intent:      Explain why BuildAndDo publishes evidence fingerprints to a public
#              network, and state precisely what that does and does not prove.
# ───────────────────────────────────────────────────────────────

# External Evidence Witness

## Why this exists

BuildAndDo already keeps an internal hash-linked evidence chain. Every receipt
contains the digest of the record before it, so changing old history breaks the
chain and the break is detectable. On top of that chain sit the knowledge graph,
the SBOM and provenance manifests (`BUILDANDDO_SOURCE_PROVENANCE.json`,
`BUILDANDDO_CANDIDATE_PROVENANCE.json`), the evidence fabric in
`services/praxis_evidence/`, and TEVV verification records.

All of that is internally verifiable. Which is the problem.

Suppose BuildAndDo states:

> "CAP-0081 passed verification on September 10."

Internally there is a source commit, an SBOM, test output, a provenance record,
an authorship graph and a TEVV receipt. BuildAndDo can check every one of them.
A skeptic can then ask a question that none of those checks answer:

> "Could you have rewritten all of those records yesterday and claimed they
> were from September 10?"

Today the honest answer is: you would have to trust us. Every artifact in the
chain, and every tool that verifies the chain, is under the same operator's
control. An internal chain proves **internal consistency**. It cannot prove
**when** a state existed, because the clock, the storage and the verifier all
belong to the party making the claim.

The External Evidence Witness closes that specific gap, and nothing else. At
chosen moments BuildAndDo computes one deterministic fingerprint over a defined
set of evidence and publishes that fingerprint — only the fingerprint — to a
network it does not control. Later, anyone can recompute the fingerprint from the
evidence and compare it against the public record.

This is not a blockchain product, a token, or a new subsystem. It is one control
and one 32-byte digest.

## Architecture

```text
INTERNAL EVIDENCE (private plane)

  receipt ──► receipt ──► receipt ──► receipt        hash-linked chain
  DKG edges     SBOM      provenance     TEVV        verifiable artifacts
        │
        │  batch a defined, ordered set
        ▼
  EVIDENCE EPOCH            EPOCH-20260910-01
        │                   artifact_count: 421
        │  canonical serialisation, leaf digests
        ▼
  MERKLE TREE               sha256-merkle-v1
        │
        ▼
  ROOT DIGEST               83ac...29bf        one 32-byte value
        │
        │  wrap with epoch identity + parent link
        ▼
  ANCHOR MANIFEST           buildanddo.public-anchor/v1
        │
        │  publish the manifest digest only
        ▼
PUBLIC NETWORK (not controlled by BuildAndDo)

  transaction @ time T ──► permanent timestamped witness
        │
        ▼
  INDEPENDENT VERIFIER
  recompute root ──► compare against public record ──► agree / disagree
```

Two properties of that diagram matter more than the boxes:

- **The arrow out of the private plane carries a digest, not data.** Nothing
  crosses the boundary except fixed-length hex strings and epoch identifiers.
- **The verifier at the bottom is not BuildAndDo.** If the comparison can only
  be performed by us, the control has failed and provides no additional
  assurance over the internal chain.

## What an anchor proves, and what it does not

This section is the control's reason for existing. Systems that anchor hashes
publicly routinely overclaim what that buys them; BuildAndDo states the limits
in the same place it states the guarantee.

**An anchor proves:**

- This fingerprint existed **no later than** the public timestamp.
- The evidence read today still matches the fingerprint that was anchored, so
  the intervening history has not been silently rewritten.
- The epoch chain is continuous: each epoch names its parent and its parent's
  root, so a removed or reordered epoch is detectable.

**An anchor does not prove:**

- That any underlying claim is **true**. A false claim hashes exactly as well as
  a true one. Truth is established by TEVV verification, reproduction and audit
  — never by publication.
- That the evidence was **complete**. It proves what was included, not that
  nothing was omitted. An epoch is evidence about a defined set, and the set
  definition is itself part of the record.
- That the fingerprint existed **no earlier** than the timestamp. A public
  anchor is an upper bound on age, not a lower bound.
- That anything is **authorised**. Publication grants no permission, no
  approval, and no verification status. `authority_effect: NONE` is not a
  formality; it is the point.
- That BuildAndDo is honest. It narrows what dishonesty is possible without
  detection. That is a smaller and more defensible claim.

The user-facing statement is therefore:

> You do not have to trust us when we say the record has not changed.
> BuildAndDo periodically publishes cryptographic fingerprints of its verified
> evidence so anyone can independently check its history.

Not: "the blockchain proves our claims."

## Control NEXUS-AUD-002

```yaml
control_id: NEXUS-AUD-002
name: External Witness Anchoring

rule:
  critical evidence epochs may be externally witnessed

input:
  - ledger_head
  - merkle_root
  - sbom_root
  - graph_snapshot_hash
  - verification_epoch

public_payload:
  - schema_version
  - epoch_id
  - root_digest
  - previous_anchor_digest

forbidden_public_data:
  - pii
  - secrets
  - customer_content
  - source_documents
  - private_graph_nodes

authority_effect: NONE
```

`authority_effect: NONE` inherits an existing invariant: in the BuildAndDo
architecture, evidence and memory cannot independently authorise an action, and
reasoner agreement is evidence rather than authorisation. An external network
gets no exemption from that rule. It is one more witness, with no standing to
approve anything.

Two structural consequences follow, and both are enforced rather than asserted:

1. **The anchoring pipeline lives on the private plane.** It reads private
   receipts and holds publication authority, so it is not committed to this
   public repository. Requests for it go through `.bits/handoffs/`.
2. **The public collections are read-only to clients.** `evidence_epochs` and
   `anchor_manifests` are readable by anyone and writable only by a superuser,
   so a browser session can never author a proof about itself.

## Evidence epoch design

Anchoring every internal event would be expensive, noisy and pointless: the
value of a witness comes from the timestamp, not the frequency. Instead,
internal events are batched into **evidence epochs**, and an epoch is the unit
that gets anchored.

```text
internal events
    ├── 12,431 receipts
    ├──     87 graph changes
    ├──      4 deployments
    ├──     19 verified capabilities
    └──      3 SBOM generations
              │
              ▼
      EPOCH-20260910-01
              │
         Merkle tree
              │
              ▼
      one 32-byte root
              │
              ▼
        public anchor
```

Epoch rules:

- **Identifier:** `EPOCH-<YYYYMMDD>-<NN>`, sequence per UTC day.
- **Deterministic:** the same artifact set, canonically serialised in the same
  order, must always produce the same root. Any nondeterminism — map iteration
  order, local timezones, floating point — makes independent verification
  impossible and is a defect.
- **Chained:** each epoch records `previous_epoch` and `previous_root`, so
  epochs form their own hash-linked chain above the receipt chain.
- **Sealed before anchored:** an epoch is closed (`SEALED`) before a manifest is
  produced. An epoch that is still accepting artifacts has no stable root.
- **Stated scope:** the artifact set is part of the record, because a root over
  an undisclosed set proves nothing useful.

### When to anchor

- A **release**.
- A public BuildAndDo **capability reaches VERIFIED**.
- A **Commons covenant or RFC release** (see below).
- A **daily evidence checkpoint**, so gaps in the timeline are visible.
- A **production deployment**.
- A significant **model or policy change**.
- An important **audit report**.

In practice: roughly once daily, plus release-triggered and
capability-triggered anchors. A missing daily checkpoint is itself a signal
worth reading.

## Security model

The public payload is a whitelist, not a filter. Anything not named in
`public_payload` does not leave the private plane.

Forbidden in the public payload, without exception:

| Forbidden | Why |
|-----------|-----|
| PII | Digests are permanent and cannot be redacted after publication. |
| Secrets, keys, tokens | Publication is irreversible; rotation cannot undo it. |
| Customer content | Not ours to publish, at any resolution. |
| Source documents | The digest is the claim; the document stays private. |
| Private graph nodes | Node identifiers leak structure, relationships and volume. |

Additional constraints:

- **Digest only.** The manifest is assembled privately, then hashed, and only
  that digest is published. No field of the manifest is published in clear.
- **No re-identification through granularity.** Anchoring frequently enough to
  correlate a single event with a single anchor would leak activity timing.
  Epoch batching is a privacy property as well as a cost property.
- **Failure is loud and non-blocking.** If a public network is unreachable, the
  epoch stays `ANCHOR_PENDING` and says so. An unavailable witness must never
  block internal verification, and must never be rendered as if a witness
  existed.
- **Mismatch is not silently resolved.** If a recomputed root disagrees with the
  anchored root, the correct behaviour is to surface `MISMATCH` and investigate.
  Overwriting the local record to match the anchor destroys the only signal the
  control produces.

## Anchor manifest schema

`buildanddo.public-anchor/v1`

```json
{
  "schema": "buildanddo.public-anchor/v1",
  "epoch_id": "EPOCH-20260910-01",
  "root_algorithm": "sha256-merkle-v1",
  "root_digest": "83ac...29bf",
  "previous_epoch": "EPOCH-20260909-03",
  "previous_root": "20fd...7c14",
  "artifact_count": 421,
  "created_at": "2026-09-10T15:13:00Z"
}
```

Field notes:

- `schema` is versioned. A change to how the root is computed requires a new
  version, because old anchors must remain verifiable under the rules that were
  in force when they were made.
- `root_algorithm` is explicit for the same reason. `sha256-merkle-v1` names the
  leaf encoding, the pairing rule and the odd-node rule, not just the hash.
- `previous_epoch` and `previous_root` make the epoch chain independently
  walkable.
- `artifact_count` is a cheap completeness check against the recorded set.
- Only the **digest of this manifest** is published. The manifest itself is
  retained privately and served to verifiers as needed.

## Storage

Two collections carry the public read surface. Both are readable by anyone and
writable only by a superuser; see
`apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js`.

- **`evidence_epochs`** — one record per epoch: identifier, root algorithm and
  digest, parent link, artifact count, artifact list, the capabilities the epoch
  covers, open/close timestamps, and status
  (`OPEN`, `SEALED`, `ANCHOR_PENDING`, `ANCHORED`, `MISMATCH`).
- **`anchor_manifests`** — one record per anchor attempt: schema version, epoch
  relation, root digest, manifest digest, previous anchor digest, network name,
  anchor reference, anchored timestamp, the publicly observed root on re-check,
  verification state, trigger, and `control_id` (`NEXUS-AUD-002`).

The separation matters. An epoch exists whether or not it was ever anchored, and
an anchor attempt exists whether or not it succeeded. Collapsing them would make
"never anchored" and "anchored and mismatched" indistinguishable, which are
opposite conclusions.

## Governance provenance

The same chain applies to the covenant and RFC documents that govern the
project:

```text
Discord idea ──► BuildAndDo suggestion ──► RFC-0001 ──► Commons Covenant v0.1
                                                              │
                                                        git commit
                                                              │
                                                       document digest
                                                              │
                                                       evidence epoch
                                                              │
                                                        PUBLIC ANCHOR
```

Which yields a publicly witnessed governance history:

```text
v0.1 ──► anchor A
  │
  └── v0.2 (parent v0.1) ──► anchor B
```

Years later BuildAndDo can show that a specific covenant text, represented by a
specific digest, existed at a specific time — without asking anyone to trust the
project's own timestamps.

## Community attribution

This design originated in the BuildAndDo Discord, not internally.

- **ErichG** proposed publicly notarising evidence roots — an external witness
  over the private provenance chain rather than moving anything onto a chain.
  This document is his suggestion, implemented as one control, with the
  epistemic limits written down.
- **Fabi** argued for learning by doing: attempt a real problem, observe what
  happened, verify the result. Independent verification is that principle
  applied to the project's own claims about itself.
- **delphianQ** argued that LLMs need a structural, GPL-equivalent foundation
  rather than another tool. Verifiable provenance is a prerequisite for any such
  structure: a licence that cannot be checked is a request, not a foundation.

BuildAndDo's position, which these three lines of argument converge on: **a
verification claim should be independently checkable, not trust-dependent.** An
anchor is how that applies to time.

Attribution is recorded here because it is the provenance of the provenance
system. A project that asks to be judged on verifiable records should be able to
show where its own designs came from.

## Related

- [CAPABILITY_PASSPORT.md](./CAPABILITY_PASSPORT.md) — the user-facing surface
  this control feeds.
- [../observability/datadog-ci.md](../observability/datadog-ci.md) — pipeline
  self-measurement, the other half of "measured, not asserted".
- `.bits/srs/SRS-BUILDANDDO-WITNESS-001.md` — the spec and acceptance evidence.
