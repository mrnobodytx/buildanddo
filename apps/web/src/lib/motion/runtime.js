// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/motion/runtime.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/motion/preferences.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/web/src/lib/motion/preferences.js
// DAG Node:    none
// Intent:      Cancel interrupted effects and suspend visual work when it cannot be seen.
// ───────────────────────────────────────────────────────────────

const running = new WeakMap();

/** Animate one current element; cancellation never restores obsolete content. */
export function animateElement(element, keyframes, options, enabled = true) {
    running.get(element)?.cancel();
    running.delete(element);
    if (!enabled || !element?.animate || !options?.duration) return () => {};
    let animation;
    try {
        animation = element.animate(keyframes, { ...options, fill: 'none' });
    } catch { return () => {}; }
    running.set(element, animation);
    const clear = () => {
        if (running.get(element) === animation) running.delete(element);
    };
    animation.onfinish = clear;
    animation.oncancel = clear;
    return () => { animation.cancel(); clear(); };
}

/** Observe visibility with a static-compatible fallback and symmetric cleanup. */
export function observeActivity(element, callback, browser = globalThis) {
    let intersecting = !browser.IntersectionObserver;
    let disposed = false;
    const notify = () => {
        if (!disposed) callback(intersecting && browser.document?.hidden !== true);
    };
    let observer;
    if (browser.IntersectionObserver && element) {
        observer = new browser.IntersectionObserver((entries) => {
            intersecting = entries.some((entry) => entry.isIntersecting);
            notify();
        }, { threshold: 0.05 });
        observer.observe(element);
    }
    browser.document?.addEventListener?.('visibilitychange', notify);
    notify();
    return () => {
        disposed = true;
        observer?.disconnect();
        browser.document?.removeEventListener?.('visibilitychange', notify);
    };
}

/** Drive a loop with zero scheduled frames while paused or out of view. */
export function createFrameLoop(draw, browser = globalThis) {
    let frame = null;
    let active = false;
    let disposed = false;
    const tick = (time) => {
        frame = null;
        if (!active || disposed) return;
        draw(time);
        if (active && !disposed) frame = browser.requestAnimationFrame(tick);
    };
    return {
        setActive(value) {
            if (disposed) return;
            active = Boolean(value);
            if (active && frame === null && browser.requestAnimationFrame) frame = browser.requestAnimationFrame(tick);
            if (!active && frame !== null) {
                browser.cancelAnimationFrame(frame);
                frame = null;
            }
        },
        dispose() {
            this.setActive(false);
            disposed = true;
        },
    };
}

/** Bound reading/progress geometry without inventing missing measurements. */
export function progressRatio(value, total) {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
    return Math.min(1, Math.max(0, value / total));
}

/** Move a local demonstration item while retaining stable item identities. */
export function reorderItems(items, id, destination) {
    const from = items.findIndex((item) => item.id === id);
    if (from < 0 || !Number.isInteger(destination)) return items;
    const to = Math.max(0, Math.min(items.length - 1, destination));
    if (from === to) return items;
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
}

/** Derive bounded continuity from geometry, never from a copy of private DOM. */
export function continuityFrames(origin, target, limit = 80) {
    if (!origin || !target) return [{ opacity: 1 }, { opacity: 1 }];
    const clamp = (value) => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;
    return [{ transform: `translate(${clamp(origin.left - target.left)}px, ${clamp(origin.top - target.top)}px)`, opacity: 0.7 },
        { transform: 'translate(0px, 0px)', opacity: 1 }];
}
