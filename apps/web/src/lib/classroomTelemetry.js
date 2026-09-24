// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/lib/classroomTelemetry.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     none
// EnumType:    Adapter
// EnumEdges:   VERIFIED_BY tests/upgrade/classroom-telemetry.test.mjs
// Intent:      Observe bounded media outcomes through independent injected sinks without identities, media content or delivery claims.
// ----------------------------------------------------------------

const SECTION = '/app/classrooms/:room';
const STATES = new Set(['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed']);
const FAILURES = new Set(['join_failed', 'microphone_camera_denied', 'microphone_camera_unavailable',
    'microphone_camera_failed', 'autoplay_blocked', 'peer_failed', 'peer_closed', 'remote_track_failed',
    'presence_failed', 'heartbeat_failed', 'listen_failed', 'publish_forbidden']);
const JOIN_FAILURES = new Set(['join_failed', 'microphone_camera_denied', 'microphone_camera_unavailable',
    'microphone_camera_failed', 'peer_failed', 'peer_closed']);

/** Observe one explicit join; signalling acceptance and browser receipt are not delivery.
 * @param {{reportAction?: Function, trackEvent?: Function, readFailed?: Function, isCurrent: () => boolean, role?: 'teach'|'watch', now?: () => number}} options Injected sinks, lifetime, requested media mode and monotonic clock.
 * @returns {object} Bounded observations and an idempotent teardown owned by the media lifetime.
 */
export function createClassroomTelemetry({ reportAction, trackEvent, readFailed, isCurrent, role, now = () => performance.now() }) {
    let stopped = false, result = null, connectionState = 'unknown', disconnected = false, started;
    let counters = {};
    const sent = new Set();
    try { started = now(); } catch { /* Timing is optional. */ }
    const current = () => { try { return !stopped && isCurrent(); } catch { return false; } };
    const emit = (event, fields) => {
        const key = `${event}:${fields.reason || ''}:${connectionState}`;
        if (sent.has(key)) return;
        sent.add(key);
        const context = { section: SECTION, source: 'classroom_media', operation: role === 'teach' ? 'start' : 'join',
            connection_state: connectionState, ...fields };
        try {
            const elapsed = now() - started;
            if (Number.isFinite(elapsed)) context.duration_ms = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(elapsed)));
        } catch { /* A missing clock must not suppress either sink. */ }
        try { Promise.resolve(reportAction?.(`classroom.media.${event}`, { ...context })).catch(() => {}); } catch { /* Independent sink. */ }
        try { Promise.resolve(trackEvent?.(`classroom.media.${event}`, { ...context })).catch(() => {}); } catch { /* Independent sink. */ }
    };
    const settle = (outcome, reason) => {
        if (result !== null) return;
        result = outcome;
        emit('join.result', { outcome, reason });
    };
    const failure = (reason, error) => {
        if (!current() || !FAILURES.has(reason) || reason === 'join_failed' && result === 'failure') return;
        // Failure deduplication does not depend on a mutable peer state or a poll interval.
        if (sent.has(`failure:${reason}`)) return;
        sent.add(`failure:${reason}`);
        let status, readReason = reason === 'publish_forbidden' ? 'forbidden' : 'unavailable';
        try {
            const code = error?.status;
            if (Number.isInteger(code) && (code === 0 || code >= 100 && code < 600)) status = code;
            if (['NOT_JSON', 'UNREADABLE_BODY', 'NO_ITEMS'].includes(error?.code)) readReason = 'invalid_response';
        } catch { /* Never inspect exception prose or forward opaque error objects. */ }
        emit('failure', { outcome: 'failure', reason,
            status_class: status === undefined ? 'unknown' : status === 0 ? 'network' : `${Math.floor(status / 100)}xx` });
        if (JOIN_FAILURES.has(reason)) settle('failure', reason);
        try { Promise.resolve(readFailed?.(SECTION, 'classroom_media', readReason, status)).catch(() => {}); } catch { /* Independent failure summary. */ }
    };

    if (current()) emit('join.started', { outcome: 'started' });
    return {
        accepted() {
            if (current()) settle('accepted', 'signalling_only');
        },
        failure,
        deviceError(error) {
            let reason = 'microphone_camera_failed';
            try {
                if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) reason = 'microphone_camera_denied';
                else if (['NotFoundError', 'DevicesNotFoundError', 'NotReadableError'].includes(error?.name)) reason = 'microphone_camera_unavailable';
            } catch { /* Unknown device errors stay bounded. */ }
            // Capture requests both together; a refusal cannot identify which device was denied.
            failure(reason, error);
        },
        connection(state) {
            if (!current()) return;
            connectionState = STATES.has(state) ? state : 'unknown';
            if (connectionState === 'failed' || connectionState === 'closed') {
                failure(connectionState === 'failed' ? 'peer_failed' : 'peer_closed');
                return;
            }
            if (connectionState === 'disconnected') disconnected = true;
            const connected = connectionState === 'connected';
            emit(connected ? 'connected' : 'connection', { outcome: 'observed',
                reason: connected ? disconnected ? 'peer_recovered' : 'peer_connected' : 'peer_state' });
        },
        stats(audio) {
            if (!current() || audio?.supported !== true) return;
            const sample = {};
            for (const [from, to] of [['bytes', 'received_bytes'], ['packets', 'received_packets'], ['streams', 'inbound_streams']]) {
                if (Number.isSafeInteger(audio[from]) && audio[from] >= 0) sample[to] = audio[from];
            }
            counters = sample;
            if (!sent.has('received') && (sample.received_bytes > 0 || sample.received_packets > 0)) {
                sent.add('received');
                emit('received', { outcome: 'observed', reason: 'browser_stats', ...sample });
            }
        },
        leave(reason = 'scope_ended') {
            if (stopped) return;
            // Only the owning lifetime calls this synchronously during teardown. All
            // subsequent async observations are fenced, including late accepted handles.
            stopped = true;
            const ended = reason === 'left' ? 'left' : 'scope_ended';
            settle('cancelled', ended);
            if (result !== 'failure') emit('leave', { outcome: result === 'accepted' ? 'observed' : 'cancelled', reason: ended, ...counters });
        },
    };
}
