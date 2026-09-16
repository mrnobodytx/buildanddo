# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/discord-activation.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docker-compose.yml, apps/pocketbase/.pocketbase-version, scripts/discordbot/doctor.py, docs/discord-bot.md, docs/mission-research.md, docs/private-dossiers.md, .github/workflows/pr-governance.yml
# EnumType:    Doc
# EnumEdges:   CONSUMES docker-compose.yml; CONSUMES apps/pocketbase/.pocketbase-version; CONSUMES scripts/discordbot/doctor.py; CONSUMES docs/discord-bot.md; CONSUMES docs/mission-research.md; CONSUMES docs/private-dossiers.md; CONSUMES .github/workflows/pr-governance.yml
# DAG Node:    none
# Intent:      Separate inspected local startup contracts from unverified bot activation and identify the evidence the receiving runtime must supply.
# ───────────────────────────────────────────────────────────────

# Discord activation: what this checkout establishes

The checked-in Compose setup starts the web app, PocketBase and its migration
step. It contains no Discord bot or research-worker service. The original bot
comment referred to a VPS systemd service, but its unit and current launcher
are not in this checkout. No local or VPS service has been inspected live.
Running a generic local installation command is therefore not an established
activation procedure for the existing bot.

`python -m scripts.discordbot.bot` is an application entry point.
`python -m apps.research.worker` is the research-worker entry point. Neither
identifies the operator's actual service manager, release path, restart policy,
environment injection or currently running revision. Those details must come
from the installation that owns the bot. Do not start a second copy to discover
them. The public A2 dispatch does not provision, synchronize or restart a shared
Discord installation.

## Inspect prerequisites without activation

The new doctor can be run from the matching BuildAndDo source checkout in the
service's own Python environment:

```bash
python -m scripts.discordbot.doctor --component bot
python -m scripts.discordbot.doctor --component worker
```

It reports source-package presence, Python/native dependencies, existing token
binding presence, and locally parseable scope/provider settings. It reuses the
application configuration validators. It does not read dotenv files, print
values, contact services, authenticate, start processes, synchronize commands
or send messages. Credentials injected only by the service manager will not
appear in an unrelated interactive shell; a FAIL there is not proof that the
running service lacks them.

Exit zero means local prerequisites passed. `runtime_state`, `service_launcher`
and registration remain **UNVERIFIED** even then. The expected command count is
13 when the private bridge is disabled and 25 when configured: 13 public,
seven mission/research and five dossier commands. Twenty-five fills Discord's
subcommand limit for this group; future expansion needs deliberate grouping.

## What is implemented, and what still needs evidence

| Area | Public source | Remaining receiving acceptance |
|---|---|---|
| Onboarding and learning | Public docs, status/release/roadmap, 25 authored lessons, paginated readers and quizzes. | Complete deployed package, generated catalogue, native SDK and private replies in the approved server. |
| Mission research | Shared queue, protected originals, leased worker, review into observed evidence. | Native OAuth/files/transactions, actual worker service and Firecrawl/transcription contracts. No visual video analysis or scanned-document OCR is implemented. |
| Personal dossiers | Explicit entities, encrypted private notes, recall, correction, deletion and recoverable writes. | Native backend/key binding, same-account OAuth and browser/Discord privacy acceptance. No passive collection or automatic entity extraction is implemented. |
| Integration controls | Desired settings, check requests and source-specific research receipts. | The private generic request consumer and dated applied-state/health receipts still need implementation/verification in the receiving stack. |
| Activation | Declared entry points and a read-only prerequisite doctor. | Actual launcher, selected Python/backend versions, installed revisions, approved registration and dated runtime receipts. |

The package file declares PocketBase **0.39.8**; Compose/Dockerfile default to
**0.28.4**. Neither establishes the running version. The new independent
`ci:test / PocketBase dossier` matrix tests both declarations using the existing
Dockerfile on the hosted runner; no version is silently substituted in the
application. Its hosted result and the receiving runtime's version must be
checked before applying migrations. Local fixture passes do not prove native
compatibility with either version.

The existing independent Discord CI job requires the native SDK and PDF parser
without credentials or login. Frontend dependency/lock restoration, rendered
tests, coverage, official lint and production build also remain delivery gates.
In this sandbox, missing SDK/parser/frontend packages and the native PocketBase
binary prevent those acceptance claims.

## Receiving sequence

1. Identify the existing launcher, working directory, Python environment and
   installed bot/backend/worker/web revisions using non-secret service metadata.
   Resolve the package-versus-Compose version difference for that installation.
2. Run the doctor in the actual service environment. Review source and native
   test results before changing shared state. Keep bot, worker and dossier key
   bindings in their existing secret store; public forms never hold them.
3. Under the receiving deployment authority, install the complete packages and
   migrations, native Discord OAuth, exact server/channel/workspace registration
   and required server encryption binding. The bot imports `scripts/discordbot`
   and `apps/research`; copying only `bot.py` does not supply the application.
4. Coordinate registration with the existing command owner. Sync defaults to
   `none`; it does not activate new definitions. Test the configured 25-command
   set in an approved guild, then restore `none` for routine restarts. This step
   is an external write and is not performed by the doctor or this source work.
5. Read and write a synthetic dossier from both clients, prove foreign-user and
   revoked-link denial, correct/delete it, and retry a lost response. Exercise
   each advertised research provider before announcing it as available. Record
   independent bot, backend, worker and served-site revisions and actual UTC
   observations without publishing private content or credential values.

The current operator handoff is
`.bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md`.
Source merge, HTTP 200, a valid doctor result and requested integration settings
are insufficient evidence that these components are running together.
