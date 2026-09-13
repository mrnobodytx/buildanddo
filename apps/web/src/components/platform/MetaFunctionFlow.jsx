// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/platform/MetaFunctionFlow.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PLATFORM-001
// CAPS:        pending
// CK:          pending
// Dispatch:    USO-BUILDANDDO-PLATFORM-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-13
// Depends:     apps/web/src/components/site/ui.jsx, framer-motion, lucide-react
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/ui.jsx;
//              VALIDATES SRS-BUILDANDDO-PLATFORM-001
// Intent:      Make each governed step from Guildmaster request to causal edge inspectable.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    BarChart3,
    Cable,
    ChevronRight,
    Crown,
    ListTree,
    Network,
    PackageCheck,
    Pause,
    Play,
    Send,
    ShieldCheck,
} from 'lucide-react';
import { Badge, EvidenceChip, StatusDot } from '@/components/site/ui';

const FLOW = [
    {
        key: 'guildmaster',
        icon: Crown,
        name: 'Guildmaster',
        shortName: 'Intent owner',
        subtitle: 'Frames bounded intent',
        tone: 'amber',
        detail: 'Names the outcome and context, but never selects credentials or a provider method directly.',
        input: 'mission + actor',
        output: 'bounded intent',
    },
    {
        key: 'request',
        icon: Send,
        name: 'Meta Function Request',
        shortName: 'Request',
        subtitle: 'Names one capability',
        tone: 'amber',
        detail: 'Carries a stable capability ID, validated arguments and correlation fields across the fabric.',
        input: 'intent + context',
        output: 'CAP-29381',
    },
    {
        key: 'registry',
        icon: ListTree,
        name: 'Deterministic Registry',
        shortName: 'Registry',
        subtitle: 'Resolves without model routing',
        tone: 'violet',
        detail: 'Maps the capability to an owned provider operation, authority requirement and mutation class.',
        input: 'OBSERVE.*',
        output: 'provider handler',
    },
    {
        key: 'policy',
        icon: ShieldCheck,
        name: 'AAXP / Policy Gate',
        shortName: 'Policy gate',
        subtitle: 'Checks authority and scope',
        tone: 'violet',
        detail: 'Denies insufficient reads, holds privileged mutation and records the resulting authority effect.',
        input: 'actor A3',
        output: 'EXECUTED',
    },
    {
        key: 'adapter',
        icon: Cable,
        name: 'Provider Adapter',
        shortName: 'Adapter',
        subtitle: 'Contains provider details',
        tone: 'violet',
        detail: 'Invokes the bounded provider method while keeping credentials and vendor response shapes out of the caller.',
        input: 'validated args',
        output: 'raw response',
    },
    {
        key: 'result',
        icon: PackageCheck,
        name: 'Normalized Result',
        shortName: 'Result',
        subtitle: 'States the outcome explicitly',
        tone: 'teal',
        detail: 'Distinguishes PASS, FAIL, EMPTY and unavailable states, then attaches latency and evidence references.',
        input: 'raw response',
        output: 'PASS · OBSERVED',
    },
    {
        key: 'analytics',
        icon: BarChart3,
        name: 'CNWB Analytics',
        shortName: 'Analytics',
        subtitle: 'Records the invocation',
        tone: 'teal',
        detail: 'Correlates the request to its dispatch and trace so operations can compare provider behavior over time.',
        input: 'receipt',
        output: 'event + evidence',
    },
    {
        key: 'dkg',
        icon: Network,
        name: 'DKG / Causality',
        shortName: 'Causality',
        subtitle: 'Connects cause to outcome',
        tone: 'teal',
        detail: 'Adds the verified relationship to the graph, making later impact analysis and deterministic reuse possible.',
        input: 'evidence edge',
        output: 'causal relation',
    },
];

const TONE_CLASS = {
    amber: {
        border: 'border-[hsl(var(--amber))]',
        text: 'text-amber-warm',
        wash: 'bg-[hsl(var(--amber))]/10',
        dot: '[&>span]:!bg-[hsl(var(--amber))]',
        stroke: 'hsl(var(--amber))',
    },
    violet: {
        border: 'border-[hsl(var(--mf-violet))]',
        text: 'text-[hsl(var(--mf-violet))]',
        wash: 'bg-[hsl(var(--mf-violet))]/10',
        dot: '[&>span]:!bg-[hsl(var(--mf-violet))]',
        stroke: 'hsl(var(--mf-violet))',
    },
    teal: {
        border: 'border-[hsl(var(--teal))]',
        text: 'text-teal',
        wash: 'bg-[hsl(var(--teal))]/10',
        dot: '[&>span]:!bg-[hsl(var(--teal))]',
        stroke: 'hsl(var(--teal))',
    },
};

function Connector({ tone, active, reduce }) {
    const stroke = TONE_CLASS[tone].stroke;
    return (
        <>
            <svg
                viewBox="0 0 28 8"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="absolute left-[calc(100%-1px)] top-[3.65rem] z-0 hidden h-2 w-[calc(1rem+1px)] lg:block"
            >
                <path d="M 0 4 H 28" stroke="hsl(var(--border))" strokeWidth="1" />
                <motion.path
                    d="M 0 4 H 28"
                    stroke={stroke}
                    strokeWidth="2"
                    initial={false}
                    animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0.25 }}
                    transition={{ duration: reduce ? 0 : 0.65, ease: 'easeOut' }}
                />
            </svg>
            <svg
                viewBox="0 0 8 28"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="mx-auto h-7 w-2 lg:hidden"
            >
                <path d="M 4 0 V 28" stroke="hsl(var(--border))" strokeWidth="1" />
                <motion.path
                    d="M 4 0 V 28"
                    stroke={stroke}
                    strokeWidth="2"
                    initial={false}
                    animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0.25 }}
                    transition={{ duration: reduce ? 0 : 0.55 }}
                />
            </svg>
        </>
    );
}

export default function MetaFunctionFlow({ autoPlay = true }) {
    const reduce = useReducedMotion();
    const [activeIndex, setActiveIndex] = useState(0);
    const [playing, setPlaying] = useState(autoPlay && !reduce);
    const detailId = useId();
    const playbackActive = playing && !reduce;
    const active = FLOW[activeIndex];
    const activeTone = TONE_CLASS[active.tone];

    useEffect(() => {
        if (!playbackActive) return undefined;
        const timer = window.setInterval(() => {
            setActiveIndex((index) => (index + 1) % FLOW.length);
        }, 2800);
        return () => window.clearInterval(timer);
    }, [playbackActive]);

    const selectStep = (index) => {
        setActiveIndex(index);
        setPlaying(false);
    };

    const nextStep = () => {
        setActiveIndex((index) => (index + 1) % FLOW.length);
        setPlaying(false);
    };

    return (
        <div
            className="border-y border-foreground/70 bg-card"
            style={{ '--mf-violet': '268 42% 43%' }}
        >
            <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                    <p className="font-evidence text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Execution sequence · 8 governed stages
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                        Select any stage to inspect its input and output boundary.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setPlaying((value) => !value)}
                        disabled={reduce}
                        className="inline-flex h-9 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45"
                        aria-pressed={playbackActive}
                    >
                        {playbackActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {playbackActive ? 'Pause' : 'Play'}
                    </button>
                    <button
                        type="button"
                        onClick={nextStep}
                        className="inline-flex h-9 items-center gap-2 border border-foreground bg-foreground px-3 text-xs font-semibold uppercase tracking-[0.12em] text-background transition-opacity hover:opacity-85"
                    >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <ol className="grid px-4 pt-5 sm:px-6 lg:grid-cols-8 lg:gap-x-4 lg:pb-5">
                {FLOW.map((node, index) => {
                    const Icon = node.icon;
                    const selected = activeIndex === index;
                    const tone = TONE_CLASS[node.tone];
                    return (
                        <li key={node.key} className="relative min-w-0">
                            <motion.button
                                type="button"
                                onClick={() => selectStep(index)}
                                aria-expanded={selected}
                                aria-controls={detailId}
                                className={`relative z-10 flex min-h-[7.4rem] w-full flex-row items-center gap-4 border bg-card px-4 py-3 text-left transition-colors lg:flex-col lg:items-start lg:gap-2 lg:px-3 ${selected ? `${tone.border} ${tone.wash}` : 'border-border hover:border-foreground/50'}`}
                                initial={false}
                                animate={{ y: selected && !reduce ? -3 : 0 }}
                                transition={{ duration: reduce ? 0 : 0.25 }}
                            >
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center border ${selected ? tone.border : 'border-border'} ${selected ? tone.text : 'text-muted-foreground'}`}>
                                    <Icon className="h-4 w-4" strokeWidth={2} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center justify-between gap-2">
                                        <span className={`font-evidence text-[9px] uppercase tracking-[0.16em] ${selected ? tone.text : 'text-muted-foreground'}`}>
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        <StatusDot
                                            tone="neutral"
                                            pulse={selected && playbackActive}
                                            className={selected ? tone.dot : ''}
                                        />
                                    </span>
                                    <span className="mt-1 block text-xs font-semibold leading-tight lg:text-[11px]">
                                        {node.shortName}
                                    </span>
                                    <span className="mt-1 hidden text-[10px] leading-snug text-muted-foreground xl:block">
                                        {node.subtitle}
                                    </span>
                                </span>
                            </motion.button>
                            {index < FLOW.length - 1 && (
                                <Connector
                                    tone={FLOW[index + 1].tone}
                                    active={activeIndex > index}
                                    reduce={reduce}
                                />
                            )}
                        </li>
                    );
                })}
            </ol>

            <div id={detailId} className="border-t border-border bg-background/55 px-4 py-5 sm:px-6">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={active.key}
                        initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: reduce ? 0 : -4 }}
                        transition={{ duration: reduce ? 0 : 0.24 }}
                        className="grid gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:items-center"
                    >
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                    tone="neutral"
                                    className={`${activeTone.border} ${activeTone.text} ${activeTone.wash}`}
                                >
                                    Stage {String(activeIndex + 1).padStart(2, '0')}
                                </Badge>
                                <span className="font-evidence text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                    {active.subtitle}
                                </span>
                            </div>
                            <h3 className="mt-3 font-display text-2xl font-semibold">{active.name}</h3>
                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                {active.detail}
                            </p>
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border border-border bg-card p-3">
                            <EvidenceChip tone="neutral">{active.input}</EvidenceChip>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            <EvidenceChip tone="neutral">{active.output}</EvidenceChip>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
