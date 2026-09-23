// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/buddi/Buddi.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/buddi/buddi.css
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/buddi/buddi.css
// DAG Node:    none
// Intent:      Draw Buddi, the BuildAndDo block with a face, in one of five poses.
// ───────────────────────────────────────────────────────────────
//
// The outline and limbs use currentColor, so Buddi follows the text colour of
// wherever it sits (ink on paper, light on the dark stage). The face is always
// drawn in ink on the paper front. Every movement lives in buddi.css and is
// gated by the learning motion category.

import React from 'react';
import { BUDDI_POSES } from '@/lib/buddi';
import './buddi.css';

const INK = 'hsl(220 16% 12%)';
const PAPER = 'hsl(40 18% 97%)';
const CAP = 'hsl(0 70% 40%)';
const SIDE = 'hsl(38 60% 64%)';
const PLANK = 'hsl(38 58% 40%)';
const GREEN = 'hsl(128 26% 34%)';

const MOUTHS = {
    calm: 'M88 158 Q101 168 114 158',
    hello: 'M86 154 Q101 170 116 154',
    think: 'M91 162 L111 162',
    verified: 'M84 152 Q101 178 118 152 Z',
    build: 'M90 160 Q101 166 112 160',
};

/**
 * @param {{pose?: string, size?: number, label?: string, look?: 'center'|'up', arrive?: boolean, className?: string}} props
 * `label` makes Buddi an image with that name; without it Buddi is decorative.
 * @returns {React.ReactElement}
 */
export default function Buddi({ pose = 'calm', size = 96, label, look = 'center', arrive = false, className = '' }) {
    const current = BUDDI_POSES.includes(pose) ? pose : 'calm';
    const eyeY = current === 'think' ? 120 : 126;
    const eyeL = current === 'think' ? 84 : 81;
    const eyeR = eyeL + 40;
    const is = (name) => current === name;
    return (
        <span className={`buddi inline-block shrink-0 ${arrive ? 'buddi-arrive' : ''} ${className}`} data-pose={current}
            data-look={look === 'up' ? 'up' : 'center'} style={{ width: size, height: Math.round(size * 240 / 220) }}>
            <svg viewBox="0 0 220 240" width="100%" height="100%" role={label ? 'img' : undefined}
                aria-label={label || undefined} aria-hidden={label ? undefined : 'true'} focusable="false">
                <g stroke="currentColor" fill="none" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
                    <rect x="70" y="196" width="14" height="28" fill="currentColor" />
                    <rect x="116" y="196" width="14" height="28" fill="currentColor" />
                    {!is('think') && !is('build') && <g><path d="M44 136 L24 170" /><circle cx="22" cy="174" r="7" fill="currentColor" /></g>}
                    {(is('calm') || is('think')) && <g><path d="M176 128 L194 164" /><circle cx="196" cy="168" r="7" fill="currentColor" /></g>}
                    {is('hello') && <g className="buddi-wave">
                        <path d="M176 122 Q198 108 196 82" /><circle cx="196" cy="76" r="7" fill="currentColor" />
                        <path d="M207 64 L214 56" strokeWidth="3" /><path d="M209 80 L217 79" strokeWidth="3" />
                    </g>}
                    {is('think') && <path d="M44 150 Q24 186 56 184" />}
                    {is('verified') && <path d="M176 120 L192 98" />}
                    {is('build') && <g><path d="M44 112 L54 54" /><path d="M176 102 L166 54" /></g>}
                    <polygon points="160,80 178,62 178,182 160,200" fill={SIDE} />
                    <polygon points="40,80 58,62 178,62 160,80" fill={CAP} />
                    <rect x="40" y="80" width="120" height="120" fill={PAPER} />
                    <g stroke={INK} strokeWidth="3" strokeLinecap="butt">
                        <line x1="40" y1="100" x2="52" y2="100" /><line x1="40" y1="120" x2="47" y2="120" />
                        <line x1="40" y1="140" x2="52" y2="140" /><line x1="40" y1="160" x2="47" y2="160" />
                        <line x1="40" y1="180" x2="52" y2="180" />
                    </g>
                    <circle cx="68" cy="148" r="6" fill={CAP} stroke="none" opacity="0.3" />
                    <circle cx="134" cy="148" r="6" fill={CAP} stroke="none" opacity="0.3" />
                    <g className="buddi-eyes">
                        {is('verified') ? <g stroke={INK}><path d="M73 128 Q81 118 89 128" /><path d="M113 128 Q121 118 129 128" /></g>
                            : <g stroke="none">
                                <circle cx={eyeL} cy={eyeY} r="7" fill={INK} /><circle cx={eyeR} cy={eyeY} r="7" fill={INK} />
                                <circle cx={eyeL + 2} cy={eyeY - 3} r="2.2" fill={PAPER} /><circle cx={eyeR + 2} cy={eyeY - 3} r="2.2" fill={PAPER} />
                            </g>}
                    </g>
                    <path d={MOUTHS[current]} stroke={INK} fill={is('verified') ? INK : 'none'} />
                    {!is('build') && <g><line x1="150" y1="62" x2="150" y2="24" /><polygon points="150,24 176,32 150,40" fill={CAP} /></g>}
                    {is('think') && <g>
                        <circle cx="58" cy="183" r="7" fill="currentColor" />
                        <circle cx="192" cy="46" r="5" strokeWidth="3" /><circle cx="204" cy="24" r="8" strokeWidth="3" />
                    </g>}
                    {is('verified') && <g className="buddi-stamp">
                        <circle cx="196" cy="80" r="17" fill={GREEN} /><path d="M188 80 L194 86 L205 73" stroke={PAPER} />
                    </g>}
                    {is('build') && <g>
                        <rect x="36" y="18" width="148" height="34" fill={PLANK} />
                        <line x1="60" y1="35" x2="90" y2="35" stroke={INK} strokeWidth="2" opacity="0.45" />
                        <line x1="120" y1="29" x2="160" y2="29" stroke={INK} strokeWidth="2" opacity="0.45" />
                        <circle cx="54" cy="54" r="7" fill="currentColor" /><circle cx="166" cy="54" r="7" fill="currentColor" />
                    </g>}
                </g>
            </svg>
        </span>
    );
}
