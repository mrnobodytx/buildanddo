# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-21-bits-codegen-cmax-b-governance-execution.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .gitlab/ci/day21-submission.yml, .gitlab/ci/source-validation.yml, scripts/ci/verify_public_boundary.py
# EnumType:    Doc
# EnumEdges:   CONSUMES .gitlab/ci/day21-submission.yml; CONSUMES .gitlab/ci/source-validation.yml; CONSUMES scripts/ci/verify_public_boundary.py
# Intent:      Assign the provider integration needed to connect real GitLab governance results to the matching public review without inventing hosted acceptance.
# ───────────────────────────────────────────────────────────────

# GitLab governance receiving work

From: BITS-CODEGEN. To: CMAX-B / GitLab runner and repository owner.
This file requests receiving work; no external notification or private
configuration change has been performed by the coding session.

PR 64's GitHub governance run 35664137943 failed eleven jobs before any steps
started. The govern annotation reports an account billing lock. That observation
does not describe GitLab health. The local readiness/context/memory gates passed
before this correction. The public PR had only the `Bits AI` label, which is
not one of the required actor labels. The Cloudflare check supplied a failed
build ID but no diagnostic in the accessible provider response.

Public source now makes GitHub governance an explicit manual fallback, preserves
the required coverage jobs in reachable GitLab includes, and enforces review
attribution in `day21_governance`. Existing private release jobs are unchanged.
The receiving owner must close these integration gates:

1. Verify public candidate delivery into the actual GitLab project and run the
   merged GitLab configuration for the same SHA. The existing GitHub candidate
   workflow is still a source definition; it cannot establish that private
   mirroring works or that it is independent of Actions availability.
2. On GitLab merge requests, preserve native IID/labels. On GitHub external PR
   pipelines, supply an authenticated GitHub pull-object export wrapped under
   `pull_request`, via `BUILDANDDO_GITHUB_PR_EVENT`. The file must name this public
   repository, review number, exact head and labels. Keep credentials out of the
   export and public artifacts. Missing metadata fails rather than bypassing the
   actor gate. Apply exactly one reviewed actor label; this agent change expects
   `actor:agent`, in addition to any separate product labels.
3. Provision Node from `.nvmrc`, Python 3.11 and 3.12 with venv/pip, locked npm
   dependencies, the declared Python packages, and Docker or both declared
   PocketBase binaries. Require `day21_governance`, `day21_full_acceptance`,
   `source_discord` and both versions of `source_foundry`,
   `source_federal_portfolio` and `source_mission_suite`.
4. Publish the actual GitLab results to the same GitHub candidate SHA. Inspect
   those observed check names before updating required-status settings. Do not
   replace missing jobs with successful placeholders or disable required
   validation. Retire obsolete automatic GitHub status requirements only with
   the GitLab equivalents active; old failed runs remain historical.
5. Retain job records plus complete acceptance receipt/log/artifact exports.
   An inventory of jobs, a local regression or a summary without evidence cannot
   establish hosted acceptance. The manual submission bundle also waits for
   every source matrix job and the full acceptance artifact.
6. Obtain the separate Cloudflare build diagnostic for build
   `232a9c7b-9344-434b-a8ac-87190882cb5b`. No source cause or successful rebuild
   is inferred from its failed status alone.

Local source verification:

```bash
python -m unittest tests.upgrade.test_public_boundary tests.upgrade.test_gitlab_acceptance -v
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py --check
```

The provider export is a consistency input, not a signed attestation. The
receiving integration owns its provenance. Runtime activation, repository
settings and remote labels/statuses still require their existing owner authority.
