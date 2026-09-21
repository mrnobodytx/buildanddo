# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/development-loop.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/development.py, libs/evolution/development_sources.py, libs/evolution/intelligence.py, libs/evolution/review_packets.py, docs/verified-evolution.md, docs/capability-tokens.md, docs/submission-guide.md
# EnumType:    Doc
# EnumEdges:   CONSUMES libs/evolution/development.py; CONSUMES libs/evolution/development_sources.py; CONSUMES libs/evolution/intelligence.py; CONSUMES libs/evolution/review_packets.py; EXTENDS docs/verified-evolution.md; EXTENDS docs/capability-tokens.md; CONSUMES docs/submission-guide.md
# Intent:      Make development observations, proposed work and independent grading operable without confusing source tests with competence or competition acceptance.
# ───────────────────────────────────────────────────────────────

# Development feedback loop

The additive adapters reuse the evolution journal, deterministic compiler,
semantic graph, capability-token review policy and existing replay/promotion
gates. Run them with Python 3.11+ and the standard library. They do not activate
a private runtime, create remote issues, approve work, or deploy a candidate.

```text
Repository-authenticated GitHub observation
  → attributed information / sprint estimate
  → proposed SRS + dispatch + ActionProposal
  → frozen test-selection prediction
  → actual unittest process and retained failures
  → separately pinned independent outcome review
  → existing discovery / replay / shadow / PromotionProof gates
```

## Capture an actual development observation

The configured `gh` CLI supplies its existing session authentication. No new
token or credential is required by this adapter. Select the repository, exact
run, attempt and source SHA independently of the returned response:

```bash
python -m libs.evolution.development --scope buildanddo/public-development capture-run \
  --repository mrnobodytx/buildanddo --run-id RUN_ID --attempt 1 \
  --candidate FULL_CANDIDATE_SHA --output state/development-loop/run-capture.json
```

Only bounded, relative, read-only Actions API paths are allowed. A capture keeps
the exact response bytes locally and validates repository, attempt, source,
chronology and complete job inventory (at most 100 jobs). Replaying the capture
with `ingest-run` does not authenticate its origin again. The journal records
`OBSERVED`, A0 provider facts: success, failure and skipped workflow conclusions
never become test results, independent verification or deployment receipts.
Unavailable jobs remain an explicit observation gap. A new capture has its own
identity; re-importing the exact capture is idempotent.

Only GitHub Actions is connected here. Other exporters retain their private
receiving dispatch and authentication requirements. Full provider bodies and
journals stay in ignored operational storage; publish only reviewed summaries.

## Propose work and run a bounded experiment

Freeze the decision before tests. The current scope is Python source under
`libs/evolution`, `libs/capability_tokens`, `libs/semantic_twin` and their source
suites under `tests/upgrade`. Each file's actual bytes are captured separately
from Git HEAD. Static AST import relationships select transitive source suites;
dynamic imports, runtime providers and application/browser behavior are outside
that selection. A selection is a hypothesis about useful tests, not evidence
that the tests are sufficient.

```bash
python -m libs.evolution.development --scope buildanddo/public-development predict \
  --changed libs/evolution/development.py --mission YOUR_APPROVED_MISSION \
  --output state/development-loop/prediction.json

python -m libs.evolution.development --scope buildanddo/public-development mission-from-run \
  state/development-loop/prediction.json state/development-loop/run-capture.json \
  --repository mrnobodytx/buildanddo \
  --srs SRS-BUILDANDDO-YOUR-SCOPE-001 --dispatch VCC-BUILDANDDO-YOUR-SCOPE-001 \
  --builder cni://agent/builder --verifier cni://agent/independent-reviewer \
  --output state/development-loop/mission-packet

python -m libs.evolution.development --scope buildanddo/public-development test \
  state/development-loop/prediction.json --output state/development-loop/test-run.json
```

Replace the example identities with receiving seats. Packet identities are
proposals; their presence does not authenticate or assign a verifier. The
packet contains a proposed SRS, dispatch, registry entry, mission and canonical
graph. The receiving owner must register/dispatch work at its existing authority
before implementation. There is no branch, issue, registry or external-write
side effect. A2/A3 authority cannot be obtained by describing additive work.

The fixed local unittest driver records counts, failures, errors, skips,
expected failures, output, times and source integrity. Empty, skipped, timed-out
or source-drifted execution cannot pass. A failed run remains in the journal;
another attempt needs a fresh prediction. Output paths are never overwritten.
Process PASS still leaves grading `UNMEASURED`.

## Admit independently graded outcomes

An independent reviewer must inspect the actual change, the frozen prediction,
broader test evidence and the retained run. They supply `OutcomeLabels` for the
exact rule, including the tests that were actually needed. Copying the selected
test list into expected labels is not independent grading. Unknown subsystem,
failure, safety or deployment outcomes stay null. Process success alone cannot
establish selection recall, absence of regressions, or judge comprehension.

```bash
python -m libs.evolution.development --scope buildanddo/public-development prepare-review \
  state/development-loop/prediction.json state/development-loop/test-run.json \
  --labels state/development-loop/reviewer-labels.json \
  --output state/development-loop/review-request.json

python -m libs.evolution.development --scope buildanddo/public-development admit-review \
  state/development-loop/review-request.json \
  --receipt state/development-loop/verification-receipt.json \
  --review-policy state/development-loop/receiving-review-policy.json \
  --output state/development-loop/replay-case.json
```

The receiving runtime supplies the existing `ReviewPolicy` independently of the
producer's packet. Its trusted verifier and exact receipt digest pins must cover
the request subject/version, prediction ID, run ID and result event ID under the
`development_outcome` check. The review must follow the run and retain A1 scope.
Distinct identifier strings alone do not establish real-world independence;
authentication and pin distribution remain receiving responsibilities. Changed
labels, source bytes, log content or policy pins invalidate the review.

Accepted labels enter the existing `ReplayCase`. The adapter preserves the
current requirement for independently reviewed successful outcome episodes;
failed and incomplete runs remain observations until a separately measured
successful repair can qualify. It never sets `verified=True` or reduces
promotion thresholds. Default promotion requires two discovery successes,
ten disjoint replay cases and five shadow cases, measured quality/safety,
known source/schema/SBOM compatibility and independent TEVV/`PromotionProof`.
Teacher agreement cannot replace truth. See `docs/verified-evolution.md` and
`docs/capability-tokens.md` for the unchanged qualification and certification flow.

### Move actual evidence to the independent reviewer

`libs.evolution.review_packets` exports the frozen prediction, actual test run,
process log and every captured source file together. Export while the source
bytes still match the prediction. The packet refuses overwrites and stays
`UNMEASURED`, including when its process passed. Failed and held runs can also
be transported; they cannot qualify as successful outcomes.

```bash
python -m libs.evolution.review_packets export --root . \
  --prediction state/development-loop/prediction.json \
  --run state/development-loop/test-run.json \
  --output state/development-loop/reviewer-packet

python -m libs.evolution.review_packets inspect \
  state/development-loop/reviewer-packet/packet.json \
  --scope buildanddo/public-development
```

The receiving seat inspects source, the actual change and broader test evidence,
then authors the labels and exact `OutcomeReviewRequest` as above. Distribute
its trusted `ReviewPolicy` separately from the producer's packet. The receiver
can use a fresh scoped journal; the importer retains the original prediction
and process events before invoking the same existing admission gate:

```bash
python -m libs.evolution.review_packets admit \
  state/development-loop/reviewer-packet/packet.json \
  --scope buildanddo/public-development --state state/development-loop/receiver.sqlite \
  --labels state/development-loop/reviewer-labels.json \
  --receipt state/development-loop/verification-receipt.json \
  --review-policy state/development-loop/receiving-review-policy.json \
  --output state/development-loop/reviewed-case.json
```

Packet hashes establish byte consistency; the receiving identity and receipt
pins establish the review boundary. A producer cannot supply its own labels as
independent evidence. Re-importing an identical review is idempotent, and a
reviewed case alone does not promote a capability. Keep real discovery, replay
and shadow cases disjoint and retain the existing promotion proof requirements.

## Keep information useful and bounded

`IntelligenceSignal` retains publisher, origin, source locator/digest, timestamps,
scope and public/licensed/authorized acquisition basis. Source text stays inert
JSON. Stale, conflicting or instruction-like claims cannot produce a sprint
packet. Sources sharing a publisher, origin or exact bytes count as one group,
including transitive copy chains. These checks flag some bad inputs; they do not
prove source identity, detect every injection, or verify advertised benchmarks.
Competitor assertions remain attributed `UNMEASURED` claims.

`DevelopmentOpportunity` binds an existing `ActionProposal` to a hypothesis,
metric, optional baseline, target and acceptance criteria. Five owner-supplied
planning weights (25/20/20/20/15) and explicit estimates produce an exact rational
impact/confidence/evidence/effort/risk score. P0 starts at 5; P1 starts at 1.
Architecture work and estimates above 180 minutes are deferred; information
quality gaps and A3 proposals are held. Weights are not an owner-reviewed rules
capture, and priority is not a predicted judge score. Opportunity roles are
claim metadata over the existing semantic vocabulary, not new graph predicates.

## Source validation and real acceptance

```bash
python -m unittest discover -s tests/upgrade -p 'test_development*.py' -v
python -m mypy --strict --explicit-package-bases libs/evolution/development_sources.py libs/evolution/intelligence.py libs/evolution/development.py
python .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/verify.py
```

The retained dogfood uses an actual provider capture and actual local tests.
Its independent labels and real qualification remain unknown until the receiving
review exists. The full-ladder unit test uses explicitly synthetic identities,
teacher captures and receipts solely to check API composition.

Submission closure continues through the existing readiness and Day-21 tools.
The earlier `submissions/hostinger` candidate is historical. Required acceptance,
deployment/readback, authenticated browser journey, four Hostinger product
proofs, nonsynthetic replay, participant instructions and owner review must bind
the final selected candidate. A refreshed source lock or this adapter's passing
tests cannot establish `READY_FOR_OWNER_SUBMISSION`.
