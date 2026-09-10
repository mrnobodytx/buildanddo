# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-WITNESS-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-WITNESS-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     docs/architecture/EVIDENCE_WITNESS.md,
#              docs/architecture/CAPABILITY_PASSPORT.md
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/web/src/pages/workspace/SpecialistDeskPage.jsx;
#              VALIDATES apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js
# Intent:      Specify the public read surface for externally witnessed evidence,
#              and the honest limits of what a public anchor proves.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-WITNESS-001 — Capability Passport and External Evidence Witness

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

BuildAndDo already keeps an internal hash-linked evidence chain: every receipt
carries the digest of the record before it, so altering old history breaks the
chain. The evidence fabric (`services/praxis_evidence/`), the source and
candidate provenance manifests, and the audit trail all produce artifacts that
BuildAndDo can verify.

Every one of those verifications is performed **by BuildAndDo, on BuildAndDo's
own records**. That is enough to detect accidental corruption. It is not enough
to answer a skeptic:

> "Could you have rewritten all of those records yesterday and claimed they
> were from September 10?"

Nothing currently pins a state of the chain to a point in time that BuildAndDo
does not control. There is also no user-facing surface where anyone can see the
verification layers behind a capability, or check a digest for themselves.

## Intent

Two things, and deliberately no more:

1. Write down the architecture — why an external witness is needed, what it
   proves, and the far longer list of what it does not prove — so the design
   exists before any anchoring code does.
2. Ship the public read surface: a Capability Passport page that renders the
   verification layers of a capability, browses evidence epochs, and compares a
   locally recorded root digest against a publicly anchored one.

## Scope

- `docs/architecture/EVIDENCE_WITNESS.md` — the external witness architecture,
  control `NEXUS-AUD-002`, the epoch model, anchor triggers, the forbidden
  public payload list, and the `buildanddo.public-anchor/v1` schema.
- `docs/architecture/CAPABILITY_PASSPORT.md` — what a passport is, its four
  verification layers, and the user-facing verification flow.
- `apps/pocketbase/pb_migrations/` — `evidence_epochs` and `anchor_manifests`
  collections. Public read, superuser-only write: the anchoring pipeline runs on
  the private plane and publishes into these collections, so a browser client can
  never author a proof about itself.
- `apps/web/src/components/workspace/PublicProof.jsx` — the verification block
  for one epoch, including the proves / does-not-prove disclosure.
- `apps/web/src/components/workspace/EpochTimeline.jsx` — the epoch browser and
  the hash-link chain between epochs.
- `apps/web/src/pages/workspace/SpecialistDeskPage.jsx` — repurposed as the
  Capability Passport viewer, with RUM actions `passport.viewed`,
  `passport.verify_clicked` and `passport.epoch_selected`.
- `README.md` — a Provenance and Verification section, in plain language, with
  community attribution.

## Out of scope

- The epoch aggregator, Merkle tree builder, anchor manifest signer and public
  network publisher. Those read private receipts and hold publication authority,
  so they live on the private plane and reach this repo through a handoff, never
  as code committed here.
- Choosing a public network. The read surface treats the anchor reference as an
  opaque string plus an optional URL so the network can change without a UI
  change.
- Recomputing Merkle roots in the browser. The client compares two recorded
  digests and reports agreement; it does not claim to have re-derived either.
- Any authority effect. An anchor never authorises anything (see
  `NEXUS-AUD-002`, `authority_effect: NONE`).

## Acceptance evidence

1. `npm run lint` and `npm run build` both pass with the new page and components
   in the graph — run them, do not assert them.
2. With no `evidence_epochs` records present, the page renders an empty state
   that says no epoch has been sealed yet. It does not render a placeholder
   epoch, a fabricated digest, or a green checkmark.
3. With an epoch whose `root_digest` matches its anchor manifest's
   `observed_public_root`, the verification block reports agreement; with a
   deliberately differing value it reports a mismatch and says the recorded
   evidence no longer matches what was anchored.
4. An epoch with no anchor manifest reports "not yet anchored" rather than
   failure — absence of a witness is not evidence of tampering.
5. The proves / does-not-prove disclosure is present on every rendered proof,
   not behind an interaction that can be skipped before the claim is read.
6. `python scripts/ci/verify_public_boundary.py` passes: no private-plane path,
   no secret, and no anchoring authority is introduced.

## Verification

```bash
npm run lint
npm run build
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py
```

## Notes for the implementing agent

The epistemic distinction is the feature. A public anchor proves that a
fingerprint existed no later than a public timestamp and has not silently
changed since. It does not make the underlying claims true — TEVV does that —
and it grants no authority. Any copy that blurs those lines is a defect, not a
wording preference, because it is exactly the overclaim this control exists to
avoid.

The design originated in the BuildAndDo Discord: ErichG proposed publicly
notarising evidence roots, and the surrounding discussion (Fabi on learning by
doing, delphianQ on a GPL-equivalent moment for LLMs) framed why verification
should be independently checkable rather than trust-dependent. Attribution is
part of the record — it is the provenance of the provenance system.
