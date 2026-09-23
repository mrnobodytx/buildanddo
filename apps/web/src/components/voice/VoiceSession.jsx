// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/voice/VoiceSession.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-003
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-003
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     @elevenlabs/react, apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES @elevenlabs/react; CONSUMES apps/web/src/components/site/ui.jsx;
//              CONSUMED_BY apps/web/src/components/voice/TalkToBuddi.jsx
// DAG Node:    none
// Intent:      Run one voice session with Buddi through the official SDK, saying each state in words.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { Button } from '@/components/site/ui';

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

function Session({ agentId, onEnd, onFail }) {
    const { status, message, isSpeaking, isMuted, setMuted, startSession, endSession } = useConversation({
        onDisconnect: (details) => {
            if (details?.reason === 'error') onFail('The voice session was interrupted.', details.message);
            else onEnd(ENDED[details?.reason] || ENDED.user);
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
            onFail('The voice session could not start.', error?.message);
        }
    }, [agentId, startSession, onFail]);

    useEffect(() => {
        // A session that never connects reports here, not through onDisconnect.
        if (status === 'error') onFail('The voice session could not start.', message);
    }, [status, message, onFail]);

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
                <Button variant="secondary" size="sm" onClick={() => { endSession(); onEnd(ENDED.user); }}>
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
 * @param {{agentId: string, onEnd: (note: string) => void, onFail: (reason: string, detail?: string) => void}} props
 */
export default function VoiceSession(props) {
    return (
        <ConversationProvider>
            <Session {...props} />
        </ConversationProvider>
    );
}
