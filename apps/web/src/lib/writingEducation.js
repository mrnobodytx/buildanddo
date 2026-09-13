// CGRF: SRS=SRS-CN-BUILDANDDO-EDUCATION-API-001 | CAPS=B | Seat=C-ONE
// Client for the BuildAndDo educational writing facade.
//
// The facade is served by the Citadel platform, but a BuildAndDo learner never needs to know that: the base is
// a BuildAndDo-relative path by default, so the request goes to our own origin and the backend forwards it.
// Citadel provides services to BuildAndDo; the learner's browser talks to BuildAndDo.
//
// FOUR CLAIMS, NEVER COLLAPSED. The API returns submission provenance and content origin as separate facts,
// and this client keeps them separate. A cryptographic chain can show that an authenticated learner submitted
// these exact bytes and that they have not changed since; it CANNOT show who composed them, because pasting
// AI-generated prose produces an identical record. Anything in this file that rendered "human authored" from a
// verified chain would be a lie the UI told on the platform's behalf.

const API_BASE = import.meta.env.VITE_WRITING_API_BASE || '/api/buildanddo/v1/writing';

/** Unreachable/failed calls surface as a typed result — never as fabricated content. */
async function call(path, { method = 'GET', body } = {}) {
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'same-origin',
        });
    } catch (error) {
        return { ok: false, unreachable: true, error: String(error?.message || error) };
    }
    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }
    if (!response.ok) {
        return {
            ok: false,
            status: response.status,
            error: payload?.detail?.error || payload?.detail || `HTTP ${response.status}`,
            reason: payload?.detail?.reason || '',
        };
    }
    return { ok: true, status: response.status, data: payload };
}

export const writingApi = {
    health: () => call('/health'),
    createChallenge: (courseId, lessonId) =>
        call('/challenges', { method: 'POST', body: { course_id: courseId, lesson_id: lessonId } }),
    openSession: (payload) => call('/sessions', { method: 'POST', body: payload }),
    getSession: (sessionId) => call(`/sessions/${encodeURIComponent(sessionId)}`),
    draft: (sessionId, text) =>
        call(`/sessions/${encodeURIComponent(sessionId)}/draft`, { method: 'POST', body: { text } }),
    requestCoaching: (sessionId) =>
        call(`/sessions/${encodeURIComponent(sessionId)}/coach`, { method: 'POST' }),
    listCoaching: (sessionId) => call(`/sessions/${encodeURIComponent(sessionId)}/coach`),
    decide: (sessionId, suggestionId, decision, rationale = '') =>
        call(`/sessions/${encodeURIComponent(sessionId)}/suggestions/${encodeURIComponent(suggestionId)}/decision`,
            { method: 'POST', body: { decision, rationale } }),
    complete: (sessionId) => call(`/sessions/${encodeURIComponent(sessionId)}/complete`, { method: 'POST' }),
    evidence: (sessionId) => call(`/sessions/${encodeURIComponent(sessionId)}/evidence`),
};

/**
 * The four claims, rendered honestly.
 *
 * Each one is read from the field that actually establishes it. Where the platform cannot yet prove something,
 * this returns the pending/unknown wording rather than the optimistic one — a UI that shows a green tick before
 * the evidence exists teaches the learner to trust a claim nobody checked.
 */
export function readClaims(evidence) {
    const authorship = evidence?.authorship || {};
    const submissionState = evidence?.authorship_state || 'UNVERIFIED';
    const submissionEvidence = evidence?.submission_evidence || null;

    return {
        submission: {
            label: 'Submission',
            state: submissionState === 'VERIFIED' ? 'verified' : 'pending',
            text: submissionState === 'VERIFIED'
                ? 'Authenticated learner submission'
                : 'Not yet an authenticated learner submission',
            detail: authorship.uncertified_because || '',
        },
        integrity: {
            label: 'Integrity',
            state: submissionEvidence?.submission_integrity === 'VERIFIED' ? 'verified' : 'pending',
            text: submissionEvidence?.submission_integrity === 'VERIFIED'
                ? 'Evidence epoch verified'
                : 'Awaiting admission to an evidence epoch',
            detail: submissionEvidence?.evidence?.verification_mode || '',
        },
        witness: {
            label: 'Historical witness',
            state: submissionEvidence?.historical_integrity === 'VERIFIED' ? 'verified' : 'absent',
            text: submissionEvidence?.historical_integrity === 'VERIFIED'
                ? 'Root independently witnessed'
                : 'Not yet witnessed',
            detail: 'An unwitnessed local chain cannot prove history to an outside party.',
        },
        contentOrigin: {
            label: 'Content origin',
            // Deliberately NOT derived from the chain. This comes from the learner's recorded interaction
            // history — did they request coaching, and did they act on it.
            state: 'declared',
            text: {
                HUMAN: 'Learner-declared — written without coaching',
                AI_ASSISTED: 'AI-assisted — coaching was requested and acted on',
                COLLABORATIVE: 'Collaborative — AI prose is present in the work',
            }[authorship.label] || 'Unknown',
            detail: authorship.basis || '',
        },
    };
}

export default writingApi;
