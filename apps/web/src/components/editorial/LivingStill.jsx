// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/editorial/LivingStill.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/contexts/MotionContext.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/contexts/MotionContext.jsx
// DAG Node:    none
// Intent:      Keep picture motion inside a fixed frame and suspend every layer when the reader or motion policy requires it.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { useMotionActivity } from '@/contexts/MotionContext';
import './editorial.css';

const MOTIONS = new Set(['scene', 'push', 'pull', 'left', 'right', 'rise']);

/** Frame an animated scene or pan a photograph under the shared media policy.
 * @param {object} props Image or artwork, accessible description and motion choices.
 * @returns {React.ReactElement} A stationary figure around slowly moving content.
 */
export default function LivingStill({ src, alt = '', motion = 'push', duration = 16, paused = false, className = '', children }) {
    const activity = useMotionActivity('media');
    const seconds = Number.isFinite(duration) ? Math.min(40, Math.max(10, duration)) : 16;
    const moving = activity.active && !paused;
    return (
        <figure ref={activity.ref} className={`living-still ${className}`}
            data-moving={moving ? 'on' : 'off'} data-motion-enabled={activity.enabled ? 'on' : 'off'}
            style={{ '--living-duration': `${seconds}s` }}
            role={!src && alt ? 'img' : undefined} aria-label={!src && alt ? alt : undefined}
            aria-hidden={!src && !alt ? true : undefined}>
            <div className={`living-still__image living-still--${MOTIONS.has(motion) ? motion : 'push'}`}>
                {src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : children}
            </div>
            <span className="living-still__grain" aria-hidden="true" />
        </figure>
    );
}
