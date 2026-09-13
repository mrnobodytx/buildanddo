// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/PlatformPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PLATFORM-001
// CAPS:        pending
// CK:          pending
// Dispatch:    USO-BUILDANDDO-PLATFORM-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-13
// Depends:     apps/web/src/components/platform/MetaFunctionFlow.jsx,
//              apps/web/src/components/platform/MetaFunctionDashboard.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/platform/MetaFunctionFlow.jsx;
//              CONSUMES apps/web/src/components/platform/MetaFunctionDashboard.jsx;
//              DEPENDS_ON apps/web/src/components/site/ui.jsx
// Intent:      Give the public an inspectable visual model of the governed capability fabric.
// ───────────────────────────────────────────────────────────────

import React, { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet';
import { motion, useReducedMotion } from 'framer-motion';
import {
    ArrowDown,
    ArrowRight,
    Braces,
    CheckCircle2,
    ChevronDown,
    CircleGauge,
    FileCheck2,
    Fingerprint,
    Network,
    ShieldCheck,
} from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import Seo from '@/components/Seo';
import CapabilityMeshFallback from '@/components/platform/CapabilityMeshFallback';
import MetaFunctionFlow from '@/components/platform/MetaFunctionFlow';
import MetaFunctionDashboard from '@/components/platform/MetaFunctionDashboard';
import {
    ARCHITECTURE_STAGES,
    NAMESPACES,
} from '@/components/platform/platformData';
import {
    Badge,
    Button,
    Card,
    EvidenceChip,
    Rule,
    Section,
    SectionLabel,
} from '@/components/site/ui';

const MetaFunctionOrb = lazy(() => import('@/components/platform/MetaFunctionOrb'));

const DESCRIPTION =
    'See how the Citadel MetaFunction Fabric resolves named capabilities, applies authority policy, normalizes provider results and records evidence.';

const PLATFORM_LINKS = [
    { label: 'Execution flow', href: '#fabric' },
    { label: 'Capabilities', href: '#capabilities' },
    { label: 'Architecture', href: '#architecture' },
    { label: 'Dashboard', href: '#dashboard' },
    { label: 'Roadmap', href: '/roadmap' },
];

const NAMESPACE_TONES = {
    amber: 'border-t-[hsl(var(--amber))] text-amber-warm',
    violet: 'border-t-[hsl(var(--mf-violet))] text-[hsl(var(--mf-violet))]',
    teal: 'border-t-[hsl(var(--teal))] text-teal',
    blue: 'border-t-[hsl(var(--mf-blue))] text-[hsl(var(--mf-blue))]',
};

const fade = (delay, reduce) => ({
    initial: { opacity: 0, y: reduce ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.52, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] },
});

function HeroReceipt() {
    return (
        <div className="grid gap-px border border-foreground/70 bg-border sm:grid-cols-[1.1fr_0.9fr]">
            <div className="bg-card px-4 py-3">
                <p className="font-evidence text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Specimen request</p>
                <p className="mt-1.5 break-all font-evidence text-[10px] font-semibold">OBSERVE.DATADOG.SPANS</p>
            </div>
            <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                <div>
                    <p className="font-evidence text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Normalized result</p>
                    <p className="mt-1.5 font-evidence text-[10px] font-semibold text-teal">PASS · OBSERVED</p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-teal" aria-hidden="true" />
            </div>
        </div>
    );
}

function ArchitectureStage({ stage }) {
    return (
        <details className="group border-b border-border last:border-b-0">
            <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-start gap-4 px-4 py-5 marker:hidden sm:px-6">
                <span className="font-evidence text-[10px] font-semibold text-primary">{stage.number}</span>
                <span>
                    <span className="block font-display text-xl font-semibold">{stage.name}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{stage.summary}</span>
                </span>
                <ChevronDown className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <div className="grid gap-4 bg-secondary/35 px-4 py-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)] sm:px-6">
                <p className="text-sm leading-relaxed text-muted-foreground">{stage.detail}</p>
                <EvidenceChip icon={FileCheck2} tone="neutral">{stage.evidence}</EvidenceChip>
            </div>
        </details>
    );
}

export default function PlatformPage() {
    const reduce = useReducedMotion();

    return (
        <div
            id="top"
            className="min-h-screen bg-background text-foreground"
            style={{
                '--mf-violet': '268 42% 43%',
                '--mf-blue': '209 47% 43%',
            }}
        >
            <Helmet>
                <title>MetaFunction Fabric Platform | BuildAndDo</title>
                <meta name="description" content={DESCRIPTION} />
            </Helmet>
            <Seo title="MetaFunction Fabric Platform | BuildAndDo" description={DESCRIPTION} />
            <Header
                navLinks={PLATFORM_LINKS}
                ctaHref="#dashboard"
                ctaLabel="Open live preview"
            />

            <main>
                <section className="relative overflow-hidden border-b border-foreground/80 pt-14">
                    <div aria-hidden="true" className="absolute inset-0 bg-grid opacity-70" />
                    <div className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-12 lg:items-center lg:gap-12">
                        <div className="lg:col-span-5">
                            <motion.div {...fade(0, reduce)}>
                                <SectionLabel icon={Network}>The platform · MetaFunction Fabric</SectionLabel>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    <Badge tone="paper">Deterministic registry</Badge>
                                    <Badge tone="paper">Authority gated</Badge>
                                    <Badge tone="paper">Receipt native</Badge>
                                </div>
                            </motion.div>

                            <motion.h1
                                {...fade(0.08, reduce)}
                                className="mt-6 max-w-xl font-display text-5xl font-semibold leading-[0.94] tracking-[-0.035em] sm:text-6xl lg:text-[4.35rem]"
                            >
                                One governed fabric for every capability.
                            </motion.h1>
                            <motion.p
                                {...fade(0.16, reduce)}
                                className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
                            >
                                Guildmasters ask for outcomes by stable capability ID. The fabric resolves the provider, checks authority, normalizes the result and leaves an evidence trail.
                            </motion.p>

                            <motion.div {...fade(0.24, reduce)} className="mt-7 flex flex-col gap-3 sm:flex-row">
                                <Button href="#fabric" size="lg">
                                    Trace a request
                                    <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button href="#dashboard" variant="secondary" size="lg">
                                    Inspect dashboard
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </motion.div>

                            <motion.div {...fade(0.31, reduce)} className="mt-8 grid grid-cols-3 border-y border-border py-4">
                                {[
                                    ['01', 'Capability ID'],
                                    ['A1–A9', 'Authority'],
                                    ['PASS', 'Receipt state'],
                                ].map(([value, label]) => (
                                    <div key={label} className="border-r border-border px-3 first:pl-0 last:border-r-0 last:pr-0">
                                        <p className="font-evidence text-sm font-semibold">{value}</p>
                                        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                                    </div>
                                ))}
                            </motion.div>
                        </div>

                        <motion.div {...fade(0.22, reduce)} className="lg:col-span-7">
                            <Suspense fallback={<CapabilityMeshFallback />}>
                                <MetaFunctionOrb />
                            </Suspense>
                            <HeroReceipt />
                        </motion.div>
                    </div>
                </section>

                <Section id="fabric" className="bg-background" containerClassName="max-w-7xl">
                    <div className="mb-9 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(19rem,0.55fr)] md:items-end">
                        <div>
                            <SectionLabel icon={Fingerprint}>How the fabric works</SectionLabel>
                            <h2 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                                Intent enters. Evidence leaves.
                            </h2>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Eight explicit boundaries keep provider choice, credentials and authority effects out of the Guildmaster’s reasoning loop.
                        </p>
                    </div>
                    <MetaFunctionFlow />
                </Section>

                <Rule double />

                <Section id="capabilities" className="bg-secondary/25">
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)]">
                        <div>
                            <SectionLabel icon={Braces}>Capability namespace</SectionLabel>
                            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight">Authority is visible before execution.</h2>
                            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                                Every namespace declares what it can do and the minimum authority envelope it can cross. Reads and mutations never look identical.
                            </p>
                            <Card className="mt-6 p-4">
                                <p className="font-evidence text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Capability grammar</p>
                                <p className="mt-2 break-all font-evidence text-xs font-semibold">NAMESPACE.PROVIDER.OPERATION</p>
                            </Card>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {NAMESPACES.map((namespace, index) => (
                                <motion.article
                                    key={namespace.id}
                                    initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.25 }}
                                    transition={{ duration: reduce ? 0 : 0.35, delay: reduce ? 0 : index * 0.035 }}
                                    className={`border border-t-2 border-border bg-card p-4 ${NAMESPACE_TONES[namespace.tone]}`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-evidence text-xs font-semibold tracking-[0.08em]">{namespace.id}</span>
                                        <span className="border border-current px-1.5 py-0.5 font-evidence text-[9px]">{namespace.authority}</span>
                                    </div>
                                    <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{namespace.purpose}</p>
                                </motion.article>
                            ))}
                        </div>
                    </div>
                </Section>

                <Section id="architecture">
                    <div className="mx-auto max-w-4xl">
                        <div className="text-center">
                            <SectionLabel icon={CircleGauge} className="justify-center">Architecture deep dive</SectionLabel>
                            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Four contracts, one receipt chain.</h2>
                            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                Expand each contract to see what it guarantees before the next stage can proceed.
                            </p>
                        </div>
                        <Card className="mt-9 border-foreground/70">
                            {ARCHITECTURE_STAGES.map((stage) => (
                                <ArchitectureStage key={stage.name} stage={stage} />
                            ))}
                        </Card>
                    </div>
                </Section>

                <Section id="dashboard" className="border-y border-foreground/80 bg-secondary/30" containerClassName="max-w-7xl">
                    <div className="mb-9 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(19rem,0.55fr)] md:items-end">
                        <div>
                            <SectionLabel icon={ShieldCheck}>Capability operations</SectionLabel>
                            <h2 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">A control surface that states what it knows.</h2>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            The preview uses a fixed public specimen dataset. Production provider health remains on private, authenticated operational surfaces.
                        </p>
                    </div>
                    <MetaFunctionDashboard />
                </Section>

                <section className="bg-foreground text-background">
                    <div className="mx-auto grid max-w-6xl gap-7 px-4 py-14 sm:px-6 sm:py-16 md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                            <p className="font-evidence text-[10px] uppercase tracking-[0.2em] text-background/60">From observation to proof</p>
                            <h2 className="mt-3 max-w-3xl font-display text-3xl font-semibold sm:text-4xl">See the same evidence discipline inside the workspace.</h2>
                        </div>
                        <Button
                            href="/app"
                            variant="outlinePaper"
                            size="lg"
                            className="border-background/55 text-background hover:bg-background/10"
                        >
                            Open workspace
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </section>
            </main>

            <Footer productLinks={PLATFORM_LINKS} earlyAccessHref="/#early-access" />
        </div>
    );
}
