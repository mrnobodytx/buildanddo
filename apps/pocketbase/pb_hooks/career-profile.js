// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/career-profile.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CAREER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CAREER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/career/profile.py
// EnumType:    Service
// EnumEdges:   CONSUMES apps/career/profile.py; CONSUMES Citadel Nexus career profile endpoint; PRODUCES apps/pocketbase/pb_hooks/career-profile.pb.js
// DAG Node:    none
// Intent:      Fetch the signed-in user's career profile from Citadel Nexus server-to-server and return only an allow-listed, account-bound projection, storing nothing.
// ───────────────────────────────────────────────────────────────
//
// Environment (set by the operator; never committed):
//   BUILDANDDO_CAREER_PROFILE_URL    Citadel endpoint; https://, or http:// on loopback only.
//   BUILDANDDO_CAREER_PROFILE_TOKEN  service bearer token; never sent to the browser.
// Request to Citadel: POST {subject_id, email} where email is present only when verified.
// Citadel answers 200 with a buildanddo.career.profile/v1 envelope, or 404 when it holds
// no profile for the subject. Anything else is "unavailable". Nothing is persisted here.

const PROFILE = 'buildanddo.career.profile/v1';
const PASSPORT = 'buildanddo.career.passport/v1';
const STATES = ['VERIFIED', 'OBSERVED', 'DECLARED', 'ABSENT'];
const PARTICIPATION = ['PERSONALLY_IMPLEMENTED', 'AGENT_ASSISTED', 'PERSONALLY_OPERATED', 'DESIGNED', 'DIRECTED',
    'REVIEWED', 'VERIFIED', 'ASSESSED', 'TEAM_DELIVERED', 'SELF_REPORTED', 'AGENT_EXECUTED'];
const MAX_BYTES = 1024 * 1024;

const text = (value, max) => typeof value === 'string' && value.length <= max;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The JSVM has no WHATWG URL, so the endpoint is checked with a strict pattern:
// https to any host, or http to loopback only; no credentials, spaces or fragments.
function endpoint(raw) {
    if (!raw) return null;
    const match = /^(https?):\/\/([A-Za-z0-9.-]+|\[::1\])(:\d{1,5})?(\/[^\s#@]*)?$/.exec(raw);
    if (!match) return false;
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(match[2].toLowerCase());
    return match[1] === 'https' || loopback ? raw : false;
}

function capability(entry) {
    if (!plain(entry) || !/^[a-z_]{1,40}$/.test(entry.capability_id) || !text(entry.label, 80) ||
        !text(entry.claim_verb, 60) || !PARTICIPATION.includes(entry.claim_participation) ||
        !STATES.includes(entry.state) || entry.verified !== (entry.state === 'VERIFIED') ||
        !Number.isSafeInteger(entry.records) || entry.records < 1 || !plain(entry.participation_counts) ||
        !Object.entries(entry.participation_counts).every(([key, value]) => PARTICIPATION.includes(key) && count(value)) ||
        !text(entry.first_seen, 40) || !text(entry.last_seen, 40) ||
        typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1) return null;
    // Evidence references and details stay in Citadel; the login view needs the summary only.
    return { capability_id: entry.capability_id, label: entry.label, claim_verb: entry.claim_verb,
        claim_participation: entry.claim_participation, state: entry.state, verified: entry.verified,
        records: entry.records, participation_counts: { ...entry.participation_counts },
        first_seen: entry.first_seen, last_seen: entry.last_seen, confidence: entry.confidence };
}

function source(item) {
    if (!plain(item) || !text(item.kind, 40) || !item.kind) return null;
    const kept = { kind: item.kind };
    for (const [key, value] of Object.entries(item)) if (/^[a-z_]{1,40}$/.test(key) && count(value)) kept[key] = value;
    if (typeof item.head === 'string' && /^[a-f0-9]{40}$/.test(item.head)) kept.head = item.head;
    return kept;
}

/** Validate an envelope for one account and return the projection, or null. */
function project(body, subject) {
    if (!plain(body) || body.schema !== PROFILE || body.subject_id !== subject || !text(body.issued_at, 40)) return null;
    const passport = body.passport;
    if (!plain(passport) || passport.schema !== PASSPORT || !text(passport.person_id, 120) || !text(passport.as_of, 40) ||
        typeof passport.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(passport.digest) ||
        !Array.isArray(passport.capabilities) || passport.capabilities.length > 64 ||
        !Array.isArray(passport.sources) || passport.sources.length > 12) return null;
    const capabilities = passport.capabilities.map(capability);
    const sources = passport.sources.map(source);
    if (capabilities.includes(null) || sources.includes(null)) return null;
    const limits = Array.isArray(passport.limits) ? passport.limits.filter((item) => text(item, 400)).slice(0, 12) : [];
    return { person_id: passport.person_id, as_of: passport.as_of, digest: passport.digest, capabilities, sources, limits,
        card: text(body.card, 20000) ? body.card : '' };
}

function load(e) {
    const auth = e.auth;
    if (!auth || !auth.id) return { status: 401, body: { message: 'Sign in to load your career profile.' } };
    const subject = auth.id;
    const url = endpoint($os.getenv('BUILDANDDO_CAREER_PROFILE_URL'));
    const token = $os.getenv('BUILDANDDO_CAREER_PROFILE_TOKEN');
    const log = (reason, status) => $app.logger().warn('career-profile: unavailable', 'reason', reason, 'status', status || 0);
    if (url === null) return { status: 200, body: { state: 'not_configured', subject_id: subject } };
    if (url === false || !token) { log('misconfigured'); return { status: 503, body: { state: 'unavailable', subject_id: subject } }; }
    let res;
    try {
        res = $http.send({
            url, method: 'POST', timeout: 5,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ subject_id: subject, email: auth.getBool('verified') ? auth.getString('email') : '' }),
        });
    } catch (_) { log('unreachable'); return { status: 503, body: { state: 'unavailable', subject_id: subject } }; }
    if (res.statusCode === 404) return { status: 200, body: { state: 'no_profile', subject_id: subject } };
    if (res.statusCode !== 200) { log('upstream_status', res.statusCode); return { status: 503, body: { state: 'unavailable', subject_id: subject } }; }
    let profile = null;
    try {
        if (JSON.stringify(res.json).length <= MAX_BYTES) profile = project(res.json, subject);
    } catch (_) { profile = null; }
    if (!profile) { log('invalid_profile', 200); return { status: 503, body: { state: 'unavailable', subject_id: subject } }; }
    return { status: 200, body: { state: 'ready', subject_id: subject, issued_at: res.json.issued_at, profile } };
}

module.exports = { PROFILE, PASSPORT, endpoint, project, load };
