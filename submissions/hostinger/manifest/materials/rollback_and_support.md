# Rollback and support

## Release path

Changes reach production through a rail that gates each hop and keeps a receipt: build, gate,
staging sync, staging probe, then promote. A build that cannot be read back on staging is not
promoted.

Both environments currently run the same build. `GET /_version` on either one is the authoritative
answer to "what is deployed" — the bundled release manifests are known to go stale and should not be
trusted over it.

## Database changes, and the failure mode we design around

PocketBase applies migrations by set difference on filename, and **one bad migration takes the whole
service down** — it aborts startup rather than skipping the offender. Two consequences shape how we
work:

1. A migration that returns early is recorded as applied **forever**. Guards must be written so that
   skipping is a deliberate, repeatable decision rather than an accident that can never be retried.
   We have been bitten by the opposite: a guarded migration whose data directory was missing was
   recorded as applied and could never run again.
2. Migrations are rehearsed before they are deployed, never after.

`scripts/ci/migration_preflight.py` copies the live database, runs the pending set against a real
backend on that copy, and requires the process to reach a serving state — not merely "did not exit
yet", which an earlier version wrongly accepted as a pass. All 52 migrations currently reach a
serving backend.

The preflight is trusted only because it also fails on demand: `--selftest` plants a broken migration
and requires the gate to refuse it. A version that passed its own planted control was treated as a
defect and fixed.

## Rolling back

- **Application** — re-promote the previous candidate through the same rail. Each build is identified
  by commit and readable at `/_version`, so the target of a rollback is never ambiguous.
- **Database** — migrations are rehearsed down and re-up as part of the native acceptance suite. A
  migration that cannot be reversed is expected to say so before it ships.
- **Configuration** — environment values live in systemd environment files on the host. A
  configuration rollback is a file change plus a service restart, independent of the application
  build, which is why production realtime can stay off without holding back any other change.

## Monitoring and self-checks

The platform carries its own detectors rather than relying only on external monitoring:

- **Silent-failure scanner** — reads artefacts for the shape of work that claimed success and did
  nothing. Run across 8,383 real artefacts it reports 3 findings. Its selftest holds 16 must-catch
  and 10 must-ignore cases, including five that try to silence it by writing a state field. It
  refuses all five, because a checker you can pass by claiming to have passed is the exact failure it
  exists to catch.
- **Public disclosure scanner** — over both the served surface and the published mirror.
- **Sprint replay** — re-reads every progress claim against its own cited evidence and prints the
  overstatement.

## Known operational limits

We would rather list these than have a reviewer find them.

- Production classroom realtime is not configured, deliberately, pending a credential rotation.
- Our working branch matches no CI job rule, so its pipelines contain zero jobs and report as
  "failed". An empty pipeline is not a broken build, but it looks exactly like one at a glance. The
  local acceptance runner is the gate evidence for that branch.
- Six of fourteen acceptance checks fail, all named and reproducible. None are blocked: every check
  produces a measured result, which was not true two days ago.

## Support

Citadel Nexus Inc. For evaluation questions, the contact address published on the site's contact
page is the correct route.

Every claim in this submission has a command next to it in the evaluator journey. Where something
cannot be reproduced from outside, we have said so rather than asking to be taken on trust.
