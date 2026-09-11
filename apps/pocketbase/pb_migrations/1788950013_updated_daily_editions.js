// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
/// <reference path="../pb_data/types.d.ts" />
// Imported 2026-09-11 from production (KVM1 /opt/buildanddo-pocketbase/pb_migrations).
// Original production filename: 1788798545_updated_daily_editions.js
//   (PocketBase admin-UI generated, 2026-09-07T16:29:05.000Z).
// Renumbered to 1788950013 because the original number sorts before
// 1788900000_create_workspace_members_rbac.js (creates the
// @collection.workspace_members the rules below reference); a fresh database
// fails with "failed to load collection" at the original position. Production
// only succeeded because the collection already existed when the admin edit was made.
// PocketBase records applied migrations by FILENAME, so production will re-apply
// this file under the new name. It only sets listRule/viewRule/createRule/updateRule
// via unmarshal + app.save: no records, no indexes, no fields. Re-applying it on
// production is an idempotent no-op; down() restores the prior rules symmetrically.
// Collection: daily_editions (the pbc_ id below is "pbc_" + crc32("base" + name), which
// PocketBase derives deterministically, so it resolves identically on a fresh install).
// See docs/architecture/POCKETBASE_MIGRATION_DRIFT_2026-09-11.md.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_189460901")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id = owner || (@collection.workspace_members.workspace ?= workspace && @collection.workspace_members.user ?= @request.auth.id && @collection.workspace_members.role ?!= 'viewer')",
    "listRule": "@request.auth.id = owner || (@collection.workspace_members.workspace ?= workspace && @collection.workspace_members.user ?= @request.auth.id)",
    "updateRule": "@request.auth.id = owner || (@collection.workspace_members.workspace ?= workspace && @collection.workspace_members.user ?= @request.auth.id && @collection.workspace_members.role ?!= 'viewer')",
    "viewRule": "@request.auth.id = owner || (@collection.workspace_members.workspace ?= workspace && @collection.workspace_members.user ?= @request.auth.id)"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_189460901")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id = owner || (@collection.workspace_members.workspace = workspace && @collection.workspace_members.user = @request.auth.id && @collection.workspace_members.role != 'viewer')",
    "listRule": "@request.auth.id = owner || (@collection.workspace_members.workspace = workspace && @collection.workspace_members.user = @request.auth.id)",
    "updateRule": "@request.auth.id = owner || (@collection.workspace_members.workspace = workspace && @collection.workspace_members.user = @request.auth.id && @collection.workspace_members.role != 'viewer')",
    "viewRule": "@request.auth.id = owner || (@collection.workspace_members.workspace = workspace && @collection.workspace_members.user = @request.auth.id)"
  }, collection)

  return app.save(collection)
})
