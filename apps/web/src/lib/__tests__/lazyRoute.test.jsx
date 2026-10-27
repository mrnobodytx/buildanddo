// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/lazyRoute.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-17
// Depends:     apps/web/src/lib/lazyRoute.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/lazyRoute.js
// DAG Node:    none
// Intent:      Prove a route chunk removed by a deploy reloads the page once into the current build, and that a
//              reload which cannot help leaves the failure visible instead of looping.
// ───────────────────────────────────────────────────────────────

import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyRoute, reloadIntoCurrentBuild } from '@/lib/lazyRoute';

// What Vite's preload helper throws when the running bundle names a stylesheet the deploy removed.
const staleChunk = () => new Error('Unable to preload CSS for /assets/HomePage-_vZoPb_N.css');

// One browser tab: a reload replaces the window but keeps the tab's session storage.
const tab = ({ onLine = true, sessionStorage = window.sessionStorage } = {}) =>
    ({ location: { reload: vi.fn() }, navigator: { onLine }, sessionStorage });

// A held route waits on a grace timer; fake timers keep one from outliving its test.
beforeEach(() => { vi.useFakeTimers(); });

describe('a route chunk removed by a newer deployment', () => {
    it('reloads into the current build and keeps the route loading instead of failing', async () => {
        const browser = tab();
        const HomePage = lazyRoute(() => Promise.reject(staleChunk()), browser);
        render(<Suspense fallback={<p>Loading the page</p>}><HomePage /></Suspense>);
        await act(async () => {});
        expect(browser.location.reload).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Loading the page')).toBeVisible();
        // Another stale route in the same document waits for that reload instead of starting a second one.
        reloadIntoCurrentBuild(staleChunk(), browser);
        expect(browser.location.reload).toHaveBeenCalledTimes(1);
    });

    it('shows the original failure if the reload has not replaced the page within ten seconds', async () => {
        const error = staleChunk();
        const surfaced = expect(reloadIntoCurrentBuild(error, tab())).rejects.toBe(error);
        vi.advanceTimersByTime(10_000);
        await surfaced;
    });

    it('lets the failure surface when the reload reached no newer build, and recovers again a minute later', () => {
        vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
        reloadIntoCurrentBuild(staleChunk(), tab());
        const reloaded = tab();
        const error = staleChunk();
        expect(() => reloadIntoCurrentBuild(error, reloaded)).toThrow(error);
        expect(reloaded.location.reload).not.toHaveBeenCalled();

        vi.setSystemTime(new Date('2026-10-17T12:01:00Z'));
        reloadIntoCurrentBuild(staleChunk(), reloaded);
        expect(reloaded.location.reload).toHaveBeenCalledTimes(1);
    });

    it('leaves the failure to the page when offline or when the tab cannot remember that it reloaded', () => {
        const error = staleChunk();
        const offline = tab({ onLine: false });
        const noStorage = tab({ sessionStorage: { getItem() { throw new Error('storage is blocked'); } } });
        expect(() => reloadIntoCurrentBuild(error, offline)).toThrow(error);
        expect(() => reloadIntoCurrentBuild(error, noStorage)).toThrow(error);
        expect(offline.location.reload).not.toHaveBeenCalled();
        expect(noStorage.location.reload).not.toHaveBeenCalled();
    });
});
