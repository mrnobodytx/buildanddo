// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/customerio-mail.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-MAIL-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-MAIL-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-25
// Depends:     apps/pocketbase/pb_hooks/builder-mailer.pb.js
// EnumType:    Adapter
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/builder-mailer.pb.js
// DAG Node:    none
// Intent:      Deliver PocketBase account mail through Customer.io without tracking or retaining the links it carries.
// ───────────────────────────────────────────────────────────────

// The JSVM loads CommonJS modules; this is not Node.js application code.
// PocketBase renders every account mail itself (password reset, verification,
// email change, one-time code, login alert). This module carries the rendered
// message to Customer.io's transactional API and nothing else.
//
// A reset or verification link works as a credential while it is valid, so each
// request turns off Customer.io's open and click tracking, which would rewrite
// the link through a tracking host, and its retention of the message body.
// Nothing this module returns or logs contains an address, a link or the key.

const HOSTS = { us: 'https://api.customer.io', eu: 'https://api-eu.customer.io' };
// A test points the module at a fake Customer.io on this machine; nothing else
// may replace the host, and never with plain http to another machine.
const OVERRIDE = /^(?:https:\/\/[A-Za-z0-9.-]+(?::\d{2,5})?|http:\/\/127\.0\.0\.1:\d{2,5})$/;
const ADDRESS = /^[^\s@<>"(),;:\\[\]]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const ANY_ADDRESS = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g;

function setting(env, name) {
    return String(env(name) || '').trim();
}

/** The send URL, or '' when the region or override is unusable. */
function endpoint(env) {
    const override = setting(env, 'CUSTOMERIO_API_URL');
    if (override) return OVERRIDE.test(override) ? override + '/v1/send/email' : '';
    const host = HOSTS[setting(env, 'CUSTOMERIO_REGION').toLowerCase() || 'us'];
    return host ? host + '/v1/send/email' : '';
}

function displayName(name) {
    return String(name || '').replace(/["\\<>\r\n\t]/g, '').trim().slice(0, 80);
}

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build one request from a rendered PocketBase message: { url, key, payload } or { error }. */
function request(message, env) {
    const url = endpoint(env);
    const key = setting(env, 'CUSTOMERIO_APP_API_KEY');
    const from = message && message.from ? message.from : {};
    const sender = setting(env, 'BUILDER_MAILER_SENDER_ADDRESS') || String(from.address || '').trim();
    const name = displayName(setting(env, 'BUILDER_MAILER_SENDER_NAME') || from.name || 'BuildAndDo');
    const replyTo = setting(env, 'BUILDER_MAILER_REPLY_TO');
    const recipients = message && message.to ? message.to : [];
    const to = recipients.length === 1 ? String(recipients[0].address || '').trim() : '';
    const html = String((message && message.html) || '');
    const text = String((message && message.text) || '');
    if (!url) return { error: 'endpoint' };
    if (!key) return { error: 'credential' };
    if (!ADDRESS.test(sender)) return { error: 'sender' };
    if (replyTo && !ADDRESS.test(replyTo)) return { error: 'reply_to' };
    if (!ADDRESS.test(to)) return { error: 'recipient' };
    if (!html && !text) return { error: 'empty' };
    const payload = {
        to,
        identifiers: { email: to },
        from: name ? `"${name}" <${sender}>` : sender,
        subject: String(message.subject || ''),
        body: html || `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre>`,
        tracked: false,
        disable_message_retention: true,
        send_to_unsubscribed: true,
    };
    if (text) payload.body_plain = text;
    if (replyTo) payload.reply_to = replyTo;
    return { url, key, payload };
}

/** Send one message: { ok: true, delivery } or { ok: false, reason, status, detail }. */
function send(message, http, env) {
    const built = request(message, env);
    if (built.error) return { ok: false, reason: 'config_' + built.error, status: 0, detail: '' };
    let res;
    try {
        res = http.send({
            url: built.url, method: 'POST', timeout: 20,
            headers: { Authorization: 'Bearer ' + built.key, 'Content-Type': 'application/json',
                Accept: 'application/json', 'User-Agent': 'BuildAndDo-PocketBase/1' },
            body: JSON.stringify(built.payload),
        });
    } catch (_) {
        return { ok: false, reason: 'unreachable', status: 0, detail: '' };
    }
    const json = res && res.json ? res.json : {};
    if (res.statusCode === 200 && typeof json.delivery_id === 'string' && json.delivery_id) {
        return { ok: true, delivery: json.delivery_id.slice(0, 80) };
    }
    // Customer.io explains a refusal in meta.error; it can quote the recipient.
    const said = json.meta && typeof json.meta.error === 'string' ? json.meta.error : '';
    const detail = said.replace(ANY_ADDRESS, '<address>').split(built.key).join('<key>').slice(0, 160);
    return { ok: false, reason: res.statusCode === 200 ? 'no_delivery_id' : 'rejected', status: res.statusCode, detail };
}

module.exports = { endpoint, request, send };
