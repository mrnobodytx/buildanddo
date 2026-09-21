# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .bits/srs/SRS-BUILDANDDO-CAPABILITY-TOKEN-001.md, .bits/queue/VCC-BUILDANDDO-CAPABILITY-TOKEN-001.md, .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/validation.json, .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/memory.json, .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/dogfood.json, .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/verify.py, docs/capability-tokens.md, .bits/context.lock.json, .bits/hostinger-readiness.lock.json
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-CAPABILITY-TOKEN-001.md; DEPENDS_ON .bits/queue/VCC-BUILDANDDO-CAPABILITY-TOKEN-001.md; DEPENDS_ON .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/validation.json; DEPENDS_ON .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/memory.json; DEPENDS_ON .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/dogfood.json; DEPENDS_ON .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/verify.py; DEPENDS_ON docs/capability-tokens.md; DEPENDS_ON .bits/context.lock.json; DEPENDS_ON .bits/hostinger-readiness.lock.json
# Intent:      Make the six local protocol surfaces reviewable with measured source evidence and explicit receiving-runtime requirements.
# ───────────────────────────────────────────────────────────────

# Capability Token Protocol v1

The six requested protocol surfaces are implemented locally on the merged
evolution and semantic-twin contracts. Portable skills remain uncertified until
the exact implementation passes bounded conformance and independently pinned
typed TEVV. Competence and authority remain separate.

The package supplies immutable contracts and assets; conformance/certification;
a scoped registry with federation captures, exact dependencies and revocation;
per-implementation passports; reviewed public pattern projections; and integer
metering/royalty/refund estimates. Both CLI entry points exercise these paths.
Invocation emits the existing ActionProposal. Its transaction bridge constructs
a DRAFT semantic transaction.
The package does not execute external skills, distribute data or transfer funds.

## §1 SUMMARY

Status: COMPLETE (local source); runtime acceptance UNMEASURED
Dispatch: VCC-BUILDANDDO-CAPABILITY-TOKEN-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-CAPABILITY-TOKEN-001
Branch: dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm (session-managed)
Tasks: 4/4
Smoke: 9/9
CKS Gate: B+/75; CKS: pending; CAPS: pending; CK: pending
Commit bookkeeping: the measured working source is fingerprinted in validation.json;
the source implementation commit follows this report.

## §2 TASK RESULTS

| Phase | Output | Verify | CKET |
|---|---|---|---|
| A | 14 contract/schema/interop cases PASS; exact assets, strict semver, bounded Agent Skills and MCP capture profiles | python -m unittest tests.upgrade.test_capability_token_contracts -v | 07_BUILD, 08_TEST |
| B | 16 conformance/registry/composition cases PASS; source/context/SBOM binding, independent review pins, immutable federation, transitive revocation and proposal-only use | python -m unittest tests.upgrade.test_capability_token_registry -v | 07_BUILD, 08_TEST |
| C | 12 passport/sharing/economic cases PASS; tenant separation, scoped measured denominators, explicit A3 human publication, integer conservation and refunds | python -m unittest tests.upgrade.test_capability_token_records -v | 07_BUILD, 08_TEST |
| D | 8 persistent CLI cases PASS; 185 existing regressions PASS; actual release-source capture retained | python -m unittest tests.upgrade.test_capability_token_cli -v | 07_BUILD, 08_TEST, 11_COMMIT |

Implementation: libs/capability_tokens/ and scripts/cnwb. Acceptance sources:
tests/upgrade/test_capability_token*.py. Usage: docs/capability-tokens.md.
Runtime boundary: .bits/handoffs/2026-09-21-bits-codegen-cmax-b-capability-runtime.md.

## §3 SMOKE TEST RESULTS

Expected: zero exits for all nine dispatch commands. Actual observed outputs,
timestamps and exact digests are embedded in validation.json.

| Check | Actual | Reproduce |
|---|---|---|
| token_tests | PASS | python -m unittest discover -s tests/upgrade -p 'test_capability_token*.py' -v |
| evolution_regression | PASS | python -m unittest discover -s tests/upgrade -p 'test_evolution*.py' -v |
| semantic_twin_regression | PASS | python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py' -v |
| mypy | PASS | python -m mypy --strict libs/capability_tokens |
| ruff | PASS | python -m ruff check libs/capability_tokens tests/upgrade/test_capability_token*.py scripts/cnwb .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/dogfood.py .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/verify.py |
| boundary | PASS | python scripts/ci/verify_public_boundary.py |
| context | PASS | python scripts/ci/agent_context.py --check |
| readiness | PASS | python scripts/ci/hostinger_readiness.py --check |
| submission | PASS | python scripts/ci/submission_readiness.py --check |

The unfiltered stdlib trace run executes all 50 token tests. It measures
2540/2559 executable lines (99.26%);
every production module and the CLI entry point covers at least 97.20%.
Strict mypy checks 13 production modules. Coverage is line coverage, not a
claim of complete behavioral or adversarial security verification.

### Observed failures and corrections

- Exact integer bounds were coerced through float and rejected 2**53+1 at its
  declared boundary; enormous integers also overflowed float conversion.
  The regression is retained red/green. Integer arithmetic now preserves exact
  bounds, and nonfinite floats still fail. Reproduce:
  python -m unittest tests.upgrade.test_capability_token_contracts.SchemaTests.test_integer_bounds_preserve_precision_beyond_float_range -v.
- The first CLI use of the real example correctly rejected a 12,719,263-byte
  pretty-printed suite against the 8,000,000-byte input cap. The example now
  emits equivalent compact JSON; the cap remains enforced. The retained command
  returns exit 2 (HOLD) for missing independent replay/TEVV.
- The sprint source binding was already stale on the merged baseline before
  implementation. Existing rationale, owners, dependencies and next actions were
  reviewed. Refreshing its generated binding acknowledges current source only.
  No milestone, hosted job or deployed acceptance is upgraded by that refresh.

### Actual local dogfood

Captured at 2026-09-21T03:45:05.529686+00:00, from tools/buildanddo_release.py at
916507f53d203a1dff809948049cf59455f56205. Exact public source digest: bab9249204c4852f5bf9121c7248e4016891c31690eeb61586922e7de2bd5741.
The existing ingestion produced 157 semantic objects.
A bounded A0 rule proposes inspection, exports/reimports a portable skill,
generates an MCP proposal descriptor, and installs one content-pinned version.
Six local conformance groups PASS; replay is HOLD. The CLI also returns HOLD.
The retained registry has zero certifications; zero effects and zero funds moved.

The rule is an explicit local example, not a claim of a learned certified
capability. Replay/TEVV/publication/payment happy paths in unit tests use
synthetic, clearly marked fixtures. Real independent reviews are not invented.

Reproduce in a new directory:
python .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/dogfood.py --output /tmp/cnwb-token-reproduce
Then follow the retained CLI command using that directory's captured_at value.
The retained summary and portable bundle are dogfood.json and dogfood-bundle.json.
Run python .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/verify.py to check exact source bindings, capture identity,
recorded outputs and memory consistency. Frontend/native/deployed checks were not
rerun: existing application source is unchanged by this additive scope.

## §4 MEMORY INGEST

Type A count: 37
Type B count: 195
Type C count: 7
IOO compliance: complete; DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/memory.json
No remote memory ingestion, identity attestation or CK signing occurred.

## §5 CKET FILING

04_HYPOTHESIZE: new specification, SRS registration, regenerated measured context.
06_PLAN: docs/capability-tokens.md.
07_BUILD: libs/capability_tokens/ and scripts/cnwb.
08_TEST: five focused test/fixture modules.
11_COMMIT: dispatch, receiving handoff, evidence artifacts and reviewed source binding.
CGRF headers/JSON sidecars: 34/34 new files.
REFLEX validation: receiving post-merge process; not executed in this public scope.
The repository's additive A1 authorization covers these local modules and tests.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc.
License posture: existing repository terms; no legal terms modified.
Authority: fixed by each contract and rechecked at proposal/transaction boundaries.
Public/private boundary and changed-file credential scan: see retained check outputs.
Actor: agent; no PR label or external publication claimed by this local report.
Measured findings: 22 findings/20 unwired gates remain visible and out of scope.
Three existing OCN scripts were absent from the old measured lock; refreshing
records them without changing those scripts or CI wiring.
Stripe mode: not applicable; no checkout or payment execution is included.
CK/CAPS/CKS: pending.

Trust pins must come from a separately authenticated receiving process.
Hashes and typed identities do not authenticate publishers or reviewers. The
Agent Skills/MCP adapters implement documented bounded profiles, not every vendor
extension or hosted skill service. External scripts and real rollback effects
require receiving runners. Public projection needs an explicit current human A3
review. Economic statements report accrual estimates; actual revenue is unknown.

## §7 NEXT ACTIONS

Source blockers: none.
Receiving owners: CMAX-B / IDE1 / COPILOT under a separate human A3 dispatch.
Handoff: .bits/handoffs/2026-09-21-bits-codegen-cmax-b-capability-runtime.md.
Next scope: authenticate federation/receipt captures, bind actual runners and
AAXP execution, connect exact outcome receipts to the existing evolution loop,
and retain the first independently reviewed result under its immutable version.
Publication consent and financial settlement remain with their receiving owners.
No runtime dispatch ID is invented here. No out-of-scope bugs were changed or
external issue comments sent.
