// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/research-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/mission-research.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/mission-research.js
// DAG Node:    none
// Intent:      Exercise research source contracts with registered identities and transactional storage while retaining native acceptance as a separate gate.
// ───────────────────────────────────────────────────────────────

import { fixture, plain } from './admin-fixture.mjs';
export const SCHEMA = 'apps/pocketbase/pb_migrations/1790100000_mission_research.js';
export const GUILD = '12345678901234567';
export const CHANNEL = '23456789012345678';
export const DISCORD = '34567890123456789';
export function researchFixture({ runtime = {} } = {}) {
    const registered = [{ workspace: 'ws1', bot_user: 'bot', worker_user: 'worker', guild_id: GUILD, channel_id: CHANNEL,
        binding: 'research', capabilities: ['search', 'url', 'document', 'audio', 'video'] }];
    const env = { value: JSON.stringify(registered) };
    const f = fixture({ runtime: { ...runtime, $dbx: { hashExp: (value) => plain(value) },
        $os: { getenv: (name) => name === 'BUILDANDDO_RESEARCH_BINDINGS' ? env.value : runtime.$os?.getenv(name) || '' } } });
    f.migration(SCHEMA).up();
    for (const id of ['bot', 'worker', 'worker2']) f.seed('users', { id });
    const Collection = f.collections.users.constructor;
    f.app.save(new Collection({ name: '_externalAuths', type: 'base', fields: [] }));
    f.seed('_externalAuths', { id: 'discordlink', provider: 'discord', providerId: DISCORD, collectionRef: f.collections.users.id, recordRef: 'editor' });
    // Native PocketBase OAuth links are ExternalAuth models, not record collections.
    // The array above remains fixture storage; expose the model query separately.
    f.app.findFirstExternalAuthByExpr = (expression) => {
        const rows = f.data._externalAuths.filter((row) => Object.entries(expression).every(([key, value]) => row[key] === value));
        if (rows.length !== 1) throw new Error('sql: no rows in result set');
        return plain(rows[0]);
    };
    f.seed('missions', { id: 'mission1', workspace: 'ws1', owner: 'owner', title: 'Research appointments', status: 'running' });
    f.seed('missions', { id: 'mission2', workspace: 'ws2', owner: 'otherowner', title: 'Other work', status: 'running' });
    f.command('integration.save', { provider: 'firecrawl', enabled: true, configuration: { binding: 'research', mode: 'read' } });
    f.command('integration.save', { provider: 'discord', enabled: true, configuration: { guild_id: GUILD, channel_id: CHANNEL, mode: 'read' } });
    const service = f.load('mission-research.js'); const policy = f.load('research-policy.js');
    let n = 0;
    const body = (action, payload, revision = 0, key) => ({ action, payload, revision, request_key: key || 'research_test_' + String(++n).padStart(5, '0') });
    const command = (action, payload, { actor = 'editor', revision = 0, key, workspace = 'ws1' } = {}) =>
        plain(service.command(f.event(actor, body(action, payload, revision, key), { workspace })));
    const work = (action, payload, { actor = 'worker', revision = 1, key } = {}) => plain(service.work(f.event(actor, body(action, payload, revision, key))));
    const bridge = (command, overrides = {}) => plain(service.discordCommand(f.event(overrides.actor || 'bot', {
        discord_user_id: DISCORD, guild_id: GUILD, channel_id: CHANNEL, link_id: 'discordlink', command, ...overrides.body,
    }, { workspace: overrides.workspace || 'ws1' })));
    const input = (overrides = {}) => ({ mission: 'mission1', title: 'Appointment source', context: 'Understand missed bookings',
        kind: 'search', input: 'appointment reminders evidence', upload: '', ...overrides });
    const submit = (overrides = {}, options) => command('submit', input(overrides), options);
    const result = { text: 'The observed page describes appointment reminders.', citations: [{ title: 'Source', url: 'https://buildanddo.com/docs' }],
        processor: 'firecrawl', version: 'v1', input_sha256: 'a'.repeat(64), truncated: false };
    return { ...f, get data() { return f.data; }, env, registered, service, policy, body, command, work, bridge, input, submit, result };
}
