# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/discord-bot.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/bot.py, scripts/discordbot/service.py, apps/web/tools/generate-community.mjs, tests/upgrade/check_discordbot.py, .github/workflows/pr-governance.yml
# EnumType:    Doc
# EnumEdges:   CONSUMES scripts/discordbot/bot.py; CONSUMES scripts/discordbot/service.py; CONSUMES apps/web/tools/generate-community.mjs; VERIFIED_BY tests/upgrade/check_discordbot.py; CONSUMES .github/workflows/pr-governance.yml
# DAG Node:    none
# Intent:      Explain the implemented Discord experience, its real public data sources and the remaining private activation requirements.
# ───────────────────────────────────────────────────────────────

# BuildAndDo Discord bot

The public command bot helps community members learn BuildAndDo, open the
appropriate workspace desk and inspect dated public evidence. It uses the same
authored lessons and canonical site origin as the web application. It never
authenticates to PocketBase or retrieves workspace records.

## Commands

All slash commands live under `/buildanddo`. Replies are private to the caller.
Commands with a topic accept the optional `query` argument.

| Command | Result |
|---|---|
| `help` | Browse the command reference. |
| `start` | Follow the account, workspace, mission and evidence introduction. |
| `ping` | Confirm that this command reached the bot. |
| `status` | See the canonical site's HTTP response, request duration and observation time. |
| `release` | Read the version and complete source revision in the site's `version.json`. |
| `roadmap` | Read measured progress and its generation time; flag stale or missing evidence. |
| `docs query:pricing` | Search public page descriptions and open a result. |
| `learn query:missions` | Search lesson titles, summaries, categories and slugs; select a lesson. |
| `lesson query:welcome-to-buildanddo` | Read the complete authored lesson using Previous and Next. |
| `quiz query:welcome-to-buildanddo` | Answer one knowledge check and read its explanation. |
| `workspace query:integrations` | Open a known workspace desk through the existing website login. |
| `support` | Open Contact and see what to include in a reproducible bug report. |
| `diagnostics` | Let a member with Manage Server permission inspect bot scope and local read counters. |

Start with `learn`, choose a lesson, then use `quiz` to practice it. The reader
includes outcomes, context, preparation, every instructional section, the worked
example, exercise and references. It preserves the full source text across
bounded pages. Autocomplete uses content already loaded by a learning command;
typing into a command field makes no HTTP request.

Controls belong to the initiating person and expire after ten minutes. A quiz
accepts one answer; retrying the same answer after a failed delivery returns the
same explanation. A different answer requires a new quiz. Practice does not
write tutorial progress, award authority, approve a mission or issue credentials.
Saved progress remains in the signed-in website.

## Sources and behavior

The canonical origin is `https://buildanddo.tech`, taken from the public site's
existing route catalogue and checked for parity by the generated-feed tests.
The bot reads exactly four resources:

| Resource | Purpose | Cache |
|---|---|---|
| `/` | HTTP reachability; the response body is not downloaded. | 10 seconds |
| `/version.json` | Served version and source revision. | 30 seconds |
| `/roadmap-status.json` | Measured progress, generation time and reported last gate. | 30 seconds |
| `/community-catalog.json` | Public pages and complete authored starter lessons. | 5 minutes |

The normal web build writes `community-catalog.json` beside `version.json` after
Vite succeeds. It projects explicitly selected fields from PUBLIC_PAGES and the
existing versioned 25-lesson starter curriculum. Database identities, migration
metadata and any later private fields are excluded, including nested fields.
There is no second edited copy of the tutorials or a runtime database export.

HTTP runs in two bounded worker slots. Each resource has at most one in-flight
read, including after an interaction is cancelled or times out. Socket I/O has a
four-second timeout; the streaming body loop checks an eight-second deadline.
Callers receive a timeout after ten seconds even when host resolution stalls.
Those workers remain tracked until they finish; Python cannot kill a blocked
resolver thread. Shutdown drains the existing work instead of creating retries.
Redirects, ambient credential-bearing proxies, encoded responses, non-JSON
fallback pages, non-finite numbers and oversized bodies are rejected.

Unsuccessful reads are negative-cached for five seconds and remain unavailable.
Cached observations retain their original time. Roadmap snapshots older than
48 hours are labelled stale; missing, future or invalid timestamps cannot
establish current progress. An HTTP 200 does not establish successful login,
working workspace storage, applied integrations or production acceptance.

Each person can start six commands per 30 seconds, with an aggregate limit of
60. Scope checks happen before reads. Bot accounts, direct messages and callers
outside configured guild/channel scope are denied. Message contents, queries,
user IDs and provider payloads are excluded from structured command logs.
Text is escaped, mentions are suppressed and rendered reply sizes are bounded.

## Runtime configuration

Source work here does not install the bot, alter credentials, synchronize
commands or send Discord messages. The existing private runtime operator owns
those steps and the integration request consumer.

| Existing binding or option | Meaning |
|---|---|
| `BAD_DISCORD` | Existing runtime token binding; read only by explicit program startup and never included in configuration objects or logs. |
| `BUILDANDDO_DISCORD_GUILD_IDS` | Optional comma-separated allowed server snowflakes. Empty means the servers where this bot is installed. |
| `BUILDANDDO_DISCORD_CHANNEL_IDS` | Optional allowed channel snowflakes; requires an explicit server allowlist. Threads need their own allowed ID. |
| `BUILDANDDO_DISCORD_LEGACY_PREFIX` | `0` by default. Set `1` only when intentionally retaining prefix commands and the privileged Message Content intent. |
| `BUILDANDDO_DISCORD_SYNC` | `none` by default; `guild` synchronizes the explicit allowlist, and `global` deliberately registers global commands. |

Slash command registration is a deployment action. A new installation with
`SYNC=none` and prefix mode off has no usable commands until the operator
registers them. Use an approved test server for initial guild registration.
After registration, return to `none` for ordinary restarts. Reconnect events
do not resynchronize commands. Global registration replaces this application's
global command set and must be coordinated with its existing command owner.

The application needs the existing Discord.py dependency in
`scripts/discordbot/requirements.txt` and the complete `scripts/discordbot` source
directory. Copying just the old single `bot.py` is no longer sufficient.
Both `python -m scripts.discordbot.bot` and the existing direct-script entry
point remain supported. No token is read and no client is started by importing
the modules.

Install the bot with the `bot` and `applications.commands` scopes and the
channel permissions needed to view the approved channel, send its requested
replies and embed links. Administrator, member-directory, presence and message
moderation permissions are not needed. Message Content is used only for
explicit prefix compatibility. Prefix replies are visible in the channel;
the slash-command experience is private.

BuildAndDo's integration controls still record desired state and check requests.
This bot does not acknowledge those requests or write `observed_state`.
Binding a workspace to a Discord server, consuming revisions, applying
enable/disable requests and persisting executor receipts remain in
`.bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md`.

## Verification

Run the targeted source suite and its statement-coverage gate:

```bash
python tests/upgrade/check_discordbot.py
node --test tests/upgrade/discord-catalogue.test.mjs
python -m ruff check scripts/discordbot tests/upgrade/*discord*.py
python -m mypy --strict --explicit-package-bases scripts/discordbot/contracts.py scripts/discordbot/public_data.py scripts/discordbot/catalogue.py scripts/discordbot/service.py
```

The Python runner executes actual application source and real loopback HTTP.
If Discord.py is absent, adapter tests explicitly use a transport double and
the native serialization case is skipped. The report measures Python trace
statement lines; it does not claim branch coverage or live transport validation.
Coverage must be at least 80% for each bot module.

The PR governance workflow has an independent `ci:test / Discord SDK` job.
It installs the declared runtime and runs the checker with `--require-sdk`,
without bot credentials or a login. Missing SDK support cannot turn into a
passing skip in that job, and frontend dependency failures do not prevent it
from running. Its hosted execution has not been observed in this sandbox.

On a dependency-enabled runner, require native SDK acceptance:

```bash
python tests/upgrade/check_discordbot.py --require-sdk
python -m mypy --strict --explicit-package-bases scripts/discordbot
python -m pytest tests/upgrade/test_discordbot_*.py --cov=scripts/discordbot --cov-branch --cov-fail-under=80
npm --prefix apps/web run build
```

The same adapter tests use the real SDK when available, without logging in.
The receiver must additionally verify the full build and public catalogue,
command installation and slash replies in its authorized test server, mobile
Discord select menus, permission denial, mention suppression, pagination,
expiry, a lost-response retry, source unavailability and orderly shutdown.
Record the bot revision and served site revision independently.

No live result follows from local source tests. The existing frontend dependency
and native PocketBase acceptance blockers remain with the delivery handoff.

## Rollback

Roll back the bot as a complete source bundle and coordinate any registered
command changes with the receiving operator. The public catalogue is additive
and can remain available to an earlier frontend; this change has no migration
or workspace-record write to reverse. Reverting to the old bot also restores
its blocking HTTP behavior and Message Content requirement.
