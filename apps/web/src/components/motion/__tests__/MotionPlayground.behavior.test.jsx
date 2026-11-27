// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/__tests__/MotionPlayground.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/motion/MotionPlayground.jsx, apps/web/src/contexts/MotionContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/motion/MotionPlayground.jsx; CONSUMES apps/web/src/contexts/MotionContext.jsx
// DAG Node:    none
// Intent:      Prove each local preview's controls change only local state, validate local files and release media resources.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, setupUser } from '@/test/utils';
import { MotionProvider } from '@/contexts/MotionContext';
import { MOTION_STORAGE_KEY } from '@/lib/motion/preferences';
import MotionPlayground from '../MotionPlayground';

const renderPlayground = (kind) => renderWithProviders(<MotionProvider><MotionPlayground kind={kind} /></MotionProvider>);
const planOrder = () => within(screen.getByRole('list', { name: 'Example plan' })).getAllByRole('listitem').map((item) => item.getAttribute('aria-label'));

function stubObjectUrls() {
    let sequence = 0;
    const create = vi.fn(() => { sequence += 1; return `blob:local-${sequence}`; });
    const revoke = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    return { create, revoke };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('interface preview', () => {
    it('dismisses a confirmed example and opens the example dialog from the disclosure tab', async () => {
        const user = setupUser();
        renderPlayground('interface');
        await user.click(screen.getByRole('button', { name: 'Run success example' }));
        expect(screen.getByText('Waiting for the simulated response…')).toBeVisible();
        expect(await screen.findByText('Example confirmed. No record was saved.')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
        expect(screen.queryByText('Example confirmed. No record was saved.')).not.toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: 'Disclosure & overlay' }));
        await user.click(screen.getByRole('button', { name: 'Open example dialog' }));
        expect(await screen.findByRole('dialog', { name: 'Focus stays with the task' })).toBeVisible();
    });
});

describe('planning preview', () => {
    it('moves items with Alt+Arrow keys, ignores moves past the edges or without Alt, and resets', async () => {
        const user = setupUser();
        renderPlayground('planning');
        expect(planOrder()).toEqual(['Frame a question, position 1', 'Plan a test, position 2', 'Review evidence, position 3']);

        const first = screen.getByRole('listitem', { name: 'Frame a question, position 1' });
        first.focus();
        await user.keyboard('{ArrowDown}');
        expect(planOrder()[0]).toBe('Frame a question, position 1');
        await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
        expect(planOrder()[1]).toBe('Frame a question, position 2');
        expect(screen.getByText('Moved Frame a question to position 2.')).toBeInTheDocument();

        const last = screen.getByRole('listitem', { name: 'Review evidence, position 3' });
        last.focus();
        await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
        expect(planOrder()[2]).toBe('Review evidence, position 3');
        expect(screen.getByText('Moved Frame a question to position 2.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Move Frame a question down' }));
        expect(planOrder()[2]).toBe('Frame a question, position 3');
        expect(screen.getByText('Moved Frame a question to position 3.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Reset example plan' }));
        expect(planOrder()).toEqual(['Frame a question, position 1', 'Plan a test, position 2', 'Review evidence, position 3']);
        expect(screen.getByText('Example order reset.')).toBeInTheDocument();
    });
});

describe('data preview', () => {
    it('updates exact counts immediately without bar transitions when diagram motion is off', async () => {
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, categories: { data: false } }));
        const user = setupUser();
        renderPlayground('data');
        await user.click(screen.getByRole('button', { name: 'Decrease example' }));
        await user.click(screen.getByRole('button', { name: 'Decrease example' }));
        expect(screen.getByRole('progressbar', { name: 'Example progress' })).toHaveAttribute('aria-valuenow', '0');
        expect(screen.getByRole('button', { name: 'Decrease example' })).toBeDisabled();
        const bars = screen.getByRole('figure', { name: 'Example planned, recorded and reviewed counts' }).querySelectorAll('.bg-primary');
        expect([...bars].map((bar) => bar.style.transition)).toEqual(['none', 'none', 'none']);
        expect(bars[1].style.transform).toBe('scaleX(0)');
    });
});

describe('gallery preview', () => {
    it('adjusts the comparison, ignores an empty selection and restores the example image', async () => {
        const { revoke } = stubObjectUrls();
        const user = setupUser();
        renderPlayground('gallery');
        fireEvent.change(screen.getByRole('slider'), { target: { value: '30' } });
        expect(screen.getByText('Monochrome comparison: 30%')).toBeVisible();

        const input = screen.getByLabelText(/Try a local image/);
        fireEvent.change(input, { target: { files: [] } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.change(input, { target: { files: [new File(['image'], 'example.webp', { type: 'image/webp' })] } });
        await waitFor(() => expect(screen.getByRole('img', { name: 'Original image' })).toHaveAttribute('src', 'blob:local-1'));

        await user.click(screen.getByRole('button', { name: 'Restore example image' }));
        expect(screen.getByRole('img', { name: 'Original image' })).toHaveAttribute('src', '/social-card.png');
        expect(revoke).toHaveBeenCalledWith('blob:local-1');
    });
});

describe('media preview', () => {
    it('rejects unsupported video and caption files and keeps the placeholder', () => {
        stubObjectUrls();
        renderPlayground('media');
        fireEvent.change(screen.getByLabelText(/Local video preview \(MP4/), { target: { files: [new File(['x'], 'clip.mov', { type: 'video/quicktime' })] } });
        expect(screen.getByRole('alert')).toHaveTextContent('Choose a supported file within the size limit.');
        const captions = screen.getByLabelText(/Optional local captions/);
        fireEvent.change(captions, { target: { files: [] } });
        fireEvent.change(captions, { target: { files: [new File(['x'], 'captions.srt', { type: 'text/plain' })] } });
        expect(screen.getByText('Choose a WebVTT file under 1 MB.')).toBeVisible();
        expect(screen.getByText(/Choose a video to use playback/)).toBeVisible();
    });

    it('attaches local captions, pauses when the tab is hidden and releases everything on Clear media', async () => {
        const { revoke } = stubObjectUrls();
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
        const user = setupUser();
        renderPlayground('media');
        fireEvent.change(screen.getByLabelText(/Local video preview \(MP4/), { target: { files: [new File(['v'], 'clip.mp4', { type: 'video/mp4' })] } });
        const video = await screen.findByLabelText('Local video preview');
        fireEvent.change(screen.getByLabelText(/Optional local captions/), { target: { files: [new File(['WEBVTT'], 'Captions.VTT', { type: 'text/vtt' })] } });
        const track = video.querySelector('track');
        expect(track).toHaveAttribute('kind', 'captions');
        expect(track).toHaveAttribute('src', 'blob:local-2');
        expect(screen.queryByText('Choose a WebVTT file under 1 MB.')).not.toBeInTheDocument();

        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(pause).not.toHaveBeenCalled();
        hidden.mockReturnValue(true);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(pause).toHaveBeenCalledTimes(1);
        hidden.mockReturnValue(false);

        await user.click(screen.getByRole('button', { name: 'Clear media' }));
        expect(pause).toHaveBeenCalledTimes(2);
        expect(screen.queryByLabelText('Local video preview')).not.toBeInTheDocument();
        expect(screen.getByText(/Choose a video to use playback/)).toBeVisible();
        expect(revoke).toHaveBeenCalledWith('blob:local-1');
        expect(revoke).toHaveBeenCalledWith('blob:local-2');
    });
});

describe('story and spatial previews', () => {
    it('shows the illustrative walkthrough for the story collection', () => {
        renderPlayground('story');
        expect(screen.getByRole('region', { name: 'From question to evidence' })).toBeVisible();
        expect(screen.getByText('Illustrative walkthrough. It does not run or approve work.')).toBeVisible();
    });

    it('explains the opt-in 3D mesh and falls back to a static diagram by default', async () => {
        renderPlayground('spatial');
        expect(screen.getByText(/Enable 3D capability mesh under Optional effects/)).toBeVisible();
        expect(await screen.findByRole('figure')).toBeInTheDocument();
        expect(screen.queryByText('Loading illustration…')).not.toBeInTheDocument();
    });
});
