/// <reference path="../pb_data/types.d.ts" />
// A research quest with no stated question isn't actionable - added late,
// real gap found while building the auto-compiler (Phase 13).
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("governance_research_quests");
    if (!c.fields.getByName("question")) {
      c.fields.add(new Field({ name: "question", type: "text", required: true, max: 500 }));
      app.save(c);
    }
  },
  (app) => {
    const c = app.findCollectionByNameOrId("governance_research_quests");
    const f = c.fields.getByName("question");
    if (f) { c.fields.removeById(f.id); app.save(c); }
  },
);
