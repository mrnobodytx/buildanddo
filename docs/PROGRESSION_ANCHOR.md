# BuildAndDo progression anchor

generated 2026-09-20T18:42:41Z  ·  schema buildanddo.progression-anchor/v1

**Day 20/21** (start 2026-09-01)  ·  planned **94.0%**  ·  local **42.0%**

Replay: claimed 42.0 = replayed 42.0, overstatement 0.0  ·  {'HOLDS': 5, 'ROTTED': 0, 'UNCHECKED': 0, 'NOT_VERIFIED': 6}

- **production** serves 42.0% (day 20, generated 2026-09-20)
- **staging** serves 42.0% (day 20, generated 2026-09-20)

## Criteria: 6 done / 27 open of 33

### Priority 1 - One release candidate; real onboarding; multi-user isolation

- [ ] **D03-2** (day 3) Workspace creation flow, reproduced end-to-end and fixed when broken
      - verdict `implemented_end_to_end_unverified`
      - next: MEASURE it and record the evidence
- [ ] **D03-3** (day 3) Team roles per workspace (owner/admin/editor/viewer), not just single-owner
      - verdict `implemented_runtime_acceptance_unverified`
      - next: MEASURE it and record the evidence
- [ ] **D05-2** (day 5) Role-aware access rules verified with real multi-user accounts, not assumed
      - verdict `acceptance_unverified`
      - next: MEASURE it and record the evidence

### Priority 2 - Independent verification; production bounded-action proof; exercised rollback

- [ ] **D01-1** (day 1) Self-hosted domain + TLS (no third-party site builder)
      - verdict `operational_with_provenance_gap`
      - next: ATTACH provenance to the operational claim
- [ ] **D01-3** (day 1) Automated build → gate → staging-probe → promote pipeline
      - verdict `implemented_historical_live_receipt`
      - next: MEASURE it and record the evidence
- [ ] **D17-1** (day 17) Source-lineage collapsing (100 copies of one origin ≠ 100 independent sources)
      - verdict `implemented_internal_service`
      - next: MEASURE it and record the evidence
- [ ] **D17-2** (day 17) Real self-audit rejection by actual authorship, not a caller-honesty flag
      - verdict `partial_customer_path_gap`
      - next: EXERCISE the real customer path end to end, not the internal call
- [ ] **D17-3** (day 17) Per-dimension knowledge health — never one averaged fake score
      - verdict `implemented_with_explicit_gaps`
      - next: MEASURE it and record the evidence
- [ ] **D09-1** (day 9) A target/capability graph so an edit is scoped to one file and one mutation class
      - verdict `implemented_historical_local_receipt`
      - next: MEASURE it and record the evidence
- [ ] **D09-2** (day 9) A first real, dogfooded end-to-end edit through that pipeline, verified live in production
      - verdict `production_acceptance_unverified`
      - next: MEASURE it and record the evidence
- [ ] **D09-3** (day 9) Rollback strategy tracked as declared vs. materialized vs. verified — not assumed complete
      - verdict `declared_rollback_exercise_unverified`
      - next: MEASURE it and record the evidence

### Priority 3 - n8n / workflow execution; mission+signal -> ERP links

- [ ] **D11-3** (day 11) Connectors reusing the same evidence/audit model as everything else, not a parallel system
      - verdict `partial`
      - next: CLOSE the named remainder in the finding
- [ ] **D13-1** (day 13) Firecrawl for controlled web research
      - verdict `implemented_activation_unverified`
      - next: EXERCISE the live binding and capture the readback
- [ ] **D13-2** (day 13) Self-hosted n8n for orchestration
      - verdict `missing_product_execution_path`
      - next: BUILD the product execution adapter; an available external service is not wiring
- [ ] **D13-3** (day 13) Bounded adapter authority per connector, not a generic admin key
      - verdict `partial`
      - next: CLOSE the named remainder in the finding
- [ ] **D15-1** (day 15) Contacts/objectives/tasks with the same RBAC model as the rest of the workspace
      - verdict `implemented_runtime_acceptance_unverified`
      - next: MEASURE it and record the evidence
- [ ] **D15-2** (day 15) Cross-links from missions/signals into ERP records, not a disconnected module
      - verdict `partial_original_crosslinks_not_established`
      - next: ESTABLISH the cross-module relation in migrations/hooks, then read it back
- [ ] **D07-1** (day 7) A typed evidence/claim model with epistemic states (asserted → sourced → corroborated → verified)
      - verdict `implemented_internal_service`
      - next: MEASURE it and record the evidence
- [ ] **D07-2** (day 7) A research-quest compiler: a disputed or stale signal becomes a tracked request for more evidence, never an auto-edit
      - verdict `implemented_internal_service`
      - next: MEASURE it and record the evidence
- [ ] **D07-3** (day 7) Community audit actions with real reputation (XP/TP) settlement — never from self-review or raw volume
      - verdict `implemented_internal_service_integration_partial`
      - next: EXERCISE the live binding and capture the readback

### Priority 4 - Publish the original-criteria replay and the honest remaining gaps

- [ ] **D01-4** (day 1) Public GitHub repo + private release mirror
      - verdict `implemented_convergence_unverified`
      - next: MEASURE it and record the evidence
- [ ] **D19-1** (day 19) A canonical release event compiled once, projected consistently to wiki/Discord/community channels
      - verdict `implemented_historical_partial_delivery`
      - next: CLOSE the named remainder in the finding
- [ ] **D19-2** (day 19) Self-hosted wiki as the durable public record
      - verdict `implemented_historically_published_live_reachable`
      - next: MEASURE it and record the evidence
- [ ] **D19-3** (day 19) Specialist desk views scoped by role, not one firehose
      - verdict `partial_changed_scope`
      - next: RESTORE the original criterion scope or state the change explicitly
- [ ] **D21-1** (day 21) Public test suite results, not just a green checkmark
      - verdict `implemented_local_public_acceptance_missing`
      - next: PUBLISH a complete public test result, not a green badge
- [ ] **D21-2** (day 21) An honest list of what remains open
      - verdict `partial`
      - next: CLOSE the named remainder in the finding
- [ ] **D21-3** (day 21) This roadmap updated to reflect what actually happened, not the original plan
      - verdict `not_satisfied_at_live_readback`
      - next: DEPLOY: the local artifact is correct; publish it so the public payload agrees  **BLOCKED BY:** publish-path: staging/production deploy

---

'done' counts only criteria whose assessment verdict carries no partial/missing/gap qualifier - the conservative read. A local percentage is NOT what the public sees; compare sprint.local_pct against published.*.actual_pct and treat any publish_gap as an open item in its own right.
