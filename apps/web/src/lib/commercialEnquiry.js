// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/commercialEnquiry.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     docs/business-execution.md, docs/research-sprint.md
// EnumType:    Adapter
// EnumEdges:   CONSUMES docs/business-execution.md; CONSUMES docs/research-sprint.md
// DAG Node:    none
// Intent:      Prepare bounded commercial email drafts without sending requests, granting authority or asserting payment.
// ───────────────────────────────────────────────────────────────

export const COMMERCIAL_CONTACT = 'licensing@citadel-nexus.com';
export const ENQUIRY_LIMITS = Object.freeze({ name: 120, email: 254, message: 2000, outcome: 400, constraints: 600 });
export const PILOT_SCOPE = Object.freeze([
    'One workspace and one agreed external operation',
    'A pilot duration and run limit agreed in writing',
    'Human approval before execution',
    'A recorded result, separate verifier and replay',
]);

/** Select only the supported enquiry from a public URL.
 * @param {string} search URL query string.
 * @returns {'pilot'|'government'|'commercial'} Public enquiry kind; other query data is ignored.
 */
export function commercialInterest(search) {
    const values = new URLSearchParams(search).getAll('interest');
    return values.length === 1 && ['pilot', 'government'].includes(values[0]) ? values[0] : 'commercial';
}

function textField(value, label, maximum, minimum = 1, multiline = false) {
    if (typeof value !== 'string') throw new TypeError(`Enter ${label}.`);
    const text = value.replace(/\r\n?/g, '\n').trim();
    const controls = [...text].some((character) => {
        const code = character.charCodeAt(0);
        return code === 127 || (code < 32 && !(multiline && (character === '\n' || character === '\t')));
    });
    if (text.length < minimum || text.length > maximum || controls) {
        throw new TypeError(`Use ${minimum}–${maximum} characters for ${label}, without control characters.`);
    }
    return text;
}

/** Prepare a fixed-recipient draft for explicit review in the user's email app.
 * @param {{interest: 'pilot'|'government'|'commercial', name: string, email: string, message: string, outcome?: string, constraints?: string}} input Reviewed form values.
 * @returns {{href: string, subject: string, body: string}} Encoded email and copyable plain text.
 * @throws {TypeError} When the enquiry is incomplete or outside the form limits.
 */
export function prepareCommercialEnquiry(input) {
    if (!input || !['pilot', 'government', 'commercial'].includes(input.interest)) throw new TypeError('Choose an enquiry type.');
    const name = textField(input.name, 'a name', ENQUIRY_LIMITS.name);
    const email = textField(input.email, 'an email address', ENQUIRY_LIMITS.email);
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new TypeError('Enter an email address.');
    const message = textField(input.message, 'the problem or enquiry', ENQUIRY_LIMITS.message, 10, true);
    let sections = [message];
    if (input.interest === 'pilot') {
        const outcome = textField(input.outcome, 'the desired result', ENQUIRY_LIMITS.outcome, 10, true);
        const constraints = textField(input.constraints ?? '', 'the optional restrictions', ENQUIRY_LIMITS.constraints, 0, true);
        sections = [
            'Paid-pilot scoping request',
            `Recurring problem:\n${message}`,
            `Desired result:\n${outcome}`,
            `Limits or data restrictions:\n${constraints || 'To agree during scoping.'}`,
            `Proposed scope:\n${PILOT_SCOPE.map((item) => `- ${item}`).join('\n')}`,
            'Before work starts: agree connector readiness, acceptance criteria, price and manual invoice terms, support, cancellation, and data access/retention/deletion. Execution still requires its own approval.',
        ];
    }
    if (input.interest === 'government') {
        sections = [
            'Government research membership request', message,
            'Requested tier: Government research, USD 100/month, subject to operator approval and confirmed payment.',
            'This enquiry does not confirm payment, activate membership, establish federal eligibility or authorize submission. Please confirm invoice, renewal and cancellation terms before activation.',
        ];
    }
    const subject = input.interest === 'pilot' ? 'BuildAndDo paid-pilot enquiry' : input.interest === 'government'
        ? 'BuildAndDo government membership enquiry' : 'BuildAndDo commercial enquiry';
    const body = [...sections, `From: ${name}\nReply to: ${email}`].join('\n\n');
    return { subject, body, href: `mailto:${COMMERCIAL_CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
