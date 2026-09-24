// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/domain-verification.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-SITE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-SITE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1791600000_domain_verification.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_migrations/1791600000_domain_verification.js
// DAG Node:    none
// Intent:      Prove a workspace controls its domain through one DNS TXT lookup at a fixed resolver, never by contacting the domain itself.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const PROOF = ['verification_token', 'verification_requested_at', 'verification_checked_at', 'verification_result', 'verified_at'];
const PREFIX = '_buildanddo-verify.';
const VALUE = 'buildanddo-verify=';
const RESOLVER = 'https://cloudflare-dns.com/dns-query';
const INTERVAL = 30;
const MANAGERS = ['owner', 'admin'];

const now = () => new Date().toISOString();
const time = (record, name) => { const value = record.getString(name); return value ? value.replace(' ', 'T') : ''; };
function scope(e, roles) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    const { role } = access.requireRole(e.app, e.auth, workspace, roles);
    return { workspace, role, manager: MANAGERS.includes(role) };
}
function linked(app, workspace, required = true) {
    access.schema(app, 'domains', PROOF);
    const id = access.find(app, 'workspaces', workspace).getString('domain');
    if (!id) {
        if (required) access.conflict('Add a website domain first.');
        return null;
    }
    return access.find(app, 'domains', id);
}
function wait(record) {
    const last = Date.parse(time(record, 'verification_checked_at'));
    return Number.isFinite(last) ? Math.max(0, Math.ceil((last + INTERVAL * 1000 - Date.now()) / 1000)) : 0;
}
function challenge(record) {
    const token = record.getString('verification_token');
    return token ? { record_name: PREFIX + record.getString('domain'), record_type: 'TXT', record_value: VALUE + token,
        requested_at: time(record, 'verification_requested_at') } : null;
}
function view(workspace, record, manager) {
    const value = { workspace, domain: record ? record.getString('domain') : '', status: record ? record.getString('status') : '', can_manage: manager };
    if (!manager || !record) return value;
    return { ...value, result: record.getString('verification_result'), checked_at: time(record, 'verification_checked_at'),
        verified_at: time(record, 'verified_at'), retry_after: wait(record), challenge: challenge(record) };
}

/** Everyone in the workspace sees the domain and its status; only owners and admins see the challenge. */
function read(e) {
    const { workspace, manager } = scope(e);
    return view(workspace, linked(e.app, workspace, false), manager);
}

/** Link a new unverified domain record, or return the current one when the name is unchanged. */
function save(e) {
    const { workspace } = scope(e, MANAGERS);
    const body = e.requestInfo().body;
    access.exact(body, ['domain']);
    const name = access.domainName(body.domain);
    if ((PREFIX + name).length > 253) access.invalid('This domain name is too long for a verification record.');
    let result;
    e.app.runInTransaction((app) => {
        const current = linked(app, workspace, false);
        if (current && current.getString('domain') === name) { result = { ...view(workspace, current, true), changed: false }; return; }
        const target = access.find(app, 'workspaces', workspace);
        // Held by the workspace owner: a domain row cascades to its workspace, so an admin must not own one.
        const record = new Record(app.findCollectionByNameOrId('domains'));
        for (const [field, value] of Object.entries({ domain: name, status: 'selected', has_website: true, owner: target.getString('owner') }))
            record.set(field, value);
        app.save(record);
        target.set('domain', record.id); app.save(target);
        result = { ...view(workspace, record, true), changed: true };
    });
    return result;
}

/** Issue a fresh random token; the previous one stops counting immediately. */
function issue(e) {
    const { workspace } = scope(e, MANAGERS);
    access.exact(e.requestInfo().body || {}, []);
    let result;
    e.app.runInTransaction((app) => {
        const record = linked(app, workspace);
        record.set('verification_token', $security.randomString(32));
        record.set('verification_requested_at', now());
        record.set('verification_result', '');
        app.save(record);
        result = challenge(record);
    });
    return result;
}

function resolver() {
    const configured = String($os.getenv('BUILDANDDO_DOH_URL') || '').trim();
    if (!configured) return RESOLVER;
    if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?\/[^\s?#@]*$/i.test(configured))
        throw new ApiError(503, 'The DNS resolver is misconfigured: BUILDANDDO_DOH_URL must be an https URL. Ask the operator to correct it.');
    return configured;
}
// DNS-over-HTTPS JSON quotes each TXT character-string; one record may split its value across several.
function txt(data) {
    if (typeof data !== 'string') return null;
    if (!data.startsWith('"')) return data;
    const parts = data.match(/"((?:[^"\\]|\\.)*)"/g);
    return parts ? parts.map((part) => part.slice(1, -1).replace(/\\(.)/g, '$1')).join('') : null;
}
/** @returns {string} not_found, mismatch, lookup_failed or verified. Resolver text is never returned. */
function lookup(url, name, expected) {
    try {
        const response = $http.send({ url: `${url}?name=${encodeURIComponent(name)}&type=TXT`, method: 'GET', timeout: 5,
            headers: { accept: 'application/dns-json' } });
        // Older runtimes expose the body as raw text; newer ones only as parsed json.
        const raw = typeof response.raw === 'string' ? response.raw : JSON.stringify(response.json ?? null);
        if (response.statusCode !== 200 || typeof raw !== 'string' || raw.length > 65536) return 'lookup_failed';
        const answer = JSON.parse(raw);
        if (answer?.Status === 3) return 'not_found';
        if (answer?.Status !== 0) return 'lookup_failed';
        const values = (Array.isArray(answer.Answer) ? answer.Answer : []).filter((item) => item?.type === 16).map((item) => txt(item.data));
        if (!values.length) return 'not_found';
        return values.includes(expected) ? 'verified' : 'mismatch';
    } catch { return 'lookup_failed'; }
}

/** Check the published record once per interval; only an exact match verifies. */
function verify(e) {
    const { workspace } = scope(e, MANAGERS);
    access.exact(e.requestInfo().body || {}, []);
    const url = resolver();
    let claim, busy = null;
    e.app.runInTransaction((app) => {
        const record = linked(app, workspace);
        if (!record.getString('verification_token')) access.conflict('Create a verification record first.');
        const remaining = wait(record);
        if (remaining) { busy = { ...view(workspace, record, true), retry_after: remaining }; return; }
        record.set('verification_checked_at', now()); app.save(record);
        claim = { id: record.id, name: PREFIX + record.getString('domain'), token: record.getString('verification_token') };
    });
    if (busy) return { code: 429, body: { status: busy.status, result: busy.result, checked_at: busy.checked_at, retry_after: busy.retry_after,
        message: `Check again in ${busy.retry_after} seconds.` } };
    const result = lookup(url, claim.name, VALUE + claim.token);
    let saved;
    e.app.runInTransaction((app) => {
        const record = linked(app, workspace);
        if (record.id !== claim.id || record.getString('verification_token') !== claim.token)
            access.conflict('The domain or its verification record changed during the check. Check again.');
        const status = record.getString('status');
        if (result === 'verified') { record.set('status', 'verified'); record.set('verified_at', now()); }
        // Evidence of removal withdraws a verification; an unreachable resolver proves nothing either way.
        else if (status === 'verified' && result !== 'lookup_failed') record.set('status', 'needs_attention');
        record.set('verification_result', result);
        app.save(record);
        saved = record;
    });
    return { code: 200, body: { status: saved.getString('status'), result, checked_at: time(saved, 'verification_checked_at') } };
}

module.exports = { PREFIX, VALUE, RESOLVER, INTERVAL, read, save, issue, verify, txt };
