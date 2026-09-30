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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { Button } from '@/components/site/ui';
import { PUBLIC_ACTIONS, publicActionSection, trackPublicAction } from '@/lib/publicActions';

// What the visitor reads once a session is over, by the SDK's disconnect reason.
export const ENDED = Object.freeze({
    user: 'The conversation has ended.',
    agent: 'Buddi ended the conversation.',
});

const CONNECTION_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 10_000;

function statusWords(status, isSpeaking) {
    if (status === 'connected') return isSpeaking ? 'Buddi is speaking.' : 'Buddi is listening. Go ahead.';
    if (status === 'connecting') return 'Connecting to Buddi…';
    return 'Starting the voice session…';
}

function Session({ agentId, onEnd, onFail, actionSection }) {
    const observed = useRef({ section: publicActionSection(actionSection), active: false, connected: false, terminal: false, ending: false });
    const connectionTimeout = useRef(null);
    const closeTimeout = useRef(null);
    const [closing, setClosing] = useState(false);
    const observe = useCallback((outcome, reason) => {
        // A completed or unmounted session cannot change a newer attempt or its measurements.
        const current = observed.current;
        if (!current.active || current.terminal || outcome === 'connected' && (current.connected || current.ending)) return false;
        if (outcome === 'connected') current.connected = true;
        else current.terminal = true;
        clearTimeout(connectionTimeout.current);
        if (current.terminal) clearTimeout(closeTimeout.current);
        trackPublicAction(PUBLIC_ACTIONS.VOICE_SESSION, outcome, reason, undefined, { section: current.section });
        return true;
    }, []);
    const { status, message, isSpeaking, isMuted, setMuted, startSession, endSession } = useConversation({
        onDisconnect: (details) => {
            if (details?.reason === 'error') {
                if (observe('failure', 'connection_lost')) onFail('The voice session was interrupted.', details.message);
            } else {
                if (observe('ended', details?.reason === 'agent' ? 'agent_ended' : details?.reason === 'user' ? 'user_ended' : 'disconnected')) {
                    onEnd(ENDED[details?.reason] || ENDED.user);
                }
            }
        },
    });
    const started = useRef(false);

    useEffect(() => {
        const current = observed.current;
        current.active = true;
        if (!current.connected && !current.terminal) {
            connectionTimeout.current = setTimeout(() => {
                if (!current.ending && observe('failure', 'connection_failed')) {
                    onFail('Buddi did not connect in time. Try again.');
                }
            }, CONNECTION_TIMEOUT_MS);
        }
        return () => {
            current.active = false;
            clearTimeout(connectionTimeout.current);
            clearTimeout(closeTimeout.current);
        };
    }, [onFail, observe]);

    useEffect(() => {
        // Start once even if React replays effects. The provider owns normal unmount cleanup.
        if (started.current) return;
        started.current = true;
        const failed = (error) => {
            if (observe('failure', 'connection_failed')) onFail('The voice session could not start.', error?.message);
        };
        try {
            const pending = startSession({ agentId, connectionType: 'webrtc' });
            if (pending && typeof pending.then === 'function') {
                Promise.resolve(pending).then(() => {
                    // A transport can finish opening after provider cleanup already ran.
                    const current = observed.current;
                    if (!current.active || current.terminal || current.ending) {
                        try { Promise.resolve(endSession()).catch(() => {}); } catch { /* The old provider owns this transport. */ }
                    }
                }, failed);
            }
        } catch (error) {
            failed(error);
        }
    }, [agentId, startSession, endSession, onFail, observe]);

    useEffect(() => {
        // A session that never connects reports here, not through onDisconnect.
        if (status === 'error') {
            if (observe('failure', 'connection_failed')) onFail('The voice session could not start.', message);
        }
        if (status === 'connected') observe('connected', 'connected');
    }, [status, message, onFail, observe]);

    const end = () => {
        const current = observed.current;
        if (!current.active || current.terminal || current.ending) return;
        current.ending = true;
        setClosing(true);
        clearTimeout(connectionTimeout.current);
        const completed = () => {
            if (observe('ended', 'user_requested')) onEnd(ENDED.user);
        };
        const failed = (error) => {
            if (observe('failure', 'connection_lost')) {
                onFail('The voice session could not end. Reload this page to close the connection.', error?.message, false);
            }
        };
        closeTimeout.current = setTimeout(() => failed(), CLOSE_TIMEOUT_MS);
        try {
            const pending = endSession();
            if (pending && typeof pending.then === 'function') Promise.resolve(pending).then(completed, failed);
            else completed();
        } catch (error) {
            failed(error);
        }
    };

    const connected = status === 'connected';
    return (
        <div className="space-y-4">
            <p role="status" className="text-sm font-semibold leading-6">{closing ? 'Ending the voice session…' : statusWords(status, isSpeaking)}</p>
            <div className="flex flex-wrap gap-3">
                {connected && (
                    <Button variant="secondary" size="sm" disabled={closing} aria-pressed={isMuted} onClick={() => setMuted(!isMuted)}>
                        {isMuted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                        {isMuted ? 'Unmute' : 'Mute'}
                    </Button>
                )}
                <Button variant="secondary" size="sm" disabled={closing} onClick={end}>
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
 * @param {{agentId: string, onEnd: (note: string) => void, onFail: (reason: string, detail?: string, retry?: boolean) => void, actionSection?: string}} props
 */
export default function VoiceSession(props) {
    return (
        <ConversationProvider>
            <Session {...props} />
        </ConversationProvider>
    );
}
