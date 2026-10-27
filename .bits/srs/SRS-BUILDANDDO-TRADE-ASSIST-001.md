# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-TRADE-ASSIST-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     AGENTS.md, apps/web/src/data/personas.js
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-TRADE-ASSIST-001-* branches; DEPENDS_ON apps/web/src/data/personas.js
# DAG Node:    none
# Intent:      Let the BuildAndDo guildmasters turn a TradeBuilder site record or a walk-in intake into a verified, provenance-labelled content package.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-TRADE-ASSIST-001 — Guildmaster content assist for TradeBuilder and walk-in, slice 1

**Status:** in_progress **Risk:** A1 **Seat:** C-ONE

**Authorization:** the repository owner asked on 2026-10-16 for BuildAndDo to assist the
TradeBuilder and walk-in systems automatically with the guildmasters and content. This
slice is the additive A1 part an agent seat may self-authorize. Delivery to those systems
and any model provider are A3 and wait for a human dispatch (see Out of scope).

## Problem

TradeBuilder builds and upgrades contractor websites, and the walk-in system takes a
business's intake and produces its site. Both run on the private CNWB plane. Walk-in's
site step has had no content-generation provider: an intake can complete and still
produce a placeholder page. Nothing checks a trade site's copy for claims the business
never made, such as a licence number, years in business, ratings or prices. BuildAndDo
already seats the eight guildmasters and requires that work is checked by someone other
than its producer, which is the missing piece.

## Scope

Add dependency-free `apps/trade_assist/`:

- **Intake.** Normalize a walk-in intake or a TradeBuilder site record into one typed
  business record. Every field keeps its source system and is MEASURED (present in the
  source) or absent. Unknown fields are kept aside, never guessed.
- **Guild roster.** Content roles are bound to guildmasters by the role each already
  holds in `apps/web/src/data/personas.js`: Forge plans the site, Quill writes the page
  copy, Muse writes the brand brief, Alex writes the offer and call to action, Sterling
  writes pricing language, Scholar writes the service explainers. Oracle verifies claims
  and Director Nexus checks content safety. Producers never verify.
- **Drafting.** A deterministic template provider drafts every section from the record
  alone. Each sentence carries provenance: MEASURED when built from a record field,
  ASSERTED when it is generic trade copy that states no fact about the business. The
  provider interface allows a model provider later; this slice ships none.
- **Verification.** Oracle rejects any section stating a licence, insurance, bond,
  certification, years-in-business, rating, review count, award, guarantee or price that
  is not in the record. Director Nexus rejects unsafe or prohibited content. A rejected
  section is reported with the rule it broke, never silently rewritten.
- **Mission and envelope.** The package becomes a BuildAndDo mission that is open until a
  human reviews it. It carries a delivery envelope addressed to TradeBuilder or walk-in
  with a SHA-256 digest of its content. Delivery is `dry_run` only.
- **CLI.** `python -m apps.trade_assist draft|batch|verify` over JSON files.

## Out of scope

- Sending anything to TradeBuilder, walk-in or any network endpoint (A3: external write).
- Any model or API provider and any credential (A3: secret access).
- PocketBase collections, web pages, NATS, scheduled runs and the CNWB ingest side. The
  CNWB side is described in `.bits/handoffs/2026-10-16-C-ONE-CNWB-trade-assist.md`.

## Invariants

- No sentence states a fact about the business unless that fact is in the record.
- Gated claims (licence, insurance, bond, certification, years, rating, reviews, awards,
  guarantees, prices) appear only when the record carries them, and Oracle checks this.
- The verifier seat is never the producer seat for the same section.
- A package with any rejected section is `blocked`; it is never marked ready.
- A mission is never closed by the system; only a human review closes it.
- The envelope digest is computed over the canonical content, so any change to the
  content changes the digest.
- Delivery mode is `dry_run`. Any other mode is refused in this slice.

## Acceptance evidence

1. `python tests/trade_assist/check_trade_assist.py` passes with at least 80 percent
   statement coverage per module.
2. `python scripts/ci/verify_public_boundary.py` and `python scripts/ci/agent_context.py --check` pass.

## Rollback

Delete `apps/trade_assist`, `tests/trade_assist`, the handoff note, this spec, its dispatch
and its registry entry.
