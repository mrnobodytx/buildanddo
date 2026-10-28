// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/__tests__/StepSequence.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/motion/StepSequence.jsx, apps/web/src/contexts/MotionContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/motion/StepSequence.jsx; CONSUMES apps/web/src/contexts/MotionContext.jsx
// DAG Node:    none
// Intent:      Prove the walkthrough's manual navigation, replay from the end, pause and empty-state behaviour.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@/contexts/MotionContext';
import StepSequence, { EDITORIAL_STEPS } from '../StepSequence';

const observers = [];
beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback) { this.callback = callback; this.disconnect = vi.fn(); observers.push(this); }
        observe(node) { this.node = node; }
        unobserve() {}
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const steps = [
    { title: 'Ask', body: 'Ask the question.' },
    { title: 'Plan', body: 'Plan the test.' },
    { title: 'Review', body: 'Review the evidence.' },
];
const stepButton = (title) => screen.getByRole('button', { name: new RegExp(`^\\d{2}\\s*${title}$`) });

describe('StepSequence manual navigation', () => {
    it('moves between steps with Previous, Next and direct step buttons', () => {
        render(<MotionProvider><StepSequence steps={steps} /></MotionProvider>);
        expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
        expect(stepButton('Ask')).toHaveAttribute('aria-current', 'step');

        fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
        expect(screen.getByText('Plan the test.')).toBeVisible();
        expect(stepButton('Plan')).toHaveAttribute('aria-current', 'step');

        fireEvent.click(stepButton('Review'));
        expect(screen.getByText('Review the evidence.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
        expect(screen.getByText('Plan the test.')).toBeVisible();
        expect(stepButton('Ask')).not.toHaveAttribute('aria-current');
    });

    it('uses the editorial steps by default and renders nothing for an empty sequence', () => {
        const { container, rerender } = render(<MotionProvider><StepSequence title="Product path" compact /></MotionProvider>);
        expect(screen.getByRole('region', { name: 'Product path' })).not.toHaveClass('space-y-5');
        expect(screen.getAllByRole('listitem')).toHaveLength(EDITORIAL_STEPS.length);
        rerender(<MotionProvider><StepSequence steps={[]} /></MotionProvider>);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('StepSequence automatic playback', () => {
    it('replays from the first step when Play is pressed on the last step, and can be paused', () => {
        vi.useFakeTimers();
        render(<MotionProvider><StepSequence steps={steps} /></MotionProvider>);
        const region = screen.getByRole('region', { name: 'From question to evidence' });
        act(() => observers.find((observer) => observer.node === region).callback([{ isIntersecting: true }]));

        fireEvent.click(stepButton('Review'));
        fireEvent.click(screen.getByRole('button', { name: 'Play walkthrough' }));
        expect(screen.getByText('Ask the question.')).toBeVisible();
        const pause = screen.getByRole('button', { name: 'Pause walkthrough' });
        expect(pause).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Ask the question.').closest('[aria-live]')).toHaveAttribute('aria-live', 'off');

        act(() => vi.advanceTimersByTime(3200));
        expect(screen.getByText('Plan the test.')).toBeVisible();

        fireEvent.click(pause);
        expect(screen.getByRole('button', { name: 'Play walkthrough' })).toHaveAttribute('aria-pressed', 'false');
        act(() => vi.advanceTimersByTime(6400));
        expect(screen.getByText('Plan the test.')).toBeVisible();
        expect(screen.getByText('Plan the test.').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    });
});
