// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/brand/__tests__/Buddi.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/brand/Buddi.jsx, design/brand/Buddi.dc.html
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/brand/Buddi.jsx
// Intent:      Hold the mascot to the rules its own brand sheet sets, so a later edit cannot
//              quietly let it claim something was verified when it was not.
// ───────────────────────────────────────────────────────────────

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Buddi from '@/components/brand/Buddi';

const POSES = ['calm', 'hello', 'think', 'verified', 'build'];

describe('Buddi', () => {
    it('draws every pose the brand sheet defines, and names it for a screen reader', () => {
        for (const pose of POSES) {
            const { unmount } = render(<Buddi pose={pose} />);
            // The label is how a non-sighted reader learns which pose is on screen; a mascot that
            // renders five different things under one name tells them nothing.
            expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('Buddi'));
            unmount();
        }
    });

    it('gives each pose its own accessible name', () => {
        const names = POSES.map((pose) => {
            const { unmount } = render(<Buddi pose={pose} />);
            const label = screen.getByRole('img').getAttribute('aria-label');
            unmount();
            return label;
        });
        expect(new Set(names).size).toBe(POSES.length);
    });

    it('falls back to calm rather than rendering nothing for an unknown pose', () => {
        render(<Buddi pose="triumphant" />);
        expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('calm'));
    });

    it('shows the verified check ONLY in the verified pose', () => {
        // The sheet's don't list: never let Buddi say a thing is done before it has been measured.
        // The green check is that claim, so it must not appear in a pose that means "still working".
        const green = 'hsl(128, 26%, 34%)';
        for (const pose of POSES) {
            const { container, unmount } = render(<Buddi pose={pose} />);
            const shown = [...container.querySelectorAll('[fill]')].some(
                (node) => node.getAttribute('fill') === green
                    && node.closest('[display]')?.getAttribute('display') !== 'none',
            );
            expect(shown, `${pose} pose`).toBe(pose === 'verified');
            unmount();
        }
    });

    it('lowers the flag while building, and flies it otherwise', () => {
        // The flag is the goal on top; it comes down while Buddi is working on it.
        for (const pose of POSES) {
            const { container, unmount } = render(<Buddi pose={pose} />);
            const polygons = [...container.querySelectorAll('polygon')];
            const flag = polygons.find((node) => node.getAttribute('points') === '150,24 176,32 150,40');
            const visible = flag?.closest('[display]')?.getAttribute('display') !== 'none';
            expect(visible, `${pose} pose`).toBe(pose !== 'build');
            unmount();
        }
    });

    it('keeps the ruler on the front, because measuring is the point', () => {
        const { container } = render(<Buddi pose="calm" />);
        const ticks = [...container.querySelectorAll('line')].filter(
            (node) => node.getAttribute('x1') === '40',
        );
        expect(ticks).toHaveLength(5);
    });

    it('scales to the drawn proportion rather than a square', () => {
        const { container } = render(<Buddi pose="calm" size={110} />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('width', '110');
        expect(svg).toHaveAttribute('height', '120');
    });
});
