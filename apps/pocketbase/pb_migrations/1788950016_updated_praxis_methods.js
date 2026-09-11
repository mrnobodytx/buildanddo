// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
/// <reference path="../pb_data/types.d.ts" />
// Imported 2026-09-11 from production (KVM1 /opt/buildanddo-pocketbase/pb_migrations).
// Original production filename: 1788799254_updated_praxis_methods.js
//   (PocketBase admin-UI generated, 2026-09-07T16:40:54.000Z).
// Renumbered to 1788950016 because the original number sorts before
// 1788800000_create_praxis_evidence_fabric.js (creates the collection whose
// field definitions are replaced below); a fresh database
// fails with "failed to load collection" at the original position. Production
// only succeeded because the collection already existed when the admin edit was made.
// PocketBase records applied migrations by FILENAME, so production will re-apply
// this file under the new name. It only replaces existing field definitions
// (collection.fields.addAt with the field's own deterministic id = type + crc32(name),
// so it replaces in place rather than adding) and calls app.save: no records, no
// indexes, no new fields. Re-applying it on production is an idempotent no-op;
// down() restores the prior definition symmetrically.
// Collection: praxis_methods (the pbc_ id below is "pbc_" + crc32("base" + name), which
// PocketBase derives deterministically, so it resolves identically on a fresh install).
// See docs/architecture/POCKETBASE_MIGRATION_DRIFT_2026-09-11.md.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2463497436")

  // update field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "number1300308547",
    "max": null,
    "min": null,
    "name": "community_attempts",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(13, new Field({
    "help": "",
    "hidden": false,
    "id": "number1533002948",
    "max": null,
    "min": null,
    "name": "community_verified_successes",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2463497436")

  // update field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "number1300308547",
    "max": null,
    "min": null,
    "name": "community_attempts",
    "onlyInt": false,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(13, new Field({
    "help": "",
    "hidden": false,
    "id": "number1533002948",
    "max": null,
    "min": null,
    "name": "community_verified_successes",
    "onlyInt": false,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
