// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/platform/platformData.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PLATFORM-001
// CAPS:        pending
// CK:          pending
// Dispatch:    USO-BUILDANDDO-PLATFORM-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-13
// Depends:     none
// EnumType:    Schema
// EnumEdges:   VALIDATES apps/web/src/components/platform/MetaFunctionDashboard.jsx;
//              VALIDATES apps/web/src/pages/PlatformPage.jsx
// Intent:      Keep the public capability preview consistent across every platform visual.
// ───────────────────────────────────────────────────────────────

export const PROVIDERS = [
    {
        id: 'datadog',
        name: 'Datadog',
        namespace: 'OBSERVE',
        color: '#7653a6',
        methodCount: 9,
        lastInvoked: '18 sec ago',
        status: 'healthy',
    },
    {
        id: 'gitlab',
        name: 'GitLab',
        namespace: 'SCM',
        color: '#a8642d',
        methodCount: 8,
        lastInvoked: '41 sec ago',
        status: 'healthy',
    },
    {
        id: 'posthog',
        name: 'PostHog',
        namespace: 'TELEMETRY',
        color: '#3b75a6',
        methodCount: 6,
        lastInvoked: '1 min ago',
        status: 'healthy',
    },
    {
        id: 'memory',
        name: 'Memory',
        namespace: 'MEMORY',
        color: '#3f7d64',
        methodCount: 3,
        lastInvoked: '2 min ago',
        status: 'healthy',
    },
    {
        id: 'dkg',
        name: 'DKG',
        namespace: 'VERIFY',
        color: '#a17b31',
        methodCount: 4,
        lastInvoked: '3 min ago',
        status: 'healthy',
    },
];

export const PROVIDER_HEALTH = PROVIDERS.filter((provider) => provider.id !== 'dkg');

export const NAMESPACES = [
    { id: 'OBSERVE', authority: 'A1', purpose: 'Read runtime and external state.', tone: 'violet' },
    { id: 'ANALYZE', authority: 'A1', purpose: 'Run deterministic local analysis.', tone: 'amber' },
    { id: 'TELEMETRY', authority: 'A2', purpose: 'Emit correlated metrics and events.', tone: 'blue' },
    { id: 'DISPATCH', authority: 'A2–A3', purpose: 'Create bounded, attributable work.', tone: 'amber' },
    { id: 'SCM', authority: 'A1–A3', purpose: 'Read or propose source-control changes.', tone: 'amber' },
    { id: 'EXECUTE', authority: 'A3+', purpose: 'Hold runtime mutation behind policy.', tone: 'violet' },
    { id: 'VERIFY', authority: 'A1', purpose: 'Evaluate postconditions and evidence.', tone: 'teal' },
    { id: 'PROMOTE', authority: 'A4+', purpose: 'Advance verified state deliberately.', tone: 'teal' },
    { id: 'REFLEX', authority: 'A1–A9', purpose: 'Enforce invariant-specific responses.', tone: 'violet' },
];

export const CAPABILITIES = [
    {
        id: 'OBSERVE.DATADOG.LOGS',
        provider: 'Datadog',
        authority: 'A1',
        mutation: 'Read',
        status: 'healthy',
    },
    {
        id: 'TELEMETRY.DATADOG.EVENT',
        provider: 'Datadog',
        authority: 'A2',
        mutation: 'Bounded write',
        status: 'healthy',
    },
    {
        id: 'SCM.GITLAB.PIPELINES',
        provider: 'GitLab',
        authority: 'A1',
        mutation: 'Read',
        status: 'healthy',
    },
    {
        id: 'SCM.GITLAB.CREATE_ISSUE',
        provider: 'GitLab',
        authority: 'A3',
        mutation: 'Policy write',
        status: 'gated',
    },
    {
        id: 'MEMORY.QUERY.PRECEDENT',
        provider: 'Memory',
        authority: 'A1',
        mutation: 'Read',
        status: 'healthy',
    },
    {
        id: 'TELEMETRY.POSTHOG.EVENT',
        provider: 'PostHog',
        authority: 'A2',
        mutation: 'Bounded write',
        status: 'healthy',
    },
    {
        id: 'VERIFY.DKG.CAUSAL_CHAIN',
        provider: 'DKG',
        authority: 'A1',
        mutation: 'Read',
        status: 'healthy',
    },
    {
        id: 'PROMOTE.EVIDENCE.TRUTH',
        provider: 'DKG',
        authority: 'A4',
        mutation: 'Held mutation',
        status: 'held',
    },
];

export const INVOCATIONS = [
    {
        requestId: 'CAP-29381',
        capabilityId: 'OBSERVE.DATADOG.LOGS',
        latencyMs: 184,
        state: 'PASS',
        occurredAt: '09:42:18',
    },
    {
        requestId: 'CAP-29380',
        capabilityId: 'SCM.GITLAB.PIPELINES',
        latencyMs: 91,
        state: 'PASS',
        occurredAt: '09:42:02',
    },
    {
        requestId: 'CAP-29379',
        capabilityId: 'MEMORY.QUERY.PRECEDENT',
        latencyMs: 238,
        state: 'EMPTY',
        occurredAt: '09:41:44',
    },
    {
        requestId: 'CAP-29378',
        capabilityId: 'TELEMETRY.POSTHOG.EVENT',
        latencyMs: 73,
        state: 'PASS',
        occurredAt: '09:41:27',
    },
    {
        requestId: 'CAP-29377',
        capabilityId: 'PROMOTE.EVIDENCE.TRUTH',
        latencyMs: 12,
        state: 'FAIL',
        occurredAt: '09:41:10',
    },
];

export const ARCHITECTURE_STAGES = [
    {
        number: '01',
        name: 'Registry',
        summary: 'Resolves a stable capability ID to one governed provider operation.',
        detail: 'The map is deterministic: authority, mutation class, provider and argument contract are known before execution. No model chooses the handler.',
        evidence: 'capability_id → provider.operation',
    },
    {
        number: '02',
        name: 'Executor',
        summary: 'Checks arguments, actor authority and mutation policy before invocation.',
        detail: 'Insufficient reads are denied and high-authority mutations are held. Provider credentials stay behind the adapter boundary.',
        evidence: 'actor A3 · required A1 · EXECUTED',
    },
    {
        number: '03',
        name: 'Normalizer',
        summary: 'Turns provider-specific responses into one explicit result contract.',
        detail: 'PASS, FAIL, EMPTY, UNREACHABLE and UNCONFIGURED are different states. An empty response is never silently presented as a failure.',
        evidence: 'raw result → truth_state: OBSERVED',
    },
    {
        number: '04',
        name: 'Receipt',
        summary: 'Correlates the outcome to its request, dispatch, trace and evidence.',
        detail: 'The append-only receipt makes retries, review and causal analysis possible without relying on a model-generated summary.',
        evidence: 'request_id · dispatch_id · evidence_ref',
    },
];
