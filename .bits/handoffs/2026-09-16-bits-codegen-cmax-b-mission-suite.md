# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-16-bits-codegen-cmax-b-mission-suite.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docs/mission-suite.md, tests/upgrade/test_suite_native.py, apps/mission_suite/__main__.py
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/mission-suite.md; DEPENDS_ON tests/upgrade/test_suite_native.py; CONSUMES apps/mission_suite/__main__.py
# DAG Node:    none
# Intent:      Transfer box placement and native application acceptance to the existing operator without fabricating a deployment, mission or government filing.
# ───────────────────────────────────────────────────────────────

# Mission suite — box and application acceptance

Requested receiver: CMAX-B with the BuildAndDo application/box operator and IDE1.
Receiving dispatch and accountable operator: not yet recorded. This artifact
records the handoff; it does not send a message or activate another seat.

The owner authorized a portable suite behind one API after the existing Sentinel
repository could not be located, then requested a BuildAndDo mission with
government-submission tutorials. The public implementation is a distinct bounded
source package using existing BuildAndDo auth, mission, evidence, worker transport
and epoch code. It does not create NNC admission, another Sentinel UI or private
release authority. Existing Sentinel work-order acceptance remains unchanged.

## Package to receive

`python -m apps.mission_suite package /tmp/buildanddo-mission-suite.tgz` produces
an explicit eight-file Python closure and guide. The archive is reproducible for
the same bytes; `identity` reports its source fingerprint. Python 3.11+ standard
library is sufficient. A CPU box can run the worker; no GPU is required for these
bounded checks. The worker opens no listener and calls only the configured
BuildAndDo API. It does not fetch a maritime feed or a government opportunity.

The source includes the authenticated `POST /api/buildanddo/workspaces/{workspace}/suite`
route, private raw collections, two additive migrations, the `/app/suite` desk,
government mission starter and eight tutorials. The receiving release must
include both the application source/migrations and the worker. Unpacking only
the worker does not create the server API or a saved mission.

## Receiver task table

| Task | Required evidence |
|---|---|
| Select an existing box and accountable supervisor | Receiving dispatch, operator and source/application revisions; no new public hostname required |
| Accept the installed PocketBase version | `BUILDANDDO_TEST_POCKETBASE` points to that binary; `python tests/upgrade/test_suite_native.py --require-binary` passes; migration down/re-up and current auth/rules accepted |
| Accept browser behavior | Rendered tests plus real desktop/mobile mission creation, approval, source-rights editing, PDF metadata, queued/blocked/recovered run and reviewed evidence |
| Bind an existing least-privilege native user | Server `BUILDANDDO_SUITE_BINDINGS` names workspace/user/exact source fingerprint; box receives its native session using existing secret custody; no token in repository, logs or evidence |
| Configure transport and supervision | Existing TLS endpoint, outbound reachability, bounded process restart, session renewal, stop procedure and data retention reviewed |
| Record an actual saved mission | Human selects a real opportunity, reviews the starter, saves, approves and records work started using the existing mission lifecycle |
| Exercise the complete bounded chain | One permitted observation or submission review: queue → lease → same-source worker result → human review → observed evidence, with matching input/result/source fingerprints |
| Verify uncertainty and rollback | Lost response retries preserve identity; revoked membership/changed rights fence work; stopped worker retains queue; disable binding, stop process and restore API source without deleting run/evidence history |
| Observe and hand back | Dated scoped run, native/browser results, archive identity, collected box logs, replay MATCH and all remaining limitations |

Run `doctor` only to diagnose configuration presence. Run `worker --once` only
after receiver authorization; it performs the recorded queue/claim/result writes.
Then bind the long-running `worker` command through the existing supervision
system. No systemd unit, box credentials, service activation or shared migration
is authored by this public session.

## Product and submission boundaries

Maritime candidates remain HOLD. Exact supplied vessel identifiers are claims,
position disagreements remain visible, and the 256-observation window has no
validated maritime precision/recall or live supplier adapter. Operational NNC,
licensed feed integration, government recipient contracts and CUI handling need
their existing owners and separate acceptance.

Government readiness checks declarations and saved evidence. Official links are
starting points, not retrieved/current rules. PDF bytes stay in the browser;
page count is human-declared. READY_FOR_HUMAN_REVIEW does not certify eligibility,
security compliance or proposal submission. A human files through the actual
notice and retains the actual receipt. Tutorial completion is not an award or
mission verification.

Local source tests are evidence of the package, not a deployed box. No production
worker, native credential, live mission row, seat event, government filing or
remote integration was created in this coding session.
