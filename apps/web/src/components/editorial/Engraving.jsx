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
// Depends:     apps/web/src/index.css, apps/web/public/images/editorial/reference-engravings.png, apps/web/public/images/editorial/reference-backgrounds.png
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/index.css; CONSUMES apps/web/public/images/editorial/reference-engravings.png; CONSUMES apps/web/public/images/editorial/reference-backgrounds.png
// DAG Node:    none
// Intent:      Bring the reference subjects to life inside fixed frames while retaining their original stills and theme ink.
// ───────────────────────────────────────────────────────────────

import React, { useId } from 'react';

// Coordinates are local to the existing padded reference tiles (144 by 148).
// A repaired paper layer sits behind the moving cutouts; reduced motion keeps the untouched reference.
const SCENES = Object.freeze({
    wireless: { tile: [0, 0], parts: [] },
    flight: { tile: [144, 0], parts: [
        { name: 'airframe', motion: 'airframe', origin: '74px 74px',
            path: 'M14 91 22 87 18 76Q17 69 23 71L34 80 68 65 35 44Q31 40 38 38L80 57 105 49 117 43 121 47 116 53 109 61 107 73 99 80 122 90Q126 95 116 96L93 89 87 85 80 93 73 94 71 89 34 96 31 103 25 102 23 96 14 96Z' },
    ] },
    medicine: { tile: [288, 0], parts: [] },
    automobile: { tile: [432, 0], parts: [] },
    storefront: { tile: [0, 148], parts: [
        { name: 'door', motion: 'door', origin: '88px 80px',
            path: 'M88 80 101 84 101 114 88 119Z' },
    ] },
    gears: { tile: [144, 148], parts: [
        { name: 'drive', motion: 'gear', origin: '50px 49px', period: '18s',
            path: 'M50 16 60 18 60 26Q62 30 67 28L71 26 78 31 73 40 76 44 81 45 81 54 73 56 72 61 72 68 66 73 61 69 59 69 58 78 50 79 48 70 43 70 40 79 33 77 32 68 28 66 23 68 20 61 28 55 28 50 20 47 20 38 29 38 31 33 29 25 36 21 41 29 46 29 49 25Z' },
        { name: 'driven', motion: 'gear-reverse', origin: '106px 60px', period: '14s',
            path: 'M99 31 109 30 109 37 113 39 119 35 125 39 123 46 126 48 130 48 131 55 128 58 129 64 133 65 133 73 126 74 125 78 129 85 121 88 115 84 112 86 112 90 104 91 100 84 96 82 91 83 85 77 88 71 86 68 79 67 77 60 84 56 84 51 78 48 82 43 91 44 94 40 95 33Z' },
        { name: 'idler', motion: 'gear-reverse', origin: '64px 104px', period: '15s',
            path: 'M57 80 65 80 68 87 71 88 80 83 86 89 84 97 89 100 91 99 91 108 84 111 84 114 87 116 82 122 75 119 70 122 69 129 60 131 59 123 54 121 48 123 42 116 45 109 40 106 36 106 36 99 44 96 46 92 45 87 51 81 58 85Z' },
    ] },
    ship: { tile: [288, 148], parts: [
        { name: 'hull', motion: 'hull', origin: '75px 108px',
            path: 'M11 16H131V116H11Z' },
        { name: 'water', motion: 'water', path: 'M8 116H136V140H8Z' },
    ] },
    typewriter: { tile: [432, 148], parts: [
        { name: 'carriage', motion: 'carriage',
            path: 'M14 15H134V65H14Z' },
    ] },
});

function SceneEffects({ subject }) {
    if (subject === 'wireless') return <>
        {[0, 1, 2].map((index) => <circle key={index} cx="73" cy="45" r="10"
            className="engraving__motion engraving__signal" style={{ '--part-delay': (-index * 1.2) + 's' }} />)}
        <path d="M38 94 42 89" className="engraving__motion engraving__needle" />
    </>;
    if (subject === 'flight') return <g className="engraving__motion engraving__airframe" style={{ transformOrigin: '74px 74px' }}>
        <g transform="translate(120 47) rotate(22)">
            <g className="engraving__motion engraving__propeller">
                <ellipse rx="2.5" ry="13" /><path d="M0-13V13M-2-8 2 8" />
            </g>
        </g>
    </g>;
    if (subject === 'medicine') return <>
        {[0, 1, 2].map((index) => <circle key={index} cx={35 + index * 6} cy="72" r={1 + index * .25}
            className="engraving__motion engraving__bubble" style={{ '--part-delay': (-index * 1.5) + 's' }} />)}
        <path d="M31 69q10 2 22-1" className="engraving__motion engraving__liquid" />
        <path d="M54 78v25" className="engraving__motion engraving__glass" />
    </>;
    if (subject === 'automobile') return <>
        {[[91, 122, .68, 1], [120, 121, .45, .82], [46, 107, .44, .6]].map(([x, y, sx, sy]) => (
            <g key={x} transform={'translate(' + x + ' ' + y + ') scale(' + sx + ' ' + sy + ')'}>
                <g className="engraving__motion engraving__wheel">
                    <path d="M0-5V5M-5 0H5M-3.5-3.5 3.5 3.5M-3.5 3.5 3.5-3.5" />
                </g>
            </g>
        ))}
        {[0, 1, 2].map((index) => <path key={index} d="M67 130q-6-3-11 0"
            className="engraving__motion engraving__exhaust" style={{ '--part-delay': (-index * 1.7) + 's' }} />)}
    </>;
    if (subject === 'storefront') return <>
        <path d="M27 71 40 70 40 112 27 113ZM47 70 59 69 59 109 47 111ZM65 68 77 67 77 107 65 109Z"
            className="engraving__motion engraving__windows" />
        <path d="M28 78 36 76M48 75 56 73M66 73 74 71" className="engraving__motion engraving__reflection" />
    </>;
    if (subject === 'ship') return <>
        {[0, 1, 2].map((index) => <path key={index} d="M82 54c-5-5 5-8 0-13-4-4-1-8 2-11"
            className="engraving__motion engraving__steam" style={{ '--part-delay': (-index * 2) + 's' }} />)}
        <path d="M24 118q8-3 16 0t16 0m15 8q7-3 15-1m16-6 15-2"
            className="engraving__motion engraving__wake" />
    </>;
    if (subject === 'typewriter') return <>
        <g className="engraving__motion engraving__carriage">
            {[0, 1, 2].map((index) => <path key={index} d={'M48 ' + (29 + index * 5) + 'h48'}
                className="engraving__motion engraving__type" style={{ '--part-delay': (-index * 2.1) + 's' }} />)}
        </g>
        <path d="M73 72 74 59" className="engraving__motion engraving__typebar" />
        {[[44, 99], [68, 108], [92, 101]].map(([x, y], index) => <ellipse key={x}
            cx={x} cy={y} rx="1.8" ry="1.1" className="engraving__motion engraving__key"
            style={{ '--part-delay': (-index * .55) + 's' }} />)}
    </>;
    return null;
}

/** Animate reference subjects inside a fixed picture and retain the original still.
 * @param {object} props Illustration variant.
 * @returns {React.ReactElement} A decorative, theme-aware looping scene.
 */
export default function Engraving({ kind = 'typewriter' }) {
    const id = 'engraving-' + useId().replace(/:/g, '');
    const subject = Object.hasOwn(SCENES, kind) ? kind : 'typewriter';
    const { tile: [x, y], parts } = SCENES[subject];
    const phase = [...id].reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) % 61, 0) / 10;
    const source = '#' + id + '-source';
    return (
        <svg viewBox="0 0 144 148" preserveAspectRatio="xMidYMid meet"
            className="engraving" data-engraving={subject} style={{ '--engraving-phase': (-phase) + 's' }}
            aria-hidden="true" focusable="false">
            <defs>
                <mask id={id + '-ink'} maskUnits="userSpaceOnUse" x="0" y="0" width="144" height="148">
                    <image href="/images/editorial/reference-engravings.png" x={-x} y={-y} width="576" height="296" />
                </mask>
                <g id={id + '-source'}>
                    <rect width="144" height="148" fill="currentColor" mask={'url(#' + id + '-ink)'} />
                </g>
                <clipPath id={id + '-frame'}><rect x="8" y="8" width="128" height="132" /></clipPath>
                <mask id={id + '-background'} maskUnits="userSpaceOnUse" x="0" y="0" width="144" height="148">
                    <image href="/images/editorial/reference-backgrounds.png" x={-x} y={-y} width="576" height="296" />
                </mask>
                {parts.map((part) => <clipPath key={part.name} id={id + '-' + part.name}>
                    <path d={part.path} />
                </clipPath>)}
            </defs>
            <use href={source} className="engraving__still" />
            <g className="engraving__animated" display="none" clipPath={'url(#' + id + '-frame)'}>
                <rect width="144" height="148" fill="currentColor" className="engraving__background" mask={'url(#' + id + '-background)'} />
                {parts.map((part) => <g key={part.name}
                    className={'engraving__motion engraving__' + part.motion}
                    style={{ transformOrigin: part.origin, '--part-duration': part.period }}>
                    {subject === 'gears' && <path d={part.path} fill="currentColor" opacity=".25" transform="translate(-1 2)" />}
                    <path d={part.path} fill="var(--engraving-paper)" />
                    <use href={source} clipPath={'url(#' + id + '-' + part.name + ')'} />
                </g>)}
                <g className="engraving__effects" fill="none" stroke="currentColor" strokeWidth=".9" strokeLinecap="round">
                    <SceneEffects subject={subject} />
                </g>
            </g>
        </svg>
    );
}
