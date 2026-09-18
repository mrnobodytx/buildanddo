// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/editorial/Engraving.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/index.css, apps/web/public/images/editorial/reference-engravings.png
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/index.css; CONSUMES apps/web/public/images/editorial/reference-engravings.png
// DAG Node:    none
// Intent:      Preserve the supplied newspaper illustration subjects and texture while adapting their ink to the current theme.
// ───────────────────────────────────────────────────────────────

import React, { useId } from 'react';

// Each padded tile retains one complete illustration from the owner's reference.
const SCENES = Object.freeze({
    wireless: [0, 0],
    flight: [144, 0],
    medicine: [288, 0],
    automobile: [432, 0],
    storefront: [0, 148],
    gears: [144, 148],
    ship: [288, 148],
    typewriter: [432, 148],
});

/** Render the reference artwork in theme ink; the enclosing figure names it.
 * @param {object} props Illustration variant.
 * @returns {React.ReactElement} A decorative, proportionally fitted engraving.
 */
export default function Engraving({ kind = 'typewriter' }) {
    const id = useId().replace(/:/g, '');
    const subject = Object.hasOwn(SCENES, kind) ? kind : 'typewriter';
    const [x, y] = SCENES[subject];
    return (
        <svg viewBox={`${x} ${y} 144 148`} preserveAspectRatio="xMidYMid meet"
            data-engraving={subject} aria-hidden="true" focusable="false">
            <defs>
                <mask id={`engraving-${id}`} maskUnits="userSpaceOnUse"
                    x="0" y="0" width="576" height="296">
                    <image href="/images/editorial/reference-engravings.png" width="576" height="296" />
                </mask>
            </defs>
            <rect x={x} y={y} width="144" height="148" fill="currentColor" mask={`url(#engraving-${id})`} />
        </svg>
    );
}
