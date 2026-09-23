# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-CAPABILITY-TOKEN-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .bits/srs/SRS-BUILDANDDO-CAPABILITY-TOKEN-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-CAPABILITY-TOKEN-001.md; DEPENDS_ON .bits/srs_registry.yml
# Intent:      Bound the six portable capability protocol pieces to local additive work and observed acceptance.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-CAPABILITY-TOKEN-001

**SRS:** SRS-BUILDANDDO-CAPABILITY-TOKEN-001 **Risk:** A1
**Seat:** BITS-CODEGEN **Status:** in_progress

## Task table

| Phase | Task | Gate | Status |
|---|---|---|---|
| A | Contract, schemas, exact assets and standards adapters | token contract/interop tests | done; 14 passed |
| B | Conformance, certification, federation, proposals and composition | token conformance/registry tests | done; 16 passed |
| C | Passports, reviewed sharing and economic accounting | token records tests | done; 12 passed |
| D | CLI, local dogfood, regressions and retained evidence | smoke block | done; 8 CLI tests, 185 regressions and 9/9 smoke commands passed; real certification HOLD |

## Scope

Add libs/capability_tokens/**, scripts/cnwb, tests/upgrade/test_capability_token*.py,
docs/capability-tokens.md, .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/** and a receiving-runtime
handoff. Create this spec/dispatch and register atomically. Refresh context and
sprint bindings after source review as required by AGENTS.md. Do not change
existing application, semantic-twin/evolution contracts, infrastructure or CI.

## Memory Brief

PR 60 merged the local evolution loop. It has typed independent promotion and
proposal-only compilation, not runtime learning acceptance. Existing Capability
Passport views and route inventories do not constitute portable certification.
The local checkout was fast-forwarded to the available merged source; its sprint
binding was already stale. Prior live acceptance gaps remain owned by their
receiving seats. Reuse the kernel; do not add a verified boolean or signer.

## Smoke test

```bash
python -m unittest discover -s tests/upgrade -p 'test_capability_token*.py' -v
python -m unittest discover -s tests/upgrade -p 'test_evolution*.py'
python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py'
python -m mypy --strict libs/capability_tokens
python -m ruff check libs/capability_tokens tests/upgrade/test_capability_token*.py scripts/cnwb
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
```

Each phase reports its observed gate result. The final report and three-type
memory payload retain exact commands and evidence; live federation, authenticated
TEVV, tenant sharing and settlement remain receiving-runtime concerns.
