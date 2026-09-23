# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/research-sprint.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/decision/packages.py, apps/federal_foundry/sprint.py, apps/pocketbase/pb_hooks/government-access.js, docs/test-assurance.md
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/decision/packages.py; CONSUMES apps/federal_foundry/sprint.py; CONSUMES apps/pocketbase/pb_hooks/government-access.js; DEPENDS_ON docs/test-assurance.md
# Intent:      Define the reproducible local research and paid-access contracts with explicit receiving gates for real execution.
# ───────────────────────────────────────────────────────────────

# Government research and the next sprint

The protected workspace desk is `/app/government`. It connects existing lessons,
mission preparation, the mission suite and evidence to three bounded lanes:
Army Decision Packages, DARPA Influence market experiments, and a FHERMA exact
polynomial experiment. BuildAndDo remains an educational collaboration platform;
government work is one restricted application domain.

The shared plan in `apps/pocketbase/pb_migrations/data/research-sprint.json` owns
the proposed September 23–October 2 sequence, 60/25/15 effort allocation and
requirement-to-capability crosswalk. Its dates, topic identifiers, prize,
leaderboard and challenge parameters are **owner-supplied, unverified leads**.
The exact supplied source URLs are retained. No page was reauthenticated during
this implementation. Confirm the official notice, eligibility and submission
requirements before relying on dates or allocating funds.

## Membership contract

The provisional offer is **USD 100/month plus manual operator approval**. The
owner requested the $100 restriction without specifying billing cadence; confirm
cadence, invoice, renewal and cancellation terms before activating real members.
There is no online checkout, payment processor call or self-service activation.
The membership link opens the existing fixed-recipient email-draft flow with a
government enquiry type. Preparing the draft does not send email or grant access.

PocketBase's native `users` authentication and workspace membership remain
required. The additional `government_memberships` collection is operator-owned:
all five ordinary record API rules are null and a unique user index prevents
multiple ambiguous grants. A current grant requires all of:

- `protocol_version: 1`, `tier: government`, `status: active`;
- `amount_cents: 10000`, `currency: USD`, `interval: month`;
- a nonempty trusted `payment_reference` and `approved_by`;
- a valid UTC `approved_at` no later than the server clock;
- a UTC `starts_at <= now < expires_at` period.

The receiving billing/operator owner records these fields through their
authorized PocketBase administration workflow after actual payment and review.
No migration grants membership. Never accept account profile fields, browser
claims, workspace roles or a query-string price as proof of payment. Payment and
approval references never appear in the public membership projection.

The server checks membership before government content, saved premium lesson
checkpoints, premium classroom participation, suite commands and cached retries.
Worker polling and completion recheck the sponsoring member, so revocation also
fences an in-flight result. Navigation and direct routes use observed membership;
account/workspace changes discard stale responses. The UI refreshes on focus,
visibility, expiry and every 30 seconds while visible. Server checks remain the
authority during that interval.

General tutorials and ordinary workspace tools stay available under their
existing rules. Premium lessons are excluded from the raw tutorial API even for
paid users; the protected route supplies their content. Earned certificates
remain personal history after expiry. Work a member saves into an ordinary
workspace follows that workspace's sharing rules; this change does not make
existing shared mission/evidence records private. The repository's published
source and public opportunity notices are public. The paywall controls hosted
features, not access to copies of open source. Controlled material belongs in
the designated private system.

The migration is idempotent and refuses unexpected existing rules or schemas.
Its down migration retains membership and learning receipts, removes the
membership protocol field and keeps government content restricted. Rolling back
requires disabling the desk/suite routes before restoring older server code;
old code cannot be assumed to enforce the new paywall.

## Reproduce the three-lane package

On a local checkout with Python 3.11 or later, use a new output directory:

```bash
python -m apps.federal_foundry sprint --output state/research/run-001
python -m apps.federal_foundry verify-sprint state/research/run-001
```

Use `--at 2026-09-23T12:00:00Z` for an explicitly simulated fixed-time replay.
Without `--at`, the compiler records the actual UTC evaluation time. Existing
directories and symlinked paths are rejected. The compiler does not contact a
provider, launch agents, register a second source of truth or submit a proposal.

The bundle contains the shared plan, lane crosswalks, separate Army and DARPA
proposal drafts, source hashes, a bounded CycloneDX source inventory, and an exact
file manifest. Its SBOM is **not** a complete installed-runtime SBOM. The verifier
checks bytes, recomputes decisions and auction results, binds history to the
exported revisions and rejects summaries that disagree with those computations.
This is local replay, not independent review or signed source authentication.

### Army Decision Packages

`apps/decision/packages.py` extends the existing decision owner. Inputs have exact
keys for question, objective, criteria, options, constraints, assumptions, risks,
bias checks and evidence. Numeric observations carry source digests, tenant and
validity windows. Criteria declare units, weights and minimize/maximize direction.
Evaluation uses weighted min/max normalization over the supplied alternatives
and applies every constraint as a hard gate. Equal best scores abstain.

Missing, stale, future or conflicting support holds the whole comparison; the
evaluator does not improve a score by silently discarding an unsupported rival.
The package retains every tradeoff, reevaluation trigger, evidence relationship
and input. `verify()` recomputes the result even if a forged object was rehashed.
The declared evidence-dependency graph is not a causal inference result.

```bash
python -m apps.federal_foundry decision-package INPUT.json --at UTC_TIME
python -m apps.federal_foundry decision-refresh PREVIOUS.json INPUT.json --at UTC_TIME
```

The generated `army/point/decision/input.json` is a complete input example.
`army/point/` demonstrates a synthetic cost/latency trade study.
`army/refresh/` changes an observation so option a violates the latency limit and
the conclusion switches to b; `history.json` retains both revisions and the
changed evidence. `army/release/` consumes a real retained BuildAndDo acceptance
receipt and correctly holds for missing current-candidate and deployed-health
evidence. It does not authorize a release.

Each directory includes `decision.json`, `evidence.json`, `assumptions.json`,
`risk.json`, `causality.json`, `verification.json`, `human-approval.json`, original
input and an escaped `decision-package.html`. The HTML can be reviewed or printed
by its recipient; no PDF-generation dependency is introduced. Approval remains
PENDING, independent verification UNMEASURED, and authority A0/advisory. A real
decision still needs domain-reviewed inputs, a distinct verifier and human
authorization through the existing mission owner.

### DARPA Influence seed

`apps/federal_foundry/episodes.py` adapts the existing market evaluator. The local
demonstration has six agents, two assets and three rounds with public news. It
records actual deterministic results for truthful and shaded **scripted**
controls. `influence/comparison.json` contains their measured local metrics.

`MarketAgent(identity, provider, model, version, kind, act)` accepts a caller-owned
async action function. A prompt contains only that agent's valuation and released
news. Exact prompt/response bytes, model identity, bids and failures are retained.
Any timeout or malformed answer makes the episode HOLD. Replay checks the
information boundary and every order before recomputing clearing and utility:

```bash
python -m apps.federal_foundry market-replay EPISODE.json
```

The supplied controls are not cross-model observations. Real model adapters and
their credentials, sampling settings, usage budget and dispatch belong to the
receiving experiment owner. Collaboration/deception/bias classifications remain
UNMEASURED pending labeled controls and independent validation. Counterfactual
replay uses fixed recorded actions, not model reevaluation under different news.

### FHERMA reference and continuation gate

`apps/federal_foundry/polynomial.py` provides exact integer negacyclic
multiplication via carry-free Kronecker packing and checks every coefficient of
a candidate. Inputs are nonnegative integers bounded by `width`; degree must be
a power of two. An explicit `modulus` selects the coefficient ring; `null` means
integers. The reference does not infer a modulus from W or guess an official
binary interface. Limits are N <= 65,536 and W <= 1,792.

```bash
python -m apps.federal_foundry polynomial-check CANDIDATE.json
python -m apps.federal_foundry fherma-doctor
python -m apps.federal_foundry fherma-gate --leader-us 260 --sample-us 510 --sample-us 520 --sample-us 900
```

Candidate JSON has exactly `left`, `right`, `candidate`, `width`, `modulus`.
The gate uses the median of supplied positive timings: GO at <= 2x the supplied
leader, WATCH up to 1,000 microseconds, otherwise PIVOT. These are internal
planning rules, not qualification. A supplied leaderboard baseline must be
<= 500 microseconds to keep those two thresholds ordered.

The doctor exits nonzero/BLOCKED until official-interface work is completed.
The reported N=32,768/W=868, prize and deadline remain unverified. This change
contains no cuPQC kernel and claims no GPU timing. The receiving GPU owner needs
the exact official starter, coefficient ring, cuPQC SDK, actual hardware and an
authorized official correctness/benchmark receipt before the Day-3 gate.

## Receiving evidence

Run `docs/test-assurance.md` before activating the restricted service. Keep the
existing eighteen-profile Day-21 gate intact. The receiving handoff is
`.bits/handoffs/2026-09-22-bits-codegen-research-assurance.md`. Official notices,
eligibility, invoice activation, hosted-model runs, independent review, hardware
benchmarks, deployment and submission are outstanding receiving actions.
