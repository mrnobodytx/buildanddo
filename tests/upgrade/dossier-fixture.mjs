// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/dossier-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     tests/upgrade/research-fixture.mjs, apps/pocketbase/pb_hooks/private-dossier.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/research-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/private-dossier.js
// DAG Node:    none
// Intent:      Exercise actual dossier handlers using explicit storage and native-crypto boundary doubles with no live identity or key material.
// ───────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { researchFixture, GUILD, CHANNEL, DISCORD } from './research-fixture.mjs';
import { plain } from './admin-fixture.mjs';
export const DOSSIER_SCHEMA = 'apps/pocketbase/pb_migrations/1790200000_private_dossiers.js';

export function dossierFixture() {
    // Synthetic fixture keys only. This adapter tests encrypted persistence and
    // tamper rejection, not PocketBase's native encryption format or implementation.
    const keys = { active: 'fixture1', keys: { fixture1: 'k'.repeat(32), fixture2: 'z'.repeat(32) } };
    const env = { keys: JSON.stringify(keys) }; const calls = [];
    const security = {
        randomString: (length) => randomBytes(length).toString('hex').slice(0, length),
        sha256: (value) => createHash('sha256').update(value).digest('hex'),
        encrypt(value, key) {
            const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), nonce);
            const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); calls.push('encrypt');
            return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
        },
        decrypt(value, key) {
            const bytes = Buffer.from(value, 'base64'); const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key), bytes.subarray(0, 12));
            cipher.setAuthTag(bytes.subarray(12, 28)); calls.push('decrypt');
            return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
        },
    };
    const f = researchFixture({ runtime: { $security: security, $os: { getenv: () => env.keys } } });
    f.migration(DOSSIER_SCHEMA).up(); const service = f.load('private-dossier.js'); const vault = f.load('dossier-vault.js');
    let count = 0; const save = f.app.save.bind(f.app);
    f.app.save = (row) => { if (f.app.fail && row.collection?.().name === f.app.fail) throw new Error('Fixture storage unavailable.'); save(row); };
    const body = (action, payload, revision = 0, key) => ({ action, payload, revision, request_key: key || `dossier_fixture_${String(++count).padStart(9, '0')}` });
    const command = (action, payload, { actor = 'editor', revision = 0, key } = {}) => plain(service.command(f.event(actor, body(action, payload, revision, key))));
    const read = (value = { action: 'recall', query: '', page: 1 }, actor = 'editor') => plain(service.read(f.event(actor, value)));
    const bridge = (command, { actor = 'bot', workspace = 'ws1', ...overrides } = {}) => plain(service.discord(f.event(actor, {
        discord_user_id: DISCORD, guild_id: GUILD, channel_id: CHANNEL, link_id: 'discordlink', command, ...overrides,
    }, { workspace })));
    const input = (values = {}) => ({ label: 'Library project', kind: 'project', aliases: ['Reading room'], tags: ['planning'],
        note: 'Confirm the reading room opening hours.', source_url: 'https://buildanddo.tech/docs', source_label: 'My source', ...values });
    return { ...f, get data() { return f.data; }, service, vault, security, keys, privateEnv: env, calls, body, command, read, bridge, input,
        create: (values = {}, options) => command('entity.create', input(values), options) };
}
