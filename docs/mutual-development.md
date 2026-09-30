# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/mutual-development.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/work.py, libs/evolution/work_exchange.py, libs/evolution/work_cli.py, scripts/ci/candidate_manifest.py, scripts/ci/evidence_epoch.py, docs/development-loop.md
# EnumType:    Doc
# EnumEdges:   CONSUMES libs/evolution/work.py; CONSUMES libs/evolution/work_exchange.py; CONSUMES libs/evolution/work_cli.py; CONSUMES scripts/ci/candidate_manifest.py; CONSUMES scripts/ci/evidence_epoch.py; EXTENDS docs/development-loop.md
# Intent:      Explain the operable public work/result exchange and the independent receiving steps still needed to close the reciprocal development loop.
# ───────────────────────────────────────────────────────────────

# BuildAndDo and Citadel work exchange

`buildanddo.work/v1` carries a public, candidate-only work proposal between
BuildAndDo and Citadel Nexus. `buildanddo.work-result/v1` returns an attempt and
its retained evidence. The adapters use the existing evolution contracts,
mission-packet generator, independent review policy and evidence epoch. All
commands below run locally with Python 3.11+ and the standard library.

```text
Existing development mission packet
  → public work contract
  → receiving authorization and worker assignment
  → exact GitHub candidate → GitLab execution
  → result + original evidence bytes
  → separately authenticated independent review
  → existing evidence epoch + derived worker history
```

The local proposal, packaging, inspection, epoch and history steps are
implemented. CSCC intake/return adapters, authenticated worker mappings,
GitLab execution, native mission persistence, release and external readback
remain receiving work. A prepared packet does not assign a Guildmaster.
GitHub and GitLab retain their existing roles; this exchange grants no release
authority and performs no remote publication or repository synchronization.

## Wire contracts

| Work field | Meaning |
|---|---|
| `schema` | Required exact version `buildanddo.work/v1` |
| `mission_id`, `scope_id` | Stable mission and receiving tenant/workspace boundary |
| `producer`, `consumer` | Distinct `buildanddo` / `citadel-nexus` parties |
| `lane` | `development`, `experience`, `research` or `operations` |
| `objective`, `srs`, `dispatch` | Proposed outcome and existing governance join keys |
| `source` | Public owner/repository slug and full starting Git revision |
| `created_at`, `origin` | Aware timestamp and optional exact original packet reference |
| `allowed_paths`, `forbidden_paths` | Exact paths or directory `/**` rules; deny wins |
| `required_capabilities` | Requested skills, with no implied worker qualification |
| `acceptance` | Named, measurable checks used by the result and verifier |
| `evidence_required` | `commit`, `test`, `artifact`, optionally `deployment` and `runtime` |
| `authority`, `visibility` | Fixed `candidate_only` and `public` |

The result repeats the mission, scope and starting source, binds the entire
work digest, and adds `attempt_id`, `worker`, `candidate_revision`,
`changed_paths`, start/completion times, reported status, checks, evidence and
contributors. The candidate can advance from the starting revision; neither
revision is silently substituted for the other. Each evidence entry records
ID, kind, relative path, SHA-256, size, observed time and author. Check evidence
must resolve to these entries. Missing or skipped checks remain incomplete.

The strict codec rejects unknown fields/versions, string booleans, duplicate
JSON keys, path traversal, unsupported globs, credential/private/deployment
paths and contradictory lineage. Receivers rehash the actual bytes, reject
symlinks and unreferenced bundle files, and bound individual files to 16 MiB
and evidence totals to 64 MiB. Keep larger original artifacts in their existing
authorized store; select a bounded, reviewed public derivative with its own
digest. Do not label a derivative as the original.

Public visibility is a content requirement, not an automatic sanitizer. The
mission adapter rejects observations marked licensed or authorized-only. The
receiving owner must still review prose, logs, artifacts and identity metadata
for public release. Private gaps enter as separately sanitized public problems.
Hashes neither anonymize content nor authenticate its source.

Export the wire descriptions for another language or service:

```bash
python -m libs.evolution.work_cli schema work --output state/work/work.schema.json
python -m libs.evolution.work_cli schema result --output state/work/result.schema.json
python -m libs.evolution.work_cli schema worker --output state/work/worker.schema.json
```

These JSON Schemas describe structure. The Python validators also enforce
cross-field, path, chronological and evidence invariants. Implementations in
another language must retain those checks and pass the adversarial suite.

## Use the existing mission producer

Generate a proposed mission through the development commands in
`docs/development-loop.md`, then convert its actual `mission.json`:

```bash
python -m libs.evolution.work_cli from-mission state/development-loop/mission-packet/mission.json \
  --repository mrnobodytx/buildanddo --producer buildanddo --lane development \
  --allowed-path 'apps/web/src/components/voice/**' \
  --allowed-path 'tests/upgrade/**' --capability browser-debugging \
  --require-evidence deployment --require-evidence runtime \
  --output state/work/mission-work.json
python -m libs.evolution.work_cli validate-work state/work/mission-work.json
```

Use `--producer citadel-nexus` for a sanitized Citadel challenge. The original
packet digest and proposal ID remain in `origin`; keep that original export
in its authorized store. Conversion creates a proposal. Existing receiving
membership, SRS/dispatch and approval checks still precede assignment or action.
Contract text is inert data and is never executed as shell commands.

On the actual candidate checkout, create the existing provenance with its work
binding. The expected repository comes from receiving configuration or CI:

```bash
python scripts/ci/candidate_manifest.py --repository mrnobodytx/buildanddo \
  --work state/work/mission-work.json --output state/work/candidate.json
```

This checks the Git ancestry, actual changed paths and unchanged tracked source.
The manifest refuses a CI SHA that differs from HEAD. Commit-kind evidence must
be this candidate manifest format, with matching repository, candidate, source
window, authority and content digest. Optional work provenance must agree with
the result. A worker's changed-file list cannot replace the actual Git comparison
when an epoch consumes the bundle.

## Return and inspect a result

The receiving worker writes `result.json` from actual job observations, using
its authenticated identity mapping and the work/result wire contract. Store
the referenced public evidence beneath one selected evidence directory.
`PASS` in that file is a producer report. Failures, HOLD, cancellation and
rollbacks can be retained in the same result format.

```bash
python -m libs.evolution.work_cli bundle \
  --work state/work/mission-work.json --result state/work/result.json \
  --candidate FULL_CANDIDATE_SHA --evidence-root state/work/evidence \
  --output state/work/returned-attempt
python -m libs.evolution.work_cli inspect state/work/returned-attempt \
  --work state/work/mission-work.json --candidate FULL_CANDIDATE_SHA
```

Select `FULL_CANDIDATE_SHA` from the receiving repository/job, independently of
the submitted result. Bundle destinations are new directories; existing
history is never overwritten. Bundles contain `work.json`, `result.json`,
referenced files under `evidence/`, and optionally `verification.json`.
Preparation does not create a receipt, workspace record, epoch or deployment.

Inspection returns `HOLD`, `READY_FOR_REVIEW`, a reported failure/cancellation/
rollback, or `REVIEWED_PASS`. Only `REVIEWED_PASS` exits zero; other valid
observations exit 2, malformed/conflicting inputs exit 1. Missing deployment
or runtime evidence cannot be satisfied by source tests or a build artifact.

For independent acceptance, the existing verifier supplies a semantic
`VerificationReceipt` for `WorkSubmission.subject`. Every required acceptance
check must cover `WorkSubmission.required_sources`, including the exact work,
result and all artifact references. The worker, contributors and evidence
authors are excluded from verifying that result. Receipts must be fresh and
bound to the current receiving `ReviewPolicy` and its authenticated content pins.

Add the independently obtained receipt using `bundle --verification FILE` and
inspect with `--review-policy RECEIVING_POLICY_FILE`. The policy is separately
provided receiving configuration; never accept it from the worker, browser,
work contract or bundle. An attached unpinned receipt cannot confer acceptance.
This v1 gate admits passing independent reviews; unsuccessful attempts remain
reported history and cannot pass capability or release gates.

## Epochs and experience

Add a selected returned bundle to the existing epoch builder:

```bash
python scripts/ci/evidence_epoch.py --trigger local \
  --repository mrnobodytx/buildanddo --work-bundle state/work/returned-attempt \
  --no-chain-update
python scripts/ci/evidence_epoch.py --verify state/epochs/latest.json --recheck-files
```

The root retains the existing `sha256-merkle-v1` construction. Contract, result,
optional review and artifact bytes become named leaves. The epoch checks its
actual candidate, Git ancestry and changed files. Repeated attempts, foreign
candidates, wrong repositories and altered files are refused. Its work summary
says `verification: not_conferred_by_epoch`; external anchoring stays pending.
The hosted workflow now checks out the event SHA and reads the current chain
head separately from the fetched branch, so a queued event preserves both
candidate identity and its actual chain predecessor.

Worker identity uses a canonical actor ID and optional stable GitHub/GitLab
account IDs plus their attributed logins. These are declared bindings; the
receiving identity owner authenticates their provider/instance and membership.
Changing a login cannot grant authority or create a new verified worker.

For history, supply a receiving-selected JSON array of
`{bundle, expected_work, candidate}` paths/revisions and run:

```bash
python -m libs.evolution.work_cli experience state/work/selection.json \
  --worker cni://guildmaster/RECEIVING_CANONICAL_ID \
  --review-policy RECEIVING_POLICY_FILE --output state/work/experience.json
```

Each entry is rechecked. Exact retries count once; conflicting attempt bytes
or provider identities are rejected. A separately pinned review arriving later
updates the same derived history regardless of import order. Reported outcomes
and historical reviewed passes remain separate. The output preserves failures
and rollbacks without inventing success rates, employment credentials, model
learning, current capability or deployment authority. Live GitLab job/deploy
history reaches this view only after the receiving adapter returns actual data.

## First reciprocal mission and receiving acceptance

`.bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-dogfood.json` is the
first source-bound proposal: independently exercise the previously repaired
Buddi and workspace recovery paths, repair any reproduced defects within its
public scope, then retain the actual GitLab, browser/native and release readback.
It references the retained repair report and requires deployment/runtime evidence.
No worker, private identity, completed run or successful deployment is invented.
Its source field records the inspected local revision. The receiving owner must
confirm that object is available on both repository planes. Selecting a newer
starting revision requires a new reviewed contract digest before assignment.

`.bits/handoffs/2026-09-30-bits-codegen-cscc-work-exchange.md` assigns the remaining
CSCC, native mission, identity, verifier and release responsibilities. The full
mutual-development loop remains pending until that receiving run completes.

```bash
python tests/upgrade/check_work_exchange.py
python -m mypy --strict --explicit-package-bases --follow-imports=silent \
  libs/evolution/work.py libs/evolution/work_exchange.py libs/evolution/work_cli.py
```

The existing GitLab Python 3.11/3.12 behavior lane runs the work coverage gate.
Its synthetic fixtures establish source behavior, not hosted execution or a
Guildmaster's professional record.
