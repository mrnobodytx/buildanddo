/// <reference path="../pb_data/types.d.ts" />

// Adds the missing CITES relation (a reference, not a content-copy relation -
// doesn't collapse into the same lineage root the way DERIVED_FROM/COPIES do).
// The other five lineage relations (derived_from, copies, reproduces,
// contradicts_sources, independent_of) were already added in the original
// 1788800000 migration.

migrate(
  (app) => {
    const ksrc = app.findCollectionByNameOrId("knowledge_sources");
    if (!ksrc.fields.getByName("cites")) {
      ksrc.fields.add(new Field({ name: "cites", type: "relation", collectionId: ksrc.id, maxSelect: 999 }));
      app.save(ksrc);
    }
  },
  (app) => {
    const ksrc = app.findCollectionByNameOrId("knowledge_sources");
    const f = ksrc.fields.getByName("cites");
    if (f) {
      ksrc.fields.removeById(f.id);
      app.save(ksrc);
    }
  },
);
