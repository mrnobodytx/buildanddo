// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/dossier-vault.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/1790200000_private_dossiers.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790200000_private_dossiers.js
// DAG Node:    none
// Intent:      Encrypt private content with native authenticated encryption and reject missing keys, ciphertext substitution and schema drift.
// ───────────────────────────────────────────────────────────────

const unavailable = () => { throw new ApiError(503, 'Private dossier storage is unavailable. Ask the operator to check its schema and encryption binding.'); };
function keyring() {
    try {
        const value = JSON.parse($os.getenv('BUILDANDDO_DOSSIER_KEYS') || 'null');
        if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'active,keys' ||
            typeof value.active !== 'string' || !value.keys || typeof value.keys !== 'object' || Array.isArray(value.keys)) return unavailable();
        const ids = Object.keys(value.keys);
        if (!ids.length || ids.length > 8 || !ids.includes(value.active) || !ids.every((id) => /^[a-zA-Z0-9_-]{1,32}$/.test(id) &&
            typeof value.keys[id] === 'string' && /^[\x21-\x7e]{32}$/.test(value.keys[id]))) return unavailable();
        return value;
    } catch { return unavailable(); }
}
function schema(app) {
    try {
        for (const name of ['user_dossiers', 'dossier_entities', 'dossier_events']) {
            const collection = app.findCollectionByNameOrId(name);
            const fields = ['owner', 'sealed', 'key_id', 'revision', name === 'user_dossiers' ? 'protocol_version' : 'dossier'];
            if (!fields.every((field) => collection.fields.getByName(field)) ||
                !['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].every((rule) => collection[rule] === null)) return unavailable();
        }
    } catch { return unavailable(); }
}
function identity(record) {
    return { collection: record.collection().name, id: record.id, owner: record.getString('owner'),
        dossier: record.getString('dossier'), revision: Number(record.get('revision')) };
}
function seal(record, value, keys) {
    try {
        const envelope = JSON.stringify({ schema: 1, ...identity(record), value });
        if (envelope.length > 48000) throw new Error('Content exceeds the storage bound.');
        record.set('key_id', keys.active);
        record.set('sealed', $security.encrypt(envelope, keys.keys[keys.active]));
    } catch { return unavailable(); }
}
function open(record, keys) {
    try {
        const keyId = record.getString('key_id');
        if (!Object.prototype.hasOwnProperty.call(keys.keys, keyId)) return unavailable();
        const raw = $security.decrypt(record.getString('sealed'), keys.keys[keyId]);
        if (raw.length > 48000) return unavailable();
        const decoded = JSON.parse(raw); const expected = identity(record);
        if (decoded?.schema !== 1 || !Object.keys(expected).every((key) => decoded[key] === expected[key]) ||
            !decoded.value || typeof decoded.value !== 'object' || Array.isArray(decoded.value)) return unavailable();
        return decoded.value;
    } catch { return unavailable(); }
}

module.exports = { keyring, schema, seal, open, unavailable };
