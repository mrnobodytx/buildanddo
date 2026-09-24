// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/voice/VoiceSession.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-003, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-003, VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     @elevenlabs/react, apps/web/src/components/site/ui.jsx, apps/web/src/lib/publicActions.js
// EnumType:    Widget
// EnumEdges:   CONSUMES @elevenlabs/react; CONSUMES apps/web/src/components/site/ui.jsx;
//              CONSUMES apps/web/src/lib/publicActions.js; CONSUMED_BY apps/web/src/components/voice/TalkToBuddi.jsx
// DAG Node:    none
// Intent:      Run one voice session with Buddi through the official SDK, saying each state in words.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { Button } from '@/components/site/ui';
import { PUBLIC_ACTIONS, publicActionSection, trackPublicAction } from '@/lib/publicActions';

// What the visitor reads once a session is over, by the SDK's disconnect reason.
export const ENDED = Object.freeze({
    user: 'The conversation has ended.',
    agent: 'Buddi ended the conversation.',
});

function statusWords(status, isSpeaking) {
    if (status === 'connected') return isSpeaking ? 'Buddi is speaking.' : 'Buddi is listening. Go ahead.';
    if (status === 'connecting') return 'Connecting to Buddi…';
    return 'Starting the voice session…';
}

function Session({ agentId, onEnd, onFail, actionSection }) {
    const observed = useRef({ section: publicActionSection(actionSection), connected: false, terminal: false });
    const observe = useCallback((outcome, reason) => {
        // Deduplicate measurement only; the SDK and parent still own session state.
        const current = observed.current;
        if (current.terminal || outcome === 'connected' && current.connected) return;
        if (outcome === 'connected') current.connected = true;
        else current.terminal = true;
        trackPublicAction(PUBLIC_ACTIONS.VOICE_SESSION, outcome, reason, undefined, { section: current.section });
    }, []);
    const { status, message, isSpeaking, isMuted, setMuted, startSession, endSession } = useConversation({
        onDisconnect: (details) => {
            if (details?.reason === 'error') {
                observe('failure', 'connection_lost');
                onFail('The voice session was interrupted.', details.message);
            } else {
                observe('ended', details?.reason === 'agent' ? 'agent_ended' : details?.reason === 'user' ? 'user_ended' : 'disconnected');
                onEnd(ENDED[details?.reason] || ENDED.user);
            }
        },
    });
    const started = useRef(false);

    useEffect(() => {
        // One session per mount. The provider ends it when this unmounts, so there is nothing to clean up here.
        if (started.current) return;
        started.current = true;
        try {
            startSession({ agentId, connectionType: 'webrtc' });
        } catch (error) {
            observe('failure', 'connection_failed');
            onFail('The voice session could not start.', error?.message);
        }
    }, [agentId, startSession, onFail, observe]);

    useEffect(() => {
        // A session that never connects reports here, not through onDisconnect.
        if (status === 'error') {
            observe('failure', 'connection_failed');
            onFail('The voice session could not start.', message);
        }
        if (status === 'connected') observe('connected', 'connected');
    }, [status, message, onFail, observe]);

    const end = () => {
        endSession();
        observe('ended', 'user_requested');
        onEnd(ENDED.user);
    };

    const connected = status === 'connected';
    return (
        <div className="space-y-4">
            <p role="status" className="text-sm font-semibold leading-6">{statusWords(status, isSpeaking)}</p>
            <div className="flex flex-wrap gap-3">
                {connected && (
                    <Button variant="secondary" size="sm" aria-pressed={isMuted} onClick={() => setMuted(!isMuted)}>
                        {isMuted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                        {isMuted ? 'Unmute' : 'Mute'}
                    </Button>
                )}
                <Button variant="secondary" size="sm" onClick={end}>
                    <PhoneOff className="h-4 w-4" aria-hidden="true" />
                    {connected ? 'End' : 'Cancel'}
                </Button>
            </div>
        </div>
    );
}

/**
 * One voice session with the given agent, started on mount.
 *
 * @param {{agentId: string, onEnd: (note: string) => void, onFail: (reason: string, detail?: string) => void, actionSection?: string}} props
 */
export default function VoiceSession(props) {
    return (
        <ConversationProvider>
            <Session {...props} />
        </ConversationProvider>
    );
}
