// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/test/__tests__/scriptsCarrying.test.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/test/utils.jsx
// Intent:      Prove the inertness assertion can still fail, so the four suites that rely on it
//              are not quietly asserting nothing.
// ───────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it } from 'vitest';

import { scriptsCarrying } from '@/test/utils';

/**
 * scriptsCarrying is the assertion four suites use to prove stored text stayed inert. A helper
 * like that fails in one direction silently: if it stops matching, every caller turns green and
 * nobody learns that the check died. The positive cases below are the point of this file - the
 * empty case alone would pass just as happily against `() => []`.
 */
describe('scriptsCarrying', () => {
    afterEach(() => {
        document.querySelectorAll('script').forEach((node) => node.remove());
    });

    it('finds a payload that became an inline script', () => {
        const node = document.createElement('script');
        node.textContent = 'globalThis.pwned = true; // untrusted text';
        document.body.append(node);
        expect(scriptsCarrying('untrusted text')).toHaveLength(1);
    });

    it('finds a payload that became a remote script, which carries no text at all', () => {
        const node = document.createElement('script');
        node.setAttribute('src', 'https://evil.example/untrusted-source.js');
        document.body.append(node);
        expect(scriptsCarrying('untrusted-source')).toHaveLength(1);
    });

    it('ignores the harness script that made the blunt assertion unusable', () => {
        // next-themes' ThemeProvider injects exactly this to set the theme before first paint.
        const node = document.createElement('script');
        node.setAttribute('nonce', '');
        node.textContent = '!function(){try{var d=document.documentElement}catch(e){}}()';
        document.body.append(node);
        expect(document.querySelectorAll('script')).toHaveLength(1);
        expect(scriptsCarrying('untrusted text')).toEqual([]);
    });
});
