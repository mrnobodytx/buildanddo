// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/platform/MetaFunctionDashboard.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PLATFORM-001
// CAPS:        pending
// CK:          pending
// Dispatch:    USO-BUILDANDDO-PLATFORM-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-13
// Depends:     apps/web/src/components/site/ui.jsx,
//              apps/web/src/components/platform/platformData.js
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/ui.jsx;
//              CONSUMES apps/web/src/components/platform/platformData.js;
//              VALIDATES SRS-BUILDANDDO-PLATFORM-001
// Intent:      Preview capability health, authority and receipts without exposing private telemetry.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Activity,
    Clock3,
    LockKeyhole,
    Pause,
    Play,
    Radio,
    ShieldCheck,
} from 'lucide-react';
import { Badge, Card, StatusDot } from '@/components/site/ui';
import {
    CAPABILITIES,
    INVOCATIONS,
    PROVIDER_HEALTH,
} from '@/components/platform/platformData';

const PROVIDER_TONES = {
    Datadog: {
        border: 'border-l-[hsl(var(--mf-violet))]',
        text: 'text-[hsl(var(--mf-violet))]',
        dot: '[&>span]:!bg-[hsl(var(--mf-violet))]',
    },
    GitLab: {
        border: 'border-l-[hsl(var(--amber))]',
        text: 'text-amber-warm',
        dot: '[&>span]:!bg-[hsl(var(--amber))]',
    },
    Memory: {
        border: 'border-l-[hsl(var(--teal))]',
        text: 'text-teal',
        dot: '[&>span]:!bg-[hsl(var(--teal))]',
    },
    PostHog: {
        border: 'border-l-[hsl(var(--mf-blue))]',
        text: 'text-[hsl(var(--mf-blue))]',
        dot: '[&>span]:!bg-[hsl(var(--mf-blue))]',
    },
    DKG: {
        border: 'border-l-[hsl(var(--amber))]',
        text: 'text-amber-warm',
        dot: '[&>span]:!bg-[hsl(var(--amber))]',
    },
};

const STATE_STYLE = {
    PASS: 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-success',
    FAIL: 'border-primary/40 bg-primary/10 text-primary',
    EMPTY: 'border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber))]/10 text-amber-warm',
};

function StateBadge({ state }) {
    return (
        <span className={`inline-flex border px-2 py-0.5 font-evidence text-[9px] font-semibold tracking-[0.12em] ${STATE_STYLE[state] || STATE_STYLE.EMPTY}`}>
            {state}
        </span>
    );
}

function ProviderCard({ provider, pulse }) {
    const tone = PROVIDER_TONES[provider.name] || PROVIDER_TONES.Datadog;
    return (
        <Card className={`border-l-2 p-4 ${tone.border}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <StatusDot tone="neutral" pulse={pulse} className={tone.dot} />
                    <p className="text-sm font-semibold">{provider.name}</p>
                </div>
                <span className={`font-evidence text-[9px] uppercase tracking-[0.12em] ${tone.text}`}>
                    {provider.status}
                </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                    <p className="font-evidence text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Methods</p>
                    <p className="mt-1 font-display text-xl font-semibold">{provider.methodCount}</p>
                </div>
                <div>
                    <p className="font-evidence text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Last invoked</p>
                    <p className="mt-1 text-xs font-medium">{provider.lastInvoked}</p>
                </div>
            </div>
        </Card>
    );
}

function AuthorityGauge({ actorAuthority }) {
    const actorLevel = Number.parseInt(String(actorAuthority).replace('A', ''), 10) || 1;
    return (
        <Card className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                        <ShieldCheck className="h-4 w-4 text-teal" />
                        Authority envelope
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Preview actor may execute through {actorAuthority}; higher mutations remain held.
                    </p>
                </div>
                <Badge tone="teal">Current actor · {actorAuthority}</Badge>
            </div>
            <ol className="mt-5 grid grid-cols-9 gap-1" aria-label={`Authority levels A1 through A9; current actor ${actorAuthority}`}>
                {Array.from({ length: 9 }, (_, index) => {
                    const level = index + 1;
                    const allowed = level <= actorLevel;
                    const current = level === actorLevel;
                    return (
                        <li key={level}>
                            <div
                                className={`flex h-9 items-center justify-center border font-evidence text-[10px] font-semibold ${
                                    current
                                        ? 'border-foreground bg-foreground text-background'
                                        : allowed
                                            ? 'border-[hsl(var(--teal))]/50 bg-[hsl(var(--teal))]/10 text-teal'
                                            : 'border-border bg-secondary/30 text-muted-foreground/65'
                                }`}
                                aria-current={current ? 'step' : undefined}
                                title={allowed ? `A${level} available` : `A${level} held`}
                            >
                                A{level}
                            </div>
                        </li>
                    );
                })}
            </ol>
            <div className="mt-2 flex justify-between font-evidence text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
                <span>Read boundary</span>
                <span className="flex items-center gap-1"><LockKeyhole className="h-3 w-3" /> Held authority</span>
            </div>
        </Card>
    );
}

function RegistryTable({ capabilities }) {
    return (
        <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-foreground/70 px-4 py-3">
                <div>
                    <p className="text-sm font-semibold">Deterministic registry</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Stable IDs, explicit effects.</p>
                </div>
                <span className="font-evidence text-[10px] text-muted-foreground">{capabilities.length} shown</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                        <tr className="border-b border-border bg-secondary/45 font-evidence text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                            <th className="px-4 py-2.5 font-medium">Capability ID</th>
                            <th className="px-3 py-2.5 font-medium">Provider</th>
                            <th className="px-3 py-2.5 font-medium">Authority</th>
                            <th className="px-3 py-2.5 font-medium">Mutation</th>
                            <th className="px-4 py-2.5 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {capabilities.map((capability) => {
                            const tone = PROVIDER_TONES[capability.provider] || PROVIDER_TONES.Datadog;
                            return (
                                <tr key={capability.id} className="border-b border-border/75 last:border-0">
                                    <td className="px-4 py-3 font-evidence text-[10px] font-medium text-foreground">{capability.id}</td>
                                    <td className={`px-3 py-3 text-xs font-semibold ${tone.text}`}>{capability.provider}</td>
                                    <td className="px-3 py-3 font-evidence text-[10px]">{capability.authority}</td>
                                    <td className="px-3 py-3 text-xs text-muted-foreground">{capability.mutation}</td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                                            <StatusDot
                                                tone={capability.status === 'healthy' ? 'green' : capability.status === 'held' ? 'amber' : 'neutral'}
                                            />
                                            {capability.status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

function InvocationFeed({ invocations, activeIndex, reduce }) {
    return (
        <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-foreground/70 px-4 py-3">
                <div>
                    <p className="flex items-center gap-2 text-sm font-semibold">
                        <Radio className="h-3.5 w-3.5 text-primary" />
                        Live invocation feed
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Illustrative replay · no network data.</p>
                </div>
                <span className="font-evidence text-[9px] uppercase tracking-[0.14em] text-primary">Replay</span>
            </div>
            <ol className="divide-y divide-border">
                {invocations.map((invocation, index) => {
                    const active = index === activeIndex;
                    return (
                        <motion.li
                            key={invocation.requestId}
                            className={`relative px-4 py-3 ${active ? 'bg-secondary/55' : 'bg-card'}`}
                            initial={false}
                            animate={{ x: active && !reduce ? 2 : 0 }}
                            transition={{ duration: reduce ? 0 : 0.22 }}
                        >
                            {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate font-evidence text-[10px] font-semibold">{invocation.capabilityId}</p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-evidence text-[9px] text-muted-foreground">
                                        <span>{invocation.requestId}</span>
                                        <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{invocation.latencyMs} ms</span>
                                        <span>{invocation.occurredAt}</span>
                                    </div>
                                </div>
                                <StateBadge state={invocation.state} />
                            </div>
                        </motion.li>
                    );
                })}
            </ol>
        </Card>
    );
}

export default function MetaFunctionDashboard({
    capabilities = CAPABILITIES,
    invocations = INVOCATIONS,
    providers = PROVIDER_HEALTH,
    actorAuthority = 'A3',
    animate = true,
}) {
    const reduce = useReducedMotion();
    const [activeInvocation, setActiveInvocation] = useState(0);
    const [paused, setPaused] = useState(false);
    const playbackActive = animate && !paused && !reduce;
    const activeProvider = useMemo(() => {
        const current = invocations[activeInvocation]?.capabilityId || '';
        return providers.findIndex((provider) => current.includes(provider.name.toUpperCase()));
    }, [activeInvocation, invocations, providers]);

    useEffect(() => {
        if (!playbackActive || invocations.length < 2) return undefined;
        const timer = window.setInterval(() => {
            setActiveInvocation((index) => (index + 1) % invocations.length);
        }, 3200);
        return () => window.clearInterval(timer);
    }, [invocations.length, playbackActive]);

    return (
        <div
            className="border border-foreground/80 bg-background shadow-[8px_8px_0_hsl(var(--foreground)/0.07)]"
            style={{
                '--mf-violet': '268 42% 43%',
                '--mf-blue': '209 47% 43%',
            }}
        >
            <div className="flex flex-col gap-3 border-b-4 border-double border-foreground/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                    <p className="font-evidence text-[10px] uppercase tracking-[0.2em] text-primary">Capability monitor · public specimen</p>
                    <h3 className="mt-1 font-display text-2xl font-semibold">MetaFunction control plane</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="amber">Illustrative preview</Badge>
                    <span className="inline-flex items-center gap-2 font-evidence text-[10px] text-muted-foreground">
                        <StatusDot tone="green" pulse={playbackActive} />
                        {playbackActive ? 'replay active' : 'replay paused'}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPaused((value) => !value)}
                        disabled={!animate || reduce}
                        className="inline-flex h-8 items-center gap-1.5 border border-border px-2.5 font-evidence text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45"
                        aria-pressed={paused}
                    >
                        {playbackActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        {!animate || reduce ? 'Static' : paused ? 'Resume' : 'Pause'}
                    </button>
                </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {providers.map((provider, index) => (
                        <ProviderCard
                            key={provider.id}
                            provider={provider}
                            pulse={playbackActive && index === activeProvider}
                        />
                    ))}
                </div>

                <AuthorityGauge actorAuthority={actorAuthority} />

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.9fr)]">
                    <RegistryTable capabilities={capabilities} />
                    <InvocationFeed invocations={invocations} activeIndex={activeInvocation} reduce={reduce} />
                </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border bg-secondary/30 px-4 py-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="flex items-center gap-1.5 font-evidence uppercase tracking-[0.12em]">
                    <Activity className="h-3 w-3" /> Demonstration data only
                </span>
                <a
                    href="https://citadel-nexus.com/status"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                >
                    Powered by Citadel Nexus Inc. · System status
                </a>
            </div>
        </div>
    );
}
