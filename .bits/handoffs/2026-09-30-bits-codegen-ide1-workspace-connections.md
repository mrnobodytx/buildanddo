# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-30-bits-codegen-ide1-workspace-connections.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     docs/workspace-administration.md, docs/workspace-assistant.md, docs/workflow-system.md, docs/business-execution.md, tests/upgrade/workspace-connections.test.mjs
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/workspace-administration.md; CONSUMES docs/workspace-assistant.md; CONSUMES docs/workflow-system.md; CONSUMES docs/business-execution.md; VERIFIED_BY tests/upgrade/workspace-connections.test.mjs
# Intent:      Hand off rendered and native acceptance of repaired workspace connections while keeping provider binding and deployment with the receiving owners.
# ───────────────────────────────────────────────────────────────

# Workspace connection acceptance

From: BITS-CODEGEN. To: IDE1 / CMAX-B and the existing integration operators.
Source authority: VCC-BUILDANDDO-UPGRADE-001, A2. Runtime activation and release
continue through the receiving owner's separate dispatch. This file records the
handoff; no message, seat event, activation or deployment was sent from the sandbox.

The source repair expires old integration health, adds an observation refresh,
preserves unsent Buddi drafts until configuration is readable, and fences workflow
receipt races and cancellation during dispatch. Workflow receipts now open their
specific mission/evidence records. The earlier voice recovery repair is retained.
There is no new migration, provider, permission rule or credential format.

1. On the locked Node 22 frontend toolchain, run the rendered `WorkspaceAssistant`,
   `AdministrationFlow` and `WorkflowRuns` suites, repository lint and production
   build. The sandbox's 344 passing source cases include actual handlers with
   explicit hook/storage/provider doubles; they do not replace these checks.
2. With a disposable native backend, load one integration as a viewer and one as
   an administrator. Let its observation expire, request a check as administrator,
   publish a legitimate operator observation for the requested revision, and use
   **Refresh observations**. Confirm expiry, a new receipt and unchanged request
   history on reads. A fresh timestamp for an old configuration remains stale.
3. Configure the existing workspace inference endpoint through its operator.
   Verify the unconfigured and unavailable states keep a draft without POSTs;
   **Recheck connection** permits an explicit send only after readable
   configuration. Record one permitted chat, reviewed ordinary form action and
   personal pattern, including account/workspace revocation checks. Configuration
   alone is not proof of inference or authority to approve a mission.
4. Exercise an approved ERP step and the registered Firecrawl/n8n bindings. Delay
   a receipt read across dispatch, overlap polling reads, and lose a command
   response. Recover the original effect identity. Confirm a failed read prevents
   dispatch, cancellation waits for the issued request, and stale run/step results
   do not move the current review. Open the linked mission and evidence and test
   unavailable/foreign destinations through their existing access checks.
5. Retain candidate-bound native/browser/provider receipts in the owning evidence
   plane. Do not publish credentials, conversation text, private evidence or
   deployment-control files here. Continue public voice acceptance through the
   separate dated Buddi activation handoff.

Nine provider definitions are exposed by the integration desk, but a saved request
does not activate any of them. The inspected business worker implements Firecrawl
and n8n bindings; other provider executors remain the responsibility of their
existing operators. No conclusion about their current deployed health is made.

Rollback: release the prior accepted frontend through the release owner if these
UI repairs regress. Retain saved requests, jobs, conversations and receipts; this
source change requires no database rollback or provider-side compensation.
