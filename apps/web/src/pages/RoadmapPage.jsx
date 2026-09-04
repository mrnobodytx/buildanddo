import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Gauge, ArrowRight, Info, TrendingUp } from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import Seo from '@/components/Seo';
import { Section, SectionLabel, Card, StatePill, Button } from '@/components/site/ui';

const STATUSES = ['proposed', 'planned', 'in_progress', 'blocked', 'verified', 'archived'];

const FIELDS = [
    { label: 'Owner', value: 'The desk or person accountable.' },
    { label: 'Status', value: 'Proposed → Planned → In progress → Blocked → Verified → Archived.' },
    { label: 'Evidence link', value: 'A real record or receipt backing the item.' },
    { label: 'Timestamp', value: 'When the item was created and last updated.' },
    { label: 'Dependency', value: 'What must happen first.' },
    { label: 'Next action', value: 'The concrete step that moves it forward.' },
];

/**
 * 21-day development sprint — planned trajectory.
 * Each milestone is a planned deliverable, not a verified result.
 * The curve is a plan, not telemetry: it shows intended cumulative
 * completion, with minor variance drawn only to read as a market plot.
 */
const SPRINT_DAYS = 21;

const MILESTONES = [
    { day: 1, title: 'Sprint kickoff — foundations', status: 'planned', value: 5 },
    { day: 3, title: 'Auth & onboarding hardening', status: 'planned', value: 12 },
    { day: 5, title: 'Workspace collections live', status: 'planned', value: 20 },
    { day: 7, title: 'Signals pipeline MVP', status: 'planned', value: 30 },
    { day: 9, title: 'Missions — bounded-action engine', status: 'planned', value: 40 },
    { day: 11, title: 'Workflows editor', status: 'planned', value: 50 },
    { day: 13, title: 'Service connectors (Firecrawl, n8n)', status: 'planned', value: 60 },
    { day: 15, title: 'ERP foundation', status: 'planned', value: 70 },
    { day: 17, title: 'Evidence ledger & verification', status: 'planned', value: 80 },
    { day: 19, title: 'Daily edition & specialist desks', status: 'planned', value: 88 },
    { day: 21, title: 'Sprint review — verified replay', status: 'planned', value: 100 },
];

// Full per-day trajectory: milestones plus interpolated working days,
// with small downward ticks to read like a market plot. Plan only.
const TRAJECTORY = (() => {
    const pts = [];
    for (let d = 1; d <= SPRINT_DAYS; d += 1) {
        const ms = MILESTONES.find((m) => m.day === d);
        if (ms) {
            pts.push({ day: d, value: ms.value, milestone: true });
        } else {
            // interpolate between surrounding milestones
            const prev = [...MILESTONES].reverse().find((m) => m.day < d);
            const next = MILESTONES.find((m) => m.day > d);
            const base = prev.value + ((next.value - prev.value) * (d - prev.day)) / (next.day - prev.day);
            // small deterministic wiggle (plan variance, not real data)
            const wiggle = ((d * 7) % 5) - 2;
            pts.push({ day: d, value: Math.max(0, Math.round(base + wiggle)), milestone: false });
        }
    }
    return pts;
})();

const CHART_W = 1040;
const CHART_H = 440;
const PAD_L = 64;
const PAD_R = 32;
const PAD_T = 36;
const PAD_B = 52;

const xFor = (day) => PAD_L + ((day - 1) / (SPRINT_DAYS - 1)) * (CHART_W - PAD_L - PAD_R);
const yFor = (value) => PAD_T + (1 - value / 100) * (CHART_H - PAD_T - PAD_B);

function MarketPlot({ activeDay, onHover }) {
    const linePath = TRAJECTORY.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.day).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${xFor(SPRINT_DAYS).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(1).toFixed(1)} ${yFor(0).toFixed(1)} Z`;

    const yTicks = [0, 25, 50, 75, 100];
    const xTicks = [1, 5, 9, 13, 17, 21];

    return (
        <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="block h-auto w-full"
            role="img"
            aria-label="Planned 21-day development sprint trajectory, plotted as a market-style line chart."
        >
            {/* paper background */}
            <rect x="0" y="0" width={CHART_W} height={CHART_H} fill="hsl(var(--card))" />

            {/* grid */}
            {yTicks.map((t) => (
                <g key={`y${t}`}>
                    <line x1={PAD_L} y1={yFor(t)} x2={CHART_W - PAD_R} y2={yFor(t)} stroke="hsl(var(--border))" strokeWidth="1" />
                    <text x={PAD_L - 10} y={yFor(t) + 4} textAnchor="end" className="font-evidence" fontSize="11" fill="hsl(var(--muted-foreground))">
                        {t}
                    </text>
                </g>
            ))}
            {xTicks.map((t) => (
                <g key={`x${t}`}>
                    <line x1={xFor(t)} y1={PAD_T} x2={xFor(t)} y2={CHART_H - PAD_B} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 4" />
                    <text x={xFor(t)} y={CHART_H - PAD_B + 20} textAnchor="middle" className="font-evidence" fontSize="11" fill="hsl(var(--muted-foreground))">
                        D{t}
                    </text>
                </g>
            ))}

            {/* axis labels */}
            <text x={PAD_L - 44} y={PAD_T - 14} className="font-evidence" fontSize="10" fill="hsl(var(--muted-foreground))" letterSpacing="1.5">
                % PLAN
            </text>
            <text x={CHART_W - PAD_R} y={CHART_H - PAD_B + 20} textAnchor="end" className="font-evidence" fontSize="10" fill="hsl(var(--muted-foreground))" letterSpacing="1.5">
                SPRINT DAY →
            </text>

            {/* area fill */}
            <path d={areaPath} fill="hsl(var(--primary) / 0.06)" stroke="none" />

            {/* trajectory line */}
            <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {/* milestone markers */}
            {MILESTONES.map((m) => {
                const x = xFor(m.day);
                const y = yFor(m.value);
                const isActive = activeDay === m.day;
                return (
                    <g
                        key={m.day}
                        onMouseEnter={() => onHover(m.day)}
                        onMouseLeave={() => onHover(null)}
                        style={{ cursor: 'pointer' }}
                    >
                        {isActive && <circle cx={x} cy={y} r="9" fill="hsl(var(--primary) / 0.18)" />}
                        <circle cx={x} cy={y} r="4.5" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2" />
                        <text x={x} y={y - 12} textAnchor="middle" className="font-evidence" fontSize="10" fill="hsl(var(--foreground))">
                            D{m.day}
                        </text>
                    </g>
                );
            })}

            {/* working-day dots */}
            {TRAJECTORY.filter((p) => !p.milestone).map((p) => (
                <circle key={p.day} cx={xFor(p.day)} cy={yFor(p.value)} r="1.6" fill="hsl(var(--muted-foreground) / 0.5)" />
            ))}

            {/* frame */}
            <rect x="0.5" y="0.5" width={CHART_W - 1} height={CHART_H - 1} fill="none" stroke="hsl(var(--foreground) / 0.7)" strokeWidth="1" />
        </svg>
    );
}

export default function RoadmapPage() {
    const [activeDay, setActiveDay] = useState(null);
    const activeMilestone = useMemo(
        () => MILESTONES.find((m) => m.day === activeDay) || null,
        [activeDay],
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>BuildAndDo — 21-day development sprint roadmap</title>
                <meta
                    name="description"
                    content="BuildAndDo's roadmap plotted as an old-school market chart: a planned 21-day development sprint with milestone markers. Every milestone is a plan, not a verified result — Verified still requires an evidence record."
                />
            </Helmet>
            <Seo
                title="BuildAndDo — 21-day development sprint roadmap"
                description="A planned 21-day development sprint plotted as a market-style chart with milestone markers. Plans, not verified results."
                siteName="BuildAndDo"
                type="website"
            />

            <Header />

            <div className="rule-double" />
            <Section className="py-14 sm:py-20">
                <SectionLabel icon={Gauge}>Operational Roadmap</SectionLabel>
                <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                    A 21-day sprint, plotted like a market chart.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    BuildAndDo&rsquo;s near-term roadmap is a planned development
                    sprint, drawn as an old-school stock-market plot. Each marker
                    is a milestone in the sprint. The curve is a plan, not
                    telemetry — it shows intended cumulative completion, not real
                    results. An item is never marked Verified from a prompt
                    alone; Verified still requires an evidence record.
                </p>

                <div className="mt-8 flex flex-wrap gap-2">
                    {STATUSES.map((s) => <StatePill key={s} state={s} />)}
                </div>
            </Section>

            {/* Market plot */}
            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <SectionLabel icon={TrendingUp}>Dev trajectory · planned</SectionLabel>
                        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            21-day sprint — milestone plot
                        </h2>
                    </div>
                    <div className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            BND · SPRINT 01 · PLAN
                    </div>
                </div>

                <Card className="mt-6 overflow-hidden p-0">
                    <MarketPlot activeDay={activeDay} onHover={setActiveDay} />
                </Card>

                {/* ticker / readout strip */}
                <div className="mt-4 border border-border bg-secondary/40 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <span>SPRINT 01</span>
                        <span>· 21 DAYS</span>
                        <span>· {MILESTONES.length} MILESTONES</span>
                        <span>· STATUS: PLANNED</span>
                        <span className="text-primary">· CURVE = PLAN, NOT RESULTS</span>
                    </div>
                </div>

                {/* active milestone readout */}
                <div className="mt-4 min-h-[3.5rem]">
                    {activeMilestone ? (
                        <Card className="flex flex-wrap items-center gap-3 p-4">
                            <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-primary">
                Day {activeMilestone.day}
                            </span>
                            <span className="font-display text-lg font-semibold">{activeMilestone.title}</span>
                            <StatePill state={activeMilestone.status} />
                            <span className="font-evidence text-[11px] text-muted-foreground">
                planned completion {activeMilestone.value}%
                            </span>
                        </Card>
                    ) : (
                        <p className="px-1 text-sm text-muted-foreground">
              Hover or tap a milestone marker on the chart to read its
              planned deliverable.
                        </p>
                    )}
                </div>
            </Section>

            {/* Milestone ledger */}
            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <SectionLabel>Milestone ledger</SectionLabel>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Every milestone, with provenance fields.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          No invented results, no fake progress bars, no illustrative dates
          presented as real. If a field is unknown, it says Unknown.
                </p>

                <Card className="mt-6 divide-y divide-border">
                    {MILESTONES.map((m) => (
                        <div key={m.day} className="grid grid-cols-12 items-center gap-3 p-4">
                            <div className="col-span-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-primary sm:col-span-1">
                D{m.day}
                            </div>
                            <div className="col-span-7 text-sm font-medium sm:col-span-8">{m.title}</div>
                            <div className="col-span-3 flex items-center justify-end gap-2">
                                <span className="font-evidence text-[11px] text-muted-foreground">{m.value}%</span>
                                <StatePill state={m.status} />
                            </div>
                        </div>
                    ))}
                </Card>
            </Section>

            {/* Provenance fields reference */}
            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <div className="grid gap-8 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <SectionLabel>What each item contains</SectionLabel>
                        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Full provenance, by default.
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No invented milestones, no fake progress bars, no illustrative
            dates presented as real. If a field is unknown, it says Unknown.
                        </p>
                    </div>
                    <div className="lg:col-span-7">
                        <Card className="divide-y divide-border">
                            {FIELDS.map((f) => (
                                <div key={f.label} className="flex gap-4 p-4">
                                    <p className="w-32 shrink-0 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                        {f.label}
                                    </p>
                                    <p className="text-sm text-foreground/90">{f.value}</p>
                                </div>
                            ))}
                        </Card>
                    </div>
                </div>
            </Section>

            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <Card className="p-8 text-center">
                    <p className="font-display text-xl font-semibold">
            The live, editable roadmap lives in your workspace.
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Verified milestones appear once they are backed by evidence
            records. This public chart is the planned sprint, not a record
            of completed work.
                    </p>
                    <div className="mt-5 flex justify-center gap-2">
                        <Link to="/app/roadmap"><Button size="sm">Open workspace roadmap <ArrowRight className="h-4 w-4" /></Button></Link>
                        <Link to="/signup"><Button variant="secondary" size="sm">Create account</Button></Link>
                    </div>
                </Card>
            </Section>

            <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 pb-10 text-xs leading-relaxed text-muted-foreground/70 sm:px-6">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        The curve on this page is a planned sprint trajectory, not verified
        results or live telemetry. BuildAndDo does not present illustrative
        numbers as real; no cost markers or growth metrics are shown.
            </p>

            <Footer />
        </div>
    );
}
