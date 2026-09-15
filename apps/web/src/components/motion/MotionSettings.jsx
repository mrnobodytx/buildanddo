// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/MotionSettings.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/contexts/MotionContext.jsx, apps/web/src/lib/motion/catalog.js, apps/web/src/lib/motion/preferences.js, apps/web/src/components/motion/MotionPlayground.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/contexts/MotionContext.jsx; DEPENDS_ON apps/web/src/lib/motion/catalog.js; DEPENDS_ON apps/web/src/lib/motion/preferences.js; DEPENDS_ON apps/web/src/components/motion/MotionPlayground.jsx
// DAG Node:    none
// Intent:      Organize device motion controls and the complete usage catalogue with opt-in interactive previews.
// ───────────────────────────────────────────────────────────────

import React, { lazy, Suspense, useId, useRef, useState } from 'react';
import { useMotionPreferences } from '@/contexts/MotionContext';
import { MOTION_CATEGORIES, normalizeMotionPreferences } from '@/lib/motion/preferences';
import { MOTION_CATALOG, MOTION_PREVIEWS } from '@/lib/motion/catalog';
import { Button } from '@/components/site/ui';

const MotionPlayground = lazy(() => import('./MotionPlayground'));
const groups = [...new Set(Object.values(MOTION_CATEGORIES).map((entry) => entry.group))];

export default function MotionSettings({ compact = false }) {
    const uid = useId();
    const previewHeading = useRef(null);
    const { preferences, environment, motion, persisted, update, reset } = useMotionPreferences();
    const [query, setQuery] = useState('');
    const [preview, setPreview] = useState('interface');
    const [showPreview, setShowPreview] = useState(false);
    const [usageCategory, setUsageCategory] = useState('all');
    const matching = MOTION_CATALOG.filter((entry) =>
        (usageCategory === 'all' || entry.category === usageCategory)
        && `${entry.title} ${entry.usage}`.toLowerCase().includes(query.trim().toLowerCase()));
    const choosePreset = (preset) => {
        const defaults = normalizeMotionPreferences(null);
        if (preset === 'expressive') update({ ...defaults, mode: 'full', intensity: 'expressive',
            categories: Object.fromEntries(Object.keys(MOTION_CATEGORIES).map((key) => [key, true])) });
        else if (preset === 'reduced') update({ ...defaults, mode: 'reduced' });
        else if (preset === 'off') update({ ...defaults, mode: 'off' });
        else update(defaults);
    };
    return <section id={compact ? undefined : 'motion-settings'} aria-labelledby={`${uid}-title`} data-dd-privacy="mask" className="ph-no-capture motion-settings min-w-0 space-y-6">
        <div>
            <h2 id={`${uid}-title`} className="font-display text-2xl font-semibold">Motion & interaction</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Choose how the site moves. Changes apply immediately across public pages and your workspace, and are saved on this device.</p>
            {!persisted && <p role="status" className="mt-2 text-sm">Device storage is unavailable. Your choices apply for this visit.</p>}
        </div>
        <div className="space-y-4 border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Motion presets">
                <Button size="sm" variant="secondary" onClick={() => choosePreset('editorial')}>Editorial preset</Button>
                <Button size="sm" variant="secondary" onClick={() => choosePreset('expressive')}>Expressive preset</Button>
                <Button size="sm" variant="secondary" onClick={() => choosePreset('reduced')}>Reduced preset</Button>
                <Button size="sm" variant="secondary" onClick={() => choosePreset('off')}>Turn motion off</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-2 text-sm"><span className="block font-semibold">Motion mode</span>
                    <select className="motion-select" value={preferences.mode} onChange={(event) => update({ mode: event.target.value })}>
                        <option value="system">Follow device</option><option value="full">Full motion</option>
                        <option value="reduced">Reduced motion</option><option value="off">Off</option>
                    </select>
                </label>
                <label className="space-y-2 text-sm"><span className="block font-semibold">Pace</span>
                    <select className="motion-select" value={preferences.pace} onChange={(event) => update({ pace: event.target.value })}>
                        <option value="quick">Quick</option><option value="standard">Standard</option><option value="relaxed">Relaxed</option>
                    </select>
                </label>
                <label className="space-y-2 text-sm"><span className="block font-semibold">Movement</span>
                    <select className="motion-select" value={preferences.intensity} onChange={(event) => update({ intensity: event.target.value })}>
                        <option value="subtle">Subtle</option><option value="expressive">Expressive</option>
                    </select>
                </label>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" checked={preferences.paused} onChange={(event) => update({ paused: event.target.checked })} className="h-4 w-4 accent-primary" />
                Pause automatic effects
            </label>
            <p role="status" className="text-sm text-muted-foreground">
                {environment.reduced ? 'Your device requests reduced motion. Movement stays reduced even with Full motion selected.'
                    : motion.mode === 'off' ? 'Motion is off. All content, controls and status text remain available.'
                    : motion.mode === 'reduced' ? 'Reduced motion is active. State changes appear immediately.'
                    : 'Full motion is available for the enabled categories.'}
                {motion.constrained && ' Touch, a narrow viewport or Data Saver limits optional effects.'}
            </p>
        </div>
        <div className={compact ? 'space-y-3' : 'grid items-start gap-4 lg:grid-cols-2'}>
            {groups.map((group) => <fieldset key={group} className="min-w-0 space-y-1 border border-border bg-card p-4">
                <legend className="px-1 font-display text-lg font-semibold">{group}</legend>
                {Object.entries(MOTION_CATEGORIES).filter(([, entry]) => entry.group === group).map(([key, entry]) =>
                    <label key={key} className="flex cursor-pointer items-start gap-3 py-3 text-sm">
                        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={preferences.categories[key]}
                            onChange={(event) => update({ categories: { [key]: event.target.checked } })} />
                        <span className="min-w-0"><span className="block font-semibold">{entry.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{entry.usage}</span>
                            {preferences.categories[key] && !motion.categories[key] && <span className="mt-1 block text-xs text-muted-foreground">Currently limited by your motion or device settings.</span>}
                        </span>
                    </label>)}
            </fieldset>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={reset}>Reset motion settings</Button>
            <p className="text-xs text-muted-foreground">Editorial defaults keep optional effects off.</p>
        </div>
        <details className="border border-border bg-card p-4" open={showPreview} onToggle={(event) => setShowPreview(event.currentTarget.open)}>
            <summary ref={previewHeading} className="cursor-pointer py-1 font-display text-lg font-semibold">Interactive motion previews</summary>
            {showPreview && <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">Local examples only. Preview actions do not save business records, send messages or activate integrations.</p>
                <label className="block space-y-2 text-sm"><span className="font-semibold">Preview collection</span>
                    <select className="motion-select max-w-md" value={preview} onChange={(event) => setPreview(event.target.value)}>
                        {MOTION_PREVIEWS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                    </select>
                </label>
                <Suspense fallback={<p role="status">Loading preview…</p>}><MotionPlayground key={preview} kind={preview} /></Suspense>
            </div>}
        </details>
        <details className="border border-border bg-card p-4">
            <summary className="cursor-pointer py-1 font-display text-lg font-semibold">Usage reference · all 50 areas</summary>
            <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">Find each technique, where it appears and its preview. Accessibility, truthful state and cleanup remain built-in behavior.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm"><span className="block font-semibold">Search motion usage</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="motion-select" /></label>
                    <label className="space-y-1 text-sm"><span className="block font-semibold">Filter motion category</span><select value={usageCategory} onChange={(event) => setUsageCategory(event.target.value)} className="motion-select">
                        <option value="all">All categories</option>{Object.entries(MOTION_CATEGORIES).map(([key, entry]) => <option key={key} value={key}>{entry.label}</option>)}
                    </select></label>
                </div>
                <p role="status" className="text-xs text-muted-foreground">{matching.length} of 50 areas</p>
                <ol className="divide-y divide-border">
                    {matching.map((entry) => <li key={entry.id} className="py-3 text-sm">
                        <p className="font-semibold"><span className="mr-2 font-evidence text-xs text-muted-foreground">{String(entry.id).padStart(2, '0')}</span>{entry.title}</p>
                        <p className="mt-1 leading-6 text-muted-foreground">{entry.usage}</p>
                        {entry.preview !== 'system' && <button type="button" className="mt-1 min-h-9 underline underline-offset-4"
                            onClick={() => { setPreview(entry.preview); setShowPreview(true); previewHeading.current?.focus(); }}>Show related preview</button>}
                    </li>)}
                </ol>
            </div>
        </details>
        <button id={`${uid}-preview-link`} type="button" className="motion-small-button" onClick={() => setShowPreview((current) => !current)}>
            {showPreview ? 'Close previews' : 'Open previews'}
        </button>
    </section>;
}
