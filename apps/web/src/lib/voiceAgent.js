// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/voiceAgent.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-003
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-003
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/communityLinks.js
// EnumType:    Utility
// EnumEdges:   CONSUMES apps/web/src/lib/communityLinks.js; CONSUMED_BY apps/web/src/components/voice/TalkToBuddi.jsx
// DAG Node:    none
// Intent:      Name Buddi's public voice agent from the one source for community links, and tell whether this
//              page may use the microphone before any voice code loads.
// ───────────────────────────────────────────────────────────────

import { communityLink } from '@/lib/communityLinks';

/**
 * The public ElevenLabs agent the site already links to. The id is read from the voice-agent link, so the
 * in-page session and the talk-to link can never name different agents. The agent is public: no key is needed.
 *
 * @returns {{agentId: string|null, talkToUrl: string}}
 */
export function voiceAgent() {
    const { url } = communityLink('voice-agent');
    return { agentId: new URL(url).searchParams.get('agent_id'), talkToUrl: url };
}

/**
 * Whether this page's permissions policy lets it use the microphone: `false` when the policy blocks it, `true`
 * when it allows it, and `null` when the browser cannot say before asking (Safari and Firefox expose no policy
 * API; there the prompt itself fails instead).
 *
 * @param {Document} [doc] The document to ask, for tests.
 * @returns {boolean|null}
 */
export function microphonePolicy(doc = globalThis.document) {
    const policy = doc?.permissionsPolicy || doc?.featurePolicy;
    if (typeof policy?.allowsFeature !== 'function') return null;
    try {
        return Boolean(policy.allowsFeature('microphone'));
    } catch {
        return null;
    }
}

/**
 * Plain words for why the microphone could not be opened, and what the visitor can do about it.
 *
 * @param {unknown} error What getUserMedia rejected or threw with.
 * @returns {string}
 */
export function describeMicrophoneError(error) {
    switch (error?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Your browser did not allow the microphone. Allow it for this site in the browser settings, then try again.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No microphone was found. Connect one, then try again.';
        case 'NotReadableError':
        case 'AbortError':
            return 'The microphone is busy in another app. Close that app, then try again.';
        default:
            return 'This browser could not open a microphone on this page.';
    }
}
