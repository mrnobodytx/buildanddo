// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/voice/TalkToBuddi.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-003, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-003, VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/voiceAgent.js, apps/web/src/components/voice/VoiceSession.jsx,
//              apps/web/src/components/site/ui.jsx, apps/web/src/lib/publicActions.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/voiceAgent.js; CONSUMES apps/web/src/components/voice/VoiceSession.jsx;
//              CONSUMES apps/web/src/components/site/ui.jsx; CONSUMES apps/web/src/lib/publicActions.js; CONSUMED_BY apps/web/src/pages/HomePage.jsx
// DAG Node:    none
// Intent:      Let a visitor talk to Buddi on the home page. Nothing voice-related loads until they press Start,
//              and when the microphone cannot be used they read why and get the talk-to link, never a dead button.
// ───────────────────────────────────────────────────────────────

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Mic, RotateCcw } from 'lucide-react';
import Buddi from '@/components/brand/Buddi';
import { Button, Card, Rule, Section, SectionLabel } from '@/components/site/ui';
import { describeMicrophoneError, microphonePolicy, voiceAgent } from '@/lib/voiceAgent';
import { PUBLIC_ACTIONS, publicActionSection, trackPublicAction } from '@/lib/publicActions';

export const POLICY_BLOCKED = 'This page is not allowed to use a microphone yet, so voice cannot start here.';
export const NOT_LOADED = 'The voice feature could not be loaded. Reload the page, then try again.';

// A stand-in when the voice chunk cannot be fetched (offline, or a deploy replaced it): it reports the failure
// instead of letting the rejected import take the whole page down. React keeps a failed lazy import failed, so
// only a reload helps and no Try again is offered.
function VoiceNotLoaded({ onFail, actionSection }) {
    const reported = useRef(false);
    useEffect(() => {
        if (!reported.current) {
            reported.current = true;
            trackPublicAction(PUBLIC_ACTIONS.VOICE_SESSION, 'failure', 'load_failed', undefined, { section: actionSection });
        }
        onFail(NOT_LOADED, '', false);
    }, [onFail, actionSection]);
    return null;
}

// The SDK and its voice transport are their own chunk, fetched only after the visitor grants the microphone.
const VoiceSession = lazy(() => import('@/components/voice/VoiceSession')
    .catch(() => ({ default: VoiceNotLoaded })));

function Unavailable({ problem, talkToUrl, onRetry }) {
    return (
        <div className="space-y-4">
            <div role="status" className="space-y-1">
                <p className="text-sm font-semibold leading-6">{problem.reason}</p>
                {problem.detail && <p className="font-evidence text-xs text-muted-foreground">Details: {problem.detail}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
                {problem.retry && (
                    <Button variant="secondary" size="sm" onClick={onRetry}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Try again
                    </Button>
                )}
                <Button href={talkToUrl} variant="secondary" size="sm" target="_blank" rel="noreferrer">
                    Talk to Buddi on ElevenLabs instead
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                </Button>
            </div>
        </div>
    );
}

export default function TalkToBuddi() {
    const agent = voiceAgent();
    const [phase, setPhase] = useState('idle'); // idle | asking | session | unavailable
    const [note, setNote] = useState('');
    const [problem, setProblem] = useState(null);
    const actionSection = useRef('/unknown');

    const fail = useCallback((reason, detail = '', retry = true) => {
        setProblem({ reason, detail, retry });
        setPhase('unavailable');
    }, []);
    const ended = useCallback((text) => {
        setNote(text);
        setPhase('idle');
    }, []);

    if (!agent.agentId) return null;

    async function start() {
        const section = publicActionSection();
        actionSection.current = section;
        trackPublicAction(PUBLIC_ACTIONS.VOICE_SESSION, 'started', 'user_requested', undefined, { section });
        setNote('');
        if (microphonePolicy() === false) {
            trackPublicAction(PUBLIC_ACTIONS.VOICE_SESSION, 'failure', 'policy_blocked', undefined, { section });
            fail(POLICY_BLOCKED, '', false);
            return;
        }
        setPhase('asking');
        try {
            // The browser's own prompt, on the visitor's click. The session opens its own stream afterwards.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
        } catch (error) {
            trackPublicAction(PUBLIC_ACTIONS.VOICE_SESSION, 'failure', 'microphone_unavailable', undefined, { section });
            fail(describeMicrophoneError(error));
            return;
        }
        setPhase('session');
    }

    return (
        <Section id="talk-to-buddi" className="border-t border-foreground/80 py-12 sm:py-16">
            <SectionLabel icon={Mic}>Talk to Buddi</SectionLabel>
            <div className="mt-2 flex items-start gap-5">
                <Buddi pose="hello" size={104} decorative className="hidden shrink-0 sm:block" />
                <div>
                    <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Ask Buddi, out loud.</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        Buddi is BuildAndDo's voice agent: an automated assistant, not a person. Ask about a lesson, a
                        challenge or how the platform works. What you say goes to ElevenLabs, our voice provider, and
                        may be recorded. Your browser asks before it uses the microphone.
                    </p>
                </div>
            </div>
            <Rule className="my-6" />
            <Card className="p-5">
                {phase === 'idle' && (
                    <div className="space-y-3">
                        {note && <p role="status" className="text-sm leading-6">{note}</p>}
                        <Button onClick={start}>
                            <Mic className="h-4 w-4" aria-hidden="true" />
                            Start talking
                        </Button>
                    </div>
                )}
                {phase === 'asking' && (
                    <p role="status" className="text-sm leading-6">Waiting for your browser's microphone permission…</p>
                )}
                {phase === 'session' && (
                    <Suspense fallback={<p role="status" className="text-sm leading-6">Loading the voice session…</p>}>
                        <VoiceSession agentId={agent.agentId} onEnd={ended} onFail={fail} actionSection={actionSection.current} />
                    </Suspense>
                )}
                {phase === 'unavailable' && <Unavailable problem={problem} talkToUrl={agent.talkToUrl} onRetry={start} />}
            </Card>
        </Section>
    );
}
