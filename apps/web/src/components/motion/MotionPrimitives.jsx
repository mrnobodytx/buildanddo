// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/MotionPrimitives.jsx
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
// Intent:      Keep content usable while revealing, rearranging and emphasizing current records without retaining removed content.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useMotionCategory } from '@/contexts/MotionContext';
import { animateElement, continuityFrames, observeActivity, progressRatio } from '@/lib/motion/runtime';

/** Enter with visible HTML as the fallback and cancel on immediate navigation. */
export function MotionEntrance({ as: Tag = 'div', category = 'navigation', animationKey, className = '', children, ...props }) {
    const ref = useRef(null);
    const { enabled, motion } = useMotionCategory(category);
    const duration = motion.duration.panel;
    const distance = motion.distance;
    useLayoutEffect(() => animateElement(ref.current, [
        { opacity: 0.65, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'translateY(0)' },
    ], { duration, easing: motion.ease }, enabled), [animationKey, enabled, duration, distance, motion.ease]);
    return <Tag ref={ref} className={className} {...props}>{children}</Tag>;
}

/** Reveal once in view without making unobserved content inaccessible. */
export function MotionReveal({ as: Tag = 'div', delay = 0, className = '', children, ...props }) {
    const ref = useRef(null);
    const seen = useRef(false);
    const { enabled, motion } = useMotionCategory('editorial');
    useEffect(() => {
        if (!enabled || seen.current) return undefined;
        let cancel = () => {};
        const stop = observeActivity(ref.current, (active) => {
            if (!active || seen.current) return;
            seen.current = true;
            cancel = animateElement(ref.current, [
                { opacity: 0.45, transform: `translateY(${motion.distance}px)` },
                { opacity: 1, transform: 'translateY(0)' },
            ], { duration: motion.duration.reveal, delay: Math.max(0, Math.min(240, delay)), easing: motion.ease });
        }, window);
        return () => { cancel(); stop(); };
    }, [enabled, motion.distance, motion.duration.reveal, motion.ease, delay]);
    return <Tag ref={ref} className={className} {...props}>{children}</Tag>;
}

/** Animate only retained/new keyed children; removed records disappear immediately. */
export function MotionList({ as: Tag = 'div', itemsKey, category = 'layout', className = '', children, ...props }) {
    const ref = useRef(null);
    const previous = useRef(new Map());
    const { enabled, motion } = useMotionCategory(category);
    useLayoutEffect(() => {
        const current = new Map();
        const cancels = [];
        [...(ref.current?.children || [])].forEach((element, index) => {
            const key = element.getAttribute('data-motion-key');
            if (!key) return;
            const rect = element.getBoundingClientRect();
            const old = previous.current.get(key);
            current.set(key, { left: rect.left, top: rect.top });
            if (!enabled || !previous.current.size || !rect.width) return;
            if (old && old.left === rect.left && old.top === rect.top) return;
            const frames = old ? continuityFrames(old, rect, 160) : [{ opacity: 0.5 }, { opacity: 1 }];
            cancels.push(animateElement(element, frames, {
                duration: motion.duration.layout, easing: motion.ease,
                delay: old ? 0 : Math.min(index, 4) * motion.stagger,
            }));
        });
        previous.current = current;
        return () => cancels.forEach((cancel) => cancel());
    }, [itemsKey, enabled, motion.duration.layout, motion.ease, motion.stagger]);
    return <Tag ref={ref} className={className} {...props}>{children}</Tag>;
}

/** Emphasize a changed value without announcing invented intermediate numbers. */
export function useMotionChange(value, category = 'feedback') {
    const ref = useRef(null);
    const previous = useRef(value);
    const { enabled, motion } = useMotionCategory(category);
    useEffect(() => {
        const changed = previous.current !== value;
        previous.current = value;
        return animateElement(ref.current, [{ opacity: 0.45 }, { opacity: 1 }], {
            duration: motion.duration.panel, easing: motion.ease,
        }, enabled && changed);
    }, [value, enabled, motion.duration.panel, motion.ease]);
    return ref;
}

export function MotionValue({ as: Tag = 'span', value, category = 'data', children, ...props }) {
    const ref = useMotionChange(value, category);
    return <Tag ref={ref} {...props}>{children ?? value}</Tag>;
}

/** Render measured progress with immediate semantic values and a visual transition. */
export function MotionProgress({ value, max = 100, label, category = 'data', className = '' }) {
    const { enabled } = useMotionCategory(category);
    const ratio = progressRatio(value, max);
    return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max > 0 ? max : 100}
        aria-valuenow={ratio * (max > 0 ? max : 100)} className={`h-1.5 overflow-hidden bg-muted ${className}`}>
        <div className="h-full origin-left bg-primary" style={{
            transform: `scaleX(${ratio})`,
            transition: enabled ? 'transform var(--motion-layout) var(--motion-ease)' : 'none',
        }} />
    </div>;
}

/** Link card/detail geometry without capturing or copying either view's contents. */
export function SharedTitle({ as: Tag = 'h2', origin, children, ...props }) {
    const ref = useRef(null);
    const { enabled, motion } = useMotionCategory('layout');
    useLayoutEffect(() => animateElement(ref.current, continuityFrames(origin, ref.current?.getBoundingClientRect()), {
        duration: motion.duration.layout, easing: motion.ease,
    }, enabled && Boolean(origin)), [origin, enabled, motion.duration.layout, motion.ease]);
    return <Tag ref={ref} {...props}>{children}</Tag>;
}

/** Apply pointer depth to an illustration while preserving its wrapper's hit targets. */
export function PointerSurface({ children, className = '' }) {
    const ref = useRef(null);
    const frame = useRef(null);
    const { enabled } = useMotionCategory('pointer');
    const reset = useCallback(() => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        if (ref.current) {
            ref.current.style.transform = '';
            ref.current.style.removeProperty('--pointer-x');
            ref.current.style.removeProperty('--pointer-y');
        }
    }, []);
    useEffect(() => {
        if (!enabled) reset();
        return reset;
    }, [enabled, reset]);
    const move = (event) => {
        if (!enabled || event.pointerType === 'touch' || !ref.current) return;
        const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
        const x = width ? Math.min(1, Math.max(0, (event.clientX - left) / width)) : 0.5;
        const y = height ? Math.min(1, Math.max(0, (event.clientY - top) / height)) : 0.5;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            if (!ref.current) return;
            ref.current.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 5}deg) rotateY(${(x - 0.5) * 5}deg)`;
            ref.current.style.setProperty('--pointer-x', `${x * 100}%`);
            ref.current.style.setProperty('--pointer-y', `${y * 100}%`);
        });
    };
    return <div onPointerMove={move} onPointerLeave={reset} onBlur={reset} className={className}>
        <div ref={ref} className="motion-pointer-surface">{children}</div>
    </div>;
}
