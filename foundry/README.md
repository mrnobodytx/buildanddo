# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     AGENTS.md, .buildanddo/public/path-policy.json, foundry/registry/opportunity.schema.json
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .buildanddo/public/path-policy.json; OWNS foundry/registry/opportunity.schema.json; OWNS foundry/shared/federal_foundry/portfolio.py
# DAG Node:    foundry.plan
# Intent:      Define an isolated evidence-first workflow for five public federal research lanes.
# ───────────────────────────────────────────────────────────────

# Citadel Federal R&D Foundry

This directory is a public, offline research and proposal workspace. It lets five
lanes share validation and evidence mechanics without sharing unreviewed claims,
experimental state, eligibility decisions, or submission authority.

The foundry does not file proposals. A compiled bundle is a reviewer aid, not a
certification, government record, cost proposal, or proof of eligibility.

## Layout

- `registry/<lane>/opportunity.yaml` records planning requirements and known gaps.
- `shared/federal_foundry/` validates registries and compiles evidence bundles.
- `templates/` defines the starting shape of each lane artifact.
- `lanes/<lane>/` holds authored plans and machine-readable results for one lane.

Unknown official deadlines and eligibility facts remain `null` or `unverified`.
An owner-supplied planning brief may establish scope, but it is not an official
solicitation source or measured performance evidence.

## Branch model

Long-lived research integration branches are isolated by lane:

```text
research/common-federal-evidence
research/darpa-dv026-influence
research/navair-acquisition-analysis
research/daf-nv027-low-swap
research/darpa-semantic-isr
research/diu-sentinel-maritime
```

Repository governance still requires each implementation change to start on a
short-lived `bits/<SRS-CODE>-<slug>` branch. Its pull request targets the relevant
`research/*` integration branch, or `main` only for a separately approved
promotion. Agents never write directly to `main` or a research integration branch.

Each lane follows the same chain:

```text
registered SRS
  -> bits/SRS branch
  -> measurable acceptance criteria
  -> isolated experiments and immutable results
  -> pull request
  -> independent verifier
  -> reviewed research branch
```

Shared changes begin under the common-evidence branch and must pass all foundry
tests before a lane adopts them. Lane-specific results never flow into another
lane implicitly. Reusable code returns to common only through a new SRS and PR.

## Evidence states

- `planned`: a method or source is named but not executed or inspected.
- `observed`: an artifact or result was actually inspected, without independent
  verification.
- `verified`: the declared acceptance method passed against the referenced bytes.
- `rejected`: the artifact failed validation or was withdrawn.

Only verified evidence can satisfy a requirement or support a verified claim.
The compiler rejects unknown evidence references and unsupported promotions.

## Local use

Install the one parser dependency, run tests, then compile to a new directory:

```bash
python -m pip install -r foundry/shared/requirements.txt
python -m unittest discover -s tests/foundry -p 'test_*.py'
python -m foundry.shared.federal_foundry --root . --output /tmp/federal-foundry-bundle
```

The output contains one immutable-by-convention bundle per lane plus a portfolio
index and SHA-256 manifest. Re-running from unchanged inputs produces identical
bytes. Generated files never rewrite the source lane.

## Human gates

Before submission, a named human must review proposal truthfulness, eligibility,
official topic revisions, data and IP rights, pricing, certifications, team and
key-personnel representations, customer commitments, physical test evidence,
and the final portal package. Hardware-dependent claims remain open until actual
hardware receipts are attached.
