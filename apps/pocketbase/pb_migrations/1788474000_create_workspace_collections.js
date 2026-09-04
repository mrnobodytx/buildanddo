/// <reference path="../pb_data/types.d.ts" />

// BuildAndDo workspace data model — owner-scoped collections for the
// authenticated product MVP. Tutorials are a shared catalog (any signed-in
// user can read); everything else is owner-scoped.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ---- domains ----
    const domains = new Collection({
      type: "base",
      name: "domains",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "domain", type: "text", required: true, max: 253 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["selected", "analyzing", "verified", "needs_attention"],
        },
        { name: "has_website", type: "bool" },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(domains);

    // ---- workspaces ----
    const workspaces = new Collection({
      type: "base",
      name: "workspaces",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "name", type: "text", required: true, max: 120 },
        {
          name: "domain",
          type: "relation",
          maxSelect: 1,
          collectionId: domains.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(workspaces);

    // ---- signals ----
    const signals = new Collection({
      type: "base",
      name: "signals",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "description", type: "text", max: 1000 },
        { name: "source", type: "text", max: 120 },
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["fact", "inference", "user"],
        },
        { name: "confidence", type: "number", min: 0, max: 100 },
        {
          name: "workspace",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: workspaces.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(signals);

    // ---- missions ----
    const missions = new Collection({
      type: "base",
      name: "missions",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "description", type: "text", max: 2000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "proposed",
            "approved",
            "running",
            "needs_attention",
            "verified",
            "failed",
          ],
        },
        {
          name: "workspace",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: workspaces.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(missions);

    // ---- workflows ----
    const workflows = new Collection({
      type: "base",
      name: "workflows",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "name", type: "text", required: true, max: 160 },
        { name: "description", type: "text", max: 1000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "active", "paused"],
        },
        {
          name: "workspace",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: workspaces.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(workflows);

    // ---- services (per-workspace connection cards) ----
    const services = new Collection({
      type: "base",
      name: "services",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "name", type: "text", required: true, max: 80 },
        { name: "purpose", type: "text", required: true, max: 300 },
        { name: "data_boundary", type: "text", max: 300 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["planned", "not_connected", "connected", "degraded", "needs_attention"],
        },
        { name: "last_health_check", type: "date" },
        { name: "next_action", type: "text", max: 300 },
        {
          name: "workspace",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: workspaces.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(services);

    // ---- evidence ----
    const evidence = new Collection({
      type: "base",
      name: "evidence",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "content", type: "text", required: true, max: 2000 },
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["observed", "decided", "attempted", "verified"],
        },
        { name: "source", type: "text", max: 160 },
        {
          name: "mission",
          type: "relation",
          maxSelect: 1,
          collectionId: missions.id,
          cascadeDelete: true,
        },
        {
          name: "workspace",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: workspaces.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(evidence);

    // ---- tutorials (shared catalog; any signed-in user can read) ----
    const tutorials = new Collection({
      type: "base",
      name: "tutorials",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "title", type: "text", required: true, max: 160 },
        { name: "summary", type: "text", max: 400 },
        { name: "category", type: "text", max: 80 },
        { name: "effort_minutes", type: "number", min: 1 },
        { name: "prerequisites", type: "text", max: 300 },
        { name: "order", type: "number" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(tutorials);

    // ---- tutorial_progress (per-user) ----
    const tutorialProgress = new Collection({
      type: "base",
      name: "tutorial_progress",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        {
          name: "tutorial",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tutorials.id,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["not_started", "in_progress", "completed"],
        },
        { name: "progress", type: "number", min: 0, max: 100 },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(tutorialProgress);

    // ---- ERP foundation: objectives, tasks, contacts ----
    const erpObjectives = new Collection({
      type: "base",
      name: "erp_objectives",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "description", type: "text", max: 1000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "achieved", "archived"],
        },
        {
          name: "workspace",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: workspaces.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(erpObjectives);

    const erpTasks = new Collection({
      type: "base",
      name: "erp_tasks",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["todo", "in_progress", "done"],
        },
        {
          name: "objective",
          type: "relation",
          maxSelect: 1,
          collectionId: erpObjectives.id,
        },
        {
          name: "workspace",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: workspaces.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(erpTasks);

    const erpContacts = new Collection({
      type: "base",
      name: "erp_contacts",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "name", type: "text", required: true, max: 160 },
        { name: "role", type: "text", max: 120 },
        { name: "email", type: "email" },
        { name: "notes", type: "text", max: 1000 },
        {
          name: "workspace",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: workspaces.id,
          cascadeDelete: true,
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(erpContacts);

    // ---- seed tutorial catalog ----
    const tutorialSeed = [
      {
        title: "Welcome to BuildAndDo",
        summary: "The Observe → Understand → Act → Verify loop, and how your workspace is organized.",
        category: "Foundations",
        effort_minutes: 8,
        prerequisites: "None — start here.",
        order: 1,
      },
      {
        title: "Selecting and verifying a domain",
        summary: "How domain discovery works, what 'selected' vs 'verified' means, and why a found domain is not an authorized domain.",
        category: "Foundations",
        effort_minutes: 10,
        prerequisites: "Welcome to BuildAndDo",
        order: 2,
      },
      {
        title: "Reading the Signals feed",
        summary: "Telling facts, inferences, and user-provided information apart, and what confidence means.",
        category: "Signals",
        effort_minutes: 12,
        prerequisites: "Selecting and verifying a domain",
        order: 3,
      },
      {
        title: "Proposing and approving a mission",
        summary: "How a bounded mission is scoped, what you approve before anything runs, and how to review the plan.",
        category: "Missions",
        effort_minutes: 14,
        prerequisites: "Reading the Signals feed",
        order: 4,
      },
      {
        title: "Inspecting evidence and replay",
        summary: "How to review what BuildAndDo observed, decided, attempted, and verified — and what to do when a mission needs attention.",
        category: "Evidence",
        effort_minutes: 11,
        prerequisites: "Proposing and approving a mission",
        order: 5,
      },
      {
        title: "Connecting a self-hosted service",
        summary: "What the Operations area means, the planned self-hosted stack, and how connection status works.",
        category: "Operations",
        effort_minutes: 13,
        prerequisites: "Welcome to BuildAndDo",
        order: 6,
      },
    ];

    tutorialSeed.forEach((t) => {
      const rec = new Record(tutorials);
      rec.set("title", t.title);
      rec.set("summary", t.summary);
      rec.set("category", t.category);
      rec.set("effort_minutes", t.effort_minutes);
      rec.set("prerequisites", t.prerequisites);
      rec.set("order", t.order);
      app.save(rec);
    });
  },
  (app) => {
    const names = [
      "erp_contacts",
      "erp_tasks",
      "erp_objectives",
      "tutorial_progress",
      "tutorials",
      "evidence",
      "services",
      "workflows",
      "missions",
      "signals",
      "workspaces",
      "domains",
    ];
    names.forEach((name) => {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    });
  },
);
