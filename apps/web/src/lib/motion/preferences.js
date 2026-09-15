// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/motion/preferences.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     none
// EnumType:    Service
// EnumEdges:   EXTENDS .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
// DAG Node:    none
// Intent:      Keep personal motion choices bounded, persistent and subordinate to device accessibility preferences.
// ───────────────────────────────────────────────────────────────

export const MOTION_STORAGE_KEY = 'buildanddo.motion.v1';

export const MOTION_CATEGORIES = Object.freeze({
    controls: { label: 'Controls & focus', group: 'Interface', usage: 'Buttons, links, switches and form fields.' },
    navigation: { label: 'Navigation & overlays', group: 'Interface', usage: 'Routes, sidebars, menus, dialogs and tabs.' },
    layout: { label: 'Lists & layout', group: 'Interface', usage: 'Tutorial filters, ERP lists, wiki and forum records.' },
    feedback: { label: 'Status & recovery', group: 'Work & data', usage: 'Loading, confirmed saves, errors, retries and notifications.' },
    data: { label: 'Numbers & diagrams', group: 'Work & data', usage: 'Metrics, saved progress, workflow stages and relationship diagrams.' },
    community: { label: 'Publishing & administration', group: 'Work & data', usage: 'Content previews, moderation, role changes and integration requests.' },
    reading: { label: 'Reading orientation', group: 'Reading & learning', usage: 'Reading progress, article sections and back-to-top controls.' },
    learning: { label: 'Lessons & milestones', group: 'Reading & learning', usage: 'Worked examples, onboarding and saved learning milestones.' },
    editorial: { label: 'Editorial entrances', group: 'Public storytelling', usage: 'Headlines, section reveals, newspaper rules and image reveals.' },
    theme: { label: 'Theme changes', group: 'Appearance & media', usage: 'Short surface and color transitions when changing theme.' },
    media: { label: 'Images & media', group: 'Appearance & media', usage: 'Gallery, comparison, video controls and transcript previews.' },
    ambient: { label: 'Ambient decoration', group: 'Optional effects', usage: 'Public background textures and automatic illustrative sequences.', optional: true },
    pointer: { label: 'Pointer & depth', group: 'Optional effects', usage: 'Public illustration tilt, spotlight and shallow parallax.', optional: true },
    spatial: { label: '3D capability mesh', group: 'Optional effects', usage: 'Interactive platform illustration on suitable desktop devices.', optional: true },
});

export const MOTION_TOKENS = Object.freeze({
    micro: 120, control: 160, panel: 220, layout: 260, route: 240, reveal: 440, milestone: 520,
    ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
    curve: Object.freeze([0.22, 1, 0.36, 1]),
    spring: Object.freeze({ type: 'spring', stiffness: 440, damping: 36, mass: 0.7 }),
});

/** Normalize an untrusted device preference without retaining unknown fields. */
export function normalizeMotionPreferences(input) {
    const source = input && typeof input === 'object' && input.version === 1 ? input : {};
    const pick = (key, choices, fallback) => choices.includes(source[key]) ? source[key] : fallback;
    return {
        version: 1,
        mode: pick('mode', ['system', 'full', 'reduced', 'off'], 'system'),
        pace: pick('pace', ['quick', 'standard', 'relaxed'], 'standard'),
        intensity: pick('intensity', ['subtle', 'expressive'], 'subtle'),
        paused: source.paused === true,
        categories: Object.fromEntries(Object.entries(MOTION_CATEGORIES).map(([key, entry]) => [
            key, typeof source.categories?.[key] === 'boolean' ? source.categories[key] : !entry.optional,
        ])),
    };
}

/** Resolve effective motion; an explicit mode never overrides reduced motion. */
export function resolveMotion(preferences, environment = {}) {
    const chosen = normalizeMotionPreferences(preferences);
    const mode = chosen.mode === 'off' ? 'off'
        : environment.reduced || chosen.mode === 'reduced' ? 'reduced' : 'full';
    const scale = { quick: 0.75, standard: 1, relaxed: 1.3 }[chosen.pace];
    const constrained = environment.saveData || environment.coarse;
    const categories = Object.fromEntries(Object.keys(MOTION_CATEGORIES).map((key) => [
        key, mode === 'full' && chosen.categories[key]
            && !(chosen.paused && ['ambient', 'pointer', 'spatial'].includes(key))
            && !(constrained && ['pointer', 'spatial', 'ambient'].includes(key)),
    ]));
    return {
        mode, categories,
        distance: chosen.intensity === 'expressive' && !constrained ? 20 : 8,
        stagger: Math.round(35 * scale),
        duration: Object.fromEntries(Object.entries(MOTION_TOKENS).filter(([, value]) => typeof value === 'number')
            .map(([key, value]) => [key, mode === 'full' ? Math.round(value * scale) : 0])),
        ease: MOTION_TOKENS.ease,
        curve: MOTION_TOKENS.curve,
        spring: MOTION_TOKENS.spring,
        automatic: mode === 'full' && !chosen.paused && !environment.hidden && !environment.saveData,
        constrained: Boolean(constrained),
    };
}

/** Read accessibility and activity flags without requiring browser-only APIs. */
export function readMotionEnvironment(browser) {
    const matches = (query) => Boolean(browser?.matchMedia?.(query).matches);
    return {
        reduced: matches('(prefers-reduced-motion: reduce)'),
        coarse: matches('(pointer: coarse)') || matches('(max-width: 639px)'),
        hidden: browser?.document?.hidden === true,
        saveData: browser?.navigator?.connection?.saveData === true,
    };
}

/** Create a subscribable preference store with recoverable storage failure. */
export function createMotionStore(browser) {
    const read = () => {
        try {
            const raw = browser?.localStorage?.getItem(MOTION_STORAGE_KEY);
            if (raw) return normalizeMotionPreferences(JSON.parse(raw));
            const learning = browser?.localStorage?.getItem('buildanddo.mission-effects') !== 'off';
            return normalizeMotionPreferences({ version: 1, categories: { learning } });
        }
        catch { return normalizeMotionPreferences(null); }
    };
    let snapshot = { preferences: read(), persisted: true };
    const listeners = new Set();
    const publish = () => listeners.forEach((listener) => listener());
    const onStorage = (event) => {
        if (event.key !== MOTION_STORAGE_KEY && event.key !== null) return;
        snapshot = { preferences: read(), persisted: true };
        publish();
    };
    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            if (!listeners.size) browser?.addEventListener?.('storage', onStorage);
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
                if (!listeners.size) browser?.removeEventListener?.('storage', onStorage);
            };
        },
        update(patch) {
            const preferences = normalizeMotionPreferences({
                ...snapshot.preferences, ...patch, version: 1,
                categories: { ...snapshot.preferences.categories, ...patch.categories },
            });
            let persisted = false;
            try {
                if (browser?.localStorage) {
                    browser.localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify(preferences));
                    persisted = true;
                }
            } catch { /* Keep the usable in-memory preference and report its lifetime. */ }
            snapshot = { preferences, persisted };
            publish();
        },
        reset() {
            const defaults = normalizeMotionPreferences(null);
            this.update(defaults);
        },
    };
}
