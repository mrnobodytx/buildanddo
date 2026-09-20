# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-DAY21-CLOSURE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/web/src/lib/publicPages.js, README.md,
#              scripts/ci/ocn_room_probe.py, scripts/ci/ocn_mission_lifecycle.py
# EnumType:    Doc
# EnumEdges:   VALIDATES the Day-21 submission chain;
#              DEPENDS_ON apps/web/src/components/Seo.jsx
# Intent:      Close the gap between a product that works and a submission that can be judged,
#              by binding one candidate SHA to acceptance, a real browser journey, four-product
#              evidence and a replay - and refusing to compile when any of them is missing.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-DAY21-CLOSURE-001 — Day-21 submission closure

## Why this exists

The product is not the Day-21 gap. Challenge intake, onboarding, missions, workflows, evidence and
Operator readback all exist and have been exercised from six machines that are not the development
rig. What is missing is the machinery that turns that into something a judge can check: one
candidate SHA appearing in an acceptance receipt, a recorded browser journey, four separate
Hostinger product proofs and a non-synthetic replay, compiled into a bundle that refuses to emit
when any link is absent.

## The canonical URL is a blocking defect, not a preference

Measured 2026-09-20 from a fleet box (rig1 cannot measure TLS - its antivirus terminates and
re-signs every connection):

- `buildanddo.com` — DNS resolves through Cloudflare, HTTPS 200.
- `buildanddo.tech` — **no DNS record at all**, unreachable. Same for `www.buildanddo.tech`.

`apps/web/src/lib/publicPages.js` declares `SITE_ORIGIN = 'https://buildanddo.tech'`, and
`Seo.jsx` uses it for the canonical link, the Open Graph image and the JSON-LD `WebSite.url`.
Production therefore currently serves:

```
canonical  href="https://buildanddo.tech/"
og:image   content="https://buildanddo.tech/social-card.png"
JSON-LD    "url":"https://buildanddo.tech/"
```

All three name a host that does not exist. Two consequences are live right now: search engines are
told the real site is not canonical, and **every shared link has a broken preview image** - which
compounds the separate finding that the served HTML carries 37 characters of text before JavaScript
runs, so a judge pasting the URL gets neither a preview nor a page.

This is not a naming preference to be settled by taste. One of the two declarations points at
nothing.

## Requirements

1. **R1 — one canonical origin.** `SITE_ORIGIN` and `README.md` must name the same origin, and that
   origin must resolve and serve over HTTPS. A declared origin that does not answer is a failure,
   not a configuration choice.
2. **R2 — candidate continuity.** The same Git SHA must appear in the acceptance receipt, the
   browser journey and the replay. Three artifacts about three different commits are not evidence
   about one submission.
3. **R3 — four-product proof from observation.** Web Hosting, Hostinger Agent, AI Builder and VPS
   each need separately observed evidence. Architecture prose asserting the products are used does
   not satisfy this.
4. **R4 — recorded console errors are a HOLD.** A journey that completes while the console reports
   errors has not demonstrated a working product; it has demonstrated that nobody looked.
5. **R5 — the compiler refuses.** Missing acceptance, journey, product proof or replay must produce
   a refusal with the missing link named, never a bundle with a gap in it.

## Non-goals

Adding product features. The competition rewards a finished vertical slice over an unfinished
sophisticated one, and every hour spent widening the product is an hour not spent proving the part
that already works.

## Verification

`scripts/ci/ocn_*` already exercise login, RBAC, missions, signals, evidence, workflows and rooms
from six independent machines and are the non-synthetic input to R2. The closure lane consumes those
receipts rather than re-deriving them.
