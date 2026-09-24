// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/domain-verification.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-SITE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-SITE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/domain-verification.js, apps/pocketbase/pb_migrations/1791600000_domain_verification.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/domain-verification.js; VALIDATES apps/pocketbase/pb_hooks/workspace-record-policy.js; VALIDATES apps/pocketbase/pb_migrations/1791600000_domain_verification.js
// DAG Node:    none
// Intent:      Prove a domain is verified only by an exact DNS TXT match at a fixed resolver, and that browsers cannot assert it.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { fixture, plain, source } from './admin-fixture.mjs';

const MIGRATION = 'apps/pocketbase/pb_migrations/1791600000_domain_verification.js';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);

function setup({ env = {} } = {}) {
    const calls = []; let answer = () => ({ statusCode: 200, raw: JSON.stringify({ Status: 3 }) });
    const runtime = {
        $os: { getenv: (name) => env[name] || '' },
        $http: { send(request) { calls.push(request); return answer(request); } },
        $security: { randomString: (length) => Array.from(randomBytes(length), (byte) => ALPHABET[byte % ALPHABET.length]).join(''),
            sha256: (value) => createHash('sha256').update(value).digest('hex') },
    };
    const f = fixture({ runtime });
    f.migration(MIGRATION).up();
    const service = f.load('domain-verification.js');
    // verify answers { code, body } so its route can send 429; the other commands answer the body.
    const call = (name, actor = 'owner', body = {}) => {
        const result = plain(service[name](f.event(actor, body)));
        return name === 'verify' ? result.body : result;
    };
    return { f, calls, call, respond: (fn) => { answer = fn; }, service };
}
const dns = (Status, Answer) => () => ({ statusCode: 200, raw: JSON.stringify({ Status, ...(Answer ? { Answer } : {}) }) });
const txt = (data) => ({ name: '_buildanddo-verify.example.com.', type: 16, TTL: 300, data });
function linkedDomain(t) { return t.f.data.domains.find((row) => row.id === t.f.data.workspaces.find((w) => w.id === 'ws1').domain); }
function published(t, actor = 'owner') {
    t.call('save', actor, { domain: 'Example.com' });
    return t.call('issue', actor);
}

test('the migration adds hidden, replay-safe proof fields and withdraws unchecked verified statuses', () => {
    const f = fixture();
    const legacy = f.seed('domains', { id: 'legacy', domain: 'old.example', status: 'verified', owner: 'owner' });
    f.seed('domains', { id: 'plain', domain: 'plain.example', status: 'selected', owner: 'owner' });
    const migration = f.migration(MIGRATION);
    migration.up(); migration.up();
    const fields = f.collections.domains.fields;
    assert.equal(fields.getByName('verification_token').hidden, true);
    for (const name of ['verification_requested_at', 'verification_checked_at', 'verified_at']) assert.equal(fields.getByName(name).type, 'date');
    assert.deepEqual(fields.getByName('verification_result').values, ['not_found', 'mismatch', 'lookup_failed', 'verified']);
    assert.equal(f.data.domains.find((row) => row.id === legacy.id).status, 'needs_attention');
    assert.equal(f.data.domains.find((row) => row.id === 'plain').status, 'selected');
    migration.down();
    assert.deepEqual([...fields].map((field) => field.name), ['domain', 'status', 'has_website', 'owner', 'created', 'updated']);
    assert.equal(f.data.domains.length, 2);
    f.collections.domains.fields.add({ name: 'verified_at', type: 'text' });
    assert.throws(() => migration.up(), /Review custom domains\.verified_at/);
});

test('browsers can record an unverified domain but never set status, name changes or proof fields', () => {
    const { f } = setup(); const policy = f.load('workspace-record-policy.js');
    const write = (operation, stored, changes = {}, actor = 'owner') => {
        const e = f.event(actor); e.record = f.record('domains', { id: 'd1', domain: 'example.com', status: 'selected', owner: 'owner', ...stored });
        Object.entries(changes).forEach(([key, value]) => e.record.set(key, value));
        e.next = () => 'persisted'; return () => policy.domainWrite(e, operation);
    };
    assert.equal(write('create', {})(), 'persisted');
    denied(write('create', {}, {}, 'editor'));
    for (const status of ['verified', 'analyzing', 'needs_attention']) denied(write('create', { status }), 400);
    for (const [field, value] of [['verification_token', 'chosen'], ['verified_at', '2026-09-24 00:00:00.000Z'],
        ['verification_result', 'verified'], ['verification_checked_at', '2026-09-24 00:00:00.000Z']])
        denied(write('create', { [field]: value }), 400);
    for (const status of ['verified', 'analyzing', 'needs_attention']) denied(write('update', {}, { status }), 400);
    denied(write('update', { status: 'verified', verified_at: '2026-09-24 00:00:00.000Z' }, { status: 'selected' }), 400);
    for (const [field, value] of [['domain', 'other.example'], ['owner', 'admin'], ['verification_token', 'x'],
        ['verification_result', 'verified'], ['verified_at', '2026-09-24 00:00:00.000Z']])
        denied(write('update', {}, { [field]: value }), 400);
    assert.equal(write('update', {}, { has_website: false })(), 'persisted');
    assert.match(source('apps/pocketbase/pb_hooks/domains.pb.js'), /onRecordUpdateRequest\(.*domainWrite\(e, 'update'\), 'domains'\);/);
});

test('owners and admins add or change the domain; a change starts over on a new unverified record', () => {
    const t = setup();
    const added = t.call('save', 'admin', { domain: 'Example.com' });
    assert.equal(added.domain, 'example.com'); assert.equal(added.status, 'selected'); assert.equal(added.changed, true);
    const first = linkedDomain(t);
    // The workspace owner holds the row, because deleting a domain cascades to its workspace.
    assert.equal(first.owner, 'owner');
    assert.equal(t.call('save', 'owner', { domain: 'example.com' }).changed, false);
    assert.equal(t.f.data.domains.length, 1);
    const row = t.f.data.domains[0]; row.status = 'verified'; row.verified_at = '2026-09-20 00:00:00.000Z'; row.verification_token = 'old';
    const changed = t.call('save', 'owner', { domain: 'shop.example.org' });
    assert.equal(changed.status, 'selected'); assert.equal(changed.challenge, null); assert.equal(changed.changed, true);
    assert.equal(t.f.data.domains.length, 2);
    assert.equal(t.f.data.domains.find((item) => item.id === first.id).status, 'verified');
    assert.notEqual(linkedDomain(t).id, first.id);
    for (const actor of ['editor', 'viewer', 'outsider']) denied(() => t.call('save', actor, { domain: 'taken.example' }));
    for (const domain of ['https://example.com', 'example.com/path', 'user@example.com', '10.0.0.1', 'localhost', 'example.com:8080', ''])
        denied(() => t.call('save', 'owner', { domain }), 400);
    denied(() => t.call('save', 'owner', { domain: 'example.com', status: 'verified' }), 400);
    denied(() => t.call('save', 'owner', { domain: `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(50)}.com` }), 400);
});

test('only owners and admins receive the challenge; the token never reaches editors or viewers', () => {
    const t = setup();
    denied(() => t.call('issue', 'owner'), 409);
    t.call('save', 'owner', { domain: 'example.com' });
    const record = t.call('issue', 'admin');
    assert.equal(record.record_name, '_buildanddo-verify.example.com'); assert.equal(record.record_type, 'TXT');
    assert.match(record.record_value, /^buildanddo-verify=[A-Za-z0-9]{32}$/);
    assert.ok(record.requested_at);
    for (const actor of ['editor', 'viewer', 'outsider']) denied(() => t.call('issue', actor));
    const token = record.record_value.slice('buildanddo-verify='.length);
    for (const actor of ['editor', 'viewer']) {
        const view = t.call('read', actor);
        assert.deepEqual(view, { workspace: 'ws1', domain: 'example.com', status: 'selected', can_manage: false });
        assert.doesNotMatch(JSON.stringify(view), new RegExp(token));
    }
    assert.equal(t.call('read', 'owner').challenge.record_value, record.record_value);
    const replaced = t.call('issue', 'owner');
    assert.notEqual(replaced.record_value, record.record_value);
    assert.equal(linkedDomain(t).verification_token, replaced.record_value.slice('buildanddo-verify='.length));
    assert.deepEqual(t.call('read', 'editor', {}), { workspace: 'ws1', domain: 'example.com', status: 'selected', can_manage: false });
    const empty = setup();
    assert.deepEqual(empty.call('read', 'viewer'), { workspace: 'ws1', domain: '', status: '', can_manage: false });
});

test('an exact TXT match at the fixed resolver verifies the domain; nothing is sent to the domain itself', () => {
    const t = setup(); const record = published(t);
    t.respond(dns(0, [txt('"unrelated=1"'), txt(`"${record.record_value}"`)]));
    const result = t.call('verify');
    assert.deepEqual(Object.keys(result).sort(), ['checked_at', 'result', 'status']);
    assert.equal(result.status, 'verified'); assert.equal(result.result, 'verified');
    assert.equal(t.calls.length, 1);
    assert.equal(t.calls[0].url, 'https://cloudflare-dns.com/dns-query?name=_buildanddo-verify.example.com&type=TXT');
    assert.equal(t.calls[0].method, 'GET'); assert.equal(t.calls[0].timeout, 5);
    assert.deepEqual(plain(t.calls[0].headers), { accept: 'application/dns-json' });
    const row = linkedDomain(t);
    assert.equal(row.status, 'verified'); assert.ok(row.verified_at); assert.equal(row.verification_result, 'verified');
    assert.equal(t.call('read', 'owner').verified_at, row.verified_at);
});

test('a value split across TXT strings is joined before the exact comparison', () => {
    const t = setup(); const record = published(t); const value = record.record_value;
    t.respond(dns(0, [txt(`"${value.slice(0, 20)}" "${value.slice(20)}"`)]));
    assert.equal(t.call('verify').result, 'verified');
    assert.equal(t.service.txt('"a\\"b" "c"'), 'a"bc');
    assert.equal(t.service.txt('bare'), 'bare');
});

test('a wrong or missing record leaves the domain unverified, and a removed record withdraws verification', () => {
    const t = setup(); const record = published(t);
    t.respond(dns(0, [txt(`"${record.record_value}x"`), txt(`"${record.record_value.toUpperCase()}"`)]));
    assert.deepEqual([t.call('verify').status, linkedDomain(t).verification_result], ['selected', 'mismatch']);
    for (const [answer, expected] of [[dns(3), 'not_found'], [dns(0), 'not_found'], [dns(0, [{ type: 5, data: 'alias.example.' }]), 'not_found']]) {
        linkedDomain(t).verification_checked_at = '';
        t.respond(answer);
        const result = t.call('verify');
        assert.equal(result.status, 'selected'); assert.equal(result.result, expected);
    }
    linkedDomain(t).verification_checked_at = '';
    t.respond(dns(0, [txt(`"${record.record_value}"`)]));
    assert.equal(t.call('verify').status, 'verified');
    linkedDomain(t).verification_checked_at = '';
    t.respond(dns(0, [txt('"buildanddo-verify=someoneelse"')]));
    assert.deepEqual(t.call('verify'), { status: 'needs_attention', result: 'mismatch', checked_at: linkedDomain(t).verification_checked_at });
    assert.ok(linkedDomain(t).verified_at, 'the last proven verification is kept as history');
});

test('any lookup failure fails closed with a short reason and no resolver text', () => {
    const failures = [
        () => { throw new Error('dial tcp: secret resolver detail'); },
        () => ({ statusCode: 500, raw: 'upstream exploded' }),
        () => ({ statusCode: 200, raw: 'not json at all' }),
        () => ({ statusCode: 200, raw: JSON.stringify({ Status: 2, Comment: 'SERVFAIL detail' }) }),
        () => ({ statusCode: 200, raw: 'x'.repeat(70000) }),
        () => ({ statusCode: 200, raw: 'null' }),
    ];
    for (const failure of failures) {
        const t = setup(); published(t); t.respond(failure);
        const result = t.call('verify');
        assert.deepEqual([result.status, result.result], ['selected', 'lookup_failed']);
        assert.doesNotMatch(JSON.stringify(result), /secret|exploded|SERVFAIL|json/);
    }
    const t = setup(); const record = published(t);
    t.respond(dns(0, [txt(`"${record.record_value}"`)])); t.call('verify');
    linkedDomain(t).verification_checked_at = '';
    t.respond(failures[0]);
    assert.deepEqual([t.call('verify').status, linkedDomain(t).verification_result], ['verified', 'lookup_failed']);
});

test('the resolver override must be https; anything else is refused before any request', () => {
    for (const url of ['http://resolver.example/dns-query', 'ftp://resolver.example/', 'https://user@resolver.example/dns-query',
        'https://resolver.example/dns-query?name=evil', 'resolver.example/dns-query', 'https://resolver.example']) {
        const t = setup({ env: { BUILDANDDO_DOH_URL: url } }); published(t);
        assert.throws(() => t.call('verify'), (error) => error.status === 503 && /must be an https URL/.test(error.message));
        assert.equal(t.calls.length, 0); assert.equal(linkedDomain(t).verification_checked_at ?? '', '');
    }
    const t = setup({ env: { BUILDANDDO_DOH_URL: 'https://dns.example.net/resolve' } }); published(t);
    t.call('verify');
    assert.equal(t.calls[0].url, 'https://dns.example.net/resolve?name=_buildanddo-verify.example.com&type=TXT');
});

test('checks are rate limited per domain with the seconds remaining', () => {
    const t = setup(); published(t);
    denied(() => t.call('verify', 'owner', { force: true }), 400);
    assert.equal(t.call('verify').result, 'not_found');
    const limited = t.service.verify(t.f.event('owner', {}));
    assert.equal(limited.code, 429);
    assert.ok(limited.body.retry_after >= 1 && limited.body.retry_after <= 30);
    assert.match(limited.body.message, new RegExp(`Check again in ${limited.body.retry_after} seconds`));
    assert.equal(limited.body.result, 'not_found');
    assert.equal(t.calls.length, 1);
    assert.ok(t.call('read', 'admin').retry_after > 0);
    linkedDomain(t).verification_checked_at = new Date(Date.now() - 31000).toISOString();
    assert.equal(t.service.verify(t.f.event('admin', {})).code, 200);
    assert.equal(t.calls.length, 2);
    // A new challenge does not reset the wait.
    t.call('issue', 'owner');
    assert.equal(t.service.verify(t.f.event('owner', {})).code, 429);
});

test('editors and viewers cannot check, and a check without a challenge is refused', () => {
    const t = setup(); t.call('save', 'owner', { domain: 'example.com' });
    denied(() => t.call('verify', 'owner'), 409);
    t.call('issue', 'owner');
    for (const actor of ['editor', 'viewer', 'outsider']) denied(() => t.call('verify', actor));
    assert.equal(t.calls.length, 0);
});

test('a check against a replaced domain does not verify the new one', () => {
    const t = setup(); const record = published(t);
    t.respond(() => { t.call('save', 'owner', { domain: 'other.example' }); return dns(0, [txt(`"${record.record_value}"`)])(); });
    denied(() => t.call('verify'), 409);
    assert.equal(linkedDomain(t).status, 'selected');
    assert.equal(linkedDomain(t).domain, 'other.example');
});

test('onboarding still records its optional domain as selected through the shared validator', () => {
    const t = setup(); t.f.migration('apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js').up();
    const result = t.f.load('workspace-onboarding.js').create(t.f.event('newuser', { name: 'Shop', domain: 'Shop.Example' }));
    assert.equal(t.f.data.domains.find((row) => row.id === result.domain).status, 'selected');
    denied(() => t.f.load('workspace-onboarding.js').create(t.f.event('newuser', { name: 'Shop', domain: 'https://shop.example' })), 400);
});

test('the browser client accepts only documented responses and never sends a URL', async () => {
    const { createWebsiteDomainClient, domainInput } = await import('../../apps/web/src/lib/websiteDomain.js');
    let reply; const sent = [];
    const client = { authStore: { record: { id: 'editor' } }, send: async (path, options) => { sent.push([path, options]); return reply; } };
    const api = createWebsiteDomainClient({ client, workspaceId: 'ws1', accountId: 'editor', isCurrent: () => true });
    reply = { workspace: 'ws1', domain: 'example.com', status: 'selected', can_manage: false };
    assert.equal((await api.read()).ok, true);
    reply = { ...reply, challenge: { record_name: '_buildanddo-verify.example.com', record_type: 'TXT', record_value: `buildanddo-verify=${'a'.repeat(32)}`, requested_at: 'now' } };
    assert.equal((await api.read()).ok, false, 'an editor view carrying a challenge is refused');
    reply = { workspace: 'ws2', domain: 'example.com', status: 'selected', can_manage: false };
    assert.equal((await api.read()).ok, false);
    reply = { record_name: '_buildanddo-verify.other.example', record_type: 'TXT', record_value: `buildanddo-verify=${'a'.repeat(32)}`, requested_at: 'now' };
    assert.equal((await api.challenge('example.com')).ok, false);
    reply = { status: 'verified', result: 'verified', checked_at: 'now', token: 'x' };
    assert.equal((await api.check()).ok, false);
    const before = sent.length;
    assert.equal((await api.save('https://example.com/')).reason, 'invalid');
    assert.equal(sent.length, before);
    assert.deepEqual(['Example.COM', ' shop.example.org ', 'localhost', '10.0.0.1', 'a@b.com'].map(domainInput), ['example.com', 'shop.example.org', '', '', '']);
    client.send = async () => { throw { status: 429, response: { retry_after: 12, message: 'Check again in 12 seconds.' } }; };
    assert.deepEqual(await api.check(), { ok: false, reason: 'rate_limited', retry_after: 12, error: 'Check again in 12 seconds.' });
});
