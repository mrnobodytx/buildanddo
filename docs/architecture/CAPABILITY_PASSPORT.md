# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/architecture/CAPABILITY_PASSPORT.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-WITNESS-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     docs/architecture/EVIDENCE_WITNESS.md,
#              apps/web/src/pages/workspace/SpecialistDeskPage.jsx,
#              services/praxis_evidence/claims.py
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/architecture/EVIDENCE_WITNESS.md;
#              VALIDATES apps/web/src/components/workspace/PublicProof.jsx;
#              VALIDATES apps/web/src/components/workspace/EpochTimeline.jsx
# Intent:      Define the verifiable provenance record shown for a BuildAndDo
#              capability, and the layers a reader may check independently.
# ───────────────────────────────────────────────────────────────

# Capability Passport

## What it is

A Capability Passport is the verifiable provenance record for a single
BuildAndDo capability. It answers one question in a form a stranger can check:

> On what basis does BuildAndDo claim this capability works?

It is not a badge, a score, or a marketing summary. Every line on a passport is
either a digest, a record identifier, a verification outcome, or an explicit
statement that something is absent. "Absent" is a valid and common value —
rendering an unverified layer as verified is the specific failure this surface
exists to prevent.

A capability is anything BuildAndDo claims to be able to do: a shipped feature,
a workflow, a verified method in the practice library, a deployment path. Each
carries an identifier such as `CAP-0081`.

## The four layers

```text
CAP-0081
   │
   ├── 1. SOURCE LINEAGE     which commit, derived from what
   ├── 2. SBOM               what it is built out of
   ├── 3. TEVV VERIFICATION  whether it was tested and observed to work
   └── 4. PUBLIC WITNESS     whether that record was pinned in public time
```

The layers are ordered by what they establish, and each answers a question the
one before it cannot.

### 1. Source lineage

Which commit the capability corresponds to, and what that commit was derived
from. Backed by `BUILDANDDO_SOURCE_PROVENANCE.json`,
`BUILDANDDO_CANDIDATE_PROVENANCE.json` and the lineage logic in
`services/praxis_evidence/source_lineage.py`, which tracks `DERIVED_FROM` and
`COPIES` relations so two sources that share an origin are not counted as
independent corroboration.

Answers: *what exactly is this?*
Does not answer: *does it work?*

### 2. SBOM

The dependency set the capability is built out of. Establishes what a
vulnerability disclosure applies to, and makes "this component was already in
the build at that time" a checkable statement rather than a recollection.

Answers: *what is it made of?*
Does not answer: *does it work?*

### 3. TEVV verification

Tested, evaluated, verified and validated. The only layer that speaks to whether
the capability actually does what is claimed, because it is the only layer with
observed results attached. Under this repository's rules, TEVV may be claimed
only with observed results, and self-audit cannot settle verification —
`services/praxis_evidence/audits.py` checks the real recorded author against the
auditor rather than trusting a caller-supplied flag.

Answers: *does it work?*
Does not answer: *when was this record made, and has it changed since?*

### 4. Public witness

Whether the evidence for the layers above was included in an evidence epoch
whose root digest was anchored to a public network. See
[EVIDENCE_WITNESS.md](./EVIDENCE_WITNESS.md).

Answers: *this record existed by this time and has not silently changed.*
Does not answer: *whether any of it is true.* Layer 3 does that, and layer 4
never substitutes for it.

That last distinction is the passport's load-bearing idea. A publicly witnessed
false claim is still false — it is merely a false claim that can no longer be
quietly withdrawn.

## How it connects to the evidence fabric

`services/praxis_evidence/` is the substrate. It holds sources, claims,
epistemic state, lineage, audits, disputes and contributor reputation, and it
enforces the epistemic rules in application code rather than in database access
rules: a claim is not a fact merely for existing, a belief never silently
promotes into a claim, and community consensus is evidence rather than truth.

The passport is a **read projection** over that substrate plus the epoch
records. It computes nothing and decides nothing:

```text
praxis_evidence            evidence_epochs / anchor_manifests
(claims, lineage,          (epoch roots, manifests, anchor state)
 audits, TEVV records)
        │                              │
        └──────────────┬───────────────┘
                       ▼
              Capability Passport
              (read-only projection)
```

Consequences that are enforced, not asserted:

- **The passport cannot upgrade a status.** If TEVV has not settled, the
  passport shows unverified. There is no path from viewing a passport to
  changing one.
- **Nothing is inferred.** Every layer either has a record or is rendered as
  absent. No layer is presented as satisfied because adjacent layers are.
- **Writes are not available to clients.** `evidence_epochs` and
  `anchor_manifests` are public-read and superuser-write, so a browser session
  cannot author a proof about itself.

## How it connects to the Commons covenant

Planned, not built. The Commons covenant is the governance document that will
define how BuildAndDo's public knowledge may be used, forked and attributed.

Once it exists, each covenant version is itself an artifact: committed,
digested, included in an evidence epoch, and anchored. A capability's passport
will then be able to name the covenant version in force when it was verified,
and a covenant change becomes a new anchored version with a parent link rather
than a silent edit.

```text
Commons Covenant v0.1 ──► digest ──► epoch ──► anchor A
                                       │
Commons Covenant v0.2 (parent v0.1) ──► epoch ──► anchor B
```

Until the covenant exists, passports carry no covenant field. An empty field is
preferable to a field that implies a document that has not been written.

## User-facing verification flow

The workspace page shows, per capability:

```text
PROVENANCE — CAP-0081

  Internal lineage verified     source commit 8ba1d5e
  SBOM linked                   dependency set recorded
  TEVV verified                 PASS, independently audited
  Publicly witnessed            EPOCH-20260910-01

  Public anchor   83ac...29bf

  [ Verify independently ]
```

Selecting **Verify independently** shows the comparison and its limits
together:

```text
BUILDANDDO PUBLIC PROOF

  Capability       CAP-0081
  Evidence epoch   EPOCH-20260910-01

  Local root       83ac...29bf
  Public root      83ac...29bf

  MATCH

  Anchored         September 10, 2026

  This proves:
    the evidence fingerprint existed by the anchor time
    the current evidence matches the anchored fingerprint

  This does NOT prove:
    that every underlying claim is true
    that the public network granted verification
    that the public network authorised anything

  Verification of claims:  TEVV -> PASS
```

Interface rules, all of which are acceptance criteria in
`.bits/srs/SRS-BUILDANDDO-WITNESS-001.md`:

- **The disclosure is never behind an interaction.** The "does not prove" list
  renders alongside the result, not in a collapsed panel a reader can skip.
- **Three outcomes, not two.** Match, mismatch, and not-yet-anchored are
  distinct. Absence of a witness is not evidence of tampering, and must not be
  rendered as failure.
- **A mismatch is shown, never resolved.** The UI reports disagreement and stops.
  It does not retry, re-fetch until agreement, or prefer either value.
- **No recomputation is claimed.** The client compares two recorded digests. It
  does not re-derive a Merkle root in the browser, and does not imply that it
  did. Genuine independent verification means recomputing the root from the
  artifacts yourself, with the algorithm named in the manifest — the page gives
  you the inputs for that, it is not a substitute for it.
- **Digests are copyable and shown in full on demand.** A truncated digest is
  for reading; verification needs the whole string.

## Self-provenance

The passport is expected to apply to its own construction. The suggestion that
produced this design has provenance too:

```text
SUG-0042  submitted by ErichG      "Publicly anchor evidence roots"
   │
   ▼ RFC-0011 ──► implemented ──► TEVV PASS ──► capability ──► PUBLIC ANCHOR
```

A provenance system that cannot show the provenance of its own evolution is
asking for exactly the trust it claims to make unnecessary.

## Related

- [EVIDENCE_WITNESS.md](./EVIDENCE_WITNESS.md) — the witness architecture and
  control `NEXUS-AUD-002`.
- `apps/web/src/pages/workspace/SpecialistDeskPage.jsx` — the passport viewer.
- `apps/web/src/components/workspace/PublicProof.jsx` — the proof block.
- `apps/web/src/components/workspace/EpochTimeline.jsx` — the epoch browser.
- `.bits/srs/SRS-BUILDANDDO-WITNESS-001.md` — spec and acceptance evidence.
