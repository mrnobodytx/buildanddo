# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-SITE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-SITE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SITE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     AGENTS.md, apps/pocketbase/pb_hooks/workspace-onboarding.js, apps/pocketbase/pb_hooks/workspace-record-policy.js, .bits/srs/SRS-BUILDANDDO-TRUST-001.md
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-SITE-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-TRUST-001.md
# DAG Node:    none
# Intent:      Let a workspace prove it owns its website domain before BuildAndDo treats the site as the workspace's own.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-SITE-001 — Website ownership proof (front door, part 1)

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN

**Authorization:** the repository owner approved the website-to-credential build plan
on 2026-09-23 ("build that out but make it secure"), stage two being the website
front door. Recorded before implementation.

## Problem

A workspace domain is a text label. The owner can set its status to `verified`
from a Settings dropdown, and the Front Page then says "Domain verified — deeper
analysis is authorized". Nothing checks ownership, and a domain cannot be added or
changed after onboarding. A site import (part 2) must not read or act on a site the
workspace has not proved it controls.

## Scope

1. Server-owned domain state: browsers can no longer set `status`, `verified_at` or
   verification fields on `domains`; only the server's verification command can.
   A browser may remove only a domain row it holds that no workspace links, because
   removing a linked domain would cascade to the workspace.
2. DNS TXT proof: the owner or an admin requests a challenge; the server issues a
   random token and shows the record to publish
   (`_buildanddo-verify.<domain>` TXT `buildanddo-verify=<token>`). A "Check now"
   command looks the record up through a fixed DNS-over-HTTPS resolver and marks
   the domain `verified` only on an exact match.
3. Add or change the workspace domain after onboarding (owner or admin). A change
   creates a new unverified domain record; the old record keeps its history.
4. Honest UI: Settings shows the challenge, copy buttons, last check result and a
   Check now button; the Front Page banner says "verified by DNS" only for a
   server-verified domain and states plainly that an unverified domain unlocks
   nothing.
5. Existing self-asserted verified states are downgraded: the migration sets any
   `verified` domain without a DNS check time to `needs_attention`.

## Out of scope

Crawling or importing the site (part 2), any other ownership method, automatic
periodic re-verification, and hosting or DNS changes on the owner's behalf.

## Invariants (security)

- The server never fetches the user's domain in this stage: the only outbound call
  is a DNS-over-HTTPS query to a fixed resolver, so a domain value cannot steer a
  request (no SSRF). The resolver is fixed in code, optionally overridden by
  `BUILDANDDO_DOH_URL`, which must be https.
- The challenge token is random (at least 128 bits), stored in a hidden field, shown
  only to the workspace's owners and admins, and never logged. A new challenge
  replaces the old one; verification fails closed on any lookup error.
- Checks are rate limited per domain; errors say what failed without echoing raw
  resolver responses.
- Verification is bound to the domain name and workspace; changing the domain
  starts over.

## Acceptance

1. A browser write setting `domains.status` or verification fields is refused.
2. A challenge is issued only to an owner or admin and the token never appears in
   list or view responses of `domains`.
3. Check now marks `verified` only when the TXT record matches exactly; missing,
   wrong or unreachable lookups leave the domain unverified with a plain reason.
4. Rapid repeated checks are refused with the seconds remaining.
5. Owners and admins can add or change the domain after onboarding; editors cannot.
6. Settings and the Front Page state the verified or unverified truth.
7. Node upgrade tests, affected Vitest suites, lint, build, boundary and a secret scan pass.
