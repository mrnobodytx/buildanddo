// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/__tests__/MotionContext.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/contexts/MotionContext.jsx, apps/web/src/lib/motion/preferences.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/contexts/MotionContext.jsx; CONSUMES apps/web/src/lib/motion/preferences.js
// DAG Node:    none
// Intent:      Prove the motion policy follows live device signals, cleans up its listeners and degrades safely outside a provider.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider, useMotionActivity, useMotionPreferences } from '@/contexts/MotionContext';
import { MOTION_STORAGE_KEY } from '@/lib/motion/preferences';

/** A controllable MediaQueryList. `legacy` lists expose only addListener/removeListener. */
function installMediaQueries({ legacy = false, initial = {} } = {}) {
    const state = { ...initial };
    const lists = new Map();
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
        if (!lists.has(query)) {
            const listeners = new Set();
            const list = {
                media: query, onchange: null, dispatchEvent: () => false,
                get matches() { return state[query] === true; },
                addListener: vi.fn((listener) => listeners.add(listener)),
                removeListener: vi.fn((listener) => listeners.delete(listener)),
                listeners,
            };
            if (!legacy) {
                list.addEventListener = vi.fn((type, listener) => listeners.add(listener));
                list.removeEventListener = vi.fn((type, listener) => listeners.delete(listener));
            }
            lists.set(query, list);
        }
        return lists.get(query);
    });
    return {
        lists,
        change(query, matches) {
            state[query] = matches;
            act(() => lists.get(query)?.listeners.forEach((listener) => listener({ matches, media: query })));
        },
    };
}

function Probe() {
    const { motion, preferences, environment, persisted, update, reset } = useMotionPreferences();
    return <div>
        <p data-testid="mode">{motion.mode}</p>
        <p data-testid="automatic">{motion.automatic ? 'automatic' : 'manual'}</p>
        <p data-testid="stored-mode">{preferences.mode}</p>
        <p data-testid="reduced">{environment.reduced ? 'device-reduced' : 'device-default'}</p>
        <p data-testid="persisted">{persisted ? 'saved' : 'session'}</p>
        <button type="button" onClick={() => update({ mode: 'full' })}>Choose full motion</button>
        <button type="button" onClick={() => reset()}>Reset motion</button>
    </div>;
}

function ActivityProbe() {
    const { ref, visible, active } = useMotionActivity('ambient');
    return <section ref={ref} aria-label="Ambient sample" data-visible={visible ? 'yes' : 'no'} data-active={active ? 'yes' : 'no'} />;
}

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
    delete window.navigator.connection;
});

describe('MotionContext outside a provider', () => {
    it('reports motion off and treats update and reset as harmless no-ops', () => {
        render(<Probe />);
        expect(screen.getByTestId('mode')).toHaveTextContent('off');
        expect(screen.getByTestId('persisted')).toHaveTextContent('session');
        fireEvent.click(screen.getByRole('button', { name: 'Choose full motion' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reset motion' }));
        expect(screen.getByTestId('mode')).toHaveTextContent('off');
        expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    });
});

describe('MotionProvider following live device signals', () => {
    it('switches to reduced motion when the OS setting changes and stops listening after unmount', () => {
        const media = installMediaQueries();
        const view = render(<MotionProvider><Probe /></MotionProvider>);
        expect(screen.getByTestId('mode')).toHaveTextContent('full');
        expect(document.documentElement).toHaveAttribute('data-motion', 'full');

        media.change('(prefers-reduced-motion: reduce)', true);
        expect(screen.getByTestId('mode')).toHaveTextContent('reduced');
        expect(screen.getByTestId('reduced')).toHaveTextContent('device-reduced');
        expect(document.documentElement).toHaveAttribute('data-motion', 'reduced');
        expect(document.documentElement).toHaveAttribute('data-motion-automatic', 'off');

        const reducedList = media.lists.get('(prefers-reduced-motion: reduce)');
        view.unmount();
        expect(reducedList.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        expect(reducedList.listeners.size).toBe(0);
        expect(document.documentElement).toHaveAttribute('data-motion', 'off');
        expect(document.documentElement).toHaveAttribute('data-motion-automatic', 'off');
    });

    it('supports browsers that only offer the legacy addListener API', () => {
        const media = installMediaQueries({ legacy: true });
        const view = render(<MotionProvider><Probe /></MotionProvider>);
        const reducedList = media.lists.get('(prefers-reduced-motion: reduce)');
        expect(reducedList.addListener).toHaveBeenCalled();

        media.change('(prefers-reduced-motion: reduce)', true);
        expect(screen.getByTestId('mode')).toHaveTextContent('reduced');

        view.unmount();
        expect(reducedList.removeListener).toHaveBeenCalled();
        expect(reducedList.listeners.size).toBe(0);
    });

    it('still provides full motion when the browser has no matchMedia at all', () => {
        const original = window.matchMedia;
        window.matchMedia = undefined;
        try {
            render(<MotionProvider><Probe /></MotionProvider>);
            expect(screen.getByTestId('mode')).toHaveTextContent('full');
            expect(screen.getByTestId('reduced')).toHaveTextContent('device-default');
        } finally { window.matchMedia = original; }
    });

    it('pauses automatic effects when Data Saver turns on and detaches from the connection on unmount', () => {
        installMediaQueries();
        const listeners = new Set();
        const connection = {
            saveData: false,
            addEventListener: vi.fn((type, listener) => listeners.add(listener)),
            removeEventListener: vi.fn((type, listener) => listeners.delete(listener)),
        };
        Object.defineProperty(window.navigator, 'connection', { configurable: true, value: connection });
        const view = render(<MotionProvider><Probe /></MotionProvider>);
        expect(screen.getByTestId('automatic')).toHaveTextContent('automatic');
        expect(document.documentElement).toHaveAttribute('data-motion-automatic', 'on');

        connection.saveData = true;
        act(() => listeners.forEach((listener) => listener()));
        expect(screen.getByTestId('automatic')).toHaveTextContent('manual');
        expect(document.documentElement).toHaveAttribute('data-motion-automatic', 'off');

        view.unmount();
        expect(connection.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        expect(listeners.size).toBe(0);
    });

    it('stops automatic effects while the page is hidden and resumes when it is shown again', () => {
        installMediaQueries();
        render(<MotionProvider><Probe /></MotionProvider>);
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(screen.getByTestId('automatic')).toHaveTextContent('manual');
        hidden.mockReturnValue(false);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(screen.getByTestId('automatic')).toHaveTextContent('automatic');
    });

    it('persists an update and restores defaults on reset through the provider', () => {
        installMediaQueries();
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'off' }));
        render(<MotionProvider><Probe /></MotionProvider>);
        expect(screen.getByTestId('stored-mode')).toHaveTextContent('off');
        fireEvent.click(screen.getByRole('button', { name: 'Choose full motion' }));
        expect(screen.getByTestId('stored-mode')).toHaveTextContent('full');
        expect(JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY)).mode).toBe('full');
        fireEvent.click(screen.getByRole('button', { name: 'Reset motion' }));
        expect(screen.getByTestId('stored-mode')).toHaveTextContent('system');
        expect(screen.getByTestId('persisted')).toHaveTextContent('saved');
    });
});

describe('useMotionActivity', () => {
    it('is active only while visible and only when the category is enabled with automatic motion', () => {
        installMediaQueries();
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, categories: { ambient: true } }));
        render(<MotionProvider><ActivityProbe /></MotionProvider>);
        const region = screen.getByRole('region', { name: 'Ambient sample' });
        expect(region).toHaveAttribute('data-active', 'no');
        const observer = observers.find((entry) => entry.node === region);
        act(() => observer.callback([{ isIntersecting: true }]));
        expect(region).toHaveAttribute('data-visible', 'yes');
        expect(region).toHaveAttribute('data-active', 'yes');
        act(() => observer.callback([{ isIntersecting: false }]));
        expect(region).toHaveAttribute('data-active', 'no');
    });

    it('stays inactive when visible if the category is off by default', () => {
        installMediaQueries();
        render(<MotionProvider><ActivityProbe /></MotionProvider>);
        const region = screen.getByRole('region', { name: 'Ambient sample' });
        act(() => observers.find((entry) => entry.node === region).callback([{ isIntersecting: true }]));
        expect(region).toHaveAttribute('data-visible', 'yes');
        expect(region).toHaveAttribute('data-active', 'no');
    });
});
