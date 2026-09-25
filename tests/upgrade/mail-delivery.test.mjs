// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/mail-delivery.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-MAIL-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-MAIL-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-25
// Depends:     apps/pocketbase/pb_hooks/builder-mailer.pb.js, apps/pocketbase/pb_hooks/customerio-mail.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/builder-mailer.pb.js; VALIDATES apps/pocketbase/pb_hooks/customerio-mail.js
// DAG Node:    none
// Intent:      Prove account mail reaches Customer.io untracked and unretained, fails closed on bad configuration, and never logs an address, link or key.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');

class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

const LINK = 'https://buildanddo.com/reset-password?token=fixture.reset.signature';
const LEARNER = 'learner@fixture.invalid';
const CREDENTIAL = 'fixture-key';
const CONFIGURED = Object.freeze({
    BUILDER_MAILER_PROVIDER: 'customerio',
    CUSTOMERIO_APP_API_KEY: CREDENTIAL,
    BUILDER_MAILER_SENDER_ADDRESS: 'noreply@sender.invalid',
    BUILDER_MAILER_SENDER_NAME: 'BuildAndDo',
});

// What PocketBase hands the hook for a password reset: its own sender settings,
// one recipient and the rendered template.
const resetMail = (overrides = {}) => ({
    from: { address: 'support@example.com', name: 'Support' },
    to: [{ address: LEARNER, name: '' }],
    subject: 'Reset your BuildAndDo password',
    html: `<p>Choose a new password: <a href="${LINK}">reset</a></p>`,
    text: '',
    ...overrides,
});

const ok = () => ({ statusCode: 200, json: { delivery_id: 'fixture-delivery-1', queued_at: 1 } });

/** Load the real hook source the way PocketBase does: the handler sees only globals and require(). */
function load(env, respond = ok) {
    const calls = [], logs = [];
    let handler = null;
    const logger = {
        error: (...args) => logs.push(['error', ...args]),
        info: (...args) => logs.push(['info', ...args]),
    };
    const requireHook = (path) => {
        assert.equal(path, '/hooks/customerio-mail.js');
        const module = { exports: {} };
        vm.runInNewContext(source('apps/pocketbase/pb_hooks/customerio-mail.js'), { module, exports: module.exports });
        return module.exports;
    };
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/builder-mailer.pb.js'), {
        __hooks: '/hooks', require: requireHook, ApiError,
        $http: { send: (req) => { calls.push(req); return respond(req); } },
        $os: { getenv: (name) => (Object.hasOwn(env, name) ? env[name] : '') },
        $app: { logger: () => logger },
        onMailerSend: (fn) => { handler = fn; },
    });
    assert.equal(typeof handler, 'function');
    const run = (message, smtp = false) => {
        let forwarded = false;
        const event = {
            app: { settings: () => ({ smtp: { enabled: smtp } }), logger: () => logger },
            message, next: () => { forwarded = true; },
        };
        let error = null;
        try { handler(event); } catch (caught) { error = caught; }
        return { forwarded, error };
    };
    return { run, calls, logs };
}

const logText = (logs) => JSON.stringify(logs);

test('a reset mail goes to Customer.io once, untracked, unretained and from the configured sender', () => {
    const { run, calls, logs } = load(CONFIGURED);
    const { forwarded, error } = run(resetMail());
    assert.equal(error, null);
    assert.equal(forwarded, false, 'the default mailer must not also send it');
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.url, 'https://api.customer.io/v1/send/email');
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, `Bearer ${CREDENTIAL}`);
    assert.equal(call.headers['Content-Type'], 'application/json');
    assert.ok(call.timeout > 0 && call.timeout <= 30);
    const body = JSON.parse(call.body);
    assert.deepEqual(Object.keys(body).sort(), ['body', 'disable_message_retention', 'from', 'identifiers', 'send_to_unsubscribed',
        'subject', 'to', 'tracked'].sort());
    assert.equal(body.to, LEARNER);
    assert.deepEqual(body.identifiers, { email: LEARNER });
    assert.equal(body.from, '"BuildAndDo" <noreply@sender.invalid>');
    assert.equal(body.subject, 'Reset your BuildAndDo password');
    assert.ok(body.body.includes(LINK), 'the rendered link is delivered unchanged');
    assert.equal(body.tracked, false, 'tracking would rewrite the reset link through a tracking host');
    assert.equal(body.disable_message_retention, true, 'the reset link must not stay in delivery history');
    assert.equal(body.send_to_unsubscribed, true, 'account mail is not marketing');
    assert.deepEqual(logs, [['info', 'Account email handed to Customer.io', 'delivery', 'fixture-delivery-1']]);
});

test('the EU region and a loopback test host change only the host', () => {
    const eu = load({ ...CONFIGURED, CUSTOMERIO_REGION: 'EU' });
    eu.run(resetMail());
    assert.equal(eu.calls[0].url, 'https://api-eu.customer.io/v1/send/email');
    const local = load({ ...CONFIGURED, CUSTOMERIO_API_URL: 'http://127.0.0.1:8123' });
    local.run(resetMail());
    assert.equal(local.calls[0].url, 'http://127.0.0.1:8123/v1/send/email');
});

test('plain-text mail is escaped into the HTML body and kept as the plain body', () => {
    const { run, calls } = load(CONFIGURED);
    assert.equal(run(resetMail({ html: '', text: 'Code: 123456 <b>&' })).error, null);
    const body = JSON.parse(calls[0].body);
    assert.equal(body.body_plain, 'Code: 123456 <b>&');
    assert.ok(body.body.includes('Code: 123456 &lt;b&gt;&amp;'));
    assert.ok(!body.body.includes('<b>'));
});

test('a reply-to address is sent only when configured and valid', () => {
    const { run, calls } = load({ ...CONFIGURED, BUILDER_MAILER_REPLY_TO: 'help@sender.invalid' });
    run(resetMail());
    assert.equal(JSON.parse(calls[0].body).reply_to, 'help@sender.invalid');
    const bad = load({ ...CONFIGURED, BUILDER_MAILER_REPLY_TO: 'help@sender.invalid\r\nBcc: x@y.invalid' });
    assert.ok(bad.run(resetMail()).error instanceof ApiError);
    assert.equal(bad.calls.length, 0);
});

test('a display name cannot break out of its quotes or add a header', () => {
    const { run, calls } = load({ ...CONFIGURED, BUILDER_MAILER_SENDER_NAME: 'Build"And\r\nBcc: <x@y.invalid>' });
    run(resetMail());
    const from = JSON.parse(calls[0].body).from;
    assert.equal(from, '"BuildAndBcc: x@y.invalid" <noreply@sender.invalid>');
    assert.ok(!/[\r\n]/.test(from));
});

test('bad configuration refuses before any request and says which setting, never its value', () => {
    const cases = [
        [{ ...CONFIGURED, CUSTOMERIO_APP_API_KEY: '' }, 'config_credential'],
        [{ ...CONFIGURED, CUSTOMERIO_REGION: 'ap' }, 'config_endpoint'],
        [{ ...CONFIGURED, CUSTOMERIO_API_URL: 'http://collector.invalid' }, 'config_endpoint'],
        [{ ...CONFIGURED, CUSTOMERIO_API_URL: 'https://api.customer.io/v1/send/email?x=' }, 'config_endpoint'],
        [{ ...CONFIGURED, BUILDER_MAILER_SENDER_ADDRESS: 'not-an-address' }, 'config_sender'],
    ];
    for (const [env, reason] of cases) {
        const { run, calls, logs } = load(env);
        const { error, forwarded } = run(resetMail());
        assert.ok(error instanceof ApiError, reason);
        assert.equal(error.status, 500);
        assert.equal(error.message, 'Failed to send email');
        assert.equal(forwarded, false);
        assert.equal(calls.length, 0, reason);
        assert.equal(logs.length, 1);
        assert.equal(logs[0][0], 'error');
        assert.equal(logs[0][logs[0].indexOf('reason') + 1], reason);
        assert.ok(!logText(logs).includes(LEARNER) && !logText(logs).includes(LINK));
    }
});

test('the sender falls back to PocketBase settings when no sender is configured', () => {
    const env = { ...CONFIGURED };
    delete env.BUILDER_MAILER_SENDER_ADDRESS;
    delete env.BUILDER_MAILER_SENDER_NAME;
    const { run, calls } = load(env);
    run(resetMail());
    assert.equal(JSON.parse(calls[0].body).from, '"Support" <support@example.com>');
});

test('a message for zero or several recipients is refused, not sent to the first', () => {
    for (const to of [[], [{ address: LEARNER }, { address: 'second@fixture.invalid' }], [{ address: 'x' }]]) {
        const { run, calls, logs } = load(CONFIGURED);
        assert.ok(run(resetMail({ to })).error instanceof ApiError);
        assert.equal(calls.length, 0);
        assert.equal(logs[0][logs[0].indexOf('reason') + 1], 'config_recipient');
    }
});

test('an empty message is refused', () => {
    const { run, calls } = load(CONFIGURED);
    assert.ok(run(resetMail({ html: '', text: '' })).error instanceof ApiError);
    assert.equal(calls.length, 0);
});

test('a refusal is logged with its status and a scrubbed reason, never the address, link or key', () => {
    const refusal = () => ({ statusCode: 400, json: { meta: { error: `from address not verified for ${LEARNER}; key ${CREDENTIAL}` } } });
    const { run, logs } = load(CONFIGURED, refusal);
    const { error } = run(resetMail());
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, 'Failed to send email');
    const line = logs[0];
    assert.equal(line[line.indexOf('reason') + 1], 'rejected');
    assert.equal(line[line.indexOf('status') + 1], 400);
    assert.equal(line[line.indexOf('detail') + 1], 'from address not verified for <address>; key <key>');
    const text = logText(logs);
    for (const secret of [LEARNER, LINK, CREDENTIAL]) assert.ok(!text.includes(secret), secret);
    assert.ok(!error.message.includes(LEARNER));
});

test('a 200 without a delivery id and an unreachable host both count as failures', () => {
    const empty = load(CONFIGURED, () => ({ statusCode: 200, json: {} }));
    assert.ok(empty.run(resetMail()).error instanceof ApiError);
    assert.equal(empty.logs[0][empty.logs[0].indexOf('reason') + 1], 'no_delivery_id');
    const down = load(CONFIGURED, () => { throw new Error(`dial tcp: ${CREDENTIAL}`); });
    assert.ok(down.run(resetMail()).error instanceof ApiError);
    assert.equal(down.logs[0][down.logs[0].indexOf('reason') + 1], 'unreachable');
    assert.ok(!logText(down.logs).includes(CREDENTIAL));
});

test('SMTP, when enabled, still wins and nothing reaches Customer.io', () => {
    const { run, calls } = load(CONFIGURED);
    const { forwarded, error } = run(resetMail(), true);
    assert.equal(error, null);
    assert.equal(forwarded, true);
    assert.equal(calls.length, 0);
});

test('without the provider switch the builder mailer path is unchanged', () => {
    const env = { BUILDER_MAILER_API_URL: 'https://mailer.invalid', BUILDER_MAILER_API_KEY: 'k', BUILDER_MAILER_SENDER_ADDRESS: 'noreply@sender.invalid',
        CUSTOMERIO_APP_API_KEY: CREDENTIAL };
    const { run, calls } = load(env);
    assert.equal(run(resetMail()).error, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://mailer.invalid/api/v2/email');
    assert.equal(calls[0].headers.Authorization, 'Bearer k');
    assert.equal(JSON.parse(calls[0].body).to, LEARNER);
});
