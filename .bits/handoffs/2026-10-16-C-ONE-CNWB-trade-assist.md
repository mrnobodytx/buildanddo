# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-10-16-C-ONE-CNWB-trade-assist.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     .bits/srs/SRS-BUILDANDDO-TRADE-ASSIST-001.md, apps/trade_assist/package.py
# EnumType:    Doc
# EnumEdges:   TRIGGERS cross-seat handoff
# Intent:      Hand the CNWB-side ingest and the A3 delivery switch to a private seat, with the package contract they consume.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-10-16 C-ONE -> CNWB private seat

**Originating SRS:** SRS-BUILDANDDO-TRADE-ASSIST-001 **Dispatch:** VCC-BUILDANDDO-TRADE-ASSIST-001

## What was asked

The repository owner asked for BuildAndDo to assist the TradeBuilder and walk-in systems
automatically, with the guildmasters and content.

## Why it cannot be done on the public plane

TradeBuilder and walk-in run on the private CNWB stack. Reading their records and writing
content back are external writes, which `AGENTS.md` classes as A3: a human dispatch is
required, and the endpoints and credentials live on the private plane. A model provider for
richer copy is secret access, also A3.

## What was done instead

`apps/trade_assist/` builds the BuildAndDo half. It takes a walk-in intake or a TradeBuilder
record (the `tb_demo_sites` columns), has six guildmasters draft a provenance-labelled content
package, has Oracle and Director Nexus verify it, and wraps it as an open review mission with a
SHA-256-bound delivery envelope. Delivery is `dry_run` only and raises `DeliveryRefused` for any
other mode.

## Package contract the CNWB side consumes

- `package_id`: `tap-<first 16 hex of content_digest>`
- `status`: `ready_for_review` or `blocked`. Never ingest a blocked package.
- `content`: `version`, `provider`, `business` (fields, per-field `MEASURED:<source>` provenance,
  `unmapped` keys), and `sections[]`. Each section has `role`, `producer`, `title`,
  `sentences[] {text, provenance, fields}` and `notes`.
- `content_digest`: SHA-256 over canonical JSON of `content`, with sorted keys, `(",", ":")`
  separators and UTF-8. Recompute it on ingest and reject a mismatch.
- `findings[]`, `rejected_sections[]`, `gaps[]`
- `mission`: `status: open`, `review_required: true`, `closes_only_on: human review`
- `envelope`: `target` (`walkin` or `tradebuilder`), `reference` (tenant slug, record id or
  business name), `content_digest`, `mode`

## What the receiving seat needs to do

1. **Walk-in content provider.** Export each completed intake as JSON and run
   `python -m apps.trade_assist draft --source walkin --input <intake.json> --output <dir>`. Use
   the package's sections as the site copy in place of the placeholder page walk-in has served
   without a content provider. Keep the walk-in intake keys, or tell this repo the real ones so
   `apps/trade_assist/intake.py` `ALIASES` can be corrected. Unknown keys appear in `unmapped`.
2. **TradeBuilder upgrades.** Export rows from `tb_demo_sites` as a JSON list and run
   `python -m apps.trade_assist batch --source tradebuilder --input <dir> --output <dir>`.
   Attach each `ready_for_review` package to that tenant's upgrade plan. Applying it stays the
   existing operator-approved, ledgered TradeBuilder executor action.
3. **Ingest check.** Before using any package, run
   `python -m apps.trade_assist verify --package <file>` (exit 0 = digest intact and ready).
4. **Delivery switch (A3).** Only after a human dispatch names the CNWB ingest endpoint: add a
   delivery mode that posts the envelope and content there, with credentials referenced by name
   and the digest re-checked by the receiver. Until then `dry_run` stays the only mode.
5. **Automation (A3).** A scheduled run over new walk-in intakes and TradeBuilder rows belongs to
   the private scheduler, not this repository.

Verification on the CNWB side: a walk-in run that previously served a placeholder serves the
package copy, and `verify` returns exit 0 for the package it used.

## Blocking

Public work does not stop. The BuildAndDo module, its tests and its dry run stand alone.
Sending content to TradeBuilder or walk-in waits on the A3 dispatch and the CNWB fixes already
handed off in `mrnobodytx/cnwb-mirror` PR #11 (Nemesis chat block, `tb_demo_sites` base URL,
`/api/ops/gen` router).
