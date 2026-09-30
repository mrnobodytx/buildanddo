// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/assistant-systems.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/workspace-administration.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/workspace-administration.js
// Intent:      Ground Buddi in dated workspace connection observations without transmitting integration configuration or private receipts to inference.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const administration = require(`${__hooks}/workspace-administration.js`);

/** Resolve the same supported inference binding for availability and execution. */
function inferenceBinding() {
    const url = $os.getenv('BUILDANDDO_ASSISTANT_URL') || '', model = $os.getenv('BUILDANDDO_ASSISTANT_MODEL') || '';
    if (!/^https:\/\/[a-z0-9.-]+(?::443)?\/[^\s?#@]*$/i.test(url) || !access.text(model, 120) || !model.trim()) return null;
    return { url, model: model.trim() };
}

/** Project only observations from the already-authorized workspace. */
function snapshot(app, workspace) {
    const result = { state: 'available', as_of: new Date().toISOString(), source: 'workspace_integrations',
        route: '/app/integrations', items: [] };
    try {
        access.schema(app, 'workspace_integrations', ['workspace', 'provider', 'desired_enabled', 'revision',
            'observed_state', 'observed_at', 'applied_revision', 'receipt_ref', 'check_requested_at']);
        const rows = app.findRecordsByFilter('workspace_integrations', 'workspace = {:workspace}', '', 100, 0, { workspace });
        if (rows.length >= 100) throw new Error('Integration observation bound exceeded.');
        result.items = Object.entries(access.PROVIDERS).map(([provider, metadata]) => {
            const matches = rows.filter((item) => item.getString('provider') === provider);
            if (matches.length > 1) throw new Error('Ambiguous integration observations.');
            const record = matches[0], observed = administration.observation(record);
            return { provider, label: metadata.label, citation: `integration:${provider}`,
                desired_enabled: record ? record.getBool('desired_enabled') : null,
                state: !record ? 'not_configured' : observed.current ? observed.state : observed.at ? 'stale' : 'unknown',
                observed_at: observed.at, current: observed.current, check_pending: observed.check_pending };
        });
    } catch (_) {
        result.state = 'unavailable'; result.items = [];
    }
    return result;
}

module.exports = { inferenceBinding, snapshot };
