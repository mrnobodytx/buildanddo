// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/government-access.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/workflow-policy.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js
// Intent:      Require a current paid and approved membership before disclosing government work.
// ───────────────────────────────────────────────────────────────

const base = require(`${__hooks}/workflow-policy.js`);
const COLLECTION = 'government_memberships';
const PRICE = Object.freeze({ tier: 'government', amount_cents: 10000, currency: 'USD', interval: 'month' });
const FIELDS = ['user', 'tier', 'status', 'amount_cents', 'currency', 'interval', 'payment_reference',
    'approved_by', 'approved_at', 'starts_at', 'expires_at', 'protocol_version'];
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const INDEX = 'create unique index idx_government_membership_user on government_memberships (user)';
const LESSON_RULE = "@request.auth.id != '' && category != 'Government submissions'";

function timestamp(value) {
    if (typeof value !== 'string') return NaN;
    const normalized = value.replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(normalized)) return NaN;
    const result = Date.parse(normalized);
    return Number.isFinite(result) && new Date(result).toISOString().slice(0, 19) === normalized.slice(0, 19) ? result : NaN;
}

/** @param {object} app Native app. @param {object} auth Native users record. @param {number} at Server clock. @returns {object} Minimal membership projection. */
function status(app, auth, at = Date.now()) {
    const denied = (reason) => ({ ...PRICE, allowed: false, reason, expires_at: '' });
    if (!auth || auth.collection().name !== 'users') return denied('sign_in_required');
    if (!Number.isFinite(at)) return denied('membership_unavailable');
    let collection;
    try { collection = app.findCollectionByNameOrId(COLLECTION); }
    catch (error) {
        if (!String(error.message).includes('no rows in result set')) throw error;
        return denied('membership_unavailable');
    }
    if (FIELDS.some((name) => !collection.fields.getByName(name)) ||
        RULES.some((name) => collection[name] !== null) || !collection.indexes.includes(INDEX))
        return denied('membership_unavailable');
    const rows = app.findRecordsByFilter(COLLECTION, 'user = {:user}', '', 2, 0, { user: auth.id });
    if (!rows.length) return denied('membership_required');
    if (rows.length !== 1) return denied('membership_unavailable');
    const row = rows[0];
    if (row.getString('user') !== auth.id || row.get('protocol_version') !== 1 || row.getString('tier') !== PRICE.tier ||
        row.getString('status') !== 'active' || row.get('amount_cents') !== PRICE.amount_cents ||
        row.getString('currency') !== PRICE.currency || row.getString('interval') !== PRICE.interval ||
        !row.getString('payment_reference').trim()) return denied('membership_required');
    const approval = timestamp(row.getString('approved_at'));
    if (!row.getString('approved_by').trim() || !(approval <= at)) return denied('approval_required');
    const start = timestamp(row.getString('starts_at')); const end = timestamp(row.getString('expires_at'));
    if (!(start <= at && end > at && start < end)) return denied('membership_expired');
    return { ...PRICE, allowed: true, reason: 'active', expires_at: new Date(end).toISOString() };
}

/** @param {object} app Native app. @param {object} auth Authenticated record. @returns {object} Active membership or a denial. */
function requireMember(app, auth) {
    const value = status(app, auth);
    if (!value.allowed) throw new ForbiddenError('Government work requires a current $100/month membership and operator approval.');
    return value;
}

/** @param {object} e Native request. @returns {object} Own account membership without billing or approval identifiers. */
function read(e) { base.authenticated(e); return { account_id: e.auth.id, ...status(e.app, e.auth) }; }

/** @param {object} app Native app. @param {object} auth Authenticated record. @param {object} tutorial Native lesson. @returns {boolean} Whether this is restricted learning. */
function lesson(app, auth, tutorial) {
    if (tutorial.getString('category') !== 'Government submissions') return false;
    requireMember(app, auth);
    if (String(tutorial.collection().viewRule) !== LESSON_RULE || String(tutorial.collection().listRule) !== LESSON_RULE)
        throw new ApiError(503, 'Government lesson access needs an operator review.');
    return true;
}

module.exports = { COLLECTION, PRICE, FIELDS, RULES, INDEX, LESSON_RULE, status, requireMember, read, lesson };
