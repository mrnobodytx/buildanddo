// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/missionReplay.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/pocketbase/pb_hooks/workspace-replay.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-replay.js
// Intent:      Revalidate bounded mission capture identities and content digests before exposing an export.
// ───────────────────────────────────────────────────────────────

/** Serialize JSON with sorted object keys and unchanged array order.
 * @param {unknown} value JSON data.
 * @returns {string} Canonical JSON.
 */
export function canonicalReplay(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalReplay).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalReplay(value[key])}`).join(',')}}`;
    throw new Error('Capture contains a non-JSON value.');
}
async function digest(value) {
    const result = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalReplay(value)));
    return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Verify content hashes and every record's identity before a local download.
 * @param {object} value Native capture response.
 * @param {string} workspace Expected workspace.
 * @param {string} mission Expected mission.
 * @returns {Promise<object>} The validated recorded capture.
 */
export async function validateMissionReplay(value, workspace, mission) {
    const content = value?.content;
    if (value?.schema_version !== 'buildanddo.mission-replay/v1' || value.workspace !== workspace || value.capture_complete !== true ||
        value.evidence_state !== 'recorded' || value.independent_verification !== 'not_conferred_by_export' ||
        !content || content.mission?.id !== mission || content.mission.workspace !== workspace ||
        Object.keys(content).sort().join(',') !== 'evidence,jobs,mission,runs,tasks' || !Number.isFinite(Date.parse(value.captured_at)) ||
        !['consistent', 'HOLD'].includes(value.integrity) || !Array.isArray(value.integrity_issues) ||
        value.integrity === 'consistent' && value.integrity_issues.length || !Array.isArray(value.leaves)) throw new Error('The complete mission capture is unavailable.');
    const groups = { mission: [content.mission] };
    for (const kind of ['runs', 'jobs', 'evidence', 'tasks']) {
        const records = content[kind];
        if (!Array.isArray(records) || records.length > 200 || records.some((row) => !row?.id || row.workspace !== workspace || row.mission !== mission) ||
            new Set(records.map((row) => row.id)).size !== records.length) throw new Error('The capture contains missing, duplicate or foreign records.');
        groups[kind] = records;
    }
    const serialized = canonicalReplay(content);
    if (serialized.length > 2_000_000 || 'content_canonical' in value && value.content_canonical !== serialized ||
        await digest(content) !== value.content_sha256) throw new Error('The captured content digest does not match.');
    const expected = Object.entries(groups).flatMap(([kind, rows]) => rows.map((row) => ({ kind, row })));
    if (value.leaves.length !== expected.length) throw new Error('The capture leaf inventory is incomplete.');
    for (const { kind, row } of expected) {
        const leaves = value.leaves.filter((leaf) => leaf.kind === kind && leaf.id === row.id);
        if (leaves.length !== 1 || 'canonical' in leaves[0] && leaves[0].canonical !== canonicalReplay(row) ||
            leaves[0].sha256 !== await digest(row)) throw new Error('A captured record digest does not match.');
    }
    return value;
}
