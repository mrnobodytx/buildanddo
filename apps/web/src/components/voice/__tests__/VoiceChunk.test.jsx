// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/voice/__tests__/VoiceChunk.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-003
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-003
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/voice/TalkToBuddi.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/voice/TalkToBuddi.jsx
// DAG Node:    none
// Intent:      Verify the voice SDK is imported only after Start, and that a voice chunk which cannot load is
//              reported in the section instead of taking the page down.
// ───────────────────────────────────────────────────────────────

// A file of its own: React keeps a lazy component's first result for the life of the module, so each case
// needs a module registry no other test has touched. Both cases reset it, so their order does not matter.

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ imports: 0 }));

vi.mock('@elevenlabs/react', () => {
    sdk.imports += 1;
    return {
        ConversationProvider: ({ children }) => children,
        useConversation: () => ({
            status: 'connecting', isSpeaking: false, isMuted: false,
            startSession: () => {}, endSession: () => {}, setMuted: () => {},
        }),
    };
});

beforeEach(() => {
    vi.resetModules();
    const stream = { getTracks: () => [] };
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
});

afterEach(() => {
    vi.doUnmock('@/components/voice/VoiceSession');
    delete navigator.mediaDevices;
});

describe('the voice chunk', () => {
    it('is not imported until the visitor presses Start', async () => {
        const { default: TalkToBuddi } = await import('@/components/voice/TalkToBuddi');
        const user = userEvent.setup();
        render(<TalkToBuddi />);
        expect(sdk.imports).toBe(0);
        await user.click(screen.getByRole('button', { name: 'Start talking' }));
        expect(await screen.findByText('Connecting to Buddi…')).toBeVisible();
        expect(sdk.imports).toBe(1);
    });

    it('says it could not load, without a Try again that cannot work, when the chunk is gone', async () => {
        vi.doMock('@/components/voice/VoiceSession', () => {
            throw new Error('Failed to fetch dynamically imported module');
        });
        const { default: TalkToBuddi, NOT_LOADED } = await import('@/components/voice/TalkToBuddi');
        const user = userEvent.setup();
        render(<TalkToBuddi />);
        await user.click(screen.getByRole('button', { name: 'Start talking' }));
        expect(await screen.findByText(NOT_LOADED)).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
        expect(screen.getByRole('link', { name: /Talk to Buddi on ElevenLabs instead/ })).toBeVisible();
    });
});
