/// <reference path="../pb_data/types.d.ts" />

// Two real gaps closed:
// 1. knowledge_claims had no authorship field, so "self-audit cannot settle
//    verification" (doc rule) was only caller-asserted (an `independent` bool
//    the caller could set to anything), not actually derivable/enforceable.
//    Adding submitted_by lets audits.py check the REAL author against the
//    auditor, not trust a flag.
// 2. contributor_reputation: minimal real XP/TP tracking, per user per domain.
//    XP = demonstrated verified work. TP = demonstrated trust/calibration.
//    Both settle only from independently-verified audit outcomes, never from
//    raw submission volume or self-verification (doc rules #9/#20).

migrate(
  (app) => {
    const kclaim = app.findCollectionByNameOrId("knowledge_claims");
    if (!kclaim.fields.getByName("submitted_by")) {
      kclaim.fields.add(new Field({ name: "submitted_by", type: "relation",
        collectionId: "_pb_users_auth_", maxSelect: 1 }));
      app.save(kclaim);
    }

    try {
      app.findCollectionByNameOrId("contributor_reputation");
    } catch (_) {
      const collection = new Collection({
        type: "base",
        name: "contributor_reputation",
        listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1, required: true },
          { name: "domain", type: "text", required: true, max: 120 },
          { name: "xp", type: "number" },
          { name: "tp", type: "number" },
          { name: "verified_contributions", type: "number" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_reputation_user_domain ON contributor_reputation (user, domain)"],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("contributor_reputation"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    const kclaim = app.findCollectionByNameOrId("knowledge_claims");
    const f = kclaim.fields.getByName("submitted_by");
    if (f) {
      kclaim.fields.removeById(f.id);
      app.save(kclaim);
    }
  },
);
