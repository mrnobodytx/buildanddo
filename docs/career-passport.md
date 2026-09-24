# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/career-passport.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport, apps/career, apps/web/src/pages/workspace/CareerPage.jsx, libs/capability_tokens/verification.py, docs/development-loop.md
# EnumType:    Doc
# EnumEdges:   CONSUMES libs/career_passport; CONSUMES apps/career; CONSUMES apps/web/src/pages/workspace/CareerPage.jsx; CONSUMES libs/capability_tokens/verification.py; EXTENDS docs/development-loop.md
# Intent:      Explain the BuildAndDo career dogfood workflow, contribution attribution and receiving evidence needed before one real application.
# ───────────────────────────────────────────────────────────────

# Career Passport: BuildAndDo dogfood

The Career Passport projects demonstrated work into inspectable job requirements
and application drafts. BuildAndDo supplies the first source history. Native
workspace permissions, the Semantic Twin contracts and the existing independent
review policy retain their authority. This projection does not grant XP, trust,
employment history, credentials or permission to contact an employer.

The first target is 100 current technical postings, ten requirement dossiers,
three supported draft packages and one separately approved real application.
The local compiler can exercise that complete preparation flow. Its synthetic
100/10/3 test is not a live job search. The retained real repository run has no
authenticated personal attribution, jobs, applications or outcome receipts;
it correctly remains HOLD. See the career report in the upgrade dispatch output.

## Work capture and personal attribution

The separate `apps.career` local history/assessment compiler also supplies the
login profile envelope. Its assessment ledger must be regraded against the
issuing question bank before results can enter a passport:

```bash
python -m apps.career passport --repo . --identity /private/identity.json --assessments /private/assessment.jsonl --bank /private/question-bank.json --output state/career/passport-002
```

`--bank` and `--assessments` are required together. Wrong bank revisions, mismatched
candidate/capability context, duplicate attempts and inconsistent answers or
grades fail closed. Keep question keys and assessment histories private. This is
local consistency checking, not authentication of a supplied proctor or receipt.
Receiving owners must still establish identity and independent review.

Headline wording comes from evidence at the selected claim state. A verified
assessment cannot turn observed implementation into verified authorship. Draft
claim references, counts and dates describe compatible support only; contradictory
older passport summaries must be regenerated, not silently upgraded. The login
profile and the independently reviewed `libs.career_passport` import below remain
separate contracts. Importing a review does not replace an account's login profile.

`python -m libs.career_passport` uses only Python's standard library and existing
repository contracts. Run outputs are private: choose a new directory under
ignored `state/career/` or outside this repository. The CLI and application writer
refuse replacement, tracked-source destinations and symlinked parents. Never
commit raw work exports, application documents, answers or approval policies.

Capture the available committed source, with a deliberate workspace scope:

```bash
python -m libs.career_passport capture --repo . --workspace WORKSPACE_ID --output state/career/capture-001
```

This captures at most 30 commits by default (configurable to 100), 20 public
reports and the most recent 100 Type C memory events. Every artifact includes
the retained UTF-8 bytes, digest, source revision and observation time. A memory
slice also identifies the full original file's hash and total event count.
Report selection is a bounded path sample, not a claim to have found the newest
20 achievements. Missing ancestor trees produce a commit-metadata-only capture
with an explicit gap. All Git queries disable lazy fetching and use local data.
Uncommitted work and private Citadel history are not silently included.

The report capture's timestamp describes its repository version, not a new
deployment or the time the underlying work occurred. Original timestamps and
states remain in the retained source. Git authors, repository owners and email
addresses do not establish personal participation. BITS-authored reports stay
`AGENT_EXECUTED` observations.

At `/app/career`, an authenticated member can export the existing operator's
bounded, permission-filtered work snapshot. Bind it to the exact native account:

```bash
python -m libs.career_passport capture --repo . --workspace WORKSPACE_ID --workspace-export /private/career-workspace.json --account-id ACCOUNT_ID --output state/career/capture-002
```

Native identity is `cni://person/pocketbase/ACCOUNT_ID`; no alias mapping is
guessed. The source must be current within 15 minutes and match the selected
account and workspace. A native mission review can propose a `VERIFIED`
participation activity, but still needs career review. Agent assistance remains
unknown until reviewed. Mission ownership and a completed seat event alone do
not establish personal implementation.

Contributions use one of these roles:

| Participation | Application language |
|---|---|
| `PERSONALLY_IMPLEMENTED` | Personally implemented… |
| `PERSONALLY_OPERATED` | Personally operated… |
| `DESIGNED` | Designed… |
| `DIRECTED` | Directed implementation of… |
| `REVIEWED` | Reviewed… |
| `VERIFIED` | Verified the outcome of… |
| `TEAM_DELIVERED` | Contributed to team delivery of… |
| `AGENT_EXECUTED` | Remains attributed to the agent |

Every contribution binds its participant, producer, activity, capabilities,
scope, occurrence time, assistance status and exact artifact references. Its
content-addressed review subject changes when any of these changes. An
independent receiving verifier must inspect that evidence and establish checks
`career.identity`, `career.participation`, `career.capability` and `career.scope`.
The review is a Phase 0 `VerificationReceipt`; verifier identity and receipt
digests come from a separately authenticated `ReviewPolicy` owned by the
receiver. Never derive those pins from the submitted bundle itself.

The compiler checks the existing review policy, source coverage, decision,
recency, subject, producer and reviewer separation. An applicant cannot review
their own contribution; an evidence producer cannot independently review that
evidence. Missing, stale, changed, conflicting or foreign reviews remain gaps.
Re-exporting work does not renew review freshness. No imported `verified` flag
can replace the source-and-review projection.

## Public job discovery and requirement coverage

Supply a private JSON array of explicitly selected boards. Each entry has only
`provider` (`lever` or `ashby`), `board` (the employer's board identifier) and
`company` (its display name). Choose real boards and role/location preferences
before the live run; this slice does not invent an employer list or geographic
eligibility.

```bash
python -m libs.career_passport discover --boards /private/boards.json --target 100 --output state/career/jobs-001
```

Discovery performs bounded public posting GETs against the selected provider
endpoints. It attaches no application credentials, follows no redirects and
sends no candidate data. It retains raw response text, exact hashes and capture
times. Pagination and partial failures remain visible. It collects at most the
selected target across the boards; this is not an exhaustive market search or
a claim that the first 100 postings are suitable. Ashby unlisted rows are omitted.
Live network discovery was unavailable in the coding sandbox.

Compilation reparses the original captures, rather than trusting imported
normalized requirements. Headings, literal technology names, requested activity
and production scope form a small deterministic grammar. Unknown technologies,
proficiency/scale qualifiers, mixed activities and alternatives need review.
Original clauses remain visible. A general observability claim cannot satisfy
Datadog, Kafka cannot satisfy NATS, and generic cloud evidence cannot satisfy AWS.

Every dossier explains supported, partial, missing and unparsed requirements.
It keeps required, preferred, responsibility and unclassified text separate.
Hands-on requirements cannot be satisfied by direction or team delivery; review
work supports explicitly requested review. Matching uses a default two-year
work-recency window and only includes postings captured within seven days.
Those are explicit matching limits, not a universal career standard.

Employment duration, degrees/licenses and human attestations remain separate
from project capability. Years are not calculated from commit dates. Unsupported
clauses form the mandatory **DO NOT CLAIM** list. Ranking compares required
support and gaps with deterministic tie-breaking; there is no generic match
percentage or asserted qualification equivalence. Employer eligibility and
current live availability remain separate checks.

## Compile and inspect drafts

```bash
python -m libs.career_passport compile --work state/career/capture-002/work.json --jobs state/career/jobs-001/jobs.json --person cni://person/pocketbase/ACCOUNT_ID --workspace WORKSPACE_ID --review-policy /private/receiving-review-policy.json --output state/career/review-001
```

Omit `--jobs` or `--review-policy` to inspect the explicit gaps. An optional
`--display-name` is applicant-supplied; no name is inferred from Git. A compile
without independently verified personal claims creates zero application
packages. A draft can retain job gaps while including supported individual facts;
it does not claim that all job requirements are met. A role with no relevant
verified fact cannot receive a package.

The output contains `passport.json`, `dossiers.json`, `review.json`, a summary
and up to three `application-N/` directories. Each package has:

- `resume_variant.pdf` and `cover_letter.txt`, using verified contribution prose.
- `application_answers.json`, with personal attestations unset.
- `portfolio_manifest.json` and `evidence_manifest.json`, with claim-level
  artifact, source-revision and review references.
- `interview_brief.md`, with evidenced contributions and DO NOT CLAIM gaps.

`package.json` binds all six files by byte count and SHA-256. The deterministic
PDF supports Windows-1252 text with a PDF base font and multiple pages. Unsupported
glyphs produce an explicit renderer gap; names and claims are never silently
transliterated. A receiving Unicode-capable renderer needs a fresh package and
approval binding.

Import `review.json` at `/app/career` under the matching native identity and
workspace. The browser checks the export's canonical bytes, digest and display
consistency. A digest proves integrity only: all imported verification remains
reported by the file. The page exposes provenance, coverage and package hashes,
has no approve/submit control, and sends neither review data nor personal answers.
Access refresh, revocation, logout and workspace changes clear private imports.
Review the actual six documents in the private export before approving any use.

## One governed application and actual outcomes

J0 discover, J1 evaluate, J2 draft, J3 fill, J4 submit and J5 reserved answers are
workflow labels. They never replace A0–A3 authority. The `browser_plan` contract
binds the exact applicant, workspace, current job capture, package bytes, current
form, answers, approval stage and expiry. It returns a plan only. This source
change activates no browser executor, ATS submission API or encrypted answer
vault.

The receiving executor must have site permission and its own human A3 dispatch.
It must authenticate approval outside the package, show the exact application,
and obtain explicit applicant answers. Work authorization, clearance, criminal
history, salary/relocation commitments, contract acceptance, background-check
consent, disability, veteran status, demographics and binding attestations stay
human-reserved. The conservative first contract requires human-supplied answers
for all form fields. J3 approval cannot authorize J4. A changed form, answer,
posting or document invalidates approval. A CAPTCHA stops for human handling.

Before submitting, the receiver must atomically reserve the attempt in its
durable owner. Retained `submit_started`, `submit_unknown` or completed events
block blind resubmission. Empty caller history does not establish that no prior
attempt exists. Reconcile a timeout against the actual ATS instead of clicking
again. Public posting access does not grant application API access.

Track evidenced transitions with `OutcomeEvent` and separately authenticated
event pins. Mere JSON content cannot establish a submitted application or offer.

```bash
python -m libs.career_passport outcomes --events /private/outcomes.json --event-pins /private/receiving-event-pins.json --person cni://person/pocketbase/ACCOUNT_ID --workspace WORKSPACE_ID --output state/career/outcomes-001
```

The state machine retains submitted, response, interview and offer counts from
actual observations, separately from uncertain submissions. No illustrative
response rates or career metrics are seeded. The first real ATS receipt and
response remain receiving acceptance.

## Verify

```bash
python tests/upgrade/check_career_passport.py
python -m mypy --strict libs/career_passport
node --test tests/upgrade/career-passport.test.mjs
npm --prefix apps/web test
```

The portable coverage command runs synthetic attribution, feed, matching,
application, approval and outcome cases and requires 80 percent statement
coverage per implementation module. It does not measure branch coverage or
live ATS acceptance. The Node cases compile the actual Python format before
testing the scoped client. The rendered page cases require the locked frontend
dependencies. Native isolation and a permitted browser run remain necessary
before treating the product journey as accepted.
