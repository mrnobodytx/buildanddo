/// <reference path="../pb_data/types.d.ts" />

// BuildAndDo editorial data model — new owner + workspace scoped collections
// for the truthful product shell: challenge desk, daily editions, roadmap,
// support/revenue sources, community/social, specialist desks, corrections.
// All owner-scoped (least privilege). No seed data — empty by default.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const workspaces = app.findCollectionByNameOrId("workspaces");

    const ownerRel = () => ({
      name: "owner",
      type: "relation",
      required: true,
      maxSelect: 1,
      collectionId: users.id,
      cascadeDelete: true,
    });
    const wsRel = () => ({
      name: "workspace",
      type: "relation",
      required: true,
      maxSelect: 1,
      collectionId: workspaces.id,
      cascadeDelete: true,
    });
    const stamps = () => [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];
    const rules = {
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
    };

    // ---- challenge_submissions ----
    app.save(new Collection({
      type: "base",
      name: "challenge_submissions",
      ...rules,
      fields: [
        { name: "problem", type: "text", required: true, max: 2000 },
        { name: "context", type: "text", max: 2000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["submitted", "processing", "needs_info", "resolved"],
        },
        wsRel(),
        ownerRel(),
        ...stamps(),
      ],
    }));

    // ---- daily_editions ----
    app.save(new Collection({
      type: "base",
      name: "daily_editions",
      ...rules,
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "summary", type: "text", max: 1000 },
        { name: "body", type: "text", max: 10000 },
        { name: "edition_date", type: "date" },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "published"],
        },
        wsRel(),
        ownerRel(),
        ...stamps(),
      ],
    }));

    // ---- roadmap_items ----
    app.save(new Collection({
      type: "base",
      name: "roadmap_items",
      ...rules,
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "description", type: "text", max: 2000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["proposed", "planned", "in_progress", "blocked", "verified", "archived"],
        },
        { name: "owner_role", type: "text", max: 120 },
        { name: "evidence_ref", type: "text", max: 300 },
        { name: "dependency", type: "text", max: 300 },
        { name: "next_action", type: "text", max: 300 },
        wsRel(),
        ownerRel(),
        ...stamps(),
      ],
    }));

    // ---- support_sources ----
    app.save(new Collection({
      type: "base",
      name: "support_sources",
      ...rules,
      fields: [
        {
          name: "provider",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["patreon", "kofi", "stripe", "gofundme"],
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["not_connected", "pending", "connected", "syncing", "healthy", "degraded", "error"],
        },
        { name: "last_sync", type: "date" },
        { name: "gross", type: "number", min: 0 },
        { name: "platform_fees", type: "number", min: 0 },
        { name: "refunds", type: "number", min: 0 },
        { name: "currency", type: "text", max: 8 },
        { name: "payout_status", type: "text", max: 120 },
        { name: "date_range_start", type: "date" },
        { name: "date_range_end", type: "date" },
        wsRel(),
        ownerRel(),
        ...stamps(),
      ],
    }));

    // ---- social_channels ----
    app.save(new Collection({
      type: "base",
      name: "social_channels",
      ...rules,
      fields: [
        {
          name: "platform",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["discord", "youtube", "x", "linkedin", "instagram", "tiktok", "bluesky"],
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["not_connected", "pending", "connected", "healthy", "degraded", "error"],
        },
        { name: "handle", type: "text", max: 160 },
        { name: "last_check", type: "date" },
        wsRel(),
        ownerRel(),
        ...stamps(),
      ],
    }));

    // ---- social_content ----
    app.save(new Collection({
      type: "base",
      name: "social_content",
      ...rules,
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "body", type: "text", max: 5000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "awaiting_approval", "scheduled", "published", "failed"],
        },
        { name: "channel", type: "text", max: 160 },
        { name: "scheduled_for", type: "date" },
        wsRel(),
        ownerRel(),
        ...stamps(),
      ],
    }));

    // ---- specialist_desks ----
    app.save(new Collection({
      type: "base",
      name: "specialist_desks",
      ...rules,
      fields: [
        {
          name: "desk",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["research", "strategy", "operations", "verification", "risk", "recovery", "history", "optimization"],
        },
        { name: "scope", type: "text", max: 500 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["idle", "active", "blocked"],
        },
        wsRel(),
        ownerRel(),
        ...stamps(),
      ],
    }));

    // ---- corrections ----
    app.save(new Collection({
      type: "base",
      name: "corrections",
      ...rules,
      fields: [
        { name: "prior_prediction", type: "text", required: true, max: 2000 },
        { name: "observed_result", type: "text", max: 2000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "verified", "rejected"],
        },
        { name: "reference", type: "text", max: 300 },
        wsRel(),
        ownerRel(),
        ...stamps(),
      ],
    }));
  },
  (app) => {
    const names = [
      "corrections",
      "specialist_desks",
      "social_content",
      "social_channels",
      "support_sources",
      "roadmap_items",
      "daily_editions",
      "challenge_submissions",
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
