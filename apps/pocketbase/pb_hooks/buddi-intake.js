// CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/buddi-intake.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-002
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/public-api.js, apps/pocketbase/pb_hooks/workspace-access.js,
//              apps/pocketbase/pb_migrations/1792100000_buddi_intake.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/public-api.js; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js;
//              PRODUCES buddi_intake; SERVED_BY apps/pocketbase/pb_hooks/public-api.pb.js
// DAG Node:    none
// Intent:      Accept the public voice agent's three bounded requests only from the agent, only in the shape its
//              tools declare, and only as often as a conversation plausibly needs - and hand back a receipt.
// ───────────────────────────────────────────────────────────────

// The order of refusals is the contract, and each one is a different fact:
//
//   503 CLOSED        BUDDI_TOOL_SECRET is unset (or shorter than 32 characters). The routes are
//                     closed until an operator configures them; an unset secret never means "open".
//   401 UNAUTHORIZED  x-buddi-tool-secret is missing or wrong. Compared as SHA-256 digests with
//                     $security.equal, so neither the value nor its length leaks through timing.
//   400 INVALID       a missing or malformed x-conversation-id, or a body outside the tool schema:
//                     not a JSON object, a field the tool does not declare, a missing required field,
//                     a string over its cap or carrying control characters, a rating outside 1-5.
//   404 UNKNOWN       a demo-challenge request naming a challenge that is not public.
//   429 RATE_LIMITED  5 stored requests for this conversation, or 200 across all of them in an hour.
//
// Only then is a row written. The receipt is that row's id: it is what lets the agent truthfully tell
// someone their request was submitted, and a retried identical request gets the SAME receipt back
// instead of a second row - the unique index on (conversation_id, payload_digest) holds that even
// when two retries race.

const api = require(`${__hooks}/public-api.js`);
const access = require(`${__hooks}/workspace-access.js`);

const SOURCE = 'buddi_intake: a server-only collection a person reviews';
const FIELDS = ['kind', 'payload', 'payload_digest', 'conversation_id', 'trace_id', 'campaign_id', 'status', 'notification', 'protocol_version'];
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const HEADER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
// Tab, line feed and carriage return are ordinary in a spoken summary; every other control
// character is not, and would reach a moderator's screen or a Discord message as-is.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const MIN_SECRET = 32;
const MAX_BODY = 16000;
// Read up to this much before judging the size. Answering after reading only MAX_BODY left the rest
// of the upload unread, and the server's close then reset the connection before the caller could
// read the 413 - measured on 0.39.8. Anything past this cap is not worth draining.
const READ_CAP = 262144;
const PER_CONVERSATION = 5;
const PER_HOUR = 200;
const CONTRACTS = {
    challenge_request: {
        text: { challenge_id: [100, true], user_objective: [2000, true], success_criteria: [2000, true], business_context: [2000, false] },
        numbers: {},
        next: 'A person reviews the request. Nothing has started, and this receipt grants no execution authority.',
    },
    feedback: {
        text: { feedback_type: [100, true], summary: [2000, true], challenge_id: [100, false] },
        numbers: { rating: [1, 5] },
        next: 'Recorded for the BuildAndDo team to read.',
    },
    handoff: {
        text: { reason: [500, true], summary: [2000, true], preferred_contact_method: [200, false], challenge_id: [100, false] },
        numbers: {},
        next: 'A person from the BuildAndDo team reviews every handoff. This receipt does not promise a response time.',
    },
};

function refuse(e, status, state, reason, extra = {}) {
    return api.reply(e, status, 'A2', SOURCE, Object.assign({ state, reason }, extra));
}

/** @returns {object|string} The collection, or the reason it cannot be used. */
function schema(app) {
    let collection;
    try {
        collection = app.findCollectionByNameOrId('buddi_intake');
    } catch (error) {
        if (String(error).includes('no rows in result set')) return 'Buddi requests are not installed on this server.';
        throw error;
    }
    // Rules reach the JSVM as bound objects, so compare their text; null stays null (superuser-only).
    if (RULES.some((rule) => collection[rule] !== null && collection[rule] !== undefined)) {
        return 'Buddi requests need an operator review before they can be accepted.';
    }
    if (FIELDS.some((name) => !collection.fields.getByName(name))) return 'Buddi requests are not installed on this server.';
    return collection;
}

/** @returns {{payload: object}|{field: string, reason: string}} The validated payload or the first thing wrong with it. */
function validate(kind, raw) {
    let body;
    try { body = JSON.parse(raw); } catch (_) { return { field: 'body', reason: 'Send a JSON object.' }; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { field: 'body', reason: 'Send a JSON object.' };
    const contract = CONTRACTS[kind];
    const declared = [...Object.keys(contract.text), ...Object.keys(contract.numbers)];
    const extra = Object.keys(body).find((key) => !declared.includes(key));
    if (extra !== undefined) return { field: extra.slice(0, 60), reason: `This tool does not accept the field ${extra.slice(0, 60)}.` };
    const payload = {};
    for (const name of Object.keys(contract.text)) {
        const [max, required] = contract.text[name];
        const value = body[name];
        if (value === undefined || value === null || (!required && value === '')) {
            if (required) return { field: name, reason: `${name} is required.` };
            continue;
        }
        if (typeof value !== 'string' || !value.trim()) return { field: name, reason: `${name} must be non-empty text.` };
        if (value.length > max) return { field: name, reason: `${name} must be at most ${max} characters.` };
        if (CONTROL.test(value)) return { field: name, reason: `${name} contains control characters.` };
        payload[name] = value.trim();
    }
    for (const name of Object.keys(contract.numbers)) {
        const [low, high] = contract.numbers[name];
        const value = body[name];
        if (value === undefined || value === null) continue;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
            return { field: name, reason: `${name} must be a number from ${low} to ${high}.` };
        }
        payload[name] = value;
    }
    if (payload.challenge_id !== undefined && !api.CHALLENGE_ID.test(payload.challenge_id)) {
        return { field: 'challenge_id', reason: 'challenge_id must be a lesson slug or record id.' };
    }
    return { payload };
}

/** @returns {string} What happened to the moderator notice, in words short enough for the record. */
function notify(record, payload, conversation) {
    const url = String($os.getenv('BUDDI_HANDOFF_DISCORD_WEBHOOK') || '').trim();
    if (!url) return 'not_configured';
    // https for the real webhook; plain http only to a loopback address, which is where a test double lives.
    if (!/^https:\/\/[^\s/]+\/\S+$/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:[0-9]{1,5})?\/\S+$/.test(url)) return 'misconfigured';
    const line = (label, value, max) => `${label}: ${String(value || '').replace(/\s+/g, ' ').trim().slice(0, max) || 'not given'}`;
    const content = [
        `Buddi handoff request ${record.id}`,
        line('Reason', payload.reason, 500),
        line('Summary', payload.summary, 1000),
        line('Preferred contact', payload.preferred_contact_method, 200),
        line('Challenge', payload.challenge_id, 100),
        line('Conversation', conversation, 128),
    ].join('\n').slice(0, 1900);
    try {
        const response = $http.send({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // parse: [] means no @everyone, role or user mention can ping anyone, whatever the text
            // says; flag 4 suppresses link embeds.
            body: JSON.stringify({ content, allowed_mentions: { parse: [] }, flags: 4 }),
            timeout: 5,
        });
        return response.statusCode >= 200 && response.statusCode < 300 ? 'sent' : `failed:${response.statusCode}`;
    } catch (_) {
        return 'failed:unreachable';
    }
}

function receipt(e, status, record, kind, replayed, extra = {}) {
    return api.reply(e, status, 'A2', SOURCE, Object.assign({
        state: 'RECEIVED',
        receipt_id: record.id,
        status: record.getString('status'),
        kind,
        replayed,
        next: CONTRACTS[kind].next,
    }, extra));
}

/** POST handler for one of the three request kinds: challenge_request, feedback, handoff. */
function submit(e, kind) {
    return api.guard(e, 'A2', SOURCE, () => {
        // Read the body FIRST, before any refusal. A refusal written while the upload is still unread
        // is followed by a connection close the caller sees as a reset, never as the 401 or 503 it
        // was sent - measured on 0.39.8 - and an agent that cannot read why it was refused cannot
        // say why either.
        const raw = toString(e.request.body, READ_CAP);
        const configured = String($os.getenv('BUDDI_TOOL_SECRET') || '').trim();
        if (configured.length < MIN_SECRET) return refuse(e, 503, 'CLOSED', 'Buddi requests are not enabled on this server.');
        const offered = String(e.request.header.get('X-Buddi-Tool-Secret') || '');
        if (!offered || !$security.equal($security.sha256(offered), $security.sha256(configured))) {
            return refuse(e, 401, 'UNAUTHORIZED', 'This route accepts requests from the BuildAndDo voice agent only.');
        }
        const conversation = String(e.request.header.get('X-Conversation-Id') || '');
        if (!HEADER_ID.test(conversation)) {
            return refuse(e, 400, 'INVALID', 'An x-conversation-id header of letters, digits and _.:- is required.', { field: 'x-conversation-id' });
        }
        // Trace and campaign ids are metadata. One that does not fit is dropped, not allowed to fail the request.
        const optional = (name) => { const value = String(e.request.header.get(name) || ''); return HEADER_ID.test(value) ? value : ''; };
        if (raw.length > MAX_BODY) return refuse(e, 413, 'INVALID', `The request body must be at most ${MAX_BODY} characters.`, { field: 'body' });
        const checked = validate(kind, raw);
        if (!checked.payload) return refuse(e, 400, 'INVALID', checked.reason, { field: checked.field });
        const payload = checked.payload;
        if (kind === 'challenge_request' && !api.findLesson(e.app, payload.challenge_id)) {
            return refuse(e, 404, 'UNKNOWN', `No public challenge has the id ${payload.challenge_id}.`, { field: 'challenge_id' });
        }
        const collection = schema(e.app);
        if (typeof collection === 'string') return refuse(e, 503, 'UNAVAILABLE', collection);
        const digest = $security.sha256(access.canonical({ kind, payload }));
        const prior = (app) => app.findRecordsByFilter('buddi_intake', 'conversation_id = {:conversation} && payload_digest = {:digest}',
            '', 1, 0, { conversation, digest })[0] || null;

        let outcome = null;
        try {
            e.app.runInTransaction((app) => {
                const existing = prior(app);
                if (existing) { outcome = { record: existing, replayed: true }; return; }
                // countRecords takes dbx expressions, which are SQL - not the filter syntax above.
                if (app.countRecords('buddi_intake', $dbx.exp('conversation_id = {:conversation}', { conversation })) >= PER_CONVERSATION) {
                    outcome = { limited: `This conversation has already sent ${PER_CONVERSATION} requests. A person can be reached through https://buildanddo.com/contact.` };
                    return;
                }
                const since = new Date(Date.now() - 3600000).toISOString().replace('T', ' ');
                if (app.countRecords('buddi_intake', $dbx.exp('created >= {:since}', { since })) >= PER_HOUR) {
                    outcome = { limited: 'Buddi has received as many requests as it accepts in an hour. Please try again later.' };
                    return;
                }
                const record = new Record(collection);
                const values = { kind, payload, payload_digest: digest, conversation_id: conversation, trace_id: optional('X-Trace-Id'),
                    campaign_id: optional('X-Campaign-Id'), status: 'received', notification: '', protocol_version: 1 };
                for (const name of Object.keys(values)) record.set(name, values[name]);
                app.save(record);
                outcome = { record, replayed: false };
            });
        } catch (error) {
            // Two identical retries raced past the lookup; the index kept one row, so return it.
            if (!String(error).includes('unique')) throw error;
            const existing = prior(e.app);
            if (!existing) throw error;
            outcome = { record: existing, replayed: true };
        }
        if (outcome.limited) return refuse(e, 429, 'RATE_LIMITED', outcome.limited);
        if (outcome.replayed) return receipt(e, 200, outcome.record, kind, true);
        const extra = {};
        if (kind === 'handoff') {
            extra.notification = notify(outcome.record, payload, conversation);
            outcome.record.set('notification', extra.notification);
            try {
                e.app.save(outcome.record);
            } catch (error) {
                e.app.logger().warn('buddi intake could not record the notification result', 'error', String(error));
            }
        }
        return receipt(e, 201, outcome.record, kind, false, extra);
    });
}

module.exports = { CONTRACTS, PER_CONVERSATION, PER_HOUR, MIN_SECRET, validate, submit };
