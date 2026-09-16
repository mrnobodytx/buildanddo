# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/private-dossiers.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/pocketbase/pb_hooks/private-dossier.js, apps/pocketbase/pb_hooks/dossier-vault.js, apps/pocketbase/pb_migrations/1790200000_private_dossiers.js, apps/web/src/pages/workspace/DossierPage.jsx, scripts/discordbot/dossier.py, tests/upgrade/test_dossier_native.py, docs/discord-activation.md
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/private-dossier.js; CONSUMES apps/pocketbase/pb_hooks/dossier-vault.js; CONSUMES apps/pocketbase/pb_migrations/1790200000_private_dossiers.js; CONSUMES apps/web/src/pages/workspace/DossierPage.jsx; CONSUMES scripts/discordbot/dossier.py; VERIFIED_BY tests/upgrade/test_dossier_native.py; CONSUMES docs/discord-activation.md
# DAG Node:    none
# Intent:      Define the personal dossier experience, encryption and deletion guarantees, and remaining native acceptance without confusing saved context with verified evidence.
# ───────────────────────────────────────────────────────────────

# Private dossiers and entity recall

**My dossier** at `/app/dossier` stores explicit personal context under the
signed-in PocketBase `users` identity. The website and linked Discord account
read and revise the same records. A workspace owner or administrator cannot
read another member's dossier. Switching workspaces does not copy personal data
into that workspace. Demonstration mode cannot access it.

The initial scope is personal storage. There is no automatic channel collection,
inferred person matching, workspace sharing, external memory synchronization or
AI-generated profile. A note records what its owner chose to save; it does not
verify a person, source, mission or claim.

## Use the website

Open **My dossier** from workspace navigation or **Settings → Account**.
**Personal context** holds optional goals and background. **Add entity** creates
a person, organization, project, place or topic with a first note, optional
aliases, tags and source attribution. Two equal names remain distinct IDs.

Recall searches names, aliases, tags and note text. Every search term must
match somewhere in the entity; results show ten entities per page. It is a
bounded text search, with no vector database or external model. Limits are
200 entities per account, 20 notes per entity, 2,000 UTF-16 code units per note,
ten aliases and ten tags. The server additionally bounds total entity content.
Source URLs must be public HTTPS references and are not fetched by this feature.

Open an entity to read all dated notes and their website/Discord origin. Correct
its name, aliases, tags or notes explicitly. Corrections replace the previous
text; they do not silently create a competing profile. Removal requires the
current entity revision and confirmation of its name. Change history reports
operation, date, origin and record ID without retaining previous note text.

After a lost save response, **Recover previous save** reuses the original
request. A successful receipt is separate from a fresh read of current content.
Replaying an earlier create or note save after deletion cannot restore it.
Conflicts require refreshing and reviewing the changed record before retrying
with a new intent. Pending browser intent is memory-only and is cleared when
the account changes or the page unmounts; inspect saved records after a reload
before submitting again.

## Use Discord

Link Discord through native PocketBase OAuth in **Settings → Account** while
signed into the intended account. The bot derives the caller from the Discord
interaction, resolves the native ExternalAuth model and rechecks current
membership in the registered workspace and exact server/channel. Pasted IDs,
Manage Server permission, old membership and old OAuth links grant no access.
A relink invalidates an undelivered command instead of moving its content to
another account. The website's personal route does not require a particular
workspace membership.

The existing private bridge adds these five slash commands. All replies are
ephemeral; none has a prefix-command variant.

| Command | Result |
|---|---|
| `/buildanddo dossier` | Open personal recall and the website dossier. |
| `/buildanddo remember label:Reading-room kind:project note:Opens-Tuesday` | Create an explicit entity and first note. Optional `source_url` and `source_label` preserve attribution. |
| `/buildanddo recall query:Reading page:1` | Search saved entity context, with bounded pagination. |
| `/buildanddo entity id:<saved-id>` | Read the current revision, recent notes and the link to all notes. |
| `/buildanddo remember entity_id:<saved-id> revision:<reviewed-revision> note:<new-note>` | Add a note to that exact entity; leave `label` empty. |
| `/buildanddo forget id:<saved-id> revision:<reviewed-revision> confirm:true` | Remove the reviewed entity and its notes. |
| `/buildanddo dossier recover:true` | Recover the last undelivered dossier save using the same request key. |

The repeated rows are command options, not extra registered commands. Corrections
to existing notes and individual note removal are available on the website.
The bot retains at most 100 undelivered intents for ten minutes. A delivered
reply, expiry, relink or shutdown clears the intent. Reads are not cached by the
bot. After expiry or restart, inspect the current dossier before saving again.
Ephemeral delivery limits channel exposure; Discord still processes the command
and reply, and the recipient can retain a copy.

## Storage and security boundary

The additive migration creates `user_dossiers`, `dossier_entities` and
`dossier_events`. All native collection API rules are locked. Authenticated
command routes choose the current owner on the server; clients cannot select
another owner. Root, entity and retry receipt mutations are transactional.
Deleting the canonical user cascades to these owned records.

Personal context, names, aliases, tags, notes, source references and receipts
are encrypted with PocketBase's native `$security.encrypt`/`decrypt`. The
authenticated envelope binds collection, record ID, owner, dossier and revision
to reject ciphertext substitution. The server fails closed if its key binding,
schema or ciphertext is invalid. There is no plaintext fallback. Receipts keep
an encrypted request digest and operation result, not the request's note text.

Owner relations, record IDs, timestamps, revisions, request keys and key IDs
remain metadata in the database. Search decrypts only the authenticated owner's
bounded record set on the server. This is server-side encryption, not end-to-end
encryption: authorized server operators and a compromised application/key store
can access plaintext. It is not a password or credential vault.

The receiving operator must resolve `BUILDANDDO_DOSSIER_KEYS` from existing
server secret management into a JSON object with `active` and `keys` fields.
`active` selects a key ID in `keys`; each value must be an existing 32-byte
printable ASCII key. IDs accept 1–32 letters, digits, `_` or `-`; at most eight
keys are accepted. Only the server receives this binding. Do not add it to Vite,
browser storage, integration configuration forms, repository files or public
logs. This session neither generates nor provisions keys. The existing
`PB_ENCRYPTION_KEY` setting is not substituted: settings encryption alone does
not encrypt these application records.

Old ciphertext requires its referenced key. Changing `active` affects later
writes and does not bulk re-encrypt history; removing a still-used key makes
those records unavailable. Key migration, retention, backups and recovery need
the receiving operator's own procedure and acceptance.

Decrypted page content and pending saves are kept in application memory, not
localStorage/sessionStorage. Account changes discard late responses and clear
search text before another account's request. Recall uses POST bodies and
`Cache-Control: no-store`; URLs contain only optional entity IDs. The page and
dialog portals suppress PostHog capture and mask Datadog replay; dynamic
interactions have fixed action names. Live telemetry acceptance must confirm
that private text is absent. Existing account identification remains unchanged.

Forget removes current record content. Receipts retain no old note text, but
database journals, backups and user/Discord copies have separate retention.
This feature does not claim physical erasure of those copies or implement
backup deletion. The private operator owns the retention/erasure policy.

## Validation and receiving acceptance

Source-connected tests use actual JavaScript handlers, actual Python commands
and explicit storage/SDK/crypto boundary doubles:

```bash
node --test tests/upgrade/dossier-system.test.mjs tests/upgrade/dossier-client.test.mjs
python tests/upgrade/check_discordbot.py --include-research
python -m mypy --strict --explicit-package-bases scripts/discordbot/dossier.py scripts/discordbot/doctor.py
npm --prefix apps/web run test -- --run src/pages/workspace/__tests__/DossierFlow.test.jsx src/hooks/__tests__/usePrivateDossier.test.jsx
```

On a runner with a supplied PocketBase binary, require native acceptance:

```bash
python tests/upgrade/test_dossier_native.py --require-binary
```

`BUILDANDDO_TEST_POCKETBASE` names that runner's executable. The test owns a
temporary loopback database and applies fixture migrations and actual dossier
hooks. It exercises native password authentication, locked APIs, the native
ExternalAuth lookup, encryption, isolation, concurrent retries and missing-key
failure. Its synthetic link fixture does **not** verify a live Discord OAuth
handshake. No shared database is edited by the test. The PR workflow requires
this test independently for both repository-declared PocketBase versions.

Native PocketBase, Discord SDK, browser rendering and live providers were not
available for acceptance in this sandbox. Before activation, verify a real
same-account Discord OAuth link/unlink, role removal, record isolation, key
loss/recovery and deletion/retry on the actual receiving version. In the browser,
check mobile widths, dark mode, Tab/Shift-Tab/Escape focus, long names/notes,
account switching during reads and saves, and masked telemetry. Record observed
results rather than treating test doubles or merged source as activation.

## Rollback

Revert the web and bot as complete source bundles and coordinate command
registration with the operator. The dossier down migration keeps encrypted
content and deletion receipts while removing the protocol marker; routes then
return unavailable. It does not drop data or expose native collection APIs.
Reapplying restores the marker only after schema checks. Keep existing key
bindings until the receiving retention procedure allows otherwise. Research,
workspace evidence and unrelated migrations remain independent.
