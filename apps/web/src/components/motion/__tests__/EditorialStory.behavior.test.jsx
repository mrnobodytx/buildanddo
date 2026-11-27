// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/__tests__/EditorialStory.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/motion/EditorialStory.jsx, apps/web/src/contexts/MotionContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/motion/EditorialStory.jsx; CONSUMES apps/web/src/contexts/MotionContext.jsx
// DAG Node:    none
// Intent:      Prove the editorial parallax runs only when opted in and visible, batches scroll work per frame and cleans up.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@/contexts/MotionContext';
import { MOTION_STORAGE_KEY } from '@/lib/motion/preferences';
import EditorialStory from '../EditorialStory';

const observers = [];
const frames = new Map();
let nextFrame = 0;
let rectTop = 900;

beforeEach(() => {
    observers.length = 0; frames.clear(); nextFrame = 0; rectTop = 900;
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback) { this.callback = callback; this.disconnect = vi.fn(); observers.push(this); }
        observe(node) { this.node = node; }
        unobserve() {}
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { nextFrame += 1; frames.set(nextFrame, callback); return nextFrame; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id) => frames.delete(id)));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
        top: rectTop, left: 0, width: 600, height: 400, bottom: rectTop + 400, right: 600,
    }));
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const flushFrames = () => act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(16));
});

function renderStory() {
    const view = render(<MotionProvider><EditorialStory /></MotionProvider>);
    const section = screen.getByRole('region', { name: 'A visible path from question to learning.' });
    const illustration = section.querySelector('.motion-pointer-surface').parentElement.parentElement;
    const sectionObserver = observers.find((observer) => observer.node === section);
    const setVisible = (visible) => act(() => sectionObserver.callback([{ isIntersecting: visible }]));
    return { ...view, section, illustration, setVisible };
}

describe('EditorialStory depth and ambient activity', () => {
    it('applies bounded parallax only once the section is visible and batches scrolls into one frame', () => {
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, categories: { pointer: true, ambient: true } }));
        const { section, illustration, setVisible } = renderStory();
        expect(section).toHaveAttribute('data-visible', 'false');

        fireEvent.scroll(window);
        expect(frames.size).toBe(0);
        expect(illustration.style.transform).toBe('');

        setVisible(true);
        expect(section).toHaveAttribute('data-visible', 'true');
        expect(frames.size).toBe(1);
        flushFrames();
        // (900 - 768 / 2) * -0.025 = -12.9, clamped to the -10px limit.
        expect(illustration.style.transform).toBe('translateY(-10px)');

        rectTop = 344;
        fireEvent.scroll(window);
        fireEvent.scroll(window);
        expect(frames.size).toBe(1);
        flushFrames();
        expect(illustration.style.transform).toBe('translateY(1px)');
    });

    it('cancels a pending frame, removes the scroll listener and clears the transform on unmount', () => {
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, categories: { pointer: true } }));
        const remove = vi.spyOn(window, 'removeEventListener');
        const { illustration, setVisible, unmount } = renderStory();
        setVisible(true);
        flushFrames();
        expect(illustration.style.transform).toBe('translateY(-10px)');
        fireEvent.scroll(window);
        const pending = [...frames.keys()][0];

        unmount();
        expect(cancelAnimationFrame).toHaveBeenCalledWith(pending);
        expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
        expect(illustration.style.transform).toBe('');
    });

    it('keeps the illustration static and the ambient layer idle with editorial defaults', () => {
        const { section, illustration, setVisible } = renderStory();
        setVisible(true);
        fireEvent.scroll(window);
        expect(frames.size).toBe(0);
        expect(illustration.style.transform).toBe('');
        expect(section).toHaveAttribute('data-visible', 'false');
        expect(screen.getByRole('link', { name: 'Read the field guide' })).toHaveAttribute('href', '/docs');
    });
});
