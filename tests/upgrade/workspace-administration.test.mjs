// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workspace-administration.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/workspace-administration.js, apps/pocketbase/pb_hooks/workspace-record-policy.js, apps/pocketbase/pb_hooks/administration.pb.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-administration.js; VALIDATES apps/pocketbase/pb_hooks/workspace-record-policy.js; VALIDATES apps/pocketbase/pb_hooks/administration.pb.js
// DAG Node:    none
// Intent:      Verify real admin commands against privilege escalation, native bypass, revoked membership, stale writes and uncertain integration state.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fixture, plain, source, RBAC, ADMIN_SCHEMA } from './admin-fixture.mjs';

const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);
const config = (provider = 'discord', enabled = true) => ({ provider, enabled,
    configuration: provider === 'discord' ? { mode: 'read', guild_id: '12345678901234567', channel_id: '23456789012345678' } :
        provider === 'reddit' ? { mode: 'reviewed_publish', subreddit: 'buildanddo' } : { mode: provider === 'n8n' ? 'reviewed_run' : 'telemetry', binding: 'buildanddo-test' } });

test('workspace access uses current bound membership, distinguishes the canonical owner, and fails closed', () => {
    const f = fixture(); const access = f.load('workspace-access.js');
    for (const role of ['owner', 'admin', 'editor', 'viewer']) {
        const result = access.access(f.event(role)); assert.equal(result.role, role);
        assert.equal(result.can_admin, ['owner', 'admin'].includes(role)); assert.equal(result.can_grant_admin, role === 'owner');
    }
    assert.equal(access.access(f.event('legacyowner')).role, 'admin');
    denied(() => access.access(f.event('outsider'))); denied(() => access.access(f.event(null)));
    f.config.foreignMember = true; denied(() => access.access(f.event('editor'))); f.config.foreignMember = false;
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember')); denied(() => access.access(f.event('editor')));
    f.migration(ADMIN_SCHEMA).down(); denied(() => access.access(f.event()), 503);
});

test('only administrators save settings and every saved profile has an attributed audit receipt', () => {
    const f = fixture(); const admin = f.load('workspace-administration.js');
    const value = { name: 'Operations', description: 'Working team', wiki_enabled: true, forum_enabled: true, forum_moderation: true };
    for (const actor of ['editor', 'viewer', 'outsider']) denied(() => f.command('settings.save', value, { actor }));
    const result = f.command('settings.save', value, { actor: 'admin' });
    assert.equal(result.revision, 1); assert.equal(f.data.workspaces[0].name, 'Operations');
    assert.equal(f.data.workspace_admin_events[0].actor, 'admin'); assert.equal(f.data.workspace_admin_events[0].revision, 1);
    assert.deepEqual(plain(admin.snapshot(f.event()).settings),
        { description: 'Working team', wiki_enabled: true, forum_enabled: true, forum_moderation: true, revision: 1 });
    for (const payload of [{ ...value, owner: 'admin' }, { ...value, wiki_enabled: 'yes' }, { ...value, name: '' }, { ...value, description: 'x'.repeat(801) }])
        denied(() => f.command('settings.save', payload), 400);
    denied(() => admin.snapshot(f.event('viewer')));
});

test('owners grant administrators, administrators manage lower roles, and nobody self-promotes or changes the owner', () => {
    const f = fixture(); f.enable();
    f.command('member.set', { user: 'newuser', role: 'viewer' }, { actor: 'admin' });
    const membership = f.data.workspace_members.find((m) => m.user === 'newuser'); assert.equal(membership.invited_by, 'admin');
    f.command('member.set', { user: 'newuser', role: 'editor' }, { actor: 'admin' });
    denied(() => f.command('member.set', { user: 'newuser', role: 'admin' }, { actor: 'admin' }));
    f.command('member.set', { user: 'newuser', role: 'admin' });
    denied(() => f.command('member.remove', { user: 'newuser' }, { actor: 'admin' }));
    denied(() => f.command('member.set', { user: 'legacyowner', role: 'editor' }, { actor: 'admin' }));
    for (const actor of ['owner', 'admin', 'editor', 'viewer']) {
        denied(() => f.command('member.set', { user: actor, role: 'admin' }, { actor }));
        denied(() => f.command('member.remove', { user: 'owner' }, { actor }));
    }
    f.command('member.set', { user: 'newuser', role: 'viewer' });
    f.command('member.remove', { user: 'newuser' }, { actor: 'admin' });
    assert.ok(!f.data.workspace_members.some((m) => m.user === 'newuser'));
    denied(() => f.command('member.remove', { user: 'newuser' }), 409);
    denied(() => f.command('member.set', { user: 'unknown', role: 'viewer' }), 404);
    denied(() => f.command('member.set', { user: 'newuser', role: 'owner' }), 400);
    assert.equal(f.data.workspaces[0].owner, 'owner');
});

test('lost admin responses replay once, changed retry content and stale tabs conflict, and revoked retries are denied', () => {
    const f = fixture(); const input = config(); const key = 'lost_admin_response_123';
    const first = f.command('integration.save', input, { actor: 'admin', key, revision: 0 });
    const replay = f.command('integration.save', { configuration: { channel_id: input.configuration.channel_id, mode: 'read', guild_id: input.configuration.guild_id }, enabled: true, provider: 'discord' },
        { actor: 'admin', key, revision: 0 });
    assert.equal(replay.id, first.id); assert.equal(replay.replayed, true); assert.equal(f.data.workspace_admin_events.length, 1);
    denied(() => f.command('integration.save', { ...input, enabled: false }, { actor: 'admin', key, revision: 0 }), 409);
    denied(() => f.command('integration.save', input, { revision: 0 }), 409);
    f.command('member.set', { user: 'admin', role: 'viewer' });
    denied(() => f.command('integration.save', input, { actor: 'admin', key, revision: 0 }));
    assert.equal(f.data.workspace_integrations.length, 1);
});

test('failure to store an audit rolls back settings, member and integration changes', () => {
    const f = fixture(); f.enable(); const before = plain(f.data); f.config.failAudit = true;
    for (const operation of [() => f.enable({ name: 'Should not survive' }),
        () => f.command('member.remove', { user: 'viewer' }), () => f.command('integration.save', config())]) {
        assert.throws(operation, /audit storage unavailable/); assert.deepEqual(f.data, before);
    }
});

test('integration requests permit only supported non-secret fields and never claim a connection', () => {
    const f = fixture(); const admin = f.load('workspace-administration.js');
    assert.equal(admin.integrations(f.event('viewer')).items.length, 9);
    for (const provider of ['discord', 'reddit', 'datadog', 'posthog', 'n8n']) f.command('integration.save', config(provider));
    f.command('integration.check', { provider: 'discord' });
    const integration = admin.integrations(f.event('viewer')).items.find((i) => i.provider === 'discord');
    assert.equal(integration.desired_enabled, true); assert.equal(integration.observation.state, 'unknown');
    assert.equal(integration.observation.current, false); assert.equal(integration.observation.check_pending, true);
    const invalid = [config('unsupported'), { ...config(), observed_state: 'healthy' }, { ...config(), configuration: { ...config().configuration, token: 'forbidden-field' } },
        { ...config(), configuration: { ...config().configuration, mode: 'execute' } }, { ...config(), configuration: { ...config().configuration, channel_id: 'https://example.test' } },
        { ...config('reddit'), configuration: { mode: 'read', subreddit: '../foreign' } }, { ...config('datadog'), configuration: { mode: 'telemetry', binding: 'https://example.test' } }];
    for (const value of invalid) denied(() => f.command('integration.save', value), 400);
    denied(() => f.command('integration.check', { provider: 'firecrawl' }), 409);
    denied(() => f.command('integration.check', { provider: 'unknown' }), 400);
    denied(() => f.command('integration.save', config(), { actor: 'editor' }));
    f.command('integration.save', config('discord', false));
    assert.equal(admin.integrations(f.event()).items[0].observation.current, false, 'disable is still a requested state');
});

test('runtime observations require a receipt, matching revision and fresh nonfuture timestamps', () => {
    const f = fixture(); const admin = f.load('workspace-administration.js'); f.command('integration.save', config());
    const record = f.app.findRecordById('workspace_integrations', f.data.workspace_integrations[0].id);
    record.set('observed_state', 'healthy'); record.set('observed_at', new Date().toISOString()); record.set('applied_revision', 1);
    assert.equal(admin.observation(record).state, 'unknown');
    record.set('receipt_ref', 'receipt-1'); assert.equal(admin.observation(record).current, true);
    record.set('applied_revision', 0); assert.equal(admin.observation(record).current, false);
    record.set('applied_revision', 1); record.set('observed_at', new Date(Date.now() - 16 * 60000).toISOString()); assert.equal(admin.observation(record).current, false);
    record.set('observed_at', new Date(Date.now() + 60000).toISOString()); assert.equal(admin.observation(record).state, 'unknown');
    record.set('observed_at', 'not-a-date'); assert.equal(admin.observation(record).state, 'unknown');
});

test('member and audit reads are bounded, scoped, paginated and omit raw command contents', () => {
    const f = fixture(); f.enable();
    for (let i = 0; i < 23; i++) f.seed('workspace_members', { id: `member${i}`, user: `user${i}`, workspace: 'ws1', role: 'viewer' });
    for (let i = 0; i < 23; i++) f.seed('workspace_admin_events', { id: `event${i}`, actor: 'owner', workspace: 'ws1', action: 'wiki.save', command: { body: 'private draft' }, result: {}, revision: i });
    f.seed('workspace_admin_events', { id: 'foreign_event', workspace: 'ws2', actor: 'otherowner', command: {} });
    const admin = f.load('workspace-administration.js');
    const page1 = admin.snapshot(f.event('admin')); const page2 = admin.snapshot(f.event('admin', {}, { query: { members_page: '2', audit_page: '2' } }));
    assert.equal(page1.members.items.length, 20); assert.equal(page1.members.has_more, true); assert.equal(page2.members.items.length, 7);
    assert.equal(page1.audit.items.length, 20); assert.equal(page2.audit.items.length, 4);
    assert.ok(!page1.audit.items.some((row) => 'command' in row || row.id === 'foreign_event'));
    denied(() => admin.snapshot(f.event('owner', {}, { query: { audit_page: '-1' } })), 400);
    denied(() => admin.snapshot(f.event('owner', {}, { workspace: 'ws2' })));
});

function native(f, collection, actor, operation = 'create', values = {}, changes = {}) {
    const e = f.event(actor); e.record = f.record(collection, { id: 'native', owner: actor, workspace: 'ws1', ...values });
    Object.entries(changes).forEach(([key, value]) => e.record.set(key, value));
    e.next = () => 'persisted'; return () => f.load('workspace-record-policy.js').enforce(e, operation);
}

test('native workspace writes reject owner shortcuts, viewers and reassignment across accounts/workspaces', () => {
    const f = fixture();
    assert.equal(native(f, 'signals', 'editor')(), 'persisted');
    for (const actor of ['outsider', 'viewer']) denied(native(f, 'signals', actor));
    denied(native(f, 'signals', 'editor', 'create', { owner: 'owner' }));
    denied(native(f, 'signals', 'editor', 'update', {}, { owner: 'viewer' }), 400);
    denied(native(f, 'signals', 'editor', 'update', { workspace: 'ws2' }, { workspace: 'ws1' }), 400);
    denied(native(f, 'signals', 'editor', 'delete', { owner: 'owner' }));
    assert.equal(native(f, 'signals', 'editor', 'delete')(), 'persisted');
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    denied(native(f, 'signals', 'editor', 'update')); denied(native(f, 'signals', 'editor', 'delete'));
});

test('native service records require administrators and cannot fabricate runtime health', () => {
    const f = fixture();
    for (const name of ['services', 'social_channels']) {
        const status = name === 'services' ? 'planned' : 'pending'; const stamp = name === 'services' ? 'last_health_check' : 'last_check';
        assert.equal(native(f, name, 'admin', 'create', { status })(), 'persisted');
        denied(native(f, name, 'editor', 'create', { status }));
        denied(native(f, name, 'admin', 'create', { status: 'healthy' }), 400);
        denied(native(f, name, 'admin', 'create', { status, [stamp]: '2026-01-01' }), 400);
        denied(native(f, name, 'admin', 'update', { status }, { status: 'connected' }), 400);
        assert.equal(native(f, name, 'admin', 'update', { status }, { handle: 'Team handle' })(), 'persisted');
    }
});

test('native relations and onboarding validate the actual workspace/account of the referenced record', () => {
    const f = fixture();
    f.seed('erp_objectives', { id: 'objective', workspace: 'ws2', owner: 'otherowner' });
    denied(native(f, 'erp_tasks', 'editor', 'create', { objective: 'objective' }), 400);
    const objective = f.app.findRecordById('erp_objectives', 'objective'); objective.set('workspace', 'ws1'); f.app.save(objective);
    assert.equal(native(f, 'erp_tasks', 'editor', 'create', { objective: 'objective' })(), 'persisted');
    f.denied.add('objective'); denied(native(f, 'erp_tasks', 'editor', 'create', { objective: 'objective' }));
    f.seed('domains', { id: 'domain', owner: 'otherowner' });
    const e = f.event(); e.record = f.record('workspaces', { owner: 'owner', domain: 'domain' }); e.next = () => true;
    denied(() => f.load('workspace-record-policy.js').workspaceCreate(e));
    const domain = f.app.findRecordById('domains', 'domain'); domain.set('owner', 'owner'); f.app.save(domain);
    assert.equal(f.load('workspace-record-policy.js').workspaceCreate(e), true);
    e.record.set('domain', ''); assert.equal(f.load('workspace-record-policy.js').workspaceCreate(e), true);
    e.record.set('owner', 'admin'); denied(() => f.load('workspace-record-policy.js').workspaceCreate(e));
});

test('rule migration applies to real prior schema, preserves records, replays and restores exact previous rules', () => {
    const f = fixture({ migrated: false }); const before = plain(f.collections); const records = plain(f.data);
    const migration = f.migration(RBAC); migration.up(); migration.up();
    assert.deepEqual(f.data, records); assert.equal(f.collections.workspace_members.createRule, null); assert.equal(f.collections.workspaces.updateRule, null);
    assert.equal(f.collections.seat_events.updateRule, null); assert.equal(f.collections.seat_events.deleteRule, null);
    assert.ok(!f.collections.signals.listRule.includes('@request.auth.id = owner'));
    assert.match(f.collections.signals.listRule, /workspace\.workspace_members_via_workspace\.user/);
    assert.equal(f.collections.tutorial_progress.listRule, before.tutorial_progress.listRule);
    migration.down(); migration.down(); assert.deepEqual(plain(f.collections), before); assert.deepEqual(f.data, records);
});

test('both migration directions reject custom policy before changing any collection', () => {
    const f = fixture({ migrated: false }); f.collections.evidence.viewRule = 'custom-read';
    let before = plain(f.collections); assert.throws(f.migration(RBAC).up, /Review custom evidence/); assert.deepEqual(plain(f.collections), before);
    f.collections.evidence.viewRule = f.collections.evidence.listRule; f.migration(RBAC).up();
    f.collections.signals.createRule = 'custom-create'; before = plain(f.collections);
    assert.throws(f.migration(RBAC).down, /Review custom signals/); assert.deepEqual(plain(f.collections), before);
});

test('administration down retains all community/audit data and disables commands until replayed up', () => {
    const f = fixture(); f.enable(); f.command('integration.save', config()); const before = plain(f.data);
    const migration = f.migration(ADMIN_SCHEMA); migration.up(); assert.deepEqual(f.data, before);
    migration.down(); migration.down(); assert.deepEqual(f.data, before);
    denied(() => f.enable(), 503); migration.up(); f.enable();
    assert.equal(f.data.workspace_admin_events.length, before.workspace_admin_events.length + 1);
    f.collections.forum_topics.createRule = ''; assert.throws(migration.up, /Review custom forum_topics/); assert.throws(migration.down, /Review custom forum_topics/);
});

test('custom reply relations, types and indexes block schema replay before the protocol is reenabled', () => {
    for (const change of [
        (collection) => { collection.fields.getByName('topic').collectionId = 'workspaces'; },
        (collection) => { collection.fields.getByName('owner').cascadeDelete = true; },
        (collection) => { collection.fields.getByName('body').type = 'json'; },
        (collection) => { collection.indexes = []; },
        (collection) => { collection.type = 'view'; },
    ]) {
        const f = fixture(); const migration = f.migration(ADMIN_SCHEMA); migration.down();
        change(f.collections.forum_replies); const before = plain(f.collections);
        assert.throws(migration.up, /Review/); assert.deepEqual(plain(f.collections), before);
        assert.equal(f.collections.workspace_controls.fields.getByName('protocol_version'), undefined);
    }
});

test('routes bind users auth, per-callback module loading, no-store responses and all native write operations', () => {
    const routes = []; const hooks = []; const calls = [];
    const globals = { __hooks: '/hooks', $apis: { requireAuth: (name) => { assert.equal(name, 'users'); return 'users-auth'; } },
        routerAdd: (...args) => routes.push(args), require: (name) => new Proxy({}, { get: (_, action) => (e, operation) => {
            assert.ok(name.startsWith('/hooks/')); calls.push({ name, action, operation }); return 'ok'; } }) };
    for (const verb of ['Create', 'Update', 'Delete']) globals[`onRecord${verb}Request`] = (callback, ...names) => hooks.push({ callback, names, verb });
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/administration.pb.js'), globals,
        { filename: new URL('../../apps/pocketbase/pb_hooks/administration.pb.js', import.meta.url).pathname });
    assert.equal(routes.length, 8);
    for (const [method, path, callback, auth] of routes) {
        assert.equal(auth, 'users-auth'); assert.ok(['GET', 'POST'].includes(method)); assert.match(path, /\{workspace\}/);
        let noStore = false;
        callback({ response: { header: () => ({ set: (k, v) => { assert.equal(k, 'Cache-Control'); assert.equal(v, 'no-store'); noStore = true; } }) },
            json: (status, data) => { assert.equal(status, 200); assert.equal(data, 'ok'); } }); assert.ok(noStore);
    }
    for (const hook of hooks) { hook.callback({}); if (hook.names[0] !== 'workspaces') assert.equal(hook.names.length, 19); }
    assert.ok(calls.some((call) => call.operation === 'delete')); assert.ok(calls.some((call) => call.action === 'workspaceCreate'));
});
