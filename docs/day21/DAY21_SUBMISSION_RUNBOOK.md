# --- CGRF Header ------------------------------------------------
# File:        docs/day21/DAY21_SUBMISSION_RUNBOOK.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     tools/day21/day21_public_probe.py, tools/day21/day21_browser_capture.py, scripts/ci/day21_submission.py
# EnumType:    Doc
# EnumEdges:   CONSUMES tools/day21/day21_public_probe.py; CONSUMES tools/day21/day21_browser_capture.py; CONSUMES scripts/ci/day21_submission.py
# Intent:      Carry one accepted candidate through retained public and browser observations without implying deployment authority.
# ----------------------------------------------------------------

# BuildAndDo Day-21 submission runbook

This pack closes the gap between source implementation and a defensible Hostinger submission. It does not create deployment authority and it does not convert missing runtime evidence into a PASS.

## Closure order

1. Run `python scripts/ci/hostinger_readiness.py --check`.
2. Run the self-hosted source acceptance lane. Resolve actual dependency/build failures; do not downgrade them.
3. Run the native acceptance lane for both declared PocketBase versions.
4. Select one accepted staging candidate and one small-business journey.
5. Capture public URL evidence, browser screenshots, Hostinger-product evidence, architecture evidence, build-journey evidence and the existing nonsynthetic `hostinger_replay.py` result.
6. Run `python scripts/ci/day21_submission.py audit --root . --evidence state/day21/evidence --json`.
7. Only after the audit passes, compile `state/day21/submission/` and have the owner review it against the current official Hostinger form.
8. Submission itself is a human/external action and remains outside this package.

## Canonical demo story

A small-business owner notices a real operational problem. BuildAndDo preserves the source, turns the problem into a bounded mission, requires approval before action, records one bounded action, uses a distinct verifier, and surfaces the result and evidence in the operator/readback layer. Uncertainty and missing evidence remain visible.

## What must be real

The public URL must answer. The browser journey must run against the selected candidate. The action receipt must come from the authorized executor. Producer and verifier must be distinct. All four Hostinger products must have evidence-bound meaningful use. Screenshots must be hashed and bound to the capture time. A source test or synthetic fixture cannot substitute for a deployed-browser or external-service observation.

## What this pack deliberately does not do

It does not submit the challenge form, deploy to production, create external accounts, repair billing, invent a competition deadline, synthesize missing screenshots, or grant A3/A4 authority.

## GitLab work control

Render the Day-21 milestone and issue dependency plan with:

```powershell
py -3.13 tools/day21/day21_gitlab_plan.py
```

The installer performs no GitLab mutation. If the competition owner explicitly authorizes creating the milestone/issues, use the existing AAXP path and the guarded `--apply` mode documented in `docs/day21/GITLAB_SUBMISSION_MILESTONE.md`.

## Evidence helpers

These commands generate evidence without inventing runtime success:

```bash
python tools/day21/day21_build_journey.py --repo .
python tools/day21/day21_architecture_snapshot.py --repo .
python tools/day21/day21_public_probe.py \
  --url https://<canonical-public-host>/hostinger-challenge \
  --candidate-sha <accepted-full-source-sha> \
  --source-sha256 <accepted-readiness-source-digest> \
  --artifact-tree-sha256 <accepted-release-artifact-tree-digest> \
  --output state/day21/evidence/capture-001/public-url.json
python tools/day21/day21_browser_capture.py \
  --base-url https://<canonical-public-host> \
  --scenario <authorized-journey-scenario.json> \
  --candidate-sha <same-accepted-full-source-sha> \
  --source-sha256 <same-accepted-readiness-source-digest> \
  --artifact-tree-sha256 <same-accepted-release-artifact-tree-digest> \
  --output state/day21/evidence/capture-001
```

Take all three identities from the selected acceptance/release receipts, not the
checkout that happens to run the probe. The readiness source digest is not the
artifact-tree digest. Both helpers compare the deployed `/version.json`
`commit_sha` with the expected candidate; the browser checks it before and after
the journey. The source/artifact digests remain expected identities and still
need the release owner's independent artifact/readback evidence.

Use a new capture directory for each run. The public probe retains exact response
bytes and a hashed reference. The browser retains screenshots, observed URLs and
a hashed console file; console or page errors, redirects outside scope, missing
artifacts and candidate mismatches cannot pass. Both recheck their output with
the existing submission validators. Do not overwrite failed captures or replace
them with fixtures. Keep authenticated screenshots and source bodies in their
authorized evidence store; public Git contains neither accounts nor credentials.

Supply the existing nonsynthetic `hostinger_replay.py` result and bind observed
proof for Hostinger Agent, AI Builder, Web Hosting and VPS into
`hostinger-products.json`. A clean browser run does not establish the provider
effects or independent review that the replay still requires.

## Canonical domain gate

RESOLVED 2026-09-20. The two declarations disagreed: README named `buildanddo.com` while
`apps/web/src/lib/publicPages.js` named `buildanddo.tech`. Measured from a fleet box,
`buildanddo.com` resolves through Cloudflare and answers 200 while `buildanddo.tech` has **no DNS
record at all**, and the operator confirmed the estate uses `.com` only. `SITE_ORIGIN` is now
`https://buildanddo.com`, sitemap/robots/llms were regenerated from it, and every functional
`.tech` reference was swept from the web app, the Discord bot, the crawl checker and the tests.
Historical `.bits` receipts keep the old value because they are a record of what was true then.
Capture `public-url.json` against `https://buildanddo.com`. The final compiler refuses a
mismatched origin.
