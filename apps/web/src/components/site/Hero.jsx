import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Radar,
    MessageSquareText,
    Target,
    BadgeCheck,
    ArrowRight,
    ArrowDown,
    Check,
} from 'lucide-react';
import {
    Button,
    Badge,
    StatusDot,
    PaperCard,
    EvidenceChip,
} from '@/components/site/ui';

const fade = (delay = 0, reduce) => ({
    initial: { opacity: 0, y: reduce ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const FLOW = [
    {
        key: 'observe',
        icon: Radar,
        label: 'Observe',
        tone: 'amber',
        title: 'Friday no-shows rose to 25%',
        detail: 'Six unused slots over three weeks — about half a day of lost chair time.',
        chip: 'Signal log · 3 weeks',
    },
    {
        key: 'understand',
        icon: MessageSquareText,
        label: 'Understand',
        tone: 'violet',
        title: 'Long waits make cancellations likelier',
        detail: 'Known: booking records. Assumed: no Friday reminders were sent.',
        chip: 'Known vs assumed',
    },
    {
        key: 'act',
        icon: Target,
        label: 'Act',
        tone: 'violet',
        title: "Remind next Friday's 6 bookings",
        detail: 'Owner reviews the wording, then approves. Scope: this Friday only.',
        chip: 'Awaiting approval',
    },
    {
        key: 'verify',
        icon: BadgeCheck,
        label: 'Verify',
        tone: 'teal',
        title: '8 of 10 clients confirmed',
        detail: 'Two cancelled slots refilled from the waitlist within an hour.',
        chip: 'Recorded outcome',
    },
];

const TONE_DOT = { amber: 'amber', violet: 'violet', teal: 'teal' };
const TONE_TEXT = {
    amber: 'text-amber-warm',
    violet: 'text-primary',
    teal: 'text-teal',
};

function CockpitHero({ reduce }) {
    const [step, setStep] = useState(0);
    const current = FLOW[step];

    useEffect(() => {
        if (reduce) return undefined;
        const id = setInterval(() => {
            setStep((s) => (s + 1) % FLOW.length);
        }, 2800);
        return () => clearInterval(id);
    }, [reduce]);

    return (
        <PaperCard className="overflow-hidden shadow-[0_30px_70px_-30px_rgba(0,0,0,0.65)]">
            <div className="flex items-center gap-3 border-b border-paper bg-paper-subtle px-4 py-2.5">
                <div className="flex gap-1.5" aria-hidden="true">
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--paper-border))]" />
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--paper-border))]" />
                    <span className="h-2 w-2 rounded-full bg-[hsl(var(--paper-border))]" />
                </div>
                <p className="text-xs font-medium text-paper-muted">
                    BuildAndDo · Luna Nail Studio
                </p>
                <Badge tone="paper" className="ml-auto">
                    Illustrative demo
                </Badge>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-sm font-semibold text-paper-fg">
                        Mission · Reduce Friday no-shows
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-paper-muted">
                        <StatusDot tone="violet" pulse={!reduce} />
                        Live loop
                    </span>
                </div>

                {/* Compact stage rail */}
                <ol className="grid grid-cols-4 gap-1.5" aria-label="Mission stages">
                    {FLOW.map((stage, i) => {
                        const active = i === step;
                        const done = i < step;
                        return (
                            <li key={stage.key}>
                                <button
                                    type="button"
                                    onClick={() => setStep(i)}
                                    aria-pressed={active}
                                    className="flex w-full flex-col items-start gap-1.5 rounded-md border px-2 py-2 text-left transition-colors"
                                    style={{
                                        borderColor:
                                            active || done
                                                ? 'hsl(var(--paper-foreground) / 0.22)'
                                                : 'hsl(var(--paper-border))',
                                        background: active
                                            ? 'hsl(var(--paper))'
                                            : 'hsl(var(--paper-subtle))',
                                    }}
                                >
                                    <StatusDot
                                        tone={
                                            active || done
                                                ? TONE_DOT[stage.tone]
                                                : 'neutral'
                                        }
                                        pulse={active && !reduce}
                                    />
                                    <span
                                        className="truncate text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]"
                                        style={{
                                            color:
                                                active || done
                                                    ? 'hsl(var(--paper-foreground))'
                                                    : 'hsl(var(--paper-muted))',
                                        }}
                                    >
                                        {stage.label}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>

                {/* Single focused stage body — avoids duplicating the full demo */}
                <div
                    className="relative overflow-hidden rounded-md border border-paper bg-paper-subtle p-4"
                    role="region"
                    aria-live="polite"
                >
                    {/* traveling pulse on the connector under the rail */}
                    {!reduce && (
                        <span
                            aria-hidden="true"
                            className="animate-flow-pulse pointer-events-none absolute left-0 top-0 h-0.5 w-2 rounded-full bg-primary"
                        />
                    )}
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-paper bg-paper text-paper-fg">
                            <current.icon className="h-4 w-4" strokeWidth={2.1} />
                        </span>
                        <div className="min-w-0">
                            <p
                                className={`text-[11px] font-semibold uppercase tracking-wider ${TONE_TEXT[current.tone]}`}
                            >
                                {current.label}
                            </p>
                            <p className="font-display text-base font-semibold text-paper-fg sm:text-lg">
                                {current.title}
                            </p>
                        </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-paper-fg/90">
                        {current.detail}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        <EvidenceChip icon={Check}>{current.chip}</EvidenceChip>
                    </div>
                </div>

                <p className="text-[11px] leading-relaxed text-paper-muted">
                    Fictional sample for a fictional salon. Not a live integration or customer
                    result — open the demo below to step through the full mission.
                </p>
            </div>
        </PaperCard>
    );
}

export default function Hero() {
    const reduce = useReducedMotion();

    return (
        <section id="top" className="relative overflow-hidden pt-14">
            <div
                aria-hidden="true"
                className="bg-grid pointer-events-none absolute inset-0 opacity-60"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-primary/10 blur-[150px]"
            />

            <div className="relative mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:gap-10">
                <div className="lg:col-span-5">
                    <motion.div {...fade(0, reduce)}>
                        <Badge tone="violet">
                            <StatusDot tone="violet" pulse={!reduce} />
                            Early access · small-business operating help
                        </Badge>
                    </motion.div>

                    <motion.h1
                        {...fade(0.08, reduce)}
                        className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl"
                    >
                        Turn a business problem into a verified next step.
                    </motion.h1>

                    <motion.p
                        {...fade(0.16, reduce)}
                        className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
                    >
                        BuildAndDo helps small-business owners notice important changes,
                        understand them in plain language, create a bounded mission, and verify
                        what happened. You approve every step before anything runs.
                    </motion.p>

                    <motion.div
                        {...fade(0.24, reduce)}
                        className="mt-7 flex flex-col gap-3 sm:flex-row"
                    >
                        <Button href="#early-access" size="lg">
                            Join early access
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button href="#demo" variant="secondary" size="lg">
                            See the demo
                            <ArrowDown className="h-4 w-4" />
                        </Button>
                    </motion.div>

                    <motion.p
                        {...fade(0.32, reduce)}
                        className="mt-5 text-xs leading-relaxed text-muted-foreground/80"
                    >
                        No automation jargon. No black box. You stay in control of every action.
                    </motion.p>
                </div>

                <motion.div {...fade(0.3, reduce)} className="lg:col-span-7">
                    <CockpitHero reduce={reduce} />
                </motion.div>
            </div>
        </section>
    );
}
