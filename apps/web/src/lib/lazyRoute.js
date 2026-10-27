// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/lazyRoute.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-17
// Depends:     none
// EnumType:    Service
// EnumEdges:   EXTENDS React.lazy; TRIGGERS window.location.reload
// DAG Node:    none
// Intent:      Let a visitor still running a previous deployment's bundle reach the current build when a
//              route chunk it names has been removed, instead of a page that cannot load.
// ───────────────────────────────────────────────────────────────

import { lazy } from 'react';

// A deploy replaces the hashed files under /assets/, so a tab opened before it still asks for route chunks
// that no longer exist ("Unable to preload CSS for /assets/HomePage-<old hash>.css", or a failed dynamic
// import). React.lazy keeps that rejection for the life of the page: only a reload fetches the current
// index.html and the chunks it names.
const RELOAD_KEY = 'buildanddo.stale-build-reload';

// A failure this soon after a recovery reload means the reload reached no newer build - a cached document,
// or a deploy that really lacks the file - and reloading again would loop. The error is left to the page's
// boundary instead. A tab that lives through a later deploy recovers again once the window has passed.
const RELOAD_WINDOW_MS = 60_000;

// A reload normally replaces this document well within ten seconds. If it has not, the reload was blocked or
// stalled, and the original failure is shown rather than a page that keeps loading.
const RELOAD_GRACE_MS = 10_000;

const reloading = new WeakSet();

function claimReload(browser) {
    // Offline, the connection failed rather than the build; a reload would only show the browser's error page.
    if (browser.navigator?.onLine === false) return false;
    try {
        const now = Date.now();
        if (now - Number(browser.sessionStorage.getItem(RELOAD_KEY)) < RELOAD_WINDOW_MS) return false;
        browser.sessionStorage.setItem(RELOAD_KEY, String(now));
        return true;
    } catch {
        return false; // Without session storage nothing could stop a reload loop.
    }
}

/**
 * Reloads into the current build after a route chunk failed to load, at most once per window per tab.
 *
 * @param {unknown} error Rejection from the route's dynamic import.
 * @param {Window} [browser] Window to reload; injectable for tests.
 * @returns {Promise<never>} Keeps the route in its loading state while the reload replaces this document;
 *   rejects with the original error only if that has not happened within the grace period.
 * @throws {unknown} The original error when a reload cannot help.
 */
export function reloadIntoCurrentBuild(error, browser = globalThis) {
    if (!reloading.has(browser)) {
        if (!claimReload(browser)) throw error;
        browser.location.reload();
        reloading.add(browser);
    }
    return new Promise((resolve, reject) => { setTimeout(reject, RELOAD_GRACE_MS, error); });
}

/**
 * React.lazy for a route component whose chunk a newer deployment may have removed.
 *
 * @param {() => Promise<{default: React.ComponentType}>} load The route's dynamic import.
 * @param {Window} [browser] Window to reload on failure; injectable for tests.
 * @returns {React.LazyExoticComponent<React.ComponentType>} Lazy route component.
 */
export function lazyRoute(load, browser = globalThis) {
    return lazy(() => load().catch((error) => reloadIntoCurrentBuild(error, browser)));
}
