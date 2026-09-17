// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/blueprintAnalysis.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/decision.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/decision.pb.js
// DAG Node:    none
// Intent:      Submit untrusted PDF data for scoped analysis and export human-review mission drafts.
// ───────────────────────────────────────────────────────────────

const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

/** Bind PDF analysis to one authenticated workspace and ignore stale responses.
 * @param {object} options PocketBase client and current account/workspace scope.
 * @returns {object} One explicit CPU analysis operation.
 */
export function createBlueprintAnalysisClient({ client, accountId, workspaceId, demo = false, isCurrent }) {
    const current = () => !demo && identifier(accountId) && identifier(workspaceId)
        && client.authStore.record?.id === accountId && isCurrent();
    let busy = false;
    return {
        async analyze(file, includePrompts = false) {
            if (!current()) return { ok: false, reason: 'scope_changed' };
            if (busy) return { ok: false, error: 'An analysis is already running.' };
            if (!file || typeof file.name !== 'string' || !file.name.toLowerCase().endsWith('.pdf')
                || file.name.length > 180 || file.size <= 0 || file.size > 20 * 1024 * 1024)
                return { ok: false, error: 'Choose a PDF up to 20 MiB.' };
            busy = true;
            try {
                const bytes = new Uint8Array(await file.arrayBuffer());
                if (!current()) return { ok: false, reason: 'scope_changed' };
                if (bytes.length !== file.size) return { ok: false, error: 'The PDF could not be read completely.' };
                let binary = '';
                for (let offset = 0; offset < bytes.length; offset += 8192)
                    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
                const data = await client.send('/api/buildanddo/workspaces/' + encodeURIComponent(workspaceId) + '/blueprints/analyze', {
                    method: 'POST', body: { name: file.name, pdf_base64: btoa(binary), authority: 'A0', include_prompts: includePrompts },
                    requestKey: null, cache: 'no-store',
                });
                if (!current()) return { ok: false, reason: 'scope_changed' };
                if (data?.workspace !== workspaceId || data.authority !== 'A0' || data.verified !== false
                    || data.blueprint?.verified !== false || data.blueprint.authority !== 'A0'
                    || !Array.isArray(data.blueprint.scan?.pages) || !Array.isArray(data.blueprint.parsed?.requirements)
                    || !['headings', 'table_regions', 'list_items'].every((key) => Array.isArray(data.blueprint.scan[key]))
                    || !Array.isArray(data.blueprint.parsed?.sections) || !Array.isArray(data.blueprint.parsed?.tables)
                    || !['cross_references', 'acronyms', 'open_items'].every((key) => Array.isArray(data.blueprint.parsed[key]))
                    || data.blueprint.parsed.requirements.some((req) => !Number.isFinite(req.confidence)
                        || req.confidence < 0 || req.confidence > 1 || !req.source || !Array.isArray(req.confidence_reasons))
                    || !data.blueprint.assessment?.counts
                    || !['warnings', 'sections_without_requirements', 'duplicate_requirements'].every((key) => Array.isArray(data.blueprint.assessment[key]))
                    || !Array.isArray(data.component_graph?.components) || !Array.isArray(data.component_graph.warnings)
                    || data.component_graph.verified !== false || data.component_graph.authority !== 'A0'
                    || !Array.isArray(data.session_prompts)
                    || (data.mission_plan && (data.mission_plan.verified !== false || data.mission_plan.authority !== 'A0'
                        || !Array.isArray(data.mission_plan.challenges)))
                    || data.session_prompts.some((prompt) => prompt.authority !== 'A0' || prompt.verified !== false || prompt.review_required !== true))
                    return { ok: false, error: 'The analysis response is incomplete. Retry or contact the workspace operator.' };
                return { ok: true, data };
            } catch (_) {
                return current() ? { ok: false, error: 'Analysis is unavailable. Check the PDF and retry. The workspace operator may need to enable the analysis service.' }
                    : { ok: false, reason: 'scope_changed' };
            } finally { busy = false; }
        },
    };
}

/** Download a review-only mission plan as JSON.
 * @param {object} plan An unverified A0 mission draft.
 * @returns {void}
 */
export function exportMissionPlan(plan) {
    if (!plan || plan.authority !== 'A0' || plan.verified !== false) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'blueprint-mission-plan.json';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
