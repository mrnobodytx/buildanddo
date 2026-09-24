// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/__tests__/MotionRuntime.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/motion/MotionPrimitives.jsx, apps/web/src/components/motion/StepSequence.jsx, apps/web/src/components/motion/ReadingProgress.jsx, apps/web/src/contexts/MotionContext.jsx, apps/web/src/components/platform/MetaFunctionFlow.jsx, apps/web/src/components/platform/MetaFunctionDashboard.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/components/motion/MotionPrimitives.jsx; DEPENDS_ON apps/web/src/components/motion/StepSequence.jsx; DEPENDS_ON apps/web/src/components/motion/ReadingProgress.jsx; DEPENDS_ON apps/web/src/contexts/MotionContext.jsx; DEPENDS_ON apps/web/src/components/platform/MetaFunctionFlow.jsx; DEPENDS_ON apps/web/src/components/platform/MetaFunctionDashboard.jsx
// DAG Node:    none
// Intent:      Exercise real hook cleanup, finite walkthroughs, scope removal and readable animation fallbacks.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider, useMotionPreferences } from '@/contexts/MotionContext';
import { MotionEntrance, MotionList, MotionReveal, MotionProgress, MotionValue } from '../MotionPrimitives';
import StepSequence from '../StepSequence';
import ReadingProgress from '../ReadingProgress';
import MetaFunctionFlow from '@/components/platform/MetaFunctionFlow';
import MetaFunctionDashboard from '@/components/platform/MetaFunctionDashboard';
import { MOTION_STORAGE_KEY } from '@/lib/motion/preferences';

const observers = [];
const animations = [];
let priorAnimate;
beforeEach(() => {
    observers.length = 0; animations.length = 0;
    priorAnimate = Element.prototype.animate;
    Element.prototype.animate = vi.fn((frames, options) => {
        const animation = { frames, options, cancel: vi.fn(), onfinish: null, oncancel: null,
            finish: vi.fn(), play: vi.fn(), pause: vi.fn(), finished: Promise.resolve() };
        animations.push(animation);
        // A real animation finishes. Without this the stub never settles, so an
        // AnimatePresence with mode="wait" keeps the outgoing child mounted forever and
        // the next stage never appears - the component's state had already advanced.
        setTimeout(() => { animation.onfinish?.({ target: animation }); }, 0);
        return animation;
    });
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback) { this.callback = callback; this.disconnect = vi.fn(); observers.push(this); }
        observe(node) { this.node = node; }
        unobserve() {}
    });
});
afterEach(() => {
    Element.prototype.animate = priorAnimate;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
function Controls() {
    const { update } = useMotionPreferences();
    return <button onClick={() => update({ mode: 'off' })}>Disable motion</button>;
}

describe('motion activity and lifecycle', () => {
    it('keeps the platform diagram and invocation feed operable when changing motion policy', async () => {
        render(<MotionProvider><Controls /><MetaFunctionFlow /><MetaFunctionDashboard animate={false} /></MotionProvider>);
        expect(screen.getByRole('heading', { name: 'MetaFunction control plane' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() => expect(screen.getByText('Stage 02')).toBeVisible());
        fireEvent.click(screen.getByText('Disable motion'));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() => expect(screen.getByText('Stage 03')).toBeVisible());
        expect(screen.getByRole('heading', { name: 'MetaFunction control plane' })).toBeVisible();
    });

    it('cancels an in-flight entrance when the preference changes and keeps content usable', () => {
        render(<MotionProvider><Controls /><MotionEntrance><button>Use this action</button></MotionEntrance></MotionProvider>);
        expect(animations).toHaveLength(1);
        fireEvent.click(screen.getByText('Disable motion'));
        expect(animations[0].cancel).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Use this action' })).toBeVisible();
        expect(animations).toHaveLength(1);
    });

    it('reveals once on intersection, remains readable before it, and disconnects on unmount', () => {
        const view = render(<MotionProvider><MotionReveal>Readable before reveal</MotionReveal></MotionProvider>);
        expect(screen.getByText('Readable before reveal')).toBeVisible();
        expect(animations).toHaveLength(0);
        act(() => observers[0].callback([{ isIntersecting: true }]));
        expect(animations).toHaveLength(1);
        act(() => { observers[0].callback([{ isIntersecting: false }]); observers[0].callback([{ isIntersecting: true }]); });
        expect(animations).toHaveLength(1);
        view.unmount();
        expect(observers[0].disconnect).toHaveBeenCalled();
        expect(animations[0].cancel).toHaveBeenCalled();
    });

    it('renders without animation or intersection APIs and retains exact progress semantics', () => {
        Element.prototype.animate = undefined;
        vi.stubGlobal('IntersectionObserver', undefined);
        render(<MotionProvider><MotionReveal>Fallback content</MotionReveal><MotionProgress value={7} max={10} label="Recorded checks" /></MotionProvider>);
        expect(screen.getByText('Fallback content')).toBeVisible();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '7');
    });

    it('emphasizes confirmed value changes without animating initial or unchanged values', () => {
        function Screen({ value }) { return <MotionProvider><MotionValue value={value} /></MotionProvider>; }
        const view = render(<Screen value="pending" />);
        expect(animations).toHaveLength(0);
        view.rerender(<Screen value="pending" />);
        expect(animations).toHaveLength(0);
        view.rerender(<Screen value="receipt received" />);
        expect(screen.getByText('receipt received')).toBeVisible();
        expect(animations).toHaveLength(1);
    });

    it('reorders by geometry and removes private records immediately, including mid-animation', () => {
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rectangle() {
            const position = [...(this.parentElement?.children || [])].indexOf(this);
            return { top: position * 30, left: 0, width: 200, height: 30, bottom: (position + 1) * 30, right: 200 };
        });
        function List({ ids, account }) {
            return <MotionProvider><MotionList key={account} as="ul" itemsKey={ids.join(':')}>
                {ids.map((id) => <li key={id} data-motion-key={id}>{account}-{id}</li>)}
            </MotionList></MotionProvider>;
        }
        const view = render(<List account="A" ids={['first', 'second']} />);
        view.rerender(<List account="A" ids={['second', 'first']} />);
        expect(animations.length).toBeGreaterThan(0);
        view.rerender(<List account="B" ids={['new']} />);
        expect(screen.queryByText('A-first')).not.toBeInTheDocument();
        expect(screen.queryByText('A-second')).not.toBeInTheDocument();
        expect(screen.getByText('B-new')).toBeVisible();
        expect(animations.every((animation) => animation.cancel.mock.calls.length > 0)).toBe(true);
    });

    it('plays only while visible, stops at the last step and clears timers on unmount', () => {
        vi.useFakeTimers();
        const view = render(<MotionProvider><StepSequence steps={[{ title: 'One', body: 'First explanation' }, { title: 'Two', body: 'Second explanation' }]} /></MotionProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'Play walkthrough' }));
        act(() => vi.advanceTimersByTime(6400));
        expect(screen.getByText('First explanation')).toBeVisible();
        act(() => observers[0].callback([{ isIntersecting: true }]));
        act(() => vi.advanceTimersByTime(3200));
        expect(screen.getByText('Second explanation')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Play walkthrough' })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
        expect(screen.getByText('First explanation')).toBeVisible();
        view.unmount();
        expect(observers[0].disconnect).toHaveBeenCalled();
    });

    it('still offers manual lesson navigation in reduced mode', () => {
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'reduced' }));
        render(<MotionProvider><StepSequence steps={[{ title: 'One', body: 'First' }, { title: 'Two', body: 'Second' }]} /></MotionProvider>);
        expect(screen.getByRole('button', { name: 'Play walkthrough' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
        expect(screen.getByText('Second')).toBeVisible();
        expect(animations).toHaveLength(0);
    });

    it('explains a global automatic pause while leaving manual learning controls available', () => {
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, paused: true }));
        render(<MotionProvider><StepSequence steps={[{ title: 'One', body: 'First' }, { title: 'Two', body: 'Second' }]} /></MotionProvider>);
        expect(screen.getByRole('button', { name: 'Play walkthrough' })).toBeDisabled();
        expect(screen.getByText(/Automatic playback is paused/)).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
        expect(screen.getByText('Second')).toBeVisible();
    });

    it('uses immediate scrolling when reduced and removes scroll listeners when leaving', () => {
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'reduced' }));
        const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        const remove = vi.spyOn(window, 'removeEventListener');
        const view = render(<MotionProvider><ReadingProgress /></MotionProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'Back to start' }));
        expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
        expect(screen.getByRole('progressbar', { name: 'Reading position' })).toBeVisible();
        view.unmount();
        expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    });
});
