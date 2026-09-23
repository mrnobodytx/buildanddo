// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/voice/__tests__/TalkToBuddi.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-003
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-003
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/voice/TalkToBuddi.jsx, apps/web/src/components/voice/VoiceSession.jsx,
//              apps/web/src/lib/voiceAgent.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/voice/TalkToBuddi.jsx;
//              VALIDATES apps/web/src/components/voice/VoiceSession.jsx; VALIDATES apps/web/src/lib/voiceAgent.js
// DAG Node:    none
// Intent:      Verify the visitor starts Buddi themselves, reads every state in words, and gets the talk-to link
//              whenever the microphone or the session cannot be used.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TalkToBuddi, { POLICY_BLOCKED } from '@/components/voice/TalkToBuddi';
import { communityLink } from '@/lib/communityLinks';
import { describeMicrophoneError, microphonePolicy, voiceAgent } from '@/lib/voiceAgent';

// The SDK, reduced to what the section uses: the session's state and its three actions. A test changes the
// state with sdkSays() and plays the SDK's own callbacks through sdk.options.
const sdk = vi.hoisted(() => ({ state: {}, options: null, rerender: null }));

vi.mock('@elevenlabs/react', async () => {
    const { useReducer } = await import('react');
    return {
        ConversationProvider: ({ children }) => children,
        useConversation: (options) => {
            const [, rerender] = useReducer((count) => count + 1, 0);
            sdk.options = options;
            sdk.rerender = rerender;
            return { ...sdk.state, startSession: sdk.startSession, endSession: sdk.endSession, setMuted: sdk.setMuted };
        },
    };
});

const TALK_TO_URL = communityLink('voice-agent').url;
const PUBLISHED_AGENT = new URL(TALK_TO_URL).searchParams.get('agent_id');

function sdkSays(state) {
    act(() => {
        Object.assign(sdk.state, state);
        sdk.rerender();
    });
}

let track;
function microphoneGranted() {
    track = { stop: vi.fn() };
    navigator.mediaDevices.getUserMedia.mockResolvedValue({ getTracks: () => [track] });
}

async function startTalking(user) {
    await user.click(screen.getByRole('button', { name: 'Start talking' }));
}

async function connected(user) {
    microphoneGranted();
    render(<TalkToBuddi />);
    await startTalking(user);
    await waitFor(() => expect(sdk.startSession).toHaveBeenCalled());
    sdkSays({ status: 'connected' });
}

function expectTalkToLink() {
    const link = screen.getByRole('link', { name: /Talk to Buddi on ElevenLabs instead/ });
    expect(link).toHaveAttribute('href', TALK_TO_URL);
    expect(link).toHaveAttribute('target', '_blank');
}

beforeEach(() => {
    sdk.state = { status: 'disconnected', message: undefined, isSpeaking: false, isMuted: false };
    sdk.options = null;
    sdk.startSession = vi.fn();
    sdk.endSession = vi.fn();
    sdk.setMuted = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
});

afterEach(() => {
    delete navigator.mediaDevices;
    delete document.permissionsPolicy;
});

describe('talk to Buddi', () => {
    it('asks for nothing and starts nothing before the visitor presses Start', () => {
        render(<TalkToBuddi />);
        expect(screen.getByRole('heading', { name: 'Ask Buddi, out loud.' })).toBeVisible();
        // The agent keeps recordings (its privacy settings, read 2026-09-23), so the visitor is told first.
        expect(screen.getByText(/an automated assistant, not a person.*may be recorded/s)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Start talking' })).toBeVisible();
        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
        expect(sdk.options).toBeNull();
        expect(sdk.startSession).not.toHaveBeenCalled();
    });

    it('starts one session with the agent the site already links to, after the microphone is granted', async () => {
        const user = userEvent.setup();
        microphoneGranted();
        render(<TalkToBuddi />);
        await startTalking(user);
        await waitFor(() => expect(sdk.startSession).toHaveBeenCalledTimes(1));
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
        expect(track.stop).toHaveBeenCalled();
        expect(PUBLISHED_AGENT).toMatch(/^agent_[a-z0-9]+$/);
        expect(sdk.startSession).toHaveBeenCalledWith({ agentId: PUBLISHED_AGENT, connectionType: 'webrtc' });
    });

    it('says every state in words', async () => {
        const user = userEvent.setup();
        microphoneGranted();
        render(<TalkToBuddi />);
        await startTalking(user);
        expect(await screen.findByText('Starting the voice session…')).toHaveAttribute('role', 'status');
        sdkSays({ status: 'connecting' });
        expect(screen.getByText('Connecting to Buddi…')).toBeVisible();
        sdkSays({ status: 'connected' });
        expect(screen.getByText('Buddi is listening. Go ahead.')).toBeVisible();
        sdkSays({ isSpeaking: true });
        expect(screen.getByText('Buddi is speaking.')).toBeVisible();
    });

    it('mutes and unmutes with a real button once connected', async () => {
        const user = userEvent.setup();
        await connected(user);
        const mute = screen.getByRole('button', { name: 'Mute' });
        expect(mute).toHaveAttribute('aria-pressed', 'false');
        await user.click(mute);
        expect(sdk.setMuted).toHaveBeenCalledWith(true);
        sdkSays({ isMuted: true });
        expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('End stops the session and says the conversation ended', async () => {
        const user = userEvent.setup();
        await connected(user);
        await user.click(screen.getByRole('button', { name: 'End' }));
        expect(sdk.endSession).toHaveBeenCalledTimes(1);
        expect(screen.getByText('The conversation has ended.')).toHaveAttribute('role', 'status');
        expect(screen.getByRole('button', { name: 'Start talking' })).toBeVisible();
    });

    it('says so when Buddi ends the conversation', async () => {
        const user = userEvent.setup();
        await connected(user);
        act(() => sdk.options.onDisconnect({ reason: 'agent' }));
        expect(screen.getByText('Buddi ended the conversation.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Start talking' })).toBeVisible();
    });

    it('offers the talk-to link and starts nothing when the page may not use the microphone', async () => {
        const user = userEvent.setup();
        Object.defineProperty(document, 'permissionsPolicy', {
            configurable: true,
            value: { allowsFeature: (feature) => feature !== 'microphone' },
        });
        render(<TalkToBuddi />);
        await startTalking(user);
        expect(screen.getByText(POLICY_BLOCKED)).toBeVisible();
        expectTalkToLink();
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
        expect(sdk.options).toBeNull();
    });

    it('explains a refused prompt, offers the link, and can try again', async () => {
        const user = userEvent.setup();
        navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
        render(<TalkToBuddi />);
        await startTalking(user);
        expect(await screen.findByText(/Your browser did not allow the microphone/)).toBeVisible();
        expectTalkToLink();
        expect(sdk.startSession).not.toHaveBeenCalled();
        microphoneGranted();
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(sdk.startSession).toHaveBeenCalledTimes(1));
    });

    it('offers the link when the session fails to start, with the reason the SDK gave', async () => {
        const user = userEvent.setup();
        microphoneGranted();
        render(<TalkToBuddi />);
        await startTalking(user);
        await waitFor(() => expect(sdk.startSession).toHaveBeenCalled());
        sdkSays({ status: 'error', message: 'Could not get a conversation token' });
        expect(screen.getByText('The voice session could not start.')).toBeVisible();
        expect(screen.getByText('Details: Could not get a conversation token')).toBeVisible();
        expectTalkToLink();
    });

    it('offers the link when a live session drops', async () => {
        const user = userEvent.setup();
        await connected(user);
        act(() => sdk.options.onDisconnect({ reason: 'error', message: 'connection lost', context: {} }));
        expect(screen.getByText('The voice session was interrupted.')).toBeVisible();
        expect(screen.getByText('Details: connection lost')).toBeVisible();
        expectTalkToLink();
    });
});

describe('voice agent helpers', () => {
    it('reads the agent id from the voice-agent community link', () => {
        expect(voiceAgent()).toEqual({ agentId: PUBLISHED_AGENT, talkToUrl: TALK_TO_URL });
    });

    it('reports the microphone policy only where the browser can tell', () => {
        expect(microphonePolicy({ permissionsPolicy: { allowsFeature: () => true } })).toBe(true);
        expect(microphonePolicy({ featurePolicy: { allowsFeature: () => false } })).toBe(false);
        expect(microphonePolicy({})).toBeNull();
        expect(microphonePolicy({ permissionsPolicy: { allowsFeature: () => { throw new Error('unknown feature'); } } })).toBeNull();
    });

    it('names each microphone failure in plain words', () => {
        expect(describeMicrophoneError({ name: 'NotFoundError' })).toMatch(/No microphone was found/);
        expect(describeMicrophoneError({ name: 'NotReadableError' })).toMatch(/busy in another app/);
        expect(describeMicrophoneError(new TypeError('mediaDevices is undefined'))).toMatch(/could not open a microphone/);
    });
});
