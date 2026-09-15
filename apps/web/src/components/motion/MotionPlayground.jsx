// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/MotionPlayground.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/contexts/MotionContext.jsx, apps/web/src/components/motion/MotionPrimitives.jsx, apps/web/src/components/motion/StepSequence.jsx, apps/web/src/lib/motion/runtime.js
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/contexts/MotionContext.jsx; DEPENDS_ON apps/web/src/components/motion/MotionPrimitives.jsx; DEPENDS_ON apps/web/src/components/motion/StepSequence.jsx; DEPENDS_ON apps/web/src/lib/motion/runtime.js
// DAG Node:    none
// Intent:      Offer isolated, controllable motion demonstrations without changing business state or transmitting local media.
// ───────────────────────────────────────────────────────────────

import React, { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { MotionConfig, Reorder } from 'framer-motion';
import { Button } from '@/components/site/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useMotionCategory } from '@/contexts/MotionContext';
import { reorderItems } from '@/lib/motion/runtime';
import { MotionEntrance, MotionProgress, MotionValue, PointerSurface, SharedTitle } from './MotionPrimitives';
import StepSequence from './StepSequence';
import CountUp from '@/components/CountUp';

const SpatialMesh = lazy(() => import('@/components/platform/MetaFunctionOrb'));

function InterfacePreview() {
    const uid = useId();
    const [name, setName] = useState('');
    const [checked, setChecked] = useState(false);
    const [result, setResult] = useState('idle');
    const timer = useRef(null);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const run = (fail) => {
        window.clearTimeout(timer.current);
        setResult('pending');
        timer.current = window.setTimeout(() => setResult(fail ? 'error' : 'success'), 600);
    };
    return <div className="space-y-4">
        <Tabs defaultValue="form">
            <TabsList className="h-auto flex-wrap"><TabsTrigger value="form">Form & recovery</TabsTrigger><TabsTrigger value="disclosure">Disclosure & overlay</TabsTrigger></TabsList>
            <TabsContent value="form" className="space-y-4 pt-3">
                <label className="block space-y-2 text-sm"><span>Preview draft</span><input value={name} onChange={(event) => setName(event.target.value)} className="motion-select" placeholder="Your text stays here after a simulated error" /></label>
                <div className="flex min-h-11 items-center gap-3"><Switch id={uid} checked={checked} onCheckedChange={setChecked} /><label htmlFor={uid} className="text-sm">Example selection</label></div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={result === 'pending'} onClick={() => run(false)}>Run success example</Button>
                    <Button size="sm" variant="secondary" disabled={result === 'pending'} onClick={() => run(true)}>Run failure example</Button>
                </div>
                <div className="min-h-20">
                    {result === 'pending' && <p role="status" className="motion-feedback text-sm"><span aria-hidden="true" className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-current border-r-transparent" />Waiting for the simulated response…</p>}
                    {result === 'error' && <div className="space-y-2"><p role="alert" className="motion-feedback text-sm">Simulated failure. Your draft is unchanged.</p><Button size="sm" variant="secondary" onClick={() => run(false)}>Retry example</Button></div>}
                    {result === 'success' && <MotionEntrance category="feedback" role="status" className="space-y-2 text-sm"><p className="motion-stamp">Example confirmed. No record was saved.</p><Button size="sm" variant="ghost" onClick={() => setResult('idle')}>Dismiss notification</Button></MotionEntrance>}
                </div>
            </TabsContent>
            <TabsContent value="disclosure" className="space-y-4 pt-3">
                <details className="border border-border p-3"><summary className="cursor-pointer py-2 text-sm font-semibold">Show a disclosure</summary><p className="mt-2 text-sm leading-6">The same content remains readable with motion off. The summary remains keyboard operable.</p></details>
                <Dialog><DialogTrigger asChild><Button size="sm" variant="secondary">Open example dialog</Button></DialogTrigger>
                    <DialogContent><DialogHeader><DialogTitle>Focus stays with the task</DialogTitle><DialogDescription>Use Tab to move between controls, then Escape to return to the opener.</DialogDescription></DialogHeader>
                        <label className="space-y-2 text-sm"><span>Example field</span><input className="motion-select" /></label>
                    </DialogContent>
                </Dialog>
            </TabsContent>
        </Tabs>
    </div>;
}

function PlanningPreview() {
    const initial = [{ id: 'question', title: 'Frame a question' }, { id: 'test', title: 'Plan a test' }, { id: 'review', title: 'Review evidence' }];
    const [items, setItems] = useState(initial);
    const [notice, setNotice] = useState('');
    const { enabled, motion } = useMotionCategory('layout');
    const move = (id, to) => {
        setItems((current) => reorderItems(current, id, to));
        setNotice(`Moved ${items.find((item) => item.id === id)?.title} to position ${to + 1}.`);
    };
    return <div className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">Reorder this local plan with the handle, move buttons or Alt + Arrow Up/Down. Changes stay in this preview.</p>
        <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2" aria-label="Example plan">
            {items.map((item, index) => <Reorder.Item key={item.id} value={item} dragListener={enabled} layout={enabled}
                transition={enabled ? motion.spring : { duration: 0 }} className="relative flex flex-wrap items-center justify-between gap-3 border border-border bg-background p-3"
                tabIndex={0} aria-label={`${item.title}, position ${index + 1}`}
                onKeyDown={(event) => {
                    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                    event.preventDefault();
                    const to = Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
                    if (to !== index) move(item.id, to);
                }}>
                <span className="text-sm"><span aria-hidden="true" className="mr-2 cursor-grab">⋮⋮</span>{item.title}</span>
                <span className="flex gap-2"><button type="button" className="motion-small-button" disabled={index === 0} onClick={() => move(item.id, index - 1)} aria-label={`Move ${item.title} up`}>Up</button>
                    <button type="button" className="motion-small-button" disabled={index === items.length - 1} onClick={() => move(item.id, index + 1)} aria-label={`Move ${item.title} down`}>Down</button></span>
            </Reorder.Item>)}
        </Reorder.Group>
        <p role="status" className="min-h-6 text-xs text-muted-foreground">{notice}</p>
        <Button size="sm" variant="secondary" onClick={() => { setItems(initial); setNotice('Example order reset.'); }}>Reset example plan</Button>
    </div>;
}

function DataPreview() {
    const [count, setCount] = useState(2);
    const [stage, setStage] = useState('requested');
    const { enabled } = useMotionCategory('data');
    const values = [{ name: 'Planned', value: 5 }, { name: 'Recorded', value: count }, { name: 'Reviewed', value: Math.max(0, count - 1) }];
    return <div className="space-y-5">
        <p className="text-sm text-muted-foreground">Illustrative values only. These controls do not advance a mission or activate an integration.</p>
        <div className="space-y-2"><p className="font-display text-3xl"><CountUp value={count} duration={400} /> / 5</p>
            <MotionProgress value={count} max={5} label="Example progress" />
            <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={count === 0} onClick={() => setCount((n) => n - 1)}>Decrease example</Button>
                <Button size="sm" disabled={count === 5} onClick={() => setCount((n) => n + 1)}>Increase example</Button></div></div>
        <figure aria-label="Example planned, recorded and reviewed counts" className="space-y-3">
            {values.map((item) => <div key={item.name} className="grid grid-cols-[5rem_1fr_2rem] items-center gap-2 text-xs">
                <span>{item.name}</span><div className="h-4 bg-muted"><div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${item.value / 5})`, transition: enabled ? 'transform var(--motion-layout) var(--motion-ease)' : 'none' }} /></div><span>{item.value}</span>
            </div>)}
            <figcaption className="text-xs text-muted-foreground">Example counts; the labels always show exact values.</figcaption>
        </figure>
        <label className="block space-y-2 text-sm"><span>Example integration state</span><select className="motion-select" value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="requested">Requested</option><option value="pending">Pending application</option><option value="observed">Dated observation received</option><option value="stale">Observation stale</option><option value="disabled">Disabled</option>
        </select></label>
        <MotionValue as="p" value={stage} category="community" className="border border-border p-3 text-sm">Example state: {stage}. No executor was contacted.</MotionValue>
        {count === 5 && <MotionEntrance category="learning" className="motion-stamp border border-border p-4 text-sm">Example milestone reached. Production milestones follow saved learning progress.</MotionEntrance>}
    </div>;
}

/** Restrict local preview files and release their object URLs on replacement. */
function useLocalMedia(allowed, maxSize) {
    const [file, setFile] = useState(null);
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!file) { setUrl(''); return undefined; }
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);
    const select = (event) => {
        const next = event.target.files?.[0];
        if (!next) return;
        if (!allowed.includes(next.type) || next.size > maxSize) {
            setError('Choose a supported file within the size limit.');
            event.target.value = '';
            return;
        }
        setError('');
        setFile(next);
    };
    return { url, error, select, clear: () => setFile(null) };
}

function GalleryPreview() {
    const opener = useRef(null);
    const [comparison, setComparison] = useState(50);
    const [open, setOpen] = useState(false);
    const [origin, setOrigin] = useState(null);
    const { url, error, select, clear } = useLocalMedia(['image/png', 'image/jpeg', 'image/webp'], 10 * 1024 * 1024);
    const source = url || '/social-card.png';
    return <div className="space-y-4">
        <PointerSurface>
            <button ref={opener} type="button" aria-label="Expand example image" className="block w-full border border-border p-2"
                onClick={(event) => { const { left, top } = event.currentTarget.getBoundingClientRect(); setOrigin({ left, top }); setOpen(true); }}>
                <img src={source} alt="Image used for the local motion comparison" width="1200" height="630" className="motion-image aspect-[1200/630] w-full object-contain" />
            </button>
        </PointerSurface>
        <figure className="space-y-3">
            <div className="relative overflow-hidden border border-border">
                <img src={source} alt="Original image" width="1200" height="630" className="aspect-[1200/630] w-full object-contain" />
                <img src={source} alt="" aria-hidden="true" width="1200" height="630" className="pointer-events-none absolute inset-0 aspect-[1200/630] w-full object-contain grayscale" style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }} />
                <span aria-hidden="true" className="absolute inset-y-0 border-l-2 border-primary" style={{ left: `${comparison}%` }} />
            </div>
            <label className="block space-y-2 text-sm"><span>Monochrome comparison: {comparison}%</span><input type="range" min="0" max="100" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} className="w-full accent-primary" /></label>
            <figcaption className="text-xs text-muted-foreground">Use the slider or arrow keys to compare monochrome and original appearance.</figcaption>
        </figure>
        <label className="block space-y-2 text-sm"><span>Try a local image (PNG, JPEG or WebP; up to 10 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={select} className="max-w-full text-xs" /></label>
        {error && <p role="alert" className="text-sm">{error}</p>}
        <Button size="sm" variant="secondary" onClick={clear}>Restore example image</Button>
        <p className="text-xs text-muted-foreground">Local files stay in your browser and are released when you leave this preview.</p>
        <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"
            onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
            <DialogHeader><DialogTitle>Image detail</DialogTitle><DialogDescription>The enlarged image keeps its original proportions.</DialogDescription></DialogHeader>
            <SharedTitle as="div" origin={origin}><img src={source} alt="Enlarged comparison image" width="1200" height="630" className="aspect-[1200/630] w-full object-contain" /></SharedTitle>
        </DialogContent></Dialog>
    </div>;
}

function MediaPreview() {
    const video = useRef(null);
    const [transcript, setTranscript] = useState('');
    const [captions, setCaptions] = useState('');
    const [captionError, setCaptionError] = useState('');
    const { url, error, select, clear } = useLocalMedia(['video/mp4', 'video/webm'], 50 * 1024 * 1024);
    useEffect(() => {
        const pause = () => { if (document.hidden) video.current?.pause(); };
        document.addEventListener('visibilitychange', pause);
        return () => document.removeEventListener('visibilitychange', pause);
    }, []);
    useEffect(() => {
        if (!captions) return undefined;
        return () => URL.revokeObjectURL(captions);
    }, [captions]);
    return <div className="space-y-4">
        <label className="block space-y-2 text-sm"><span>Local video preview (MP4 or WebM; up to 50 MB)</span><input type="file" accept="video/mp4,video/webm" onChange={select} className="max-w-full text-xs" /></label>
        {error && <p role="alert" className="text-sm">{error}</p>}
        {url ? <video ref={video} key={url} src={url} controls playsInline preload="metadata" className="aspect-video w-full border border-border bg-muted" aria-label="Local video preview">
            {captions && <track kind="captions" src={captions} srcLang="en" label="Local captions" default />}
        </video> : <div className="flex aspect-video items-center justify-center border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Choose a video to use playback, seeking, volume and fullscreen controls. Playback starts only when you choose Play.</div>}
        <label className="block space-y-2 text-sm"><span>Optional local captions (WebVTT; up to 1 MB)</span><input type="file" accept=".vtt,text/vtt" className="max-w-full text-xs" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith('.vtt') || file.size > 1024 * 1024) { setCaptionError('Choose a WebVTT file under 1 MB.'); return; }
            setCaptionError(''); setCaptions(URL.createObjectURL(new Blob([file], { type: 'text/vtt' })));
        }} /></label>
        {captionError && <p role="alert" className="text-sm">{captionError}</p>}
        <label className="block space-y-2 text-sm"><span>Readable transcript</span><textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} maxLength={12000} rows={4} className="motion-select h-auto" placeholder="Add a local transcript for this preview" /></label>
        <details className="border border-border p-3"><summary className="cursor-pointer py-2 text-sm font-semibold">Show transcript</summary><p className="whitespace-pre-wrap text-sm leading-7">{transcript || 'No transcript entered.'}</p></details>
        <Button size="sm" variant="secondary" onClick={() => { video.current?.pause(); clear(); setCaptions(''); }}>Clear media</Button>
        <p className="text-xs text-muted-foreground">Your video, captions and transcript stay in this preview. Motion preferences affect interface transitions; native media controls manage playback and sound.</p>
    </div>;
}

function PlaygroundScene({ kind }) {
    if (kind === 'planning') return <PlanningPreview />;
    if (kind === 'data') return <DataPreview />;
    if (kind === 'gallery') return <GalleryPreview />;
    if (kind === 'media') return <MediaPreview />;
    if (kind === 'story') return <StepSequence />;
    if (kind === 'spatial') return <div className="space-y-3"><p className="text-sm text-muted-foreground">Enable 3D capability mesh under Optional effects to animate this desktop illustration. A static diagram appears when motion, device capability or graphics support limits it.</p><Suspense fallback={<p role="status">Loading illustration…</p>}><SpatialMesh /></Suspense></div>;
    return <InterfacePreview />;
}



export default function MotionPlayground({ kind }) {
    const { motion } = useMotionCategory('controls');
    return <MotionConfig reducedMotion={motion.mode === 'full' ? 'never' : 'always'}>
        <PlaygroundScene kind={kind} />
    </MotionConfig>;
}
