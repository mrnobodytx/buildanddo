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
// Depends:     apps/web/src/index.css
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/index.css
// DAG Node:    none
// Intent:      Illustrate research and platform areas with original ink drawings that adapt to the existing paper and dark themes.
// ───────────────────────────────────────────────────────────────

import React, { useId } from 'react';

function Gear({ x, y, radius, hatch }) {
    const teeth = Array.from({ length: 64 }, (_, index) => {
        const angle = index * Math.PI / 32;
        const r = radius * (index % 4 < 2 ? 1 : .85);
        return [Math.cos(angle) * r, Math.sin(angle) * r].join(',');
    }).join(' ');
    return (
        <g transform={`translate(${x} ${y})`}>
            <polygon points={teeth} fill={hatch} strokeWidth="1.8" />
            <circle r={radius * .62} fill="var(--engraving-paper)" strokeWidth="1.5" />
            <circle r={radius * .52} fill={hatch} />
            {Array.from({ length: 6 }, (_, index) => (
                <path key={index} d={`M0 -${radius * .27}V-${radius * .51}`}
                    transform={`rotate(${index * 60})`} strokeWidth="5" />
            ))}
            <circle r={radius * .26} fill="var(--engraving-paper)" strokeWidth="2" />
            <circle r={radius * .13} fill={hatch} />
        </g>
    );
}

/** Draw a decorative engraving; the enclosing figure supplies its accessible name.
 * @param {object} props Illustration variant.
 * @returns {React.ReactElement} Theme-aware line artwork.
 */
export default function Engraving({ kind = 'library' }) {
    const id = useId().replace(/:/g, '');
    const hatch = `url(#engraving-${id})`;
    let scene;
    if (kind === 'workshop') {
        scene = <>
            <path d="M30 36h205v154H30zM37 42h191v141H37z" fill={hatch} />
            <path d="M45 163h174M45 170h174M50 47v130M214 47v130" />
            <Gear x={116} y={95} radius={53} hatch={hatch} />
            <Gear x={183} y={148} radius={37} hatch={hatch} />
            <Gear x={67} y={157} radius={25} hatch={hatch} />
            <path d="M14 190h250M26 196h229M51 204h177" opacity=".5" />
            <circle cx="47" cy="53" r="3" /><circle cx="218" cy="54" r="3" />
        </>;
    } else if (kind === 'observatory') {
        scene = <>
            <path d="M12 176c26-10 39-2 57-8 22-7 35-4 63 2 40-10 68-8 132 9M9 193h260M27 202h219" opacity=".6" />
            {Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${12 + i * 22} 188l16 -8`} opacity=".4" />)}
            <path d="M121 107l-33 91h10l34-83 38 84h11l-46-94z" fill={hatch} />
            <path d="M105 157h61M100 166h71M132 106v85" />
            <g transform="rotate(-27 137 86)">
                <path d="M59 71h141v30H59z" fill={hatch} strokeWidth="1.5" />
                <path d="M55 68h12v37H55zM185 62h25v46h-25z" fill="var(--engraving-paper)" strokeWidth="2" />
                <ellipse cx="207" cy="85" rx="7" ry="23" fill={hatch} />
                <ellipse cx="207" cy="85" rx="4" ry="18" fill="var(--engraving-paper)" />
                <path d="M59 75h122M72 96h111M75 81h104" opacity=".65" />
                <path d="M31 80h24v12H31zM28 76v20" fill={hatch} />
            </g>
            <circle cx="136" cy="110" r="11" fill={hatch} /><circle cx="136" cy="110" r="5" />
            <path d="M225 22a20 20 0 1 0 21 24 18 18 0 0 1-21-24z" fill={hatch} />
            <path d="M36 29v10m-5-5h10M102 24v6m-3-3h6M237 122v10m-5-5h10M61 136v6m-3-3h6" />
            <circle cx="161" cy="27" r="1.5" /><circle cx="39" cy="104" r="1.5" /><circle cx="239" cy="83" r="1.5" />
        </>;
    } else if (kind === 'globe') {
        scene = <>
            <path d="M104 188h83l14 12H88zM134 158v30h25v-35" fill={hatch} />
            <g transform="rotate(-18 140 98)">
                <ellipse cx="140" cy="99" rx="80" ry="78" strokeWidth="3" />
                <circle cx="140" cy="99" r="65" fill={hatch} />
                <ellipse cx="140" cy="99" rx="22" ry="65" />
                <ellipse cx="140" cy="99" rx="47" ry="65" />
                <path d="M140 34v130M75 99h130M82 72c30 11 86 11 116 0M82 126c30-11 86-11 116 0M103 46c23 7 51 7 74 0M103 152c23-7 51-7 74 0" />
                <path d="m111 44 9 16-7 12-18-2-9 17 17 12 13-7 12 13-4 14 16 26 12-12-5-14 9-14-9-11-20-9 8-16-5-19zM168 63l20 6 8 26-9 12-11-18-14 1-7-16z"
                    fill="var(--engraving-paper)" strokeWidth="1.2" />
                <path d="M140 14v13m0 145v14" strokeWidth="4" />
            </g>
            <path d="M65 205h148M45 210h190" opacity=".6" />
        </>;
    } else if (kind === 'ledger') {
        scene = <>
            <path d="M36 44l158-15 23 161-158 17z" fill={hatch} strokeWidth="2" />
            <path d="m48 48 140-13 20 147-140 15z" fill="var(--engraving-paper)" />
            <path d="m77 46 19 145m70-154 19 144M50 71l140-13" />
            {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${54 + i * 1.35} ${84 + i * 10}l139 -13`} opacity=".65" />)}
            {Array.from({ length: 6 }, (_, i) => <path key={i} d={`m${99 + i * 2.6} ${87 + i * 15} 35 -3m14-1 12-1`} opacity=".65" strokeWidth="2" />)}
            <path d="M205 164c3-45 13-64 41-100 7-9 15-26 14-43-38 11-61 33-59 70-14 27-13 46-12 56z"
                fill={hatch} strokeWidth="1.5" />
            <path d="M189 181c8-49 22-94 60-145M212 108l20-11m-10-13 17-9m-9-12 12-6M204 126l18-11" />
            <path d="m183 179 6-7 5 8-5 14zM217 176h31l5 27h-41zM221 169h22v7h-22z" fill={hatch} />
        </>;
    } else {
        scene = <>
            <path d="M22 71c44-21 80-18 117 1 38-19 75-22 117-1l-8 114c-36-14-69-12-109 5-39-17-73-19-110-5z"
                fill={hatch} strokeWidth="2" />
            <path d="M32 61c40-19 72-15 107 7 36-22 69-26 107-7l-8 111c-33-13-62-10-99 7-36-17-67-20-98-7z"
                fill="var(--engraving-paper)" strokeWidth="1.5" />
            <path d="M139 68v111M143 72v103M135 72v103" />
            {Array.from({ length: 13 }, (_, i) => <g key={i} opacity={i % 4 === 0 ? '.9' : '.6'}>
                <path d={`M${45 + i * .45} ${77 + i * 6.5}q36 -9 79 9`} />
                <path d={`M153 ${86 + i * 6.5}q34 -18 ${78 - i * .45} -10`} />
            </g>)}
            <path d="M73 44V27h105v15M82 38V19h104v26M92 18v-7h104v34M114 25v14m45-14v14M201 41l32 11" fill={hatch} />
            <path d="M31 193c34-9 68-6 108 10 40-17 75-19 108-10M70 207h141" opacity=".5" />
            <path d="m142 179 9 26 12-7 11 1-15-27" fill={hatch} />
        </>;
    }
    return (
        <svg viewBox="0 0 280 220" fill="none" stroke="currentColor" strokeWidth="1"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <defs>
                <pattern id={`engraving-${id}`} width="5" height="5" patternUnits="userSpaceOnUse">
                    <path d="M-1 1 1-1M0 5 5 0M4 6 6 4" stroke="currentColor" strokeWidth=".55" opacity=".7" />
                </pattern>
            </defs>
            {scene}
        </svg>
    );
}
