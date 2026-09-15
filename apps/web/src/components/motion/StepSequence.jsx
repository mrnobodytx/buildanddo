// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/StepSequence.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/contexts/MotionContext.jsx, apps/web/src/components/motion/MotionPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/contexts/MotionContext.jsx; DEPENDS_ON apps/web/src/components/motion/MotionPrimitives.jsx
// DAG Node:    none
// Intent:      Make illustrative learning and product diagrams controllable without advancing recorded work.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useId, useState } from 'react';
import { useMotionActivity } from '@/contexts/MotionContext';
import { MotionEntrance } from '@/components/motion/MotionPrimitives';

export const EDITORIAL_STEPS = [
    { title: 'Frame the question', body: 'Describe the problem and the outcome you want to measure.' },
    { title: 'Plan and approve', body: 'Set the scope, review the proposed steps and record approval.' },
    { title: 'Do the work', body: 'Carry out the approved steps and keep evidence of what happened.' },
    { title: 'Review the evidence', body: 'Compare the observations with the original test and record uncertainty.' },
    { title: 'Learn and repeat', body: 'Use the reviewed outcome to choose the next question.' },
];

export default function StepSequence({ steps = EDITORIAL_STEPS, title = 'From question to evidence', category = 'learning', compact = false }) {
    const uid = useId();
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const { ref, active, enabled, motion } = useMotionActivity(category);
    const safeIndex = Math.min(index, Math.max(0, steps.length - 1));
    useEffect(() => {
        if (!playing || !active || steps.length < 2) return undefined;
        const timer = window.setTimeout(() => {
            const next = Math.min(safeIndex + 1, steps.length - 1);
            setIndex(next);
            if (next === steps.length - 1) setPlaying(false);
        }, 3200);
        return () => window.clearTimeout(timer);
    }, [playing, active, steps.length, safeIndex]);
    if (!steps.length) return null;
    const select = (next) => { setPlaying(false); setIndex(next); };
    return <section ref={ref} aria-labelledby={uid} className={`motion-story relative overflow-hidden border border-border bg-card p-4 sm:p-6 ${compact ? '' : 'space-y-5'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 id={uid} className="font-display text-xl font-semibold">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">Illustrative walkthrough. It does not run or approve work.</p></div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="motion-small-button" aria-pressed={playing && active} disabled={!enabled || !motion.automatic}
                    onClick={() => { if (safeIndex === steps.length - 1) setIndex(0); setPlaying((current) => !current); }}>
                    {playing ? 'Pause walkthrough' : 'Play walkthrough'}
                </button>
                <button type="button" className="motion-small-button" onClick={() => select(0)}>Restart</button>
            </div>
        </div>
        {enabled && !motion.automatic && <p className="mt-3 text-xs text-muted-foreground">Automatic playback is paused by your motion settings. Use the step buttons to continue.</p>}
        <ol className="mt-4 grid gap-2 sm:grid-cols-5">
            {steps.map((step, stepIndex) => <li key={step.title}>
                <button type="button" aria-current={safeIndex === stepIndex ? 'step' : undefined}
                    aria-controls={`${uid}-detail`} onClick={() => select(stepIndex)}
                    className={`h-full w-full border px-3 py-3 text-left text-xs ${safeIndex === stepIndex ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <span className="mb-1 block font-evidence">{String(stepIndex + 1).padStart(2, '0')}</span>{step.title}
                </button>
            </li>)}
        </ol>
        <svg viewBox="0 0 400 12" aria-hidden="true" className="my-3 h-3 w-full text-primary">
            <path d="M 0 6 H 400" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.2" />
            <path d="M 0 6 H 400" pathLength="1" fill="none" stroke="currentColor" strokeWidth="2"
                strokeDasharray="1" strokeDashoffset={1 - (safeIndex + 1) / steps.length}
                style={{ transition: enabled ? 'stroke-dashoffset var(--motion-layout) var(--motion-ease)' : 'none' }} />
        </svg>
        <div id={`${uid}-detail`} aria-live={playing ? 'off' : 'polite'}>
            <MotionEntrance animationKey={safeIndex} category={category} className="min-h-20 space-y-2">
                <h4 className="font-semibold">{steps[safeIndex].title}</h4><p className="text-sm leading-7 text-muted-foreground">{steps[safeIndex].body}</p>
            </MotionEntrance>
        </div>
        <div className="mt-3 flex justify-between gap-3">
            <button type="button" className="motion-small-button" disabled={safeIndex === 0} onClick={() => select(safeIndex - 1)}>Previous step</button>
            <button type="button" className="motion-small-button" disabled={safeIndex === steps.length - 1} onClick={() => select(safeIndex + 1)}>Next step</button>
        </div>
    </section>;
}
