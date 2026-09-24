# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/capability-tokens.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/models.py, libs/capability_tokens/cli.py
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/cli.py
# Intent:      Document the portable protocol, executable boundaries and evidence needed for runtime acceptance.
# ───────────────────────────────────────────────────────────────

# CNWB Capability Token Protocol v1

The protocol turns a portable implementation into an immutable contract with
measured conformance, independent certification, dependency resolution, a
passport and attributable economics. It extends the existing semantic twin and
evolution fabric. Its action result is the existing ActionProposal.

A capability token is a contract, not an authentication credential. Competence
can improve without increasing authority. Installation, publication, a passing
test, a price or a high success rate confers no execution permission.

## Implemented surfaces

| Surface | Local behavior |
|---|---|
| Specification | Strict canonical contracts, closed typed variables, exact resources and implementation bindings |
| Conformance | Finite positive/negative/security/compatibility/compensation probes, existing evolution replay, independent typed TEVV |
| Federation | Captured namespace indexes with independently supplied content pins, generation chains, immutable versions, dependency closures and revocation |
| Invocation/composition | Same-authority ActionProposal or typed dependency plan; existing DRAFT transaction bridge |
| Passport | Deduplicated receiver observations, independently reviewed outcomes, measured cost/latency, confidence denominator and evidence root |
| Collective learning | Private episode provenance and separately reviewed closed-vocabulary public hypotheses |
| Economics | Conserved integer royalty accrual estimates, reviewed refunds, attributable costs and explicit unknown actual revenue |
| Interoperability | Inert Agent Skills directory/ZIP import/export and captured MCP skill indexes/tool descriptors |

No command loads imported Python, runs a skill script, fetches an MCP resource,
calls a model, authorizes a business effect, signs a receipt or transfers funds.
Receiving integrations are specified in the capability-runtime handoff.

## Identity and contract

CapabilityToken has schema_version=cnwb.capability-token/v1. The strict Python
constructor/from_json is authoritative for semantic constraints; JSON Schema is
available for structural integration:

    ./scripts/cnwb token schema --output /tmp/capability-schema.json

A manifest contains:

- Publisher-qualified cni://capability/<publisher>/<name> identity and a stable
  semantic version, name, description, category, risk and supported skills.
- Inputs and outputs using the closed ValueSchema profile. Variables can be
  strings, integers, finite numbers, booleans, null, arrays or nested objects.
  Unknown properties and unsupported schema keywords fail. Required fields,
  enums, length/numeric bounds and public/tenant_private/secret classification
  are enforced. Scalar variables bind to the current graph-rule language.
- Explicit authority tier, allowed operations/tools and forbidden side effects.
- Exact dependency pins, applicability text, supported implementation environments,
  source revision, optional SBOM digest and compensation contract.
- Independently certifiable alternatives: graph_rule, agent_skill or mcp_tool.
  Every entry point/resource carries its exact UTF-8 byte count and SHA-256.
- Evidence policy/version, conformance lifetime and existing evolution replay
  thresholds. The mandatory certification checks cannot be removed by a manifest.
- Composition size limit, creator attribution, integer price per verified result,
  currency, royalty basis points, license and typed learning lineage.

Version syntax is major.minor.patch with no ranges, tags or prerelease aliases.
TokenPin combines identity, version and manifest digest. Resolve converts a name
to that immutable pin. An advertised version cannot be rewritten, even after
revocation. Publish a higher version to change code or contract.

ImplementationBinding hashes the entire token pin and the exact implementation
descriptor. A different source/SBOM/environment, resource, alternative, rollback
program or contract gets a different binding. Old certificates and measurements
cannot be applied to it. Descriptive applicability is not an executable policy:
the executable boundaries are authority, risk, operations, tools, scope, exact
graph/source/SBOM context, environments and schemas.

Canonical contract hashing reuses libs/evolution/common.py and Phase 0.
Artifact hashes cover raw bytes. Local registry history forms a hash chain, not a
signature or tamper-proof external audit anchor.

## Package ordinary skills

import-skill accepts an existing directory or ZIP and produces an uncertified
SkillPackage. Scripts and resources are retained as text and never executed.
Paths, symlinks, encrypted ZIPs, duplicate members and size limits are checked.

    ./scripts/cnwb token import-skill ./reviewed-skill --output /tmp/skill.json
    ./scripts/cnwb token pack-skill /tmp/skill.json \
      --contract /tmp/authored-contract.json --implementation agent-v1 \
      --output /tmp/token-bundle.json
    ./scripts/cnwb token inspect /tmp/token-bundle.json

Author the contract explicitly using CapabilityToken or its schema. pack-skill
requires one declared agent_skill alternative with entrypoint SKILL.md; it
replaces resource descriptors with measured paths/digests. It never infers the
required authority, schemas, license or price from instructions.

The Agent Skills adapter supports name/description and scalar YAML metadata,
including quoted and folded/literal descriptions. Nested YAML metadata, binary
resources and unsupported YAML syntax fail explicitly. It is a bounded import
profile, not a general YAML parser or a promise of every vendor extension.

    ./scripts/cnwb token export-skill /tmp/token-bundle.json \
      --implementation agent-v1 --output /tmp/skill.zip
    ./scripts/cnwb token mcp /tmp/token-bundle.json \
      --implementation agent-v1 --output /tmp/proposal-tool.json

Native Agent Skills round-trip their original resources. A graph/MCP token
exports an instruction wrapper plus its contract; that wrapper carries neither
certification nor an executor. The MCP descriptor describes a receiving proposal
tool with typed variables and DecisionInput. It is not a hosted tool server.

import-mcp consumes captured tool descriptors using the bounded closed
inputSchema/outputSchema profile. skill-index emits a captured
{skills: [{name, description, uri}]} profile and inline skill:// resources;
import-skill-index resolves only supplied resources and checks matching metadata.
The index transports SKILL.md instructions; accompanying archives must be
captured separately. Compatibility concerns the shared formats, not installed
OpenAI/Claude/Microsoft accounts, remote discovery or authentication.

## Conformance and independent certification

ConformanceSuite keeps private inputs outside the portable bundle. Five probe
categories exercise finite proposals: positive, negative, security, rollback and
compatibility. The rollback probe tests a separately bound compensation program.
These source tests cannot establish that an external side effect was reversed.

The sixth evidence input is the existing EvaluationReport in REPLAY mode. Its
candidate, rule, authority, scope and compatibility must match the program.
Existing holdout guards reject discovery identity/source/correlation leakage and
recompute predictions from retained cases. Existing promotion thresholds require
actual reviewed labels, measured safety and adequate precision/recall/action/test
selection. Teacher agreement cannot substitute for these outcomes.

    ./scripts/cnwb token certify /tmp/bundle.json --suite /tmp/private-suite.json \
      --checked-at <UTC-time> --output /tmp/conformance.json

Exit 2 means HOLD; failed conformance and malformed inputs return 1. A local
all-PASS report still returns HOLD until independent TEVV exists.
Opaque Agent Skill/MCP implementations remain HOLD because this package cannot
safely execute their external runners.

For those alternatives, an authenticated receiving runner can capture the same
ConformanceReport and PromotionProof after actually running all required checks.
accept-certificate retains that exact Certification under a separately supplied
ReviewPolicy. It validates the typed proof, check coverage, artifact binding and
freshness; it does not claim to rerun external effects.

The report includes its exact subject and report_id for the receiving verifier.
The independent PromotionProof must cover token.schema, token.positive,
token.negative, token.replay, token.security, token.rollback,
token.compatibility and token.tevv. Each check cites the exact report artifact.
The proof uses the existing VerificationReceipt and TEVV types. There is no
verified boolean and no local certification shortcut.

ReviewPolicy is separate from the imported token. It supplies the expected policy
identity/version, allowed verifier IDs and exact receipt digests authenticated
by the receiving process. An imported claimed name cannot populate this trust
policy. Hashes and pinned JSON do not authenticate real-world identities.

    ./scripts/cnwb --scope <tenant/workspace> token certify /tmp/bundle.json \
      --suite /tmp/private-suite.json --checked-at <original-UTC-time> \
      --proof /tmp/reviewed-proof.json --policy /tmp/receiving-trust.json \
      --register --output /tmp/certificate.json

The bundle must already be in the local registry for --register. The command
recomputes the exact report before accepting the proof. Invocation rechecks
certificate time, implementation binding, all transitive dependencies and current
trust. Registry state must have existed at the decision time; later installation
cannot retroactively qualify an earlier proposal.

## Local federation, use and revocation

The default journal is ignored state/cnwb/registry.sqlite. Every operation that
uses it requires an explicit scope. Another scope cannot open that journal.

FederatedIndex carries publisher, generation, previous canonical digest, capture
time, bundles, certificates, reviewed public passports and revocations. Generation
1 has no predecessor. Every following generation must advance by one and bind its
predecessor. Revocations accumulate and published passport history is retained.

    ./scripts/cnwb --scope <tenant/workspace> token import-registry /tmp/index.json \
      --publisher citadel --digest <independently-obtained-canonical-digest>
    ./scripts/cnwb --scope <tenant/workspace> token search imports
    ./scripts/cnwb --scope <tenant/workspace> token resolve \
      cni://capability/citadel/import-repair --output /tmp/pin.json
    ./scripts/cnwb --scope <tenant/workspace> token install /tmp/pin.json
    ./scripts/cnwb --scope <tenant/workspace> token invoke /tmp/pin.json \
      --implementation graph-v1 --inputs /tmp/variables.json \
      --observation /tmp/decision-input.json --environment <declared-environment> \
      --policy /tmp/receiving-trust.json --output /tmp/proposal.json

Imports verify the independently supplied canonical digest and publisher.
Transport, publisher identity authentication and distribution remain receiving
concerns. All dependency references are pinned. Installation resolves one atomic
closure; conflicting installed dependency versions, missing content, cycles and
revoked versions fail. Dependencies need current certification for use.

Update explicitly names both the new pin and the previous installed pin; it must
advance the version without changing authority requirements. Conflicting
dependency updates need their own explicit operation. Existing measurements and
certificates remain under the old binding.

    ./scripts/cnwb --scope <tenant/workspace> token update /tmp/new-pin.json \
      --previous /tmp/pin.json
    ./scripts/cnwb --scope <tenant/workspace> token revoke /tmp/pin.json \
      --reason "Independent verification found a regression."

Registry revocation is terminal for that version. It also prevents dependent
capabilities from use. History and prior measurements remain inspectable. The
existing evolution registry retains WATCH/SHADOW/DISABLED competence transitions;
these do not confer distribution or execution authority.

compose reads pinned CompositionStep records and emits a topological plan.
Every step retains the same requested authority. Port schemas must match
conservatively, output fields must be required, private data cannot flow into
public inputs, and required inputs need one producer, external variable or
constant. No step runs during composition.

conformance.draft_transaction binds an ActionProposal to token tools, forbidden
side effects and compensation before calling the existing DRAFT transaction API.
The receiving path still performs AAXP, policy, authority, adapter execution and
independent verification. Source/context compatibility cannot be silently rebound
to another tenant or deployment; reuse a reviewed public pattern to create and
certify the appropriate new scoped implementation.

## Passports, sharing and economics

meter accepts captured MeteredCall records, never proposal logs as executions.
It rejects foreign scopes, changed implementations/source/SBOM/environments,
conflicting retry identities, currency mismatches and future results. Repeated
captures are deduplicated; an independently pinned review can arrive later.
A reviewed failure counts as a reviewed outcome, not a successful result.

passport exposes calls, reported/verified successes, reviewed denominators,
failure classes, independently tested environments, observed cost count, mean
latency, verifier identities, Wilson 95% success interval and an exact evidence
root. With no reviewed outcomes its success rate is null. Missing costs remain
unknown. Historical valid outcome reviews are checked at their actual review
time; changing a current implementation cannot inherit that history.

publish-passport requires separate A3 publication/privacy/measurement review with
an explicit human grant. Its portable projection includes aggregates and the
review digest, without raw calls or tenant scope. Federation retains each
publication alongside its exact version; capturing a published claim is separate
from authenticating its issuer.

prepare-sharing retains verified private episode IDs/root and scope in a local
SharingDraft. export-sharing requires independently pinned A3 consent, privacy
and generalization checks for that exact draft and a still-valid human grant.
Only a closed public pattern vocabulary and the review digest leave the private
packet. No examples, free text, tenant IDs or evidence bodies are copied.
The result remains HYPOTHESIS, with public lineage for new candidate discovery.
It cannot certify a capability or prove generalization automatically.

settle computes an accrual estimate from independently verified successful calls.
It uses integer minor currency units, retains independently reviewed refunds and
rejects duplicate/conflicting adjustments or refunds beyond earned amounts.
Creator shares are floor(net * basis_points / 10000); remainder stays with the
operator so every unit is conserved. It reports observed/complete costs,
cost per verified result and estimated contribution/operator profit. Unmeasured
costs leave profit unknown. actual_revenue_minor is always null: no payment
provider, funds movement, ledger write or monetary receipt has occurred.

## Validation and receiving work

    python -m unittest discover -s tests/upgrade -p 'test_capability_token*.py' -v
    python -m mypy --strict libs/capability_tokens
    python -m ruff check libs/capability_tokens tests/upgrade/test_capability_token*.py

The dispatch report retains source fingerprints, coverage, negative regressions,
local CLI evidence and the unchanged operational boundary. The complete
certification/publication/payment happy paths in tests use explicitly synthetic
receipts. A real local release-source example remains HOLD until independent
holdout and TEVV evidence arrive. Prior evolution benchmark accuracy and actual
sprint deployment/submission acceptance are not changed by this protocol.
