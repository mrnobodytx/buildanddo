// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
// Static order check for apps/pocketbase/pb_migrations - no PocketBase needed.
//
// PocketBase applies (and records) migrations by FILENAME, lexically sorted. A
// migration that references a collection (an `@collection.<name>` rule, or a
// `findCollectionByNameOrId(...)` lookup) must therefore sort AFTER the migration
// that creates it, or a fresh database fails with "failed to load collection".
// Production never noticed because the collections already existed when the
// admin-UI edits were generated (docs/architecture/POCKETBASE_MIGRATION_DRIFT_2026-09-11.md).
//
//   node tools/check_migration_order.mjs            (from apps/pocketbase)
//   npm run pb:check-migrations
//   node tools/check_migration_order.mjs <other-dir>   (negative test against a production copy)
//
// Exit 0 = every reference resolves to an earlier (or same) file; exit 1 otherwise.
import fs from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";

// Optional argv[2]: check another migrations directory (e.g. a copy of production's).
const DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "pb_migrations");
const FILENAME_RE = /^(\d{10})_([a-z0-9_]+)\.js$/;
// Collections PocketBase ships with (present on every install before any migration).
const BASE = new Set(["users", "_superusers", "_authOrigins", "_externalAuths", "_mfas", "_otps"]);
const BASE_IDS = new Map([["_pb_users_auth_", "users"], ["pbc_3142635823", "_superusers"]]);

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Collections a migration creates: `new Collection({ ... name: "x"` or `ensure("x"`.
const createdIn = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/new Collection\(\s*\{[\s\S]*?name:\s*"([a-z_]+)"/g)) names.add(m[1]);
  for (const m of src.matchAll(/ensure\(\s*"([a-z_]+)"/g)) names.add(m[1]);
  return names;
};

// PocketBase derives a collection id as "pbc_" + crc32(type + name) - measured
// against production (services -> pbc_863811952 = crc32("baseservices")).
const pbcId = (name) => "pbc_" + (crc32(Buffer.from("base" + name)) >>> 0);

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js")).sort();
const problems = [];
const known = new Map([...BASE].map((n) => [n, "(pocketbase base)"]));
const idToName = new Map(BASE_IDS);
const seenStamps = new Map();

for (const file of files) {
  const m = file.match(FILENAME_RE);
  if (!m) { problems.push(`${file}: filename does not match <10 digits>_<snake_name>.js`); continue; }
  const stamp = m[1];
  if (seenStamps.has(stamp)) {
    console.log(`note  ${stamp} shared by ${seenStamps.get(stamp)} and ${file}: PocketBase sorts by full filename, so "${seenStamps.get(stamp)}" runs first (deterministic).`);
  } else seenStamps.set(stamp, file);

  const src = stripComments(fs.readFileSync(path.join(DIR, file), "utf8"));
  const creates = createdIn(src);
  for (const name of creates) { known.set(name, file); idToName.set(pbcId(name), name); }

  const refs = new Set([...src.matchAll(/@collection\.([A-Za-z_]+)/g)].map((r) => r[1]));
  for (const name of refs) {
    if (!known.has(name)) problems.push(`${file}: @collection.${name} but no earlier migration creates "${name}"`);
  }
  const lookups = new Set([...src.matchAll(/findCollectionByNameOrId\(\s*"([^"]+)"\s*\)/g)].map((r) => r[1]));
  for (const key of lookups) {
    const name = key.startsWith("pbc_") || key.startsWith("_pb_") ? idToName.get(key) : key;
    if (!name) problems.push(`${file}: findCollectionByNameOrId("${key}") - id is not the crc32 id of any collection created earlier`);
    else if (!known.has(name)) problems.push(`${file}: findCollectionByNameOrId("${key}") -> "${name}" is not created by an earlier migration`);
  }
  const summary = [creates.size ? `creates ${[...creates].join(",")}` : "", refs.size ? `refs ${[...refs].join(",")}` : ""].filter(Boolean).join("; ");
  console.log(`ok    ${file}${summary ? "  [" + summary + "]" : ""}`);
}

const last = files[files.length - 1];
if (last !== "1789100001_ocn_seat_users_extend.js") problems.push(`last migration is ${last}, expected 1789100001_ocn_seat_users_extend.js`);
// The 18 production imports: every slot 1788950001..18 must exist and name a collection created above.
for (let i = 1; i <= 18; i++) {
  const prefix = `17889500${String(i).padStart(2, "0")}_updated_`;
  const file = files.find((f) => f.startsWith(prefix));
  if (!file) { problems.push(`missing imported production migration ${prefix}<collection>.js`); continue; }
  const coll = file.slice(prefix.length, -3);
  if (!known.has(coll)) problems.push(`${file}: collection "${coll}" named in the filename is not created by any migration`);
}

console.log(`\n${files.length} migrations, ${problems.length} problem(s)`);
for (const p of problems) console.log(`FAIL  ${p}`);
process.exit(problems.length ? 1 : 0);
