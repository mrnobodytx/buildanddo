/// <reference path="../pb_data/types.d.ts" />

// The BuildAndDo Universal Praxis Evidence Fabric (SRS: BD-PRAXIS-EVIDENCE-001).
//
// Thirteen-plus evidence classes with fundamentally different truth behavior, per
// the design: a CLAIM is not a FACT merely for existing; a PRICE is a dated/located
// observation, not a timeless number; a BELIEF must never silently promote into a
// CLAIM; TIMING is a distribution, not a constant; COMMUNITY CONSENSUS is evidence,
// not truth. Collections are created in dependency order (sources -> claims ->
// methods -> materials/tools -> pricing/timing -> experience -> governance) so
// relation fields can target already-existing collections without circularity.
//
// Public write access is deliberately NOT granted here (createRule/updateRule left
// as superuser-only, matching this repo's early_access precedent) - the write path
// goes through services/praxis_evidence (Phase 3+), which enforces the epistemic
// state machine and audit trail in application code, not raw client writes.

migrate(
  (app) => {
    const ensure = (name, def) => {
      try {
        app.findCollectionByNameOrId(name);
        return null; // already exists - idempotent
      } catch (_) {
        const collection = new Collection(def);
        app.save(collection);
        return collection;
      }
    };

    // ---- knowledge.sources ----------------------------------------------------
    ensure("knowledge_sources", {
      type: "base",
      name: "knowledge_sources",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "url", type: "url" },
        { name: "title", type: "text", max: 300 },
        { name: "publisher", type: "text", max: 200 },
        { name: "source_type", type: "select", required: true, maxSelect: 1,
          values: ["WEB", "API", "COMMUNITY", "EXPERIMENT", "TELEMETRY", "PUBLICATION", "BOOK", "STANDARD"] },
        { name: "captured_at", type: "date" },
        { name: "content_hash", type: "text", max: 128 },
        { name: "notes", type: "editor" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_ksrc_display_id ON knowledge_sources (display_id)"],
    });

    // Self-relations added in a second pass once the collection exists (PocketBase
    // relation fields can target the collection they live in without ordering issues).
    const ksrc = app.findCollectionByNameOrId("knowledge_sources");
    for (const f of ["derived_from", "copies", "reproduces", "contradicts_sources", "independent_of"]) {
      if (!ksrc.fields.getByName(f)) {
        ksrc.fields.add(new Field({ name: f, type: "relation", collectionId: ksrc.id, maxSelect: 999 }));
      }
    }
    app.save(ksrc);

    // ---- knowledge.claims -------------------------------------------------------
    ensure("knowledge_claims", {
      type: "base",
      name: "knowledge_claims",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "subject", type: "text", required: true, max: 300 },
        { name: "predicate", type: "text", required: true, max: 300 },
        { name: "object", type: "text", required: true, max: 300 },
        { name: "domain", type: "text", required: true, max: 120 },
        { name: "context", type: "json" },
        { name: "epistemic_state", type: "select", required: true, maxSelect: 1,
          values: ["USER_ASSERTED", "EXTRACTED", "SOURCE_BACKED", "CORROBORATED", "COMMUNITY_AUDITED",
                   "EXPERT_REVIEWED", "REPRODUCED", "FIELD_VERIFIED", "DISPUTED", "REFUTED", "STALE"] },
        { name: "confidence", type: "number", min: 0, max: 1 },
        { name: "supporting_sources", type: "relation", collectionId: ksrc.id, maxSelect: 999 },
        { name: "contradicting_sources", type: "relation", collectionId: ksrc.id, maxSelect: 999 },
        { name: "observed_at", type: "date" },
        { name: "valid_until", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_kclaim_display_id ON knowledge_claims (display_id)",
        "CREATE INDEX idx_kclaim_domain ON knowledge_claims (domain)",
        "CREATE INDEX idx_kclaim_state ON knowledge_claims (epistemic_state)",
      ],
    });
    const kclaim = app.findCollectionByNameOrId("knowledge_claims");

    // ---- knowledge.logic ---------------------------------------------------------
    ensure("knowledge_logic", {
      type: "base",
      name: "knowledge_logic",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "domain", type: "text", required: true, max: 120 },
        { name: "rule_type", type: "select", required: true, maxSelect: 1,
          values: ["DETERMINISTIC", "EMPIRICAL_RULE", "HEURISTIC", "CAUSAL_HYPOTHESIS", "CULTURAL_RULE", "LEGAL_RULE"] },
        { name: "if_conditions", type: "json", required: true },
        { name: "then_result", type: "json", required: true },
        { name: "certainty", type: "select", maxSelect: 1,
          values: ["DETERMINISTIC", "ESTABLISHED", "HEURISTIC", "SPECULATIVE"] },
        { name: "falsifier", type: "editor" },
        { name: "evidence", type: "relation", collectionId: kclaim.id, maxSelect: 999 },
        { name: "status", type: "select", maxSelect: 1,
          values: ["PROPOSED", "COMMUNITY_TESTED", "VERIFIED", "REFUTED"] },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_klogic_display_id ON knowledge_logic (display_id)"],
    });

    // ---- knowledge.beliefs --------------------------------------------------------
    ensure("knowledge_beliefs", {
      type: "base",
      name: "knowledge_beliefs",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "proposition", type: "editor", required: true },
        { name: "attributed_actor", type: "text", max: 200 },
        { name: "attributed_community", type: "text", max: 200 },
        { name: "attributed_school", type: "text", max: 200 },
        { name: "attributed_tradition", type: "text", max: 200 },
        { name: "domain", type: "text", required: true, max: 120 },
        { name: "context", type: "json" },
        { name: "evidence_of_belief", type: "json" },
        { name: "supports_claims", type: "relation", collectionId: kclaim.id, maxSelect: 999 },
        { name: "conflicts_with_claims", type: "relation", collectionId: kclaim.id, maxSelect: 999 },
        { name: "prevalence_state", type: "select", maxSelect: 1, values: ["UNKNOWN", "MEASURED"] },
        { name: "prevalence_evidence", type: "json" },
        // epistemic_class is fixed, never settable to CLAIM - the field itself has
        // no CLAIM option, so a belief literally cannot become a claim by mutation.
        { name: "epistemic_class", type: "select", required: true, maxSelect: 1, values: ["ATTRIBUTED_BELIEF"] },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_kbelief_display_id ON knowledge_beliefs (display_id)"],
    });

    // ---- praxis.methods -------------------------------------------------------
    ensure("praxis_methods", {
      type: "base",
      name: "praxis_methods",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "objective", type: "text", required: true, max: 300 },
        { name: "domain", type: "text", required: true, max: 120 },
        { name: "prerequisites", type: "json" },
        { name: "parameters", type: "json" },
        { name: "steps", type: "editor" },
        { name: "applicable_context", type: "json" },
        { name: "contraindications", type: "json" },
        { name: "advantages_evidence", type: "relation", collectionId: kclaim.id, maxSelect: 999 },
        { name: "disadvantages_evidence", type: "relation", collectionId: kclaim.id, maxSelect: 999 },
        { name: "outcome_metrics", type: "json" },
        { name: "community_attempts", type: "number", required: true },
        { name: "community_verified_successes", type: "number", required: true },
        { name: "knowledge_state", type: "select", required: true, maxSelect: 1,
          values: ["PROPOSED", "COMMUNITY_TESTED", "VERIFIED", "DISPUTED", "DEPRECATED"] },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_pmethod_display_id ON praxis_methods (display_id)",
        "CREATE INDEX idx_pmethod_domain ON praxis_methods (domain)",
      ],
    });
    const pmethod = app.findCollectionByNameOrId("praxis_methods");

    // ---- praxis.materials / praxis.tools ---------------------------------------
    ensure("praxis_materials", {
      type: "base",
      name: "praxis_materials",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "canonical_name", type: "text", required: true, max: 200 },
        { name: "aliases", type: "json" },
        { name: "category", type: "text", required: true, max: 120 },
        { name: "specification", type: "json" },
        { name: "substitutions", type: "json" },
        { name: "compatible_methods", type: "relation", collectionId: pmethod.id, maxSelect: 999 },
        { name: "hazards", type: "json" },
        { name: "evidence_claims", type: "relation", collectionId: kclaim.id, maxSelect: 999 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_pmat_display_id ON praxis_materials (display_id)"],
    });
    const pmat = app.findCollectionByNameOrId("praxis_materials");

    ensure("praxis_tools", {
      type: "base",
      name: "praxis_tools",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "canonical_name", type: "text", required: true, max: 200 },
        { name: "category", type: "text", required: true, max: 120 },
        { name: "specification", type: "json" },
        { name: "compatible_methods", type: "relation", collectionId: pmethod.id, maxSelect: 999 },
        { name: "evidence_claims", type: "relation", collectionId: kclaim.id, maxSelect: 999 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_ptool_display_id ON praxis_tools (display_id)"],
    });

    // ---- praxis.pricing (price_observation, never a bare point estimate) -------
    ensure("praxis_pricing", {
      type: "base",
      name: "praxis_pricing",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "material", type: "relation", collectionId: pmat.id, maxSelect: 1, required: true },
        { name: "amount", type: "number", required: true },
        { name: "currency", type: "text", required: true, max: 8 },
        { name: "quantity_value", type: "number", required: true },
        { name: "quantity_unit", type: "text", required: true, max: 40 },
        { name: "vendor", type: "text", max: 200 },
        { name: "country", type: "text", max: 4 },
        { name: "region", type: "text", max: 120 },
        { name: "locality", type: "text", max: 120 },
        { name: "channel", type: "select", required: true, maxSelect: 1,
          values: ["ONLINE", "STORE", "WHOLESALE", "COMMUNITY_REPORTED"] },
        { name: "membership_required", type: "bool" },
        { name: "sale", type: "bool" },
        { name: "bulk_quantity", type: "number" },
        { name: "shipping_included", type: "bool" },
        { name: "tax_included", type: "bool" },
        { name: "observed_at", type: "date", required: true },
        { name: "source_url", type: "url" },
        { name: "evidence_hash", type: "text", max: 128 },
        { name: "verification_state", type: "select", required: true, maxSelect: 1,
          values: ["OBSERVED", "CORROBORATED", "STALE"] },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_pprice_display_id ON praxis_pricing (display_id)",
        "CREATE INDEX idx_pprice_material ON praxis_pricing (material)",
        "CREATE INDEX idx_pprice_observed_at ON praxis_pricing (observed_at)",
      ],
    });

    // ---- praxis.timing (distribution, never a single unsupported duration) ----
    ensure("praxis_timing", {
      type: "base",
      name: "praxis_timing",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "praxis_method", type: "relation", collectionId: pmethod.id, maxSelect: 1, required: true },
        { name: "activity", type: "text", required: true, max: 300 },
        { name: "duration_value", type: "number", required: true },
        { name: "duration_unit", type: "select", required: true, maxSelect: 1,
          values: ["MINUTES", "HOURS", "DAYS", "WEEKS", "SESSIONS"] },
        { name: "sessions", type: "number" },
        { name: "minutes_per_session_mean", type: "number" },
        { name: "experience_level", type: "select", maxSelect: 1,
          values: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"] },
        { name: "prior_skill", type: "json" },
        { name: "criterion_met", type: "bool" },
        { name: "confidence", type: "select", required: true, maxSelect: 1,
          values: ["USER_REPORTED", "MEASURED", "EXPERT_VALIDATED"] },
        { name: "observed_at", type: "date", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_ptime_display_id ON praxis_timing (display_id)",
        "CREATE INDEX idx_ptime_method ON praxis_timing (praxis_method)",
      ],
    });

    // ---- experience.attempts / outcomes / failures -----------------------------
    ensure("experience_attempts", {
      type: "base",
      name: "experience_attempts",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "actor", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1 },
        { name: "praxis_method", type: "relation", collectionId: pmethod.id, maxSelect: 1, required: true },
        { name: "context", type: "json" },
        { name: "steps_completed", type: "json" },
        { name: "deviations", type: "json" },
        { name: "timing_value", type: "number" },
        { name: "timing_unit", type: "text", max: 40 },
        { name: "actual_cost", type: "number" },
        { name: "materials_consumed", type: "json" },
        { name: "materials_substituted", type: "json" },
        { name: "evidence_media", type: "json" },
        { name: "verification_state", type: "select", required: true, maxSelect: 1,
          values: ["SELF_REPORTED", "PEER_REVIEWED", "EXPERT_VERIFIED"] },
        { name: "observed_at", type: "date", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_eattempt_display_id ON experience_attempts (display_id)"],
    });
    const eattempt = app.findCollectionByNameOrId("experience_attempts");

    ensure("experience_outcomes", {
      type: "base",
      name: "experience_outcomes",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "attempt", type: "relation", collectionId: eattempt.id, maxSelect: 1, required: true },
        { name: "metric_name", type: "text", required: true, max: 120 },
        { name: "metric_value", type: "json", required: true },
        { name: "rubric", type: "json" },
        { name: "observed_at", type: "date", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_eoutcome_display_id ON experience_outcomes (display_id)"],
    });

    ensure("experience_failures", {
      type: "base",
      name: "experience_failures",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "attempt", type: "relation", collectionId: eattempt.id, maxSelect: 1, required: true },
        { name: "failure_description", type: "editor", required: true },
        { name: "recovery_attempted", type: "editor" },
        { name: "root_cause_hypothesis", type: "text", max: 500 },
        { name: "observed_at", type: "date", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_efail_display_id ON experience_failures (display_id)"],
    });

    // ---- governance.audits / disputes / research_quests ------------------------
    ensure("governance_audits", {
      type: "base",
      name: "governance_audits",
      // Append-only: no updateRule/deleteRule at all (not even superuser via the API
      // rule - corrections are new audit rows + a supersession, never an edit).
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "target_type", type: "select", required: true, maxSelect: 1,
          values: ["CLAIM", "PRICE", "MATERIAL", "TOOL", "METHOD", "TIMING", "LOGIC", "BELIEF", "SOURCE", "EXPERIENCE"] },
        { name: "target_id", type: "text", required: true, max: 40 },
        { name: "action", type: "select", required: true, maxSelect: 1,
          values: ["CORROBORATE", "CONTRADICT", "REPRODUCE", "FAIL_TO_REPRODUCE", "PRICE_CONFIRM", "PRICE_UPDATE",
                   "MATERIAL_VERIFY", "METHOD_TRIAL", "TIMING_REPORT", "SOURCE_CHECK", "LOGIC_FALSIFIER",
                   "EXPERT_REVIEW", "CONTEXT_CORRECTION", "TRANSLATION_REVIEW", "SAFETY_FLAG", "OUTDATED_FLAG"] },
        { name: "result", type: "select", required: true, maxSelect: 1,
          values: ["CONFIRMED", "CONTRADICTED", "INCONCLUSIVE", "FLAGGED"] },
        { name: "observation", type: "json" },
        { name: "evidence", type: "json" },
        { name: "auditor", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1, required: true },
        { name: "auditor_relevant_xp", type: "json" },
        { name: "auditor_relevant_tp", type: "json" },
        { name: "independent", type: "bool", required: true },
        { name: "observed_at", type: "date", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_gaudit_display_id ON governance_audits (display_id)",
        "CREATE INDEX idx_gaudit_target ON governance_audits (target_type, target_id)",
      ],
    });

    ensure("governance_disputes", {
      type: "base",
      name: "governance_disputes",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "subject_type", type: "text", required: true, max: 40 },
        { name: "subject_id", type: "text", required: true, max: 40 },
        { name: "position_claim_a", type: "relation", collectionId: kclaim.id, maxSelect: 1 },
        { name: "position_claim_b", type: "relation", collectionId: kclaim.id, maxSelect: 1 },
        { name: "conflict_type", type: "select", required: true, maxSelect: 1,
          values: ["CONTRADICTORY_OUTCOME", "CONTRADICTORY_CLAIM", "METHODOLOGY_DISAGREEMENT", "CONTEXT_MISMATCH"] },
        { name: "context_difference_possible", type: "bool" },
        { name: "evidence", type: "json" },
        { name: "state", type: "select", required: true, maxSelect: 1, values: ["OPEN", "RESOLVED", "STALE"] },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_gdispute_display_id ON governance_disputes (display_id)",
        "CREATE INDEX idx_gdispute_subject ON governance_disputes (subject_type, subject_id)",
      ],
    });

    ensure("governance_research_quests", {
      type: "base",
      name: "governance_research_quests",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        { name: "trigger_reason", type: "select", required: true, maxSelect: 1,
          values: ["CLAIM_DISPUTED", "PRICE_STALE", "TIMING_LOW_CONFIDENCE", "METHOD_OUTCOMES_CONFLICT",
                   "MATERIAL_LACKS_EVIDENCE", "LOGIC_RULE_FAILS", "BELIEF_FACT_DISPUTE",
                   "NEW_DOMAIN_INSUFFICIENT", "SAFETY_FLAG"] },
        { name: "subject_type", type: "text", required: true, max: 40 },
        { name: "subject_id", type: "text", required: true, max: 40 },
        { name: "required_capabilities", type: "json" },
        { name: "status", type: "select", required: true, maxSelect: 1,
          values: ["OPEN", "IN_PROGRESS", "RESOLVED", "ABANDONED"] },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_gquest_display_id ON governance_research_quests (display_id)",
        "CREATE INDEX idx_gquest_status ON governance_research_quests (status)",
      ],
    });
  },
  (app) => {
    const names = [
      "governance_research_quests", "governance_disputes", "governance_audits",
      "experience_failures", "experience_outcomes", "experience_attempts",
      "praxis_timing", "praxis_pricing", "praxis_tools", "praxis_materials", "praxis_methods",
      "knowledge_beliefs", "knowledge_logic", "knowledge_claims", "knowledge_sources",
    ];
    for (const name of names) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    }
  },
);
