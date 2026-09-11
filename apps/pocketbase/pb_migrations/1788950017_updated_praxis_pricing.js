// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
/// <reference path="../pb_data/types.d.ts" />
// Imported 2026-09-11 from production (KVM1 /opt/buildanddo-pocketbase/pb_migrations).
// Original production filename: 1788799326_updated_praxis_pricing.js
//   (PocketBase admin-UI generated, 2026-09-07T16:42:06.000Z).
// Renumbered to 1788950017 because the original number sorts before
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
// Collection: praxis_pricing (the pbc_ id below is "pbc_" + crc32("base" + name), which
// PocketBase derives deterministically, so it resolves identically on a fresh install).
// See docs/architecture/POCKETBASE_MIGRATION_DRIFT_2026-09-11.md.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_566667142")

  // update field
  collection.fields.addAt(3, new Field({
    "help": "",
    "hidden": false,
    "id": "number2392944706",
    "max": null,
    "min": null,
    "name": "amount",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(5, new Field({
    "help": "",
    "hidden": false,
    "id": "number3360715966",
    "max": null,
    "min": null,
    "name": "quantity_value",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_566667142")

  // update field
  collection.fields.addAt(3, new Field({
    "help": "",
    "hidden": false,
    "id": "number2392944706",
    "max": null,
    "min": null,
    "name": "amount",
    "onlyInt": false,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(5, new Field({
    "help": "",
    "hidden": false,
    "id": "number3360715966",
    "max": null,
    "min": null,
    "name": "quantity_value",
    "onlyInt": false,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
