// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/__tests__/ReadingProgress.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/motion/ReadingProgress.jsx, apps/web/src/contexts/MotionContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/motion/ReadingProgress.jsx; CONSUMES apps/web/src/contexts/MotionContext.jsx
// DAG Node:    none
// Intent:      Prove reading progress tracks page and nested-scroller position per frame and returns readers to the start accessibly.
// ───────────────────────────────────────────────────────────────

import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@/contexts/MotionContext';
import { MOTION_STORAGE_KEY } from '@/lib/motion/preferences';
import ReadingProgress from '../ReadingProgress';

const frames = new Map();
let nextFrame = 0;
const resizeObservers = [];
const geometry = { articleTop: 100, articleHeight: 1000, scrollerTop: 100, scrollerHeight: 400 };

beforeEach(() => {
    frames.clear(); nextFrame = 0; resizeObservers.length = 0;
    Object.assign(geometry, { articleTop: 100, articleHeight: 1000, scrollerTop: 100, scrollerHeight: 400 });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { nextFrame += 1; frames.set(nextFrame, callback); return nextFrame; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id) => frames.delete(id)));
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback) { this.callback = callback; this.observe = vi.fn(); this.disconnect = vi.fn(); resizeObservers.push(this); }
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rectangle() {
        if (this.tagName === 'ARTICLE') return { top: geometry.articleTop, height: geometry.articleHeight, left: 0, width: 600 };
        if (this.hasAttribute('data-reading-scroll')) return { top: geometry.scrollerTop, height: geometry.scrollerHeight, left: 0, width: 600 };
        return { top: 0, height: 0, left: 0, width: 0 };
    });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function height() {
        return this.hasAttribute('data-reading-scroll') ? geometry.scrollerHeight : 0;
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete document.documentElement.scrollHeight;
    window.scrollY = 0;
});

const flushFrames = () => act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(16));
});
const setPageHeight = (height) => Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: height });

function Lesson({ label = 'Lesson position' }) {
    const ref = useRef(null);
    return <div data-reading-scroll="" data-testid="scroller">
        <ReadingProgress targetRef={ref} label={label} />
        <article ref={ref}><h2>Lesson heading</h2><p>Lesson body</p></article>
    </div>;
}

describe('ReadingProgress on the page', () => {
    it('updates the page position once per frame while scrolling and smooth-scrolls back with full motion', () => {
        setPageHeight(2768);
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        render(<MotionProvider><ReadingProgress /></MotionProvider>);
        const bar = screen.getByRole('progressbar', { name: 'Reading position' });
        expect(bar).toHaveAttribute('aria-valuenow', '0');
        expect(bar.firstChild.style.transition).toContain('var(--motion-micro)');

        window.scrollY = 1000;
        fireEvent.scroll(window);
        fireEvent.scroll(window);
        expect(frames.size).toBe(1);
        flushFrames();
        expect(bar).toHaveAttribute('aria-valuenow', '50');
        expect(screen.getByText('50%')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Back to start' }));
        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    it('reports a page shorter than the viewport as fully read', () => {
        setPageHeight(500);
        render(<MotionProvider><ReadingProgress /></MotionProvider>);
        expect(screen.getByRole('progressbar', { name: 'Reading position' })).toHaveAttribute('aria-valuenow', '100');
    });

    it('re-measures on resize and cancels an unfinished frame when it unmounts', () => {
        setPageHeight(2768);
        const view = render(<MotionProvider><ReadingProgress /></MotionProvider>);
        expect(resizeObservers[0].observe).toHaveBeenCalledWith(document.documentElement);
        window.scrollY = 2000;
        act(() => resizeObservers[0].callback([]));
        flushFrames();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

        fireEvent(window, new Event('resize'));
        const pending = [...frames.keys()][0];
        view.unmount();
        expect(cancelAnimationFrame).toHaveBeenCalledWith(pending);
        expect(resizeObservers[0].disconnect).toHaveBeenCalled();
    });

    it('still measures when the browser has no ResizeObserver', () => {
        vi.stubGlobal('ResizeObserver', undefined);
        setPageHeight(2768);
        window.scrollY = 500;
        render(<MotionProvider><ReadingProgress /></MotionProvider>);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    });
});

describe('ReadingProgress inside a scrolling lesson', () => {
    it('tracks the article within its scroller and returns focus to the lesson heading', () => {
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
        render(<MotionProvider><Lesson /></MotionProvider>);
        const bar = screen.getByRole('progressbar', { name: 'Lesson position' });
        expect(bar).toHaveAttribute('aria-valuenow', '0');
        expect(resizeObservers[0].observe).toHaveBeenCalledWith(screen.getByRole('article'));

        geometry.articleTop = -200;
        fireEvent.scroll(screen.getByTestId('scroller'));
        flushFrames();
        // (scroller top 100 - article top -200) / (article 1000 - viewport 400)
        expect(bar).toHaveAttribute('aria-valuenow', '50');

        fireEvent.click(screen.getByRole('button', { name: 'Back to start' }));
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
        const heading = screen.getByRole('heading', { name: 'Lesson heading' });
        expect(heading).toHaveAttribute('tabindex', '-1');
        expect(heading).toHaveFocus();
    });

    it('treats an article that fits in its scroller as fully read', () => {
        geometry.articleHeight = 300;
        render(<MotionProvider><Lesson /></MotionProvider>);
        expect(screen.getByRole('progressbar', { name: 'Lesson position' })).toHaveAttribute('aria-valuenow', '100');
    });

    it('jumps back immediately and drops the bar transition when motion is reduced', () => {
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'reduced' }));
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
        render(<MotionProvider><Lesson /></MotionProvider>);
        expect(screen.getByRole('progressbar').firstChild.style.transition).toBe('none');
        fireEvent.click(screen.getByRole('button', { name: 'Back to start' }));
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    });
});
