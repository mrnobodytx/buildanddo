# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/blueprint-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     docs/blueprint-pipeline.md, tests/upgrade/check_blueprint_pipeline.py
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON docs/blueprint-pipeline.md; DEPENDS_ON tests/upgrade/check_blueprint_pipeline.py; DEPENDS_ON .bits/context.lock.json; DEPENDS_ON .github/workflows/pr-governance.yml; DEPENDS_ON apps/web/src/App.jsx; DEPENDS_ON apps/web/src/components/workspace/WorkspaceLayout.jsx
# DAG Node:    none
# Intent:      Record measured blueprint pipeline evidence and remaining native/runtime acceptance limits without promoting observations to verification.
# ───────────────────────────────────────────────────────────────


# Blueprint pipeline integration report

This report records the integrated source at PR 38 after recovery from the
interrupted session. Earlier dispatch reports and all 102 distinct events from
both parents remain retained history. The checked source keeps the saved-upload
workflow and the immediate three-pass analysis workflow available together.

## §1 SUMMARY

Status: PARTIAL — source integration complete; hosted, native and rendered acceptance open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-blueprint-pipeline
Tasks: 5/5 source areas; all four integration phases have local evidence
Smoke: 4/7 existing dispatch commands pass; 3 require missing frontend dependencies
CKS Gate: B+/75 target; unmeasured
CKS: pending
CAPS: pending
CK: pending
Source history: git log --format=fuller origin/main..HEAD

## §2 TASK RESULTS

| Task | Result | Verify | Evidence boundary |
|---|---|---|---|
| CPU extraction | Deterministic scan, parse and assessment preserve layout, requirements, confidence and PDF provenance | python tests/upgrade/check_blueprint_pipeline.py | PASS: 69 passed, 4 native PDF skips |
| Components, missions, prompts | BDR receipts, dependencies, ordered challenges and A0 review prompts retain source identity | python -m unittest tests.upgrade.test_blueprint_pipeline | Native PDF chain remains unavailable; layout-double chain passes |
| Workspace decide | Canonical Python evaluation with immutable private receipts, stable IDs and current membership checks | node --test tests/upgrade/decision-runtime.test.mjs | Actual Python and policy; simulated PocketBase storage |
| Workspace views | Analyze PDF and Saved PDFs preserve immediate analysis and protected upload/worker/review flows | npm --prefix apps/web test -- BlueprintPage BlueprintSavedPage | Fourteen rendered cases require missing Vitest |
| Integrated saved contract | Shared PDF scan preserves v1 fields and flat excerpts if structuring fails | python tests/upgrade/check_blueprints.py | PASS: 51 passed, 5 native dependency skips |

Saved intake keeps POST /api/buildanddo/workspaces/{workspace}/blueprints.
Immediate analysis uses POST /api/buildanddo/workspaces/{workspace}/blueprints/analyze.
Both routes require native users authentication and retain their own body limits.
The saved adapter uses the shared scan without depending on later analysis passes.
Its observation timestamp is part of the existing stored schema; deterministic
three-pass analysis does not include that timestamp.

The source never creates coding sessions, activates missions or promotes
extraction confidence into verification or implementation authority. Operating
contracts and retained-data rollback are documented in docs/blueprint-pipeline.md
and docs/blueprints.md.

## §3 SMOKE TEST RESULTS

| Command | Expected | Observed |
|---|---|---|
| npm --prefix apps/web test | Rendered tests pass | FAIL to start: vitest is absent |
| npm --prefix apps/web run lint | Repository lint passes | FAIL to start: eslint-plugin-import is absent |
| npm --prefix apps/web run build | Web bundle produced | FAIL to start: vite is absent |
| node --test tests/upgrade/*.test.mjs | Adapter regression passes | PASS: 320 tests |
| python -m unittest discover -s tests/upgrade -p 'test_*.py' | Available Python regression passes | PASS: 293 passed, 18 native dependency skips |
| python scripts/ci/agent_context.py --check | Measured lock matches source | PASS: six existing findings and four unwired gates remain visible |
| python scripts/ci/verify_public_boundary.py | Public boundaries pass | PASS: 842 tracked files; this invocation does not verify hosted labels |

Additional source evidence:

- python tests/upgrade/check_blueprint_pipeline.py: 69 passed, 4 skipped;
  91.57–100% statement coverage across fourteen executable extraction/adaptor
  modules, including both saved and detailed contracts.
- python tests/upgrade/check_blueprints.py: 51 passed, 5 skipped;
  88.27–98.31% statement coverage across the saved parser and research worker.
- python tests/upgrade/check_decision_runtime.py: 64 passed, 3 skipped;
  94.41–100% statement coverage across the BDR runtime.
- node --test tests/upgrade/decision-runtime.test.mjs tests/upgrade/blueprint-client.test.mjs tests/upgrade/blueprint-saved-client.test.mjs tests/upgrade/blueprint-system.test.mjs:
  41 passed on the final source, including both URL contracts and saved intake.
- python scripts/ci/supply_chain.py --skip-audit --check-lock: PASS for lock and
  manifests. The command deliberately skips online vulnerability auditing.
- node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs: 252 modules parsed,
  zero static errors. This limited diagnostic is not rendered UI or full lint.
- ruff check apps/research/blueprint*.py apps/decision/adapters apps/decision/workloads/blueprint_evaluation.py apps/decision/workloads/blueprint_document_evaluation.py tests/upgrade/test_blueprints.py tests/upgrade/check_blueprint_pipeline.py tests/upgrade/check_blueprints.py tests/upgrade/check_decision_runtime.py: PASS.
- python -m mypy --strict --explicit-package-bases --follow-imports=silent apps/research/blueprint_models.py apps/research/blueprint_scan.py apps/research/blueprint_parse.py apps/research/blueprint_assess.py apps/research/blueprints.py apps/research/blueprint_documents.py apps/research/processing.py apps/decision/workloads/blueprint_evaluation.py apps/decision/workloads/blueprint_document_evaluation.py apps/decision/adapters:
  PASS for sixteen source files.

Coverage uses the repository's standard-library trace checker. It measures
statement lines, not branch coverage; pytest and coverage.py are unavailable.
Reports are generated under reports/coverage by the commands above.

Observed red/green regressions:

1. Combining the original PR-head decision hook and main's saved-upload hook
   registers the same POST URL twice. The merged route-registration test checks
   both files together and passes with distinct URLs, authentication and limits.
   Verify: node --test --test-name-pattern='distinct authenticated routes' tests/upgrade/decision-runtime.test.mjs
2. Injected parse/assessment failures originally prevented the saved PDF adapter
   from returning its flat excerpt. Using only the shared scan restores the
   fallback; the test also rejects leaked private diagnostics. One initial test
   expectation included a trailing newline that the existing PDF scanner strips;
   that assertion was corrected without changing normalization.
   Verify: python -m unittest tests.upgrade.test_blueprints.ParserTests.test_saved_pdf_keeps_flat_text_when_structuring_is_unavailable
3. The original shared-data dependency regression remains covered, including
   producer/consumer wording and normalized data-entity names.
   Verify: python -m unittest tests.upgrade.test_blueprint_pipeline.PipelineTests.test_shared_data_and_resolved_requirement_references_produce_dependencies

The interrupted pre-recovery Node log contained three suite result-identity
errors. The recovered tree passed an uninterrupted 320-test run and the final
blueprint-specific run. No unrelated suite policy was changed and the earlier
errors' cause is not asserted from that log alone.

Unresolved acceptance and causes:

- python tests/upgrade/check_blueprint_pipeline.py --require-pdf returns FAIL
  with 69 source passes, 4 skips and no test errors because pypdf is absent.
  CI requires this gate after installing the already-declared parser. No parser
  dependency or native acceptance gate was removed.
- The three frontend smoke commands and the targeted fourteen rendered tests
  cannot start without the declared frontend packages. Root npm run build also
  stops because concurrently is absent. No installed bundle/browser claim is made.
- Native PocketBase is absent; actual migration/JSVM and served local bridge
  acceptance remain unverified. Storage/transport doubles are identified in tests.
- PR 38 has only the Bits AI label. Running the unchanged boundary gate with
  that observed label snapshot reproduces exactly the missing actor-label error.
  Add exactly actor:agent through the source-control UI. No hosted label changed.
- Workers Builds: buildanddo check 105249499047 reports failure but exposes no
  error text or annotations. Its Cloudflare build ID is
  8af20caa-33cc-4ace-bf8c-46d90d972428. Private build diagnostics remain needed;
  missing local packages do not establish the hosted failure's root cause.
- python scripts/ci/changelog_gen.py --check --no-summary --ref origin/main
  reports the existing CHANGELOG.md stale. That file is unchanged on the PR and
  the workflow explicitly marks this check continue-on-error. No unrelated
  changelog/source history is regenerated as part of the blueprint repair.

## §4 MEMORY INGEST

Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Type A count: 561. Type B count: 1183. Type C count: 105.
IOO compliance: PASS. DKG orphans: 0.

Each path has one current Type A record. Type B edges are rebuilt from the
actual CGRF headers. All 102 distinct Type C events from the PR head and main
are retained unchanged; three integration evidence events are added. No memory
service is called directly and no score or verification stamp is fabricated.

Verify: python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
The payload's top-level summary reports counts and orphan/IOO results.

## §5 CKET FILING

- 07_BUILD: extraction, saved-schema adapter, BDR adapters, decision hook and workspace views.
- 08_TEST: both Python/Node/rendered suites, coverage gates and synthetic PDF fixtures.
- 06_PLAN: docs/blueprint-pipeline.md and docs/blueprints.md.
- 04_HYPOTHESIZE: existing SRS continuation.
- 11_COMMIT: existing dispatch/CI continuation, measured context, report and memory.

New text files retain CGRF headers; PDFs retain their provenance sidecars and
binary attributes. The source verifier checks paths, current metadata, edges
and retention. REFLEX remains deferred to the private post-merge pipeline.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc.
Authority: existing in-progress A2 public-source upgrade dispatch.
License posture: unchanged; commercial contact licensing@citadel-nexus.com.
Boundary: public source and authored fixtures; no deployment, secrets or private write.
Secret scan: repository boundary scanner passes; no broader secret-audit claim.
Stripe mode: not applicable; no payment or checkout logic changed.
Verification: extraction, decisions, components, challenges and prompts stay unverified.
Actor label: actor:agent required; provider writes are unavailable in this session.

## §7 NEXT ACTIONS

Synchronize the prepared source through Update PR and apply actor:agent. Run
required native PDF, PocketBase and rendered acceptance with declared runtimes,
and inspect the existing Workers build's diagnostics before claiming hosted
acceptance. Six prior findings and four unwired gates are unchanged, explicit
baseline findings rather than failures of the measured-context freshness check.

The dispatch remains in progress for runtime acceptance. No coding session,
mission activation, live seat event, external comment or deployment was created.
