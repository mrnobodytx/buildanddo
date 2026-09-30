# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/media-corpus.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     docs/field-interviewer-v1.3.md, scripts/publish/media_contracts.py, scripts/publish/media_corpus.py, scripts/publish/media_library.py, scripts/publish/activity_publish.py, apps/web/src/components/workspace/ContentStudio.jsx, tests/upgrade/check_media_corpus.py
# EnumType:    Doc
# EnumEdges:   EXTENDS docs/field-interviewer-v1.3.md; CONSUMES scripts/publish/media_contracts.py; CONSUMES scripts/publish/media_corpus.py; CONSUMES scripts/publish/media_library.py; CONSUMES scripts/publish/activity_publish.py; CONSUMES apps/web/src/components/workspace/ContentStudio.jsx; VERIFIED_BY tests/upgrade/check_media_corpus.py
# Intent:      Make the existing editorial and publication surfaces usable for an evidence-backed corpus sprint while retaining provider, rights, cost and human publication gates.
# ───────────────────────────────────────────────────────────────

# Media corpus production

The public compiler turns a selected source account into reusable editorial and
production drafts. It uses the existing semantic wire/review contracts and
imports into the existing Content studio. The private content lab and
ElevenLabsBridge remain the owners of generation, voice bindings and provider
transport described in `docs/field-interviewer-v1.3.md`.

```text
Selected public source + original evidence bytes
  → exact excerpts, dates, revision and limitations
  → article/social/script drafts + clip plans
  → Content studio draft and human review
  → ElevenCreative studio OR the existing private ElevenLabsBridge
  → retained media + publication observations
  → engagement snapshots + proposed next work
```

Local compilation, draft import and observation reconciliation are implemented.
This does not connect an account, synthesize audio, post to a channel or execute
a mission. The current sandbox does not contain the work-exchange files reported
in PR 119. The receiving owner must materialize that revision and map the same
source/corpus/job identities through its existing work contract before claiming
the reciprocal mission integration.

## Provider facts and the production window

The owner supplied an ElevenCreative Creator+ promotion ending October 12,
`eleven_v4`, dialogue/language/tag capabilities and a grant-funded API account.
Those are unverified inputs here. The supplied documentation references are:

- https://elevenlabs.io/docs/changelog/2026/9/28
- https://elevenlabs.io/docs/overview/models
- https://elevenlabs.io/docs/api-reference/studio-api-information

No provider lookup or account check ran. `requested_model` records the requested
model, not availability. The 3,000-character default is this compiler's internal
chunk bound, not a statement of a provider limit. Cost and grant balance stay
unknown. A studio promotion never silently sets API generation cost to zero.
The receiver must confirm current model/endpoint/tag compatibility, account
eligibility, exact promotion end/time zone, voice rights and approved funding.

The packet has two alternative production plans. Each lists every spoken asset
and its character count. Selecting both lanes incurs both lanes' usage. Display
characters are a planning bound, not a provider billing estimate. Retries and
paid spending require the bridge's existing budget and recovery controls.

## Source selection and review

Export the strict input descriptions:

```bash
python -m scripts.publish.media_corpus schema source
python -m scripts.publish.media_corpus schema options
python -m scripts.publish.media_corpus schema observation
```

`buildanddo.media-source/v1` binds one event, scope, source Git revision, reported
producer/authors, observation/expiry time, audience, language, disclosure reference,
public citation and selected artifacts. It requires problem, action, outcome and
limitation excerpts; lessons are optional. Each claim names its source artifacts.
Artifacts retain relative paths, exact SHA-256, sizes and observation times.

The compiler rehashes actual files beneath the selected evidence directory and
checks that each excerpt occurs in a cited text or JSON string value. It rejects
future observations, unknown fields, duplicate JSON keys, private path segments,
symlink traversal, credential/address patterns, missing references and oversized
inputs. It never truncates a claim or reads the deployment secret loader. Select
only public-approved source material; these checks cannot establish consent,
legal rights, semantic truth or complete removal of sensitive information.

`REPORTED_SOURCE` is the normal result without independent review. Optional
`--verification FILE --review-policy FILE` reuses the existing
`VerificationReceipt` and receiver-owned `ReviewPolicy`. The receipt must cover
`claim_support` and `public_disclosure` for the exact `MediaSource.subject` and
every `required_sources` entry. The producer and declared source authors cannot
be the verifier. The receiver authenticates aliases and receipt pins separately;
never accept a review policy from a submitted corpus. Expiry remains explicit
as `STALE`, even for historically reviewed material.

The existing activity publisher now retains its already-scrubbed `public_event`
beside channel observations. Export that object to a selected file, preserve its
bytes as a source artifact, and pass `--activity FILE` during compilation. This
checks the actual PublicActivityEvent shape, event/title/time/URL and Git revision
prefix. Its `deployment_state` remains an attributed report. Do not rerun a
publisher merely to obtain an input, and do not fabricate missing exports for
older publication ledgers.

## Compile the first real source account

The tracked source selection quotes the retained Buddi connection-repair report.
Its 23-test result is historical source evidence; it does not claim a live voice
session, current backend acceptance or independent verification. Its citation
names the public repository. The receiving owner must confirm source-object
availability before publishing a revision-specific account.

Reproduce the prepared historical corpus into a new directory:

```bash
python -m scripts.publish.media_corpus compile \
  .bits/out/VCC-BUILDANDDO-UPGRADE-001/media-corpus-source.json \
  --options .bits/out/VCC-BUILDANDDO-UPGRADE-001/media-corpus-options.json \
  --evidence-root . --at 2026-09-30T17:24:05.274457+00:00 \
  --output state/media-corpus/buddi-review
python -m scripts.publish.media_corpus inspect state/media-corpus/buddi-review
```

For new work use the receiver's current UTC clock and current source/review
inputs; replaying a historical `--at` cannot establish present acceptance.
Compilation creates 34 draft assets, including four delivery variants for each
spoken format, with 27,092 planned characters per production lane. Spanish is
held for translated source, an authored template and review. Only English
templates currently emit scripts. No English script is relabelled as a translation.

Formats include article, social, Daily Edition audio, short video, mission autopsy,
Guildmaster debrief, build report, tutorial, onboarding and case study. These are
editable evidence excerpts with format-specific framing, not generated interview
quotes. Host/Analyst are fictional narration roles, not an assertion that named
Guildmasters spoke. Delivery styles are instructions for receiving production;
no unverified provider audio-tag syntax is sent. Tutorial/onboarding drafts still
need an editor to check that the selected source actually teaches the procedure.

Every chunk repeats its source date and limitations. Long material splits at
whole claim blocks; an indivisible oversized claim fails. Duration is explicitly
estimated at 150 words/minute. A short source does not become a five-minute show
through padding: `NEEDS_EDIT` means gather more evidence or change the format.
Clip plans retain claim/evidence IDs; align actual captions and timestamps only
after inspecting the returned audio/video. Social copy still needs the selected
channel's length and editorial checks.

The output contains `corpus.json`, `manifest.json`, `production-plans.json`,
`scripts/*.txt` and `drafts/*.json`. New directories preserve prior runs.
`inspect` checks all selected bytes and job bindings; it establishes integrity
only. Keep original source and independent receipts in their authorized store.
Hashes do not authenticate a provider, approve a voice or confer publication.

## Use the Content studio

Open the existing Content studio and choose **Import media draft**. Select one
generated `drafts/*.json` file. A ready example is
`.bits/out/VCC-BUILDANDDO-UPGRADE-001/media-corpus-preview.json`.

The import checks the body hash and existing field limits, then opens an unsaved
draft. It accepts no owner, workspace, record ID, approval or publication fields.
Saving, requesting review, editing approved copy and recording publication use
the current native commands and permissions. A changed body needs a new export
or normal editable draft review. Source metadata is a citation, not verification
of an imported claim. Role loss or an account/workspace change fences pending
imports; no file is uploaded or sent to a provider by import.

## Return media, publication and engagement observations

The receiver records actual observations using
`buildanddo.media-observation/v1` from `scripts/publish/media_contracts.py`.
Every observation binds the corpus asset, full production-request digest,
attempt, provider, observed time and retained receipt bytes. Successful generation
also needs the media file and its size/hash. This validates byte identity, not
playability, transcript fidelity, licensing or provider authentication.

Successful publication names the corresponding generated media digest, stable
publication ID and public URL. Engagement names that same publication and retains
nonnegative counters with an explicit interval. PostHog may name the recorded
publishing provider through `publication_provider`; Metricool is an optional
receiving adapter, not an activated connection. URLs are citations, never fetched.

```bash
python -m scripts.publish.media_library state/media-corpus/buddi-review \
  state/media-receipts/generation.json state/media-receipts/publication.json \
  state/media-receipts/engagement.json --evidence-root state/media-evidence \
  --at RECEIVING_UTC_TIMESTAMP --output state/media-library/run-001.json
```

No observation files were created for the real Buddi corpus: generation and
publication have not occurred. A no-observation run produces zero deliveries
and proposed `engagement_unmeasured` work, not invented metrics.

Reconciliation is independent of import order. Exact repeats count once; conflicting
observation identities fail. A later resolution updates the same attempt while
retaining earlier uncertainty. Repeated confirmations preserve the first observed
publication time. Engagement keeps the latest observation per provider/publication/
metric/exact interval and never adds overlapping windows. Failures stay in history.
The index says `reported_observations_only`; it does not mint verified worker
experience, causal performance improvements or authority for the next mission.

## Verification and receiving work

```bash
python tests/upgrade/check_media_corpus.py
python -m unittest tests.upgrade.test_media_corpus tests.upgrade.test_activity_publish tests.upgrade.test_gitlab_acceptance
node --test tests/upgrade/media-draft-import.test.mjs tests/upgrade/business-learning.test.mjs tests/upgrade/workspace-claims.test.mjs
```

The coverage gate is configured in the existing GitLab Python 3.11/3.12 behavior
lane. Browser rendering/native acceptance, provider generation, artifact playback,
human publication and engagement readback remain receiving checks. Follow
`.bits/handoffs/2026-09-30-bits-codegen-cmax-b-media-corpus.md` for their owners.
