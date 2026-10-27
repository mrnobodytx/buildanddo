// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/test/setup.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001, SRS-BUILDANDDO-DAY21-RUNNER-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/vitest.config.js
// EnumType:    Test
// EnumEdges:   CONSUMES apps/web/vitest.config.js;
//              VALIDATES apps/web/src
// Intent:      Give jsdom the browser APIs Radix primitives assume, and leave no
//              state behind between tests.
// ───────────────────────────────────────────────────────────────

import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// findBy*/waitFor give up after 1 s by default. On a loaded GitLab shell runner a render that
// takes 0.3 s locally can take several seconds: 13 files failed at 1 s (job 105160) and one still
// failed at 5 s (job 6369) while passing locally. Slower is not wrong; the 30 s test limit still
// fails anything that hangs.
configure({ asyncUtilTimeout: 15_000 });

/* jsdom gaps -------------------------------------------------------------- */
/* Each polyfill below exists because a Radix primitive the workspace pages   */
/* already use calls it. Without them the failure surfaces as an unrelated    */
/* TypeError inside node_modules, which tells a contributor nothing.          */

if (!window.matchMedia) {
    window.matchMedia = (query) => ({
        media: query,
        matches: false,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    });
}

if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

if (!window.IntersectionObserver) {
    window.IntersectionObserver = class IntersectionObserver {
        constructor() {
            this.root = null;
            this.rootMargin = '';
            this.thresholds = [];
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
            return [];
        }
    };
}

// Radix Select and Dialog probe pointer capture and scroll the active item
// into view; jsdom implements neither.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
}
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function hasPointerCapture() {
        return false;
    };
}
if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = function setPointerCapture() {};
}
if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = function releasePointerCapture() {};
}

// BlueprintSavedPage revokes its download link's object URL one second after the click. jsdom has no
// URL.revokeObjectURL, so whenever a loaded run keeps that test file alive past the second, the timer
// throws an unhandled TypeError and fails the whole run (measured 2026-09-23 on the base commit: every
// test passed, exit 1, 2 errors).
if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = function revokeObjectURL() {};
}

/* Per-test isolation ------------------------------------------------------ */

beforeEach(() => {
    // WorkspaceContext persists the active workspace id here; a leaked value
    // silently changes which workspace the next test believes is active.
    document.documentElement.classList.remove('light', 'dark');
    window.localStorage.clear();
    window.sessionStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});
