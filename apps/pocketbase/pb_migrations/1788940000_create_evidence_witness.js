/// <reference path="../pb_data/types.d.ts" />

// External Evidence Witness storage (SRS-BUILDANDDO-WITNESS-001, control
// NEXUS-AUD-002). Full rationale: docs/architecture/EVIDENCE_WITNESS.md.
//
// Two collections, deliberately separate:
//
//   evidence_epochs   a sealed, ordered batch of internal evidence reduced to
//                     one deterministic Merkle root, chained to its parent.
//   anchor_manifests  one record per anchor ATTEMPT against a public network.
//
// They are not merged because "never anchored" and "anchored, then found to
// disagree" are opposite conclusions. An epoch exists whether or not it was
// ever anchored; an attempt exists whether or not it succeeded. A single
// status field over one collection would make those two states
// indistinguishable, which destroys the only signal this control produces.
//
// Access: listRule/viewRule "" (public read - the whole point is independent
// checkability) and createRule/updateRule/deleteRule null (superuser only).
// The epoch aggregator and anchor publisher read private receipts and hold
// publication authority, so they run on the private plane and write here
// through the admin API. A browser client must never be able to author a proof
// about itself, which is why no client write rule is granted - matching the
// praxis evidence fabric precedent in 1788800000.
//
// No digest is computed here. PocketBase stores what the private pipeline
// published; verification is comparison of recorded values, never derivation.

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

    // ---- evidence_epochs ----------------------------------------------------
    ensure("evidence_epochs", {
      type: "base",
      name: "evidence_epochs",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        // EPOCH-<YYYYMMDD>-<NN>, sequence per UTC day.
        { name: "display_id", type: "text", required: true, max: 40 },
        // Names the leaf encoding, pairing rule and odd-node rule - not just the
        // hash function. Old anchors must stay verifiable under the rules in
        // force when they were made, so this is versioned data, not a constant.
        { name: "root_algorithm", type: "select", required: true, maxSelect: 1,
          values: ["sha256-merkle-v1"] },
        // Hex, no 0x prefix. 128 allows sha512 without a later migration.
        { name: "root_digest", type: "text", max: 128 },
        // previous_root is stored alongside the relation so the chain stays
        // walkable even if a parent record is unavailable to the reader.
        { name: "previous_root", type: "text", max: 128 },
        { name: "artifact_count", type: "number", min: 0 },
        // The artifact set is part of the record: a root over an undisclosed
        // set proves nothing useful. Shape: [{ kind, id, digest, merkle_path }].
        // merkle_path is optional - absent means "path not published", which
        // the UI must state rather than imply a path exists.
        { name: "artifacts", type: "json" },
        // Capability passport rows this epoch covers. Shape:
        // [{ capability_id, title, source_commit, lineage, sbom, tevv }] where
        // each layer value is one of VERIFIED | PENDING | ABSENT | FAILED.
        { name: "capabilities", type: "json" },
        { name: "opened_at", type: "date" },
        { name: "sealed_at", type: "date" },
        // MISMATCH is a first-class state, not an error condition: a recomputed
        // root that disagrees with the anchored one must be surfaced and
        // investigated, never overwritten to agree.
        { name: "status", type: "select", required: true, maxSelect: 1,
          values: ["OPEN", "SEALED", "ANCHOR_PENDING", "ANCHORED", "MISMATCH"] },
        { name: "notes", type: "text", max: 2000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_epoch_display_id ON evidence_epochs (display_id)",
        "CREATE INDEX idx_epoch_status ON evidence_epochs (status)",
      ],
    });

    // Self-relation added in a second pass, matching the knowledge_sources
    // pattern: a relation may target its own collection once it exists.
    const epochs = app.findCollectionByNameOrId("evidence_epochs");
    if (!epochs.fields.getByName("previous_epoch")) {
      epochs.fields.add(new Field({
        name: "previous_epoch", type: "relation", collectionId: epochs.id, maxSelect: 1,
      }));
      app.save(epochs);
    }

    // ---- anchor_manifests ---------------------------------------------------
    ensure("anchor_manifests", {
      type: "base",
      name: "anchor_manifests",
      listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: "display_id", type: "text", required: true, max: 40 },
        // Versioned: a change to how the root is computed requires a new schema
        // version so prior anchors remain verifiable.
        { name: "schema", type: "text", required: true, max: 60 },
        { name: "epoch", type: "relation", collectionId: epochs.id, maxSelect: 1, required: true },
        // The root claimed at publication time.
        { name: "root_digest", type: "text", max: 128 },
        // Digest OF the manifest - this is the only value published publicly.
        // No manifest field ever leaves the private plane in clear.
        { name: "manifest_digest", type: "text", max: 128 },
        { name: "previous_anchor_digest", type: "text", max: 128 },
        // Opaque on purpose: the network can change without a UI change.
        { name: "anchor_network", type: "text", max: 120 },
        { name: "anchor_reference", type: "text", max: 300 },
        { name: "anchor_url", type: "url" },
        { name: "anchored_at", type: "date" },
        // What a re-read of the public record actually returned. Kept separate
        // from root_digest so agreement is a comparison of two independently
        // sourced values rather than a field echoing itself.
        { name: "observed_public_root", type: "text", max: 128 },
        { name: "observed_at", type: "date" },
        // UNAVAILABLE is not MISMATCH: an unreachable network says nothing
        // about the evidence and must not be rendered as tampering.
        { name: "verification_state", type: "select", required: true, maxSelect: 1,
          values: ["PENDING", "ANCHORED", "MATCH", "MISMATCH", "UNAVAILABLE"] },
        { name: "trigger", type: "select", maxSelect: 1,
          values: ["RELEASE", "CAPABILITY_VERIFIED", "COVENANT_CHANGE", "DAILY_CHECKPOINT",
                   "DEPLOYMENT", "POLICY_CHANGE", "AUDIT_REPORT"] },
        // authority_effect is NONE by design; the control id is recorded so an
        // auditor can find the rule this row is meant to satisfy.
        { name: "control_id", type: "text", max: 40 },
        { name: "notes", type: "text", max: 2000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_anchor_display_id ON anchor_manifests (display_id)",
        "CREATE INDEX idx_anchor_epoch ON anchor_manifests (epoch)",
        "CREATE INDEX idx_anchor_state ON anchor_manifests (verification_state)",
      ],
    });
  },
  (app) => {
    // anchor_manifests first: it holds the relation into evidence_epochs.
    for (const name of ["anchor_manifests", "evidence_epochs"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    }
  },
);
