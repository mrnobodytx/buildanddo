// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/test/setup.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
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
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

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

/* Per-test isolation ------------------------------------------------------ */

beforeEach(() => {
    // WorkspaceContext persists the active workspace id here; a leaked value
    // silently changes which workspace the next test believes is active.
    window.localStorage.clear();
    window.sessionStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});
