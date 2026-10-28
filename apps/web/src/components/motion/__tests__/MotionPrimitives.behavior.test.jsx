// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/__tests__/MotionPrimitives.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/motion/MotionPrimitives.jsx, apps/web/src/contexts/MotionContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/motion/MotionPrimitives.jsx; CONSUMES apps/web/src/contexts/MotionContext.jsx
// DAG Node:    none
// Intent:      Prove reveal, list, progress and pointer-depth primitives respect preferences, skip needless work and clean up.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider, useMotionPreferences } from '@/contexts/MotionContext';
import { MOTION_STORAGE_KEY } from '@/lib/motion/preferences';
import { MotionList, MotionProgress, MotionReveal, PointerSurface } from '../MotionPrimitives';

const observers = [];
const animations = [];
const frames = new Map();
let nextFrame = 0;
let priorAnimate;

beforeEach(() => {
    observers.length = 0; animations.length = 0; frames.clear(); nextFrame = 0;
    priorAnimate = Element.prototype.animate;
    Element.prototype.animate = vi.fn(function animate(keyframes, options) {
        const animation = { element: this, keyframes, options, cancel: vi.fn(), onfinish: null, oncancel: null };
        animations.push(animation);
        return animation;
    });
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback) { this.callback = callback; this.disconnect = vi.fn(); observers.push(this); }
        observe(node) { this.node = node; }
        unobserve() {}
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { nextFrame += 1; frames.set(nextFrame, callback); return nextFrame; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id) => frames.delete(id)));
});
afterEach(() => {
    Element.prototype.animate = priorAnimate;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const flushFrames = () => act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(16));
});
/** jsdom has no PointerEvent, so carry coordinates on a MouseEvent and add pointerType. */
const pointerMove = (target, { pointerType, ...init }) => {
    const event = new MouseEvent('pointermove', { bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    fireEvent(target, event);
};
const storePreferences = (preferences) => localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, ...preferences }));

function TurnPointerOff() {
    const { update } = useMotionPreferences();
    return <button type="button" onClick={() => update({ categories: { pointer: false } })}>Turn pointer depth off</button>;
}

describe('MotionReveal', () => {
    it('does not observe or animate when motion is off', () => {
        storePreferences({ mode: 'off' });
        render(<MotionProvider><MotionReveal>Static headline</MotionReveal></MotionProvider>);
        expect(screen.getByText('Static headline')).toBeVisible();
        expect(observers).toHaveLength(0);
        expect(animations).toHaveLength(0);
    });

    it('stops observing without animating when unmounted before it is ever seen', () => {
        const view = render(<MotionProvider><MotionReveal>Below the fold</MotionReveal></MotionProvider>);
        view.unmount();
        expect(observers[0].disconnect).toHaveBeenCalled();
        expect(animations).toHaveLength(0);
    });

    it('caps a long reveal delay so content never waits more than 240ms', () => {
        render(<MotionProvider><MotionReveal delay={5000}>Late section</MotionReveal></MotionProvider>);
        act(() => observers[0].callback([{ isIntersecting: true }]));
        expect(animations).toHaveLength(1);
        expect(animations[0].options.delay).toBe(240);
    });
});

describe('MotionList', () => {
    let widths;
    beforeEach(() => {
        widths = {};
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rectangle() {
            const position = [...(this.parentElement?.children || [])].indexOf(this);
            const width = widths[this.getAttribute('data-motion-key')] ?? 200;
            return { top: position * 30, left: 0, width, height: 30, bottom: (position + 1) * 30, right: width };
        });
    });
    function List({ ids }) {
        return <MotionProvider><MotionList as="ul" itemsKey={ids.join(':')}>
            <li>Heading row without a key</li>
            {ids.map((id) => <li key={id} data-motion-key={id}>Record {id}</li>)}
        </MotionList></MotionProvider>;
    }

    it('fades in only newly added records with a stagger and leaves unmoved records alone', () => {
        const view = render(<List ids={['a', 'b']} />);
        expect(animations).toHaveLength(0);
        view.rerender(<List ids={['a', 'b', 'c']} />);
        expect(animations).toHaveLength(1);
        expect(animations[0].element).toHaveTextContent('Record c');
        expect(animations[0].keyframes).toEqual([{ opacity: 0.5 }, { opacity: 1 }]);
        // The keyless heading row is index 0, so the new record sits at index 3.
        expect(animations[0].options.delay).toBe(3 * 35);
    });

    it('moves a reordered record from its previous position without delay', () => {
        const view = render(<List ids={['a', 'b']} />);
        view.rerender(<List ids={['b', 'a']} />);
        expect(animations).toHaveLength(2);
        expect(animations.every((animation) => animation.options.delay === 0)).toBe(true);
        expect(animations[0].keyframes[0].transform).toMatch(/^translate\(/);
    });

    it('skips hidden zero-width records and every record when motion is off', () => {
        const view = render(<List ids={['a']} />);
        widths.b = 0;
        view.rerender(<List ids={['a', 'b']} />);
        expect(animations).toHaveLength(0);
        view.unmount();

        storePreferences({ mode: 'off' });
        const off = render(<List ids={['a']} />);
        off.rerender(<List ids={['a', 'c']} />);
        expect(screen.getByText('Record c')).toBeVisible();
        expect(animations).toHaveLength(0);
    });
});

describe('MotionProgress', () => {
    it('falls back to a 0-100 scale for an invalid maximum and drops the transition when motion is off', () => {
        storePreferences({ mode: 'off' });
        render(<MotionProvider><MotionProgress value={4} max={0} label="Checks" /></MotionProvider>);
        const bar = screen.getByRole('progressbar', { name: 'Checks' });
        expect(bar).toHaveAttribute('aria-valuemax', '100');
        expect(bar).toHaveAttribute('aria-valuenow', '0');
        expect(bar.firstChild.style.transition).toBe('none');
    });

    it('animates the bar width with motion on', () => {
        render(<MotionProvider><MotionProgress value={3} max={4} label="Checks" /></MotionProvider>);
        const bar = screen.getByRole('progressbar', { name: 'Checks' });
        expect(bar).toHaveAttribute('aria-valuenow', '3');
        expect(bar.firstChild.style.transform).toBe('scaleX(0.75)');
        expect(bar.firstChild.style.transition).toContain('var(--motion-layout)');
    });
});

describe('PointerSurface', () => {
    function renderSurface(rect = { left: 0, top: 0, width: 200, height: 100 }) {
        const view = render(<MotionProvider><TurnPointerOff /><PointerSurface className="outer"><button type="button">Illustration action</button></PointerSurface></MotionProvider>);
        const inner = view.container.querySelector('.motion-pointer-surface');
        const outer = inner.parentElement;
        vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height });
        return { ...view, inner, outer };
    }

    it('tilts toward a mouse pointer in one frame, cancelling a superseded frame', () => {
        storePreferences({ categories: { pointer: true } });
        const { inner, outer } = renderSurface();
        pointerMove(outer, { clientX: 20, clientY: 20, pointerType: 'mouse' });
        const superseded = [...frames.keys()][0];
        pointerMove(outer, { clientX: 150, clientY: 25, pointerType: 'mouse' });
        expect(cancelAnimationFrame).toHaveBeenCalledWith(superseded);
        expect(frames.size).toBe(1);
        flushFrames();
        expect(inner.style.transform).toBe('perspective(900px) rotateX(1.25deg) rotateY(1.25deg)');
        expect(inner.style.getPropertyValue('--pointer-x')).toBe('75%');
        expect(inner.style.getPropertyValue('--pointer-y')).toBe('25%');
        expect(screen.getByRole('button', { name: 'Illustration action' })).toBeVisible();
    });

    it('centres the tilt on a zero-size surface and resets when the pointer leaves', () => {
        storePreferences({ categories: { pointer: true } });
        const { inner, outer } = renderSurface({ left: 0, top: 0, width: 0, height: 0 });
        pointerMove(outer, { clientX: 10, clientY: 10, pointerType: 'pen' });
        flushFrames();
        expect(inner.style.getPropertyValue('--pointer-x')).toBe('50%');
        expect(inner.style.transform).toBe('perspective(900px) rotateX(0deg) rotateY(0deg)');

        pointerMove(outer, { clientX: 10, clientY: 10, pointerType: 'mouse' });
        const pending = [...frames.keys()][0];
        fireEvent.pointerLeave(outer);
        expect(cancelAnimationFrame).toHaveBeenCalledWith(pending);
        expect(inner.style.transform).toBe('');
        expect(inner.style.getPropertyValue('--pointer-x')).toBe('');
    });

    it('ignores touch input and stops tilting once pointer depth is turned off', () => {
        storePreferences({ categories: { pointer: true } });
        const { inner, outer } = renderSurface();
        pointerMove(outer, { clientX: 150, clientY: 25, pointerType: 'touch' });
        expect(frames.size).toBe(0);

        pointerMove(outer, { clientX: 150, clientY: 25, pointerType: 'mouse' });
        flushFrames();
        expect(inner.style.transform).not.toBe('');
        fireEvent.click(screen.getByRole('button', { name: 'Turn pointer depth off' }));
        expect(inner.style.transform).toBe('');
        pointerMove(outer, { clientX: 150, clientY: 25, pointerType: 'mouse' });
        expect(frames.size).toBe(0);
    });
});
