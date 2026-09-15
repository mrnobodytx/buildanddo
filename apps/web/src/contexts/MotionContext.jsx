// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/MotionContext.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/motion/preferences.js, apps/web/src/lib/motion/runtime.js
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/lib/motion/preferences.js; DEPENDS_ON apps/web/src/lib/motion/runtime.js
// DAG Node:    none
// Intent:      Apply accessible personal motion choices consistently across public pages and workspace portals.
// ───────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createMotionStore, normalizeMotionPreferences, readMotionEnvironment, resolveMotion } from '@/lib/motion/preferences';
import { observeActivity } from '@/lib/motion/runtime';

const staticPreferences = normalizeMotionPreferences({ version: 1, mode: 'off' });
const fallback = {
    preferences: staticPreferences, motion: resolveMotion(staticPreferences), environment: {},
    persisted: false, update: () => {}, reset: () => {},
};
const MotionContext = createContext(fallback);

/** Provide device-scoped preferences without reading or changing workspace data. */
export function MotionProvider({ children }) {
    const [store] = useState(() => createMotionStore(typeof window === 'undefined' ? undefined : window));
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const [environment, setEnvironment] = useState(() => readMotionEnvironment(typeof window === 'undefined' ? undefined : window));
    const motion = useMemo(() => resolveMotion(snapshot.preferences, environment), [snapshot.preferences, environment]);

    useEffect(() => {
        const queries = ['(prefers-reduced-motion: reduce)', '(pointer: coarse)', '(max-width: 639px)']
            .map((query) => window.matchMedia?.(query)).filter(Boolean);
        const update = () => setEnvironment(readMotionEnvironment(window));
        queries.forEach((query) => {
            if (query.addEventListener) query.addEventListener('change', update);
            else query.addListener?.(update);
        });
        document.addEventListener('visibilitychange', update);
        window.navigator.connection?.addEventListener?.('change', update);
        update();
        return () => {
            queries.forEach((query) => {
                if (query.removeEventListener) query.removeEventListener('change', update);
                else query.removeListener?.(update);
            });
            document.removeEventListener('visibilitychange', update);
            window.navigator.connection?.removeEventListener?.('change', update);
        };
    }, []);

    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.motion = motion.mode;
        root.dataset.motionAutomatic = motion.automatic ? 'on' : 'off';
        root.dataset.motionIntensity = snapshot.preferences.intensity;
        for (const [key, enabled] of Object.entries(motion.categories)) root.setAttribute(`data-motion-${key}`, enabled ? 'on' : 'off');
        for (const [key, value] of Object.entries(motion.duration)) root.style.setProperty(`--motion-${key}`, `${value}ms`);
        root.style.setProperty('--motion-distance', `${motion.distance}px`);
        root.style.setProperty('--motion-stagger', `${motion.stagger}ms`);
        root.style.setProperty('--motion-ease', motion.ease);
    }, [motion, snapshot.preferences.intensity]);

    useEffect(() => () => {
        const root = document.documentElement;
        root.dataset.motion = 'off';
        root.dataset.motionAutomatic = 'off';
    }, []);

    const update = useCallback((patch) => store.update(patch), [store]);
    const reset = useCallback(() => store.reset(), [store]);
    const value = useMemo(() => ({ ...snapshot, environment, motion, update, reset }), [snapshot, environment, motion, update, reset]);
    return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

/** Read the effective policy as well as the user's stored choices. */
export function useMotionPreferences() {
    return useContext(MotionContext);
}

/** Resolve an individual category for existing React and imperative effects. */
export function useMotionCategory(category) {
    const context = useMotionPreferences();
    return { ...context, enabled: context.motion.categories[category] === true, reduced: !context.motion.categories[category] };
}

/** Suspend automatic work until its element is visible and its policy permits it. */
export function useMotionActivity(category) {
    const policy = useMotionCategory(category);
    const [element, setElement] = useState(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (!element) return undefined;
        return observeActivity(element, setVisible, window);
    }, [element]);
    const ref = useCallback((node) => setElement(node), []);
    return { ...policy, ref, visible, active: visible && policy.enabled && policy.motion.automatic };
}
