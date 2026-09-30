# --- CGRF Header ------------------------------------------------
# File:        .bits/handoffs/2026-09-30-bits-codegen-cmax-b-classroom-recovery.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     docs/classrooms.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/classroom-recovery-report.md, tests/upgrade/test_classroom_native.py
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/classrooms.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/classroom-recovery-report.md; CONSUMES tests/upgrade/test_classroom_native.py
# Intent:      Give the platform owner concrete classroom runtime acceptance steps without treating local source repair as deployment or functioning media.
# ----------------------------------------------------------------

# Classroom discovery and session recovery

Receiving owner: CMAX-B / classroom platform operator.
Authority: existing A2 public source; deployment and provider configuration require
the receiving human dispatch. This note records a handoff; it sends no message
or seat event and changes no live room.

The owner reported a classroom failure without a page or error. Source regressions
reproduced missing classes beyond the first unfiltered page, overlapping discovery
polls, stale discovery after workspace return, and stuck/obsolete saves after
room or native-session replacement. The repairs retain native authorization,
revisioned commands and uncertain-save receipts. The report binds measured local
results and distinguishes unavailable UI/native checks.

Receiving acceptance:

1. Run the changed React hook suites and `ClassroomsFlow.test.jsx` with the locked
   frontend dependencies on the declared Node runtime. Exercise StrictMode,
   same-account replacement, a lost create reply, navigation during a pending
   save and a class beyond twenty ended rooms in another readable workspace.
2. Run `tests.upgrade.test_classroom_native` against a disposable local backend
   with `BUILDANDDO_TEST_POCKETBASE` pointing to its binary. This sandbox skipped
   all ten native cases because that prerequisite is absent. Then verify the
   current full migration set and matching hooks in the approved environment;
   the native fixture's historical subset is not evidence of the deployed schema.
3. Confirm actual requests reach the matching private classroom routes and raw
   collection rules stay locked. Verify current readable workspace membership,
   installed tutorial IDs and fresh attendance. A missing/failed backend must
   remain unavailable; do not relax the schema guard to make a room appear live.
4. If the reported symptom is media, inspect the existing `/api/classroom/health`
   and authenticated room detail in the receiving environment. Confirm session
   storage and the existing Realtime configuration/publisher authorization
   without exposing values. Join a live room as an authorized host and an
   independent listener. Retain actual inbound packet/audio/video evidence,
   permission-denied/retry behavior and membership/leave revocation. A successful
   signalling response alone does not establish delivered media.
5. Retain the exact candidate, independent GitLab results, browser/native evidence
   and any approved release/external readback. One historical broadcast-evidence
   test additionally needs its original source revision available in repository
   history; do not rewrite the retained evidence to bypass that check.

Rollback: revert the public hook repair through the normal review/release path.
No database migration, provider account change or stored-room compensation is
needed. An already accepted classroom command remains real history; returning
to the room must inspect that history before submitting an uncertain action again.

Open: the original live symptom, actual deployed revision, rendered/native
acceptance and delivered media. No source observation closes those runtime gates.
