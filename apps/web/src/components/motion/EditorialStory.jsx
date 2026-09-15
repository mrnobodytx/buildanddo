// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/EditorialStory.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/motion/StepSequence.jsx, apps/web/src/contexts/MotionContext.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/components/motion/StepSequence.jsx; DEPENDS_ON apps/web/src/contexts/MotionContext.jsx
// DAG Node:    none
// Intent:      Explain the product with a controllable editorial diagram and optional visible-only depth.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { useMotionActivity, useMotionCategory } from '@/contexts/MotionContext';
import { MotionReveal, PointerSurface } from './MotionPrimitives';
import StepSequence from './StepSequence';

export default function EditorialStory() {
    const ambient = useMotionActivity('ambient');
    const depth = useMotionCategory('pointer');
    const illustration = useRef(null);
    useEffect(() => {
        const node = illustration.current;
        if (!depth.enabled || !node) return undefined;
        let frame = null;
        const update = () => {
            frame = null;
            const top = node.getBoundingClientRect().top;
            const offset = Math.max(-10, Math.min(10, (top - window.innerHeight / 2) * -0.025));
            node.style.transform = `translateY(${offset}px)`;
        };
        const schedule = () => {
            if (!ambient.visible || frame !== null) return;
            frame = requestAnimationFrame(update);
        };
        window.addEventListener('scroll', schedule, { passive: true });
        schedule();
        return () => { window.removeEventListener('scroll', schedule); if (frame !== null) cancelAnimationFrame(frame); node.style.transform = ''; };
    }, [depth.enabled, ambient.visible]);
    return <section ref={ambient.ref} data-visible={ambient.active ? 'true' : 'false'}
        className="motion-ambient relative overflow-hidden border-y border-border" aria-labelledby="editorial-story-title">
        <div className="relative mx-auto grid max-w-6xl items-start gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_2fr]">
            <MotionReveal className="space-y-4 lg:sticky lg:top-24">
                <p className="font-evidence text-xs uppercase tracking-widest text-primary">How the pieces connect</p>
                <h2 id="editorial-story-title" className="motion-heading font-display text-3xl font-semibold">A visible path from question to learning.</h2>
                <hr className="motion-rule border-foreground" />
                <p className="text-sm leading-7 text-muted-foreground">Missions hold the plan. Workflows record steps. Evidence supports review. The field manual helps you build the skills to repeat the process.</p>
                <a className="motion-link inline-block py-2 text-sm font-semibold" href="/docs">Read the field guide</a>
            </MotionReveal>
            <div ref={illustration}><PointerSurface><StepSequence category="editorial" /></PointerSurface></div>
        </div>
    </section>;
}
