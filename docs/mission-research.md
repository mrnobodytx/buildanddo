# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/mission-research.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/pocketbase/pb_hooks/mission-research.js, apps/pocketbase/pb_hooks/research-policy.js, apps/pocketbase/pb_migrations/1790100000_mission_research.js, apps/web/src/pages/workspace/ResearchPage.jsx, apps/web/src/lib/discordAccount.js, scripts/discordbot/research.py, apps/research/worker.py, tests/upgrade/mission-research.test.mjs, tests/upgrade/test_discordbot_research.py, tests/upgrade/test_research_runtime.py, docs/discord-activation.md, docs/private-dossiers.md
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/mission-research.js; CONSUMES apps/pocketbase/pb_hooks/research-policy.js; CONSUMES apps/pocketbase/pb_migrations/1790100000_mission_research.js; CONSUMES apps/web/src/pages/workspace/ResearchPage.jsx; CONSUMES apps/web/src/lib/discordAccount.js; CONSUMES scripts/discordbot/research.py; CONSUMES apps/research/worker.py; VERIFIED_BY tests/upgrade/mission-research.test.mjs; VERIFIED_BY tests/upgrade/test_discordbot_research.py; VERIFIED_BY tests/upgrade/test_research_runtime.py; CONSUMES docs/discord-activation.md; CONSUMES docs/private-dossiers.md
# DAG Node:    none
# Intent:      Explain the connected mission-source workflow and exact receiving-runtime contracts without claiming private activation or verification from extracted content.
# ───────────────────────────────────────────────────────────────

# Mission research from BuildAndDo and Discord

Both entry points submit to the same workspace's mission research queue. A
registered worker records a real extraction result or a bounded failure. A
member then reviews the original and the excerpt on the website before saving
an **observed** Evidence Ledger record. Parsing and attaching never approve,
complete or verify the mission; its existing TEVV review still makes that decision.

The source implements these adapters; their deployment and the operator's
Firecrawl/transcription configuration have not been observed in this session.
The checked-in Compose setup does not start the bot or worker. Use
`docs/discord-activation.md` to distinguish their entry points from the actual
receiving service launcher; the read-only worker doctor performs no activation.

## Use the website

The Signals desk's **Propose mission** action reuses this authenticated command
service with `action=signal.propose`, `revision=0` and payload
`{signal, signal_updated}`. Current readable signal revision and write membership
are required. It atomically stores a proposed mission, source snapshot evidence
and the ordinary retry receipt. The browser's stable request key allows recovery
after closing an uncertain dialog. The mission requires separate review;
approval, signal acknowledgment and execution remain explicit later steps.

1. Sign in and choose the workspace. Open **Missions**, create or select an
   unfinished mission, then open **Mission research**. The workspace navigation
   and Evidence Ledger also link to `/app/research`.
2. Choose the mission, source type and title. Add a search query, a public HTTPS
   URL, or one supported file of at most **20 MiB**. Explain its relevance.
3. Submit. `queued` means saved for the worker; `processing` means a worker has
   claimed a lease. `blocked` names unavailable configuration. Neither is a
   successful extraction. Use **Refresh status** after the worker runs; returning
   to the tab also refreshes the view.
4. Open the source. Review the excerpt, processor/version, processing timestamp,
   input SHA-256, citations and any truncation notice. Use **Prepare original
   file download** to obtain a short-lived PocketBase file URL.
5. Add a review note explaining what was checked and its limitations, then use
   **Attach reviewed source to evidence**. The source and evidence reference one
   another; the note and reviewer are recorded on the server.

Editors, administrators and owners can submit and review. Viewers can read.
Current membership and the linked mission's readability are checked again at
every request and file download, including leased worker downloads. Unsubmitted
uploads are private to their uploader. Removed members cannot use old authorship
or a cached file token to retain access.
Demonstration mode cannot read or write this research flow.

After an uncertain save, use **Retry previous request**. It reuses the same
audited request rather than creating another source. After an uncertain file
upload, use **Refresh saved uploads** and recover it before resubmitting. Only
the uploader can submit their saved file. Used originals are retained; ordinary
deletion is denied once a research submission references them.

## Use Discord

First open **Settings → Account → Discord account** on the website. Link through
PocketBase's configured Discord OAuth provider while signed into the intended
BuildAndDo account. A failed or different-account OAuth result does not replace
the current website sign-in. Pasting a Discord ID does not link an account.

The configured bridge adds seven commands to the existing thirteen public
`/buildanddo` commands. They are private slash replies in the bound server and
channel; legacy prefix messages cannot invoke them.
Five additional personal dossier commands now share that native linked identity;
see `docs/private-dossiers.md`. Dossier notes remain private to their user and
are not automatically copied into a workspace mission or its Evidence Ledger.

| Command | Result |
|---|---|
| `/buildanddo missions` | List readable missions with their IDs and saved status. Use `page` for more. |
| `/buildanddo mission title:... description:...` | Save a proposal through the existing mission policy. Finish its plan and approval on the website. |
| `/buildanddo evidence mission:...` | List existing readable evidence for that mission, with pagination. |
| `/buildanddo submit mission:... kind:search title:... input:...` | Submit a search query. Choose `url` for one public web page. |
| `/buildanddo submit mission:... kind:document title:... file:...` | Submit an explicit attachment. Choose `audio` or `video` for those files. Leave `input` empty. |
| `/buildanddo submissions mission:...` | List saved research states, optionally filtered by mission; `page` selects more. |
| `/buildanddo submission id:...` | Read a saved status and open its website review link. |
| `/buildanddo recover` | Recover the last uncertain proposal or submission using its original request key. |

The two `submit` examples are one command. Discord account permissions do not
grant workspace roles, including Manage Server. The bot derives the caller ID
from the Discord interaction; PocketBase resolves its existing OAuth link and
current membership. Detailed extracted content stays in the authenticated web
review. A review link identifies its workspace and asks the member to switch
before loading a source from another accessible workspace.

Pending retry intent expires after ten minutes and is lost on a bot restart;
the server's submission and audit receipts persist. After either event, inspect
`submissions` and `missions` before starting again. An uncertain attachment
upload is recovered by its trusted Discord attachment ID before downloading it
again. Expired attachment links require a new explicit submission if no upload
receipt exists. Changing the linked account invalidates a pending write.

## Processing capabilities

| Input | Implemented processor | Limits |
|---|---|---|
| Search | Self-hosted Firecrawl `/{v1 or v2}/search`, five requested results | Search excerpts and URLs; no invented result when search is unavailable. |
| Public HTTPS URL | Self-hosted Firecrawl `/{v1 or v2}/scrape`, Markdown output | Fixed configured provider, no submission-selected endpoint or credentials. |
| `.txt`, `.md` | Local UTF-8 text extraction | Invalid encoding or empty content fails explicitly. |
| `.docx` | Local bounded ZIP/XML document extraction | No macro execution or external document relationships. |
| `.pdf` | Local `pypdf` text extraction | Dependency required; encrypted, image-only or unsupported files fail. No OCR. |
| `.mp3`, `.wav`, `.m4a`, `.ogg` | Configured self-hosted transcription endpoint | Multipart `file`, `model`, `response_format=json`; response contains `text`. |
| `.mp4`, `.webm` | The same configured transcription endpoint | Transcribes the audio track when the endpoint accepts that container; no visual frame analysis. |

Firecrawl is not an audio/video transcription service. The media adapter targets
an explicitly configured **OpenAI-compatible transcription HTTP contract**; it
does not imply use of OpenAI hosting. Compatibility with the operator's existing
service and model remains a receiving-runtime acceptance check. Document uploads
are processed locally, without inventing a Firecrawl upload API.

Saved excerpts contain at most 16,000 characters and ten citations, within a
55,000-byte result budget. Truncation is explicit. The digest identifies the
original uploaded bytes, or the exact query/URL for a web request; it is not a
digest of the fetched website or a claim that the source is accurate. Extracted
text is displayed as text, never executed or treated as agent instructions.

## Runtime bindings

The private receiving operator owns existing credentials, approved runtime
accounts, OAuth provider setup and shared deployments. This source adds no
installer, service unit, credential or live external message.

PocketBase reads `BUILDANDDO_RESEARCH_BINDINGS`, a JSON array of nonsecret
registrations with exactly these fields per workspace:

```json
[
  {
    "workspace": "WORKSPACE_RECORD_ID",
    "bot_user": "BOT_USER_RECORD_ID",
    "worker_user": "WORKER_USER_RECORD_ID",
    "guild_id": "DISCORD_SERVER_ID",
    "channel_id": "DISCORD_CHANNEL_ID",
    "binding": "research-local",
    "capabilities": ["search", "url", "document", "audio", "video"]
  }
]
```

These are placeholders, not usable IDs. Use native `users` identities dedicated
to the bot and worker; neither needs a superuser token or workspace membership.
They must be different users. An unneeded Discord binding may use empty
`bot_user`, `guild_id` and `channel_id` strings for website-only intake. Register
each workspace once, with only the capabilities actually available.

In the existing workspace **Integrations** desk, an administrator/owner saves
Firecrawl as enabled, mode `read`, with a matching `binding`. That registration
gates the complete research processing bundle, including local document and media
adapters. For Discord, also save the matching server and channel IDs as enabled.
These desired settings are checked by the command API; they do not prove service
health or update the generic integration `observed_state`/check receipts.

The bot receives its own nonsecret `BUILDANDDO_DISCORD_RESEARCH_BINDINGS` array
of `{guild_id, channel_id, workspace}` and the existing native PocketBase token
binding `BUILDANDDO_DISCORD_PB_TOKEN`. The server remains authoritative even if
the bot's local mapping is wrong. `BUILDANDDO_POCKETBASE_URL` is the configured
backend origin. Empty bridge registrations preserve the thirteen public commands.
Publish the complete `scripts/discordbot` **and** `apps/research` source bundles;
the bot imports shared research transport/contracts from the latter.

| Worker setting | Meaning |
|---|---|
| `BUILDANDDO_POCKETBASE_URL` | Configured PocketBase origin; never accepted from a submission. |
| `BUILDANDDO_RESEARCH_TOKEN` | Existing native auth token binding for the registered worker user. |
| `BUILDANDDO_RESEARCH_WORKSPACE` | The registered workspace ID consumed by this worker process. |
| `BUILDANDDO_FIRECRAWL_URL` | Actual self-hosted API origin, without the version suffix. |
| `BUILDANDDO_FIRECRAWL_VERSION` | Explicit `v1` or `v2`; default `v2`. Search response shapes differ. |
| `BUILDANDDO_FIRECRAWL_KEY` | Optional existing Firecrawl credential binding. |
| `BUILDANDDO_FIRECRAWL_EGRESS_GUARDED` | `1` only after the operator verifies crawler-side destination and redirect protection. |
| `BUILDANDDO_TRANSCRIPTION_URL` | The exact self-hosted transcription endpoint, including its full path. |
| `BUILDANDDO_TRANSCRIPTION_MODEL` | An actual model accepted by that service. |
| `BUILDANDDO_TRANSCRIPTION_KEY` | Optional existing transcription credential binding. |

The egress flag is an operator assertion, **not network enforcement or a passed
security test**. Source URL validation rejects private IP literals, credentials
and custom ports and checks resolved addresses before URL processing. The remote
crawler must independently prevent redirects, DNS changes and search processing
from reaching private/metadata services. Keep that policy on the private plane.
HTTP clients reject redirects and ambient proxies, and bound time and body size.

After the receiving runtime is authorized and configured, the entry point is
`python -m apps.research.worker`; `--once` processes at most one available source.
Each poll scans at most 200 queue entries and resumes later pages on subsequent
polls so revoked or reconfigured entries cannot starve later work. A claim lasts
120 seconds. Processing has an 85-second outer deadline, and stale leases,
cancellation, integration revisions and membership changes fence completion.
There are at most five processing attempts per submission. Failed or blocked
sources can be retried from the website; exhausted work needs review/new intake.

Documents run in a temporary subprocess with a 30-second deadline and cleanup.
On supported Unix hosts it also applies 512 MiB address-space and 25-second CPU
limits. The private runtime must supply process/container resource limits on
Windows, which lacks those `resource` controls. This is not a general sandbox.
The parser never invokes a shell or a command named in a submitted document.

## Verify before activation

Use Python 3.12 and Node 22, matching the PR job. The checker requires Node to
exercise the real shared backend policy through its explicit storage fixture.
Local source checks need no credentials or external service:

```bash
node --test tests/upgrade/mission-research.test.mjs tests/upgrade/research-client.test.mjs
python tests/upgrade/check_discordbot.py --include-research
python -m ruff check apps/research scripts/discordbot tests/upgrade/*discord*.py tests/upgrade/*research*.py
python -m mypy --strict --explicit-package-bases apps/research scripts/discordbot/research.py
```

The `ci:test / Discord SDK` job installs both declared requirements files and
requires `--include-research --require-sdk --require-pdf`. Neither missing native
dependency may become a passing skip in that job. On an enabled runner also run:

```bash
python tests/upgrade/check_discordbot.py --include-research --require-sdk --require-pdf
python -m mypy --strict --explicit-package-bases apps/research scripts/discordbot
python -m pytest tests/upgrade/test_discordbot_*.py tests/upgrade/test_research_runtime.py --cov=scripts/discordbot --cov=apps/research --cov-branch --cov-fail-under=80
npm --prefix apps/web test
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Source tests connect Discord intake, actual PocketBase handler modules, the
worker, file extraction and website review clients. Their PocketBase storage and
Discord transport doubles are explicit; they do not establish native auth/rule,
database concurrency, file-storage transaction or live gateway acceptance.

The receiver must verify native PocketBase 0.39.8 migration up/replay/down/re-up,
OAuth linking to an existing account, ordinary-write denial, protected file
downloads, revoked membership, duplicate simultaneous retries and evidence/audit
rollback. Exercise the rendered web flow in both themes, on mobile and with a
keyboard. In an approved test server, use a test mission and document, observe a
real worker result, review it on the website and read back the single evidence
record. Repeat with Firecrawl search/URL and a known audio/video sample, checking
citations and transcription against the originals. Disabled/missing providers,
unlinked callers and expired leases must not produce success receipts.

## Retention and rollback

The additive migration introduces `research_uploads`, `research_submissions` and
`research_events`. Normal writes to submissions/events are locked; authenticated
commands own their revisions and atomic audit receipts. Protected originals are
retained with the source. Evidence attachment copies a short excerpt but keeps
the detailed result and original linked from its research submission.

The down migration removes a protocol marker and disables research commands/new
uploads while retaining files, source results, audits and Evidence Ledger links.
It does not revert the existing membership policy or delete earlier evidence.
Coordinate frontend/bot/worker rollback as complete bundles with the operator;
stopping a worker does not imply that a queued source was processed. This source
session performed no shared migration, command registration or service startup.
