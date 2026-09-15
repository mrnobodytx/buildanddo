// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/ReadingProgress.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/contexts/MotionContext.jsx, apps/web/src/lib/motion/runtime.js
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/contexts/MotionContext.jsx; DEPENDS_ON apps/web/src/lib/motion/runtime.js
// DAG Node:    none
// Intent:      Keep readers oriented in long pages and lesson dialogs with event-driven scroll feedback.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { useMotionCategory } from '@/contexts/MotionContext';
import { progressRatio } from '@/lib/motion/runtime';

export default function ReadingProgress({ targetRef, label = 'Reading position', className = '' }) {
    const marker = useRef(null);
    const [ratio, setRatio] = useState(0);
    const { enabled } = useMotionCategory('reading');
    useEffect(() => {
        const target = targetRef?.current;
        const scroller = marker.current?.closest('[data-reading-scroll]') || window;
        let frame = null;
        const measure = () => {
            frame = null;
            if (target) {
                const bounds = target.getBoundingClientRect();
                const top = scroller === window ? 0 : scroller.getBoundingClientRect().top;
                const height = scroller === window ? window.innerHeight : scroller.clientHeight;
                setRatio(bounds.height <= height ? 1 : progressRatio(top - bounds.top, bounds.height - height));
            } else {
                const height = document.documentElement.scrollHeight - window.innerHeight;
                setRatio(height <= 0 ? 1 : progressRatio(window.scrollY, height));
            }
        };
        const schedule = () => { if (frame === null) frame = requestAnimationFrame(measure); };
        scroller.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        const observer = window.ResizeObserver ? new window.ResizeObserver(schedule) : null;
        observer?.observe(target || document.documentElement);
        measure();
        return () => {
            scroller.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            observer?.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [targetRef]);
    const back = () => {
        const target = targetRef?.current;
        if (target?.scrollIntoView) target.scrollIntoView({ behavior: enabled ? 'smooth' : 'auto', block: 'start' });
        else window.scrollTo({ top: 0, behavior: enabled ? 'smooth' : 'auto' });
        const heading = target?.querySelector('h1, h2, h3');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    };
    return <div ref={marker} className={`motion-reading flex items-center gap-3 border-b border-border bg-background py-2 text-xs ${className}`}>
        <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}
            className="h-1 min-w-12 flex-1 overflow-hidden bg-muted">
            <div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${ratio})`, transition: enabled ? 'transform var(--motion-micro) linear' : 'none' }} />
        </div>
        <span aria-hidden="true" className="w-8 text-right tabular-nums">{Math.round(ratio * 100)}%</span>
        <button type="button" onClick={back} className="min-h-9 shrink-0 px-2 underline underline-offset-4">Back to start</button>
    </div>;
}
