// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/contentMedia.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     scripts/publish/media_corpus.py, apps/web/src/lib/businessPlanning.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES scripts/publish/media_corpus.py; CONSUMES apps/web/src/lib/businessPlanning.js
// Intent:      Import bounded media copy into the existing draft flow without importing account, review or publication authority.
// ───────────────────────────────────────────────────────────────

import { CONTENT_FORMATS } from './businessPlanning.js';

const MAX_BYTES = 64000;
const fields = {
    title: 200, audience: 300, brief: 2000, body: 5000,
    channel: 160, call_to_action: 400,
};
const metadata = ['schema', 'asset_id', 'source_digest', 'language', 'body_sha256', 'format'];

/** Validate imported copy and return only editable draft fields.
 * @param {string} raw A bounded compiler draft export.
 * @returns {Promise<object>} Unsaved local content fields, with no record identity or status.
 */
export async function parseMediaDraft(raw) {
    if (typeof raw !== 'string' || !raw.length || new TextEncoder().encode(raw).length > MAX_BYTES) {
        throw new Error('Select a media draft smaller than 64 KB.');
    }
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error('The selected file is not a JSON media draft.'); }
    if (!value || Array.isArray(value) || typeof value !== 'object' ||
        value.schema !== 'buildanddo.content-draft/v1' ||
        Object.keys(value).length !== metadata.length + Object.keys(fields).length ||
        Object.keys(value).some((key) => !metadata.includes(key) && !Object.hasOwn(fields, key))) {
        throw new Error('Use a content-draft/v1 export with no account, review or publication fields.');
    }
    if (!Object.hasOwn(CONTENT_FORMATS, value.format) || typeof value.language !== 'string' ||
        !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(value.language) ||
        ['asset_id', 'source_digest', 'body_sha256'].some((name) => typeof value[name] !== 'string' || !/^[a-f0-9]{64}$/.test(value[name]))) {
        throw new Error('The media draft has an invalid format or source binding.');
    }
    for (const [name, limit] of Object.entries(fields)) {
        if (typeof value[name] !== 'string' || value[name].length > limit ||
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value[name]) ||
            (['title', 'audience', 'brief', 'body'].includes(name) && !value[name].trim())) {
            throw new Error('The media draft exceeds the content editor limits or has missing copy.');
        }
    }
    if (!globalThis.crypto?.subtle) throw new Error('Import requires a secure browser context to check the draft.');
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.body));
    const actual = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== value.body_sha256) throw new Error('The draft body changed after export. Recompile or review a new export.');
    return { ...Object.fromEntries(Object.keys(fields).map((name) => [name, value[name]])), format: value.format, objective: '' };
}

/** Read one operator-selected file without calling a provider or saving a record.
 * @param {File} file Selected local draft.
 * @returns {Promise<object>} Validated editable copy.
 */
export async function readMediaDraft(file) {
    if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_BYTES || typeof file.text !== 'function') {
        throw new Error('Select a media draft smaller than 64 KB.');
    }
    return parseMediaDraft(await file.text());
}
