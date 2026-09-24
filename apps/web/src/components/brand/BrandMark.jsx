// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/brand/BrandMark.jsx
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     design/brand/Mark.dc.html
// EnumType:    Component
// EnumEdges:   IMPLEMENTS design/brand/Mark.dc.html
// Intent:      The BuildAndDo mark, so the header stops using a stock icon as the logo.
// ───────────────────────────────────────────────────────────────

/**
 * The BuildAndDo mark. Ported from design/brand/Mark.dc.html.
 *
 * WHAT IT IS, from the brand sheet: a building block. Paper to write on, a red cap for the one
 * thing to do next, an ochre side for work still in progress, and a ruler to measure it by. Set
 * square, never rounded.
 *
 * TWO THINGS THE CANVAS COMPUTES AND THIS KEEPS. The outline thickens below 32px, and the ruler
 * ticks drop out, because four hairlines inside a 16px square read as mud. That is what makes the
 * same mark work as a favicon and as a 96px lockup.
 *
 * The fills are brand constants: the block looks the same on paper and on ink. Only the outline
 * follows the surface, through `currentColor` - what the canvas switched by hand with `dark`.
 */
const INK = 'hsl(220, 16%, 12%)';
const PAPER_FRONT = 'hsl(40, 18%, 97%)';
const CAP = 'hsl(0, 70%, 40%)';
const SIDE = 'hsl(38, 60%, 64%)';

/**
 * @param {{size?: number, className?: string, decorative?: boolean, title?: string}} props
 */
export default function BrandMark({ size = 32, className = '', decorative = false, title }) {
    const weight = size < 32 ? 4 : 3;
    const ticks = size >= 32;
    const label = title || 'BuildAndDo';

    return (
        <svg
            viewBox="0 0 64 64"
            width={size}
            height={size}
            {...(decorative ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': label })}
            focusable="false"
            className={className}
        >
            <g stroke="currentColor" strokeWidth={weight} strokeLinejoin="round">
                <polygon points="44,20 54,10 54,44 44,54" fill={SIDE} />
                <polygon points="10,20 20,10 54,10 44,20" fill={CAP} />
                <rect x="10" y="20" width="34" height="34" fill={PAPER_FRONT} />
                {ticks && (
                    <g stroke={INK} strokeWidth="2">
                        <line x1="10" y1="28" x2="17" y2="28" />
                        <line x1="10" y1="35" x2="14" y2="35" />
                        <line x1="10" y1="42" x2="17" y2="42" />
                        <line x1="10" y1="49" x2="14" y2="49" />
                    </g>
                )}
            </g>
        </svg>
    );
}
