/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("early_access");
      return;
    } catch (_) {
      // Collection does not exist yet — create it below.
    }

    const collection = new Collection({
      type: "base",
      name: "early_access",
      // Public can submit; only superusers can read or change entries.
      listRule: null,
      viewRule: null,
      createRule: "",
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "name", type: "text", required: true, max: 120 },
        { name: "email", type: "email", required: true },
        { name: "business_type", type: "text", required: true, max: 120 },
        { name: "task", type: "text", required: true, max: 1000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_early_access_email ON early_access (email)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("early_access");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("Collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
