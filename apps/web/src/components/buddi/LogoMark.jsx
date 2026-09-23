// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/buddi/LogoMark.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     none
// EnumType:    Widget
// EnumEdges:   none
// DAG Node:    none
// Intent:      Draw the BuildAndDo block mark inline so it follows the theme's text colour.
// ───────────────────────────────────────────────────────────────

import React from 'react';

/**
 * Decorative: the surrounding link carries the name. Below 32px the ruler ticks
 * drop out and the outline thickens so the block still reads.
 * @param {{size?: number, className?: string}} props
 * @returns {React.ReactElement}
 */
export default function LogoMark({ size = 32, className = '' }) {
    const small = size < 32;
    return (
        <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
            <g stroke="currentColor" strokeWidth={small ? 4 : 3} strokeLinejoin="round">
                <polygon points="44,20 54,10 54,44 44,54" fill="hsl(38 60% 64%)" />
                <polygon points="10,20 20,10 54,10 44,20" fill="hsl(0 70% 40%)" />
                <rect x="10" y="20" width="34" height="34" fill="hsl(40 18% 97%)" />
                {!small && <g stroke="hsl(220 16% 12%)" strokeWidth="2">
                    <line x1="10" y1="28" x2="17" y2="28" /><line x1="10" y1="35" x2="14" y2="35" />
                    <line x1="10" y1="42" x2="17" y2="42" /><line x1="10" y1="49" x2="14" y2="49" />
                </g>}
            </g>
        </svg>
    );
}
