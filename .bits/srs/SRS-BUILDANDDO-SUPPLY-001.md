# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-SUPPLY-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-SUPPLY-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/telemetry_snapshot.py, .buildanddo/public/path-policy.json
# EnumType:    Doc
# EnumEdges:   EXTENDS scripts/ci/telemetry_snapshot.py; PRODUCES buildanddo.ci.deps.vulnerabilities
# Intent:      Specify supply-chain signal for a dependency tree nobody currently watches.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-SUPPLY-001 — Dependency and supply-chain telemetry

**Status:** proposed **Risk:** A1 **Seat:** unassigned

## Problem

The public site ships roughly 630 locked npm packages behind 53 direct
production dependencies, including a 3D renderer, an animation library and a
charting library. CI counts those dependencies but says nothing about their
safety: no vulnerability scan, no license inventory, no lockfile integrity
check runs anywhere in this repository.

The public-boundary scanner is a secrets scanner, not a supply-chain scanner —
it will happily pass a build that pulls in a compromised transitive package. For
a build-in-public repository whose whole proposition is verified evidence, an
unwatched dependency tree is the widest unmeasured surface left.

## Intent

Turn the dependency tree into a signal that trends over time, alongside the
existing bundle and dependency-count telemetry.

## Scope

- Run `npm audit --json` in CI, parse severity counts, publish
  `buildanddo.ci.deps.vulnerabilities.{critical,high,moderate,low}` through the
  existing publisher.
- Add threshold entries to `scripts/ci/telemetry_delta.py` so a newly introduced
  critical or high vulnerability is reported as a regression against the baseline.
- Verify lockfile integrity: `package-lock.json` must satisfy every manifest, so
  a hand-edited manifest cannot pass CI.
- Produce a license inventory artifact for the direct dependency set.
- A scheduled weekly run, so a vulnerability disclosed after merge is still
  detected without waiting for the next PR.

## Out of scope

- Automated dependency upgrades. Detection first; remediation policy is separate.
- Blocking merges on vulnerability counts until the baseline is known and triaged.
- Any private-registry or internal-package scanning.

## Acceptance evidence

1. Vulnerability counts by severity appear as metrics and in the PR job summary.
2. A PR adding a package with a known advisory reports a regression.
3. A deliberately desynchronised lockfile fails CI.
4. The weekly scheduled run publishes even with no code change.

## Verification

```bash
npm audit --json > reports/npm-audit.json; echo "exit=$?"
python scripts/ci/telemetry_snapshot.py --pipeline local | grep -i vuln
```

## Notes for the implementing agent

`npm audit` exits non-zero when it finds anything, so capture the report and
evaluate it explicitly rather than letting the exit code fail the step — the
same best-effort pattern the lint and knip collectors already use. Report-only
first; thresholds only after one baseline exists.
