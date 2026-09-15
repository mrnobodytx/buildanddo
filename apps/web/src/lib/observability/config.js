// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/config.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/lib/observability/context.js
// EnumType:    ConfigDoc
// EnumEdges:   DEPENDS_ON apps/web/src/lib/observability/context.js
// DAG Node:    none
// Intent:      Centralize browser sampling and the bounded workspace mutation action vocabulary.
// ───────────────────────────────────────────────────────────────

export const BROWSER_TELEMETRY = Object.freeze({
    site: 'us5.datadoghq.com',
    service: 'buildanddo-web',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,
    traceSampleRate: 20,
});

// Collection names are deliberately closed; record content never enters names.
export const WORKSPACE_ENTITIES = Object.freeze({
    missions: 'mission',
    workflows: 'workflow',
    signals: 'signal',
    services: 'service',
    operations: 'operation',
    operation_runs: 'operation_run',
    roadmap_items: 'roadmap_item',
    evidence: 'evidence',
    daily_editions: 'edition',
    editions: 'edition',
    domains: 'domain',
    tutorial_progress: 'tutorial_progress',
    support_sources: 'support_source',
    corrections: 'correction',
    erp_objectives: 'objective',
    erp_tasks: 'task',
    erp_contacts: 'contact',
    social_channels: 'social_channel',
    social_content: 'social_content',
});

export const MUTATION_ACTIONS = Object.freeze(
    Object.fromEntries(
        Object.entries(WORKSPACE_ENTITIES).map(([collection, entity]) => [
            collection,
            Object.freeze(
                Object.fromEntries(
                    ['create', 'update', 'delete'].map((verb) => [
                        verb,
                        `workspace.${entity}.${verb}`,
                    ]),
                ),
            ),
        ]),
    ),
);
