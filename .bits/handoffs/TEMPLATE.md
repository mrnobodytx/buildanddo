# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/TEMPLATE.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-AGENTCTX-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     .bits/context.md
# EnumType:    Doc
# EnumEdges:   TRIGGERS cross-seat handoff
# Intent:      Make "this belongs to the private mirror" a durable artifact instead of a chat message.
# ───────────────────────────────────────────────────────────────

# Handoff <DATE> <FROM-SEAT> -> <TO-SEAT>

Copy to `.bits/handoffs/<YYYY-MM-DD>-<from>-<to>.md`. Write one of these instead
of guessing when a task needs authority this repository does not have:
infrastructure, deployment control, golden data, private evidence, secrets.

**Originating SRS:** <SRS-CODE> **Dispatch:** <DISPATCH_ID>

## What was asked

## Why it cannot be done on the public plane

Name the specific authority or artifact that is missing.

## What was done instead

Stub, spec, finding, or nothing — state it plainly.

## What the receiving seat needs to do

Ordered, concrete steps. Include the verification command that will prove it
worked, so the result can be checked without re-reading this file.

## Blocking

Does public work stop until this is resolved? If yes, name what stops.
