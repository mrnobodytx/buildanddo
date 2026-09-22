// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/commercial-enquiry.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/commercialEnquiry.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/commercialEnquiry.js
// DAG Node:    none
// Intent:      Verify complete, bounded and safely encoded pilot enquiries while preserving the existing commercial draft path.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { commercialInterest, prepareCommercialEnquiry } from '../../apps/web/src/lib/commercialEnquiry.js';

const enquiry = Object.freeze({ interest: 'commercial', name: 'Pat & Team', email: 'pat+team@example.com', message: 'Licensing for five people & support.' });
const pilot = Object.freeze({ ...enquiry, interest: 'pilot', message: 'Each week we reconcile an approved supplier list.',
    outcome: 'A reviewer can confirm that the agreed rows were reconciled.', constraints: 'Public catalogue data only; no customer records.' });

test('preserve the general commercial enquiry and fixed recipient', () => {
    const draft = prepareCommercialEnquiry(enquiry), link = new URL(draft.href);
    assert.equal(link.protocol, 'mailto:');
    assert.equal(link.pathname, 'licensing@citadel-nexus.com');
    assert.equal(link.searchParams.get('subject'), 'BuildAndDo commercial enquiry');
    assert.equal(link.searchParams.get('body'), draft.body);
    assert.ok(draft.body.includes(enquiry.message));
    assert.ok(draft.body.includes(`From: ${enquiry.name}\nReply to: ${enquiry.email}`));
    assert.ok(!draft.body.includes('Paid-pilot'));
});

test('retain the requested outcome and restrictions beside explicitly proposed pilot terms', () => {
    const draft = prepareCommercialEnquiry(pilot);
    assert.equal(draft.subject, 'BuildAndDo paid-pilot enquiry');
    for (const text of [pilot.message, pilot.outcome, pilot.constraints, 'One workspace and one agreed external operation',
        'duration and run limit agreed in writing', 'Human approval before execution', 'separate verifier and replay',
        'manual invoice terms', 'support, cancellation', 'data access/retention/deletion', 'Execution still requires its own approval']) {
        assert.ok(draft.body.includes(text), text);
    }
    assert.ok(draft.body.startsWith('Paid-pilot scoping request'));
    assert.equal(new URL(draft.href).searchParams.get('body'), draft.body);
    assert.deepEqual(pilot, { ...enquiry, interest: 'pilot', message: 'Each week we reconcile an approved supplier list.',
        outcome: 'A reviewer can confirm that the agreed rows were reconciled.', constraints: 'Public catalogue data only; no customer records.' });
});

test('optional restrictions remain undecided rather than implying unrestricted data access', () => {
    const { constraints: _unused, ...withoutRestrictions } = pilot;
    assert.match(prepareCommercialEnquiry(withoutRestrictions).body, /Limits or data restrictions:\nTo agree during scoping\./);
    assert.match(prepareCommercialEnquiry({ ...pilot, constraints: '   ' }).body, /To agree during scoping\./);
});

test('arbitrary query data cannot prefill contact details, change the recipient or select unknown offers', () => {
    assert.equal(commercialInterest('?interest=pilot'), 'pilot');
    assert.equal(commercialInterest('?name=Injected&interest=pilot&to=elsewhere%40example.com'), 'pilot');
    for (const query of ['', '?interest=team', '?interest=Pilot', '?interest=pilot&interest=commercial',
        '?interest=pilot&interest=pilot', '?interest=pilot%26bcc%3Devil', '?outcome=Already%20verified']) {
        assert.equal(commercialInterest(query), 'commercial', query);
    }
});

test('query delimiters, Unicode and header-like message content stay inside the encoded body', () => {
    const content = 'Café & café? #1 = 100% + 東京\nBcc: someone@example.com\n<script>alert(1)</script>';
    const draft = prepareCommercialEnquiry({ ...pilot, name: 'Zoë & Partners', message: content,
        to: 'elsewhere@example.com', subject: 'Replace subject', approved: true, paid: true });
    const link = new URL(draft.href);
    assert.equal(link.pathname, 'licensing@citadel-nexus.com');
    assert.deepEqual([...link.searchParams.keys()], ['subject', 'body']);
    assert.equal(link.hash, '');
    assert.equal(link.searchParams.get('subject'), 'BuildAndDo paid-pilot enquiry');
    assert.ok(link.searchParams.get('body').includes(content));
    assert.ok(link.searchParams.get('body').includes('Zoë & Partners'));
    assert.equal(link.searchParams.get('body'), draft.body);
});

test('reject incomplete, whitespace-only and malformed inputs with typed errors', () => {
    for (const input of [null, {}, { ...enquiry, interest: 'subscription' }, { ...enquiry, name: '' },
        { ...enquiry, name: 42 }, { ...enquiry, email: 'missing-at.example.com' }, { ...enquiry, email: 'a@b@c' },
        { ...enquiry, email: 'pat @example.com' }, { ...enquiry, message: '          ' },
        { ...enquiry, message: 'Too short' }, { ...enquiry, message: {} },
        { ...pilot, outcome: undefined }, { ...pilot, outcome: 'short' }, { ...pilot, constraints: [] }]) {
        assert.throws(() => prepareCommercialEnquiry(input), TypeError);
    }
});

test('reject embedded header/control characters in identity fields and control bytes in the request', () => {
    for (const input of [{ ...enquiry, name: 'Pat\nBcc: someone@example.com' },
        { ...enquiry, name: 'Pat\tTeam' }, { ...enquiry, email: 'pat@example.com\r\nCc:other@example.com' },
        { ...pilot, message: 'A valid request\u0000with a hidden delimiter' },
        { ...pilot, outcome: 'A complete result\u007fwith a control' }, { ...pilot, constraints: 'Remove\u0007alerts' }]) {
        assert.throws(() => prepareCommercialEnquiry(input), TypeError);
    }
});

test('reject oversized fields without truncating agreed scope', () => {
    for (const [field, length] of [['name', 121], ['email', 255], ['message', 2001], ['outcome', 401], ['constraints', 601]]) {
        assert.throws(() => prepareCommercialEnquiry({ ...pilot, [field]: 'x'.repeat(length) }), TypeError, field);
    }
});

test('keep every accepted character in the copyable preview and encoded email', () => {
    const input = { ...pilot, name: 'N'.repeat(120), email: `${'a'.repeat(242)}@example.com`,
        message: '東京'.repeat(1000), outcome: 'Outcome '.repeat(50), constraints: 'Limit '.repeat(100) };
    const draft = prepareCommercialEnquiry(input);
    for (const value of [input.name, input.email, input.message, input.outcome.trim(), input.constraints.trim()]) {
        assert.ok(draft.body.includes(value));
    }
    assert.equal(new URL(draft.href).searchParams.get('body'), draft.body);
});

test('normalize surrounding whitespace and line endings without changing substantive input', () => {
    const draft = prepareCommercialEnquiry({ ...pilot, name: ' Pat & Team ', email: ' pat+team@example.com ',
        message: ' Review approved rows.\r\n\tKeep their order.\rRecord the result. ' });
    assert.ok(draft.body.includes('Review approved rows.\n\tKeep their order.\nRecord the result.'));
    assert.ok(!draft.body.includes('\r'));
    assert.ok(draft.body.endsWith('From: Pat & Team\nReply to: pat+team@example.com'));
});
