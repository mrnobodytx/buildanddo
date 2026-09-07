/// <reference path="../pb_data/types.d.ts" />

// Workspace RBAC (SRS: BD-RBAC-001). Today's model is single-owner-only (every
// workspace-scoped collection's rule is `@request.auth.id = owner`) - real gap:
// no team collaboration is possible. This adds workspace_members with a role
// (owner/admin/editor/viewer) and re-scopes the workspace-scoped collections'
// rules to ALSO allow access via verified membership, without removing the
// existing owner-based access (backward compatible with every existing row,
// which has no membership rows yet).

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("workspace_members");
    } catch (_) {
      const workspaces = app.findCollectionByNameOrId("workspaces");
      const collection = new Collection({
        type: "base",
        name: "workspace_members",
        listRule: "@request.auth.id = user || workspace.owner = @request.auth.id",
        viewRule: "@request.auth.id = user || workspace.owner = @request.auth.id",
        createRule: "workspace.owner = @request.auth.id",
        updateRule: "workspace.owner = @request.auth.id",
        deleteRule: "workspace.owner = @request.auth.id || @request.auth.id = user",
        fields: [
          { name: "workspace", type: "relation", collectionId: workspaces.id, maxSelect: 1, required: true },
          { name: "user", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1, required: true },
          { name: "role", type: "select", required: true, maxSelect: 1,
            values: ["owner", "admin", "editor", "viewer"] },
          { name: "invited_by", type: "relation", collectionId: "_pb_users_auth_", maxSelect: 1 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_wsmember_unique ON workspace_members (workspace, user)",
        ],
      });
      app.save(collection);
    }

    // Re-scope workspace-scoped collections: owner keeps full access (unchanged
    // behavior for every existing row with no membership rows), PLUS any verified
    // member gets read access, and editor/admin/owner roles get write access.
    // viewer role is intentionally read-only (matches the role's name).
    // NOTE: relation-field comparisons in a cross-collection @collection.X.Y filter
    // MUST use the "?=" any-match operator, not "=" - measured 2026-09-07: "=" here
    // silently returns zero rows (no error), which read as "membership denied" for
    // every real member until isolated via a bare single-condition filter test.
    const memberReadFilter = "(@collection.workspace_members.workspace ?= workspace && " +
      "@collection.workspace_members.user ?= @request.auth.id)";
    const memberWriteFilter = "(@collection.workspace_members.workspace ?= workspace && " +
      "@collection.workspace_members.user ?= @request.auth.id && " +
      "@collection.workspace_members.role ?!= 'viewer')";

    const targets = ["services", "missions", "signals", "workflows", "roadmap_items",
      "erp_contacts", "erp_objectives", "erp_tasks", "social_channels", "social_content",
      "specialist_desks", "support_sources", "tutorial_progress", "corrections",
      "daily_editions", "challenge_submissions"];

    for (const name of targets) {
      let collection;
      try {
        collection = app.findCollectionByNameOrId(name);
      } catch (_) {
        continue; // collection doesn't exist in this environment - skip, don't fail the migration
      }
      if (!collection.fields.getByName("workspace")) {
        continue; // not workspace-scoped (no `workspace` relation field) - owner-only rule stands
      }
      const ownerClause = "@request.auth.id = owner";
      collection.listRule = `${ownerClause} || ${memberReadFilter}`;
      collection.viewRule = `${ownerClause} || ${memberReadFilter}`;
      collection.createRule = `${ownerClause} || ${memberWriteFilter}`;
      collection.updateRule = `${ownerClause} || ${memberWriteFilter}`;
      collection.deleteRule = ownerClause; // deletion stays owner-only regardless of role
      app.save(collection);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("workspace_members"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    // Note: does not revert the re-scoped rules on the target collections - reverting
    // those to the exact prior string would require snapshotting them first, which
    // this migration does not do. Re-run the pre-RBAC migration set to fully revert.
  },
);
