// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/brand/__tests__/BrandMark.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/brand/BrandMark.jsx, design/brand/Mark.dc.html
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/brand/BrandMark.jsx
// Intent:      Hold the mark to the size rule the brand sheet states, and keep the lockups above
//              the threshold where the ruler - the mark's whole idea - actually renders.
// ───────────────────────────────────────────────────────────────

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BrandMark from '@/components/brand/BrandMark';

const ticks = (container) => [...container.querySelectorAll('line')].length;
const outline = (container) => container.querySelector('g')?.getAttribute('stroke-width');

describe('BrandMark', () => {
    it('carries the ruler at 32px and above', () => {
        // The ruler is the mark's argument: measure before you celebrate. A lockup that renders it
        // as a bare block has dropped the idea, not just a detail.
        for (const size of [32, 48, 96]) {
            const { container, unmount } = render(<BrandMark size={size} />);
            expect(ticks(container), `${size}px`).toBe(4);
            unmount();
        }
    });

    it('drops the ruler and thickens the outline below 32px', () => {
        // Four hairlines inside a 16px square read as mud, so the small mark is a plain block.
        const { container } = render(<BrandMark size={16} />);
        expect(ticks(container)).toBe(0);
        expect(outline(container)).toBe('4');
    });

    it('keeps the thinner outline once the ruler is in', () => {
        const { container } = render(<BrandMark size={32} />);
        expect(outline(container)).toBe('3');
    });

    it('names itself unless it is decorative', () => {
        const { container: named } = render(<BrandMark size={32} />);
        expect(named.querySelector('svg')).toHaveAttribute('aria-label', 'BuildAndDo');
        const { container: quiet } = render(<BrandMark size={32} decorative />);
        expect(quiet.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(quiet.querySelector('svg')).not.toHaveAttribute('aria-label');
    });

    it('is square', () => {
        const { container } = render(<BrandMark size={48} />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('width', '48');
        expect(svg).toHaveAttribute('height', '48');
    });
});
