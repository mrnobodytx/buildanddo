// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/lib/publicActions.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/observability/runtime.js, apps/web/src/lib/telemetry.js, apps/web/src/lib/navigationIntent.js, apps/web/src/lib/authErrors.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/observability/runtime.js; CONSUMES apps/web/src/lib/telemetry.js; CONSUMES apps/web/src/lib/navigationIntent.js; CONSUMES apps/web/src/lib/authErrors.js
// DAG Node:    none
// Intent:      Observe bounded public action outcomes without personal content, identity ownership or collector failures affecting the action.
// ----------------------------------------------------------------

import { reportAction } from '@/lib/observability/runtime';
import { trackEvent } from '@/lib/telemetry';
import { telemetrySection } from '@/lib/navigationIntent';
import { authFailureKind } from '@/lib/authErrors';

export const PUBLIC_ACTIONS = Object.freeze({
    LOGIN: 'public.auth.login',
    SIGNUP: 'public.auth.signup',
    OCN_LOGIN: 'public.auth.ocn_login',
    PASSWORD_RESET_REQUEST: 'public.password_reset.request',
    PASSWORD_RESET_COMPLETE: 'public.password_reset.complete',
    EARLY_ACCESS_REQUEST: 'public.early_access.request',
    ENQUIRY_DRAFT: 'public.enquiry.draft',
    ONBOARDING_STEP: 'public.onboarding.step',
    ONBOARDING_COMPLETE: 'public.onboarding.complete',
    VOICE_SESSION: 'public.voice.session',
    NAVIGATION: 'public.navigation.click',
    CTA: 'public.cta.click',
    DOCS_SEARCH: 'public.docs.search',
    GUIDE_OPEN: 'public.guide.open',
    ARTICLE_OPEN: 'public.article.open',
    PERSONA_RESULT: 'public.persona.result',
    LESSON_OPEN: 'public.lesson.open',
    ROADMAP_HOVER: 'roadmap_milestone_hover',
    REPLAY_SNAPSHOT: 'workspace.replay.snapshot',
    PASSPORT_VIEW: 'passport.viewed',
    PASSPORT_SELECT: 'passport.epoch_selected',
    PASSPORT_VERIFY: 'passport.verify_clicked',
    ROOM_MODE: 'workspace.rooms.mode_changed',
    ROOM_SOURCE: 'workspace.rooms.source_changed',
    ROOM_PROJECTION: 'workspace.rooms.projection',
});

const KNOWN = new Set(Object.values(PUBLIC_ACTIONS));
const OUTCOMES = new Set(['success', 'failure', 'uncertain', 'accepted', 'opaque', 'prepared', 'opened', 'advanced', 'started', 'connected', 'ended',
    'intent', 'observed', 'selected', 'match', 'mismatch', 'not_anchored', 'unavailable']);
const REASONS = new Set([
    'confirmed', 'validation', 'rejected', 'network', 'rate_limited', 'server', 'unknown',
    'request_accepted', 'opaque', 'local_step', 'local_draft', 'mailto_handoff', 'unconfirmed', 'workspace_unavailable',
    'user_requested', 'policy_blocked', 'microphone_unavailable', 'load_failed', 'connection_failed',
    'connected', 'connection_lost', 'user_ended', 'agent_ended', 'disconnected',
    'navigation', 'query_settled', 'known_profile', 'unknown_profile', 'recorded_snapshot', 'root_comparison', 'published_projection', 'unavailable',
]);

const NAVIGATION_TARGETS = Object.freeze({
    '/': 'home', '/hostinger-challenge': 'challenge', '/platform': 'platform', '/practice': 'practice', '/roadmap': 'roadmap',
    '/pricing': 'pricing', '/about': 'about', '/classrooms': 'classrooms', '/docs': 'docs', '/blog': 'blog', '/contact': 'contact',
    '/guild': 'guild', '/status': 'status', '/login': 'sign_in', '/signup': 'sign_up', '/app': 'workspace', '/app/rooms': 'rooms',
    '/#early-access': 'early_access', '/docs#workspace-lessons': 'lessons',
});
const TARGETS = [...Object.values(NAVIGATION_TARGETS), 'community', 'other'];
const ENUM_FIELDS = {
    [PUBLIC_ACTIONS.NAVIGATION]: { placement: ['header', 'header_mobile', 'footer'], target: TARGETS },
    [PUBLIC_ACTIONS.CTA]: { placement: ['header', 'header_mobile', 'footer', 'pricing'], target: TARGETS,
        plan: ['early_access', 'pilot', 'government', 'team'] },
    [PUBLIC_ACTIONS.GUIDE_OPEN]: { entry: ['contents', 'destination', 'reference'] },
    [PUBLIC_ACTIONS.LESSON_OPEN]: { mode: ['reader', 'guided'] },
    [PUBLIC_ACTIONS.PASSPORT_VIEW]: { read_failed: [true, false], read_state: ['available', 'epochs_failed', 'anchors_failed', 'both_failed'] },
    [PUBLIC_ACTIONS.PASSPORT_SELECT]: { epoch_status: ['OPEN', 'SEALED', 'ANCHOR_PENDING', 'ANCHORED', 'MISMATCH'] },
    [PUBLIC_ACTIONS.ROOM_MODE]: { mode: ['operate', 'inspect', 'teach', 'replay'] },
    [PUBLIC_ACTIONS.ROOM_SOURCE]: { projection_source: ['workspace', 'published'] },
    [PUBLIC_ACTIONS.ROOM_PROJECTION]: { projection_state: ['MEASURED', 'OBSERVED', 'PARTIAL', 'UNMEASURED', 'unknown'] },
};
const COUNT_FIELDS = {
    [PUBLIC_ACTIONS.ONBOARDING_STEP]: { step: [1, 3] },
    [PUBLIC_ACTIONS.DOCS_SEARCH]: { term_length: [0, 200], result_count: [0, 1000] },
    [PUBLIC_ACTIONS.ROADMAP_HOVER]: { day: [1, 21] },
    [PUBLIC_ACTIONS.REPLAY_SNAPSHOT]: { completed: [0, 1000], uncertain: [0, 1000], failed: [0, 1000] },
    [PUBLIC_ACTIONS.PASSPORT_VIEW]: { epoch_count: [0, 10000], anchored_count: [0, 10000] },
};

/** Name only authored navigation targets; never transmit a supplied href or label.
 * @param {unknown} value Link destination.
 * @returns {string} Fixed target enum, or other.
 */
export function publicNavigationTarget(value) {
    return typeof value === 'string' && Object.hasOwn(NAVIGATION_TARGETS, value) ? NAVIGATION_TARGETS[value] : 'other';
}

/** Snapshot a canonical section before an action starts, never a raw location.
 * @param {unknown} [value] Router pathname, or the current browser pathname when omitted.
 * @returns {string} Closed section template.
 */
export function publicActionSection(value) {
    try { return telemetrySection(value === undefined ? globalThis.window?.location?.pathname : value); }
    catch { return '/unknown'; }
}

/** Classify a native request rejection without reading its message or payload.
 * @param {unknown} error Native client rejection.
 * @returns {string} Closed failure reason, with no account-existence distinction.
 */
export function publicActionFailureReason(error) {
    try {
        const kind = authFailureKind(error);
        return kind === 'not_found' ? 'rejected' : kind;
    } catch { return 'unknown'; }
}

/** Record an explicit action in each sink independently; never own auth or effects.
 * @param {string} action One of PUBLIC_ACTIONS.
 * @param {string} outcome Closed observation, not inferred delivery or verification.
 * @param {string} reason Closed reason, never exception text or form content.
 * @param {object} [counts] Action-specific, bounded integer fields from COUNT_FIELDS; no coercion or inferred zeroes.
 * @param {object} [options] Starting section and action-specific enums from ENUM_FIELDS; other properties are ignored.
 * @returns {void}
 */
export function trackPublicAction(action, outcome, reason, counts = {}, options = {}) {
    if (!KNOWN.has(action) || !OUTCOMES.has(outcome) || !REASONS.has(reason)) return;
    const context = { outcome, reason, section: '/unknown' };
    try { context.section = publicActionSection(options?.section); } catch { /* An unreadable location stays unknown. */ }
    try {
        for (const [key, [minimum, maximum]] of Object.entries(COUNT_FIELDS[action] || {})) {
            const value = counts && Object.hasOwn(counts, key) ? counts[key] : undefined;
            if (Number.isInteger(value) && value >= minimum && value <= maximum) context[key] = value;
        }
    } catch { /* Optional counts cannot suppress an action. */ }
    try {
        for (const [key, allowed] of Object.entries(ENUM_FIELDS[action] || {})) {
            const value = options && Object.hasOwn(options, key) ? options[key] : undefined;
            if (allowed.includes(value)) context[key] = value;
        }
    } catch { /* No arbitrary properties or content enter either sink. */ }
    try { Promise.resolve(reportAction(action, { ...context })).catch(() => {}); } catch { /* RUM is best-effort. */ }
    try { Promise.resolve(trackEvent(action, { ...context })).catch(() => {}); } catch { /* Analytics is independently best-effort. */ }
}
