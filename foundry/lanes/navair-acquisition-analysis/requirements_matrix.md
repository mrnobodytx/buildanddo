# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/navair-acquisition-analysis/requirements_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/navair-acquisition-analysis/opportunity.yaml, foundry/templates/requirements_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/navair-acquisition-analysis/opportunity.yaml; USES_TEMPLATE foundry/templates/requirements_matrix.md
# DAG Node:    foundry.lane.navair-acquisition-analysis
# Intent:      Provide a lane-owned workspace for requirement status and acceptance evidence.
# ───────────────────────────────────────────────────────────────

# Requirements matrix

| ID | Requirement | Acceptance | Status | Evidence | Justification |
|---|---|---|---|---|---|
| NAVAIR-REQ-01 | Parse allowlisted acquisition documents with stable source and metadata identifiers. | Re-ingestion preserves identifiers and records parser version, source digest and rejected inputs. | open | none | none |
| NAVAIR-REQ-02 | Build comparable lexical, embedding, graph, clustering and hybrid retrieval candidates. | Every candidate consumes the same frozen corpus, query set and relevance judgments. | open | none | none |
| NAVAIR-REQ-03 | Return deterministic top-N recommendations with explanations and source provenance. | Repeated runs produce identical ranking, tie-breaking, excerpts and document locators. | open | none | none |
| NAVAIR-REQ-04 | Package the selected pipeline as a bounded Docker deliverable. | An offline container build and run reproduce the declared validation report from frozen inputs. | open | none | none |

This is the registered source baseline. compile --runs derives partial requirement updates from the selected measured campaign; verified satisfaction still requires a scoped review.
