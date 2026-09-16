// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/HomePage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js, apps/web/src/components/workspace/TutorialCatalog.jsx, apps/web/src/lib/workspaceSummary.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js; CONSUMES apps/web/src/components/workspace/TutorialCatalog.jsx; CONSUMES apps/web/src/lib/workspaceSummary.js
// DAG Node:    none
// Intent:      Project authenticated workspace records onto the front page with provenance, recoverable intake and no anonymous private reads.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
    ArrowRight,
    Gauge,
    Radar,
    Target,
    BadgeCheck,
    BookOpen,
    Send,
    Loader2,
    CheckCircle2,
    Newspaper,
    Scale,
    Lock,
} from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import EarlyAccess from '@/components/site/EarlyAccess';
import Faq, { FAQ_ITEMS } from '@/components/site/Faq';
import Seo from '@/components/Seo';
import EditorialStory from '@/components/motion/EditorialStory';
import ReadingProgress from '@/components/motion/ReadingProgress';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
import {
    DemoModeBanner,
    DegradedNotice,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useDemoMode } from '@/hooks/useDemoMode';
import { truncate } from '@/lib/format';
import {
    activeMissions,
    verifiedEvidence,
    isToday,
    latestPublishedEdition,
    verifiedCorrections,
    hasReportedRevenue,
    reportedMoney,
    recordTimestamp,
} from '@/lib/workspaceSummary';
import {
    Button,
    Section,
    SectionLabel,
    Card,
    Rule,
    StatePill,
    ProvenanceTag,
} from '@/components/site/ui';

const DESCRIPTION =
    'BuildAndDo is a business newspaper for your own operations. It tells you what changed, what to do next, and proves whether it worked — using only data from sources you connect. No mock metrics, no fabricated results.';

const structuredData = [
    {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'BuildAndDo',
        description: DESCRIPTION,
    },
    {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'BuildAndDo',
        description: DESCRIPTION,
    },
    {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'BuildAndDo',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: DESCRIPTION,
    },
    {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
    },
];

function todayLabel() {
    const d = new Date();
    return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function editionLabel() {
    const d = new Date();
    const iso = d.toISOString().slice(0, 10);
    return `Edition · ${iso}`;
}

/* ---- Masthead ----------------------------------------------------------- */
function Masthead() {
    return (
        <div className="border-b border-foreground/80 bg-background">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
                <div className="flex flex-col items-center py-5 text-center">
                    <p className="font-evidence text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                        {todayLabel()}
                    </p>
                    <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
                        BUILDANDDO
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        Your business changed today. BuildAndDo tells you what changed, what to do
                        next, and proves whether it worked.
                    </p>
                </div>
            </div>
            <div className="rule-double" />
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6">
                <span className="font-evidence text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {editionLabel()}
                </span>
                <span className="font-evidence text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Vol. I · No. 1
                </span>
            </div>
            <div className="rule-thin" />
        </div>
    );
}

/* ---- Workspace-backed front page --------------------------------------- */
function recordState(source) {
    if (!source) return 'sign-in required';
    if (source.loading) return 'loading';
    if (source.degraded) return 'unavailable';
    if (source.demo) return 'demonstration';
    return source.records.length ? 'recorded' : 'empty';
}

function countValue(source, count) {
    return source && !source.loading && !source.degraded ? count : '—';
}

function SourceState({ source, label, empty, emptyMessage, children }) {
    if (!source)
        return (
            <p className="text-sm text-muted-foreground">
                Choose a signed-in workspace to see {label}.
            </p>
        );
    if (source.loading) return <ListSkeleton label={`Loading ${label}…`} />;
    if (source.degraded)
        return (
            <DegradedNotice
                message={`Could not read ${label}. No empty result is assumed.`}
                onRetry={source.refresh}
            />
        );
    if (empty)
        return (
            <p className="text-sm text-muted-foreground">{emptyMessage || `No ${label} yet.`}</p>
        );
    return children;
}

function FrontPageHero({ sources }) {
    const { isAuthed } = useAuth();
    const verified = verifiedEvidence(sources.evidence?.records || []);
    const edition = latestPublishedEdition(sources.editions?.records || []);
    return (
        <Section className="py-12 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-7">
                    <SectionLabel icon={Newspaper}>Front Page</SectionLabel>
                    <h2 className="mt-3 font-display text-3xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
                        Your business, in its own words and records.
                    </h2>
                    <p className="drop-cap mt-5 max-w-xl text-base leading-relaxed text-foreground/90 sm:text-lg">
                        See what changed, review the next step, and inspect the evidence. This
                        edition draws from the same records as your workspace desks. Their sources
                        and recorded status stay attached.
                    </p>
                    <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                        Sign in to read your workspace edition. Unavailable data is labelled; an
                        empty workspace stays empty until you add real records.
                    </p>
                    <div className="mt-7 flex flex-wrap gap-3">
                        <Button href="#challenge-desk" size="lg">
                            Submit a business challenge
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button href="#evidence-ledger" variant="secondary" size="lg">
                            View evidence
                        </Button>
                        <Button href="#daily-edition" variant="secondary" size="lg">
                            Read the Daily Edition
                        </Button>
                    </div>
                </div>
                <div className="lg:col-span-5">
                    <Card className="h-full p-5">
                        <SectionLabel icon={Gauge}>Account state</SectionLabel>
                        <Rule className="my-4" />
                        <dl className="space-y-3 font-evidence text-xs leading-relaxed text-muted-foreground">
                            <div className="flex flex-wrap justify-between gap-3">
                                <dt>Authenticated</dt>
                                <dd className="text-foreground">{isAuthed ? 'Yes' : 'No'}</dd>
                            </div>
                            <div className="flex flex-wrap justify-between gap-3">
                                <dt>Sources marked connected</dt>
                                <dd className="text-foreground">
                                    {countValue(
                                        sources.services,
                                        sources.services?.records.filter(
                                            (record) => record.status === 'connected',
                                        ).length,
                                    )}
                                </dd>
                            </div>
                            <div className="flex flex-wrap justify-between gap-3">
                                <dt>Evidence marked verified today</dt>
                                <dd className="text-foreground">
                                    {countValue(
                                        sources.evidence,
                                        verified.filter((record) => isToday(record.created)).length,
                                    )}
                                </dd>
                            </div>
                            <div className="flex flex-wrap justify-between gap-3">
                                <dt>Published edition</dt>
                                <dd className="text-foreground">
                                    {countValue(
                                        sources.editions,
                                        edition
                                            ? recordTimestamp(
                                                  edition.edition_date || edition.created,
                                              )
                                            : 'None yet',
                                    )}
                                </dd>
                            </div>
                        </dl>
                        <Rule className="my-4" />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Connection status and verification labels describe saved records.
                            Inspect the desk for their supporting evidence.
                        </p>
                        <Button
                            href={isAuthed ? '/app' : '/signup'}
                            size="sm"
                            className="mt-4 w-full"
                        >
                            {isAuthed ? 'Open workspace' : 'Create account'}
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                    </Card>
                </div>
            </div>
        </Section>
    );
}

function GlanceMetric({ icon: Icon, label, source, count, href }) {
    const latest = source?.records[0];
    return (
        <Card className="flex min-w-0 flex-col p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {label}
                </h3>
                <StatePill state={recordState(source)} />
            </div>
            <p className="mt-3 font-display text-3xl font-bold tracking-tight">
                {countValue(source, count)}
            </p>
            <div className="mt-3">
                <ProvenanceTag
                    source={source ? label : undefined}
                    timestamp={
                        latest ? recordTimestamp(latest.updated || latest.created) : undefined
                    }
                    freshness={latest ? 'Latest record' : undefined}
                />
            </div>
            {source?.degraded && (
                <p className="mt-3 text-xs text-muted-foreground">
                    Data unavailable. Open the desk to retry.
                </p>
            )}
            <Button href={href} size="sm" variant="ghost" className="mt-auto justify-start pt-4">
                Open desk
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
        </Card>
    );
}

function BusinessAtAGlance({ sources }) {
    return (
        <Section id="glance" className="border-t border-foreground/80 py-12 sm:py-16">
            <SectionLabel icon={Gauge}>Your Business at a Glance</SectionLabel>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                From your workspace records.
            </h2>
            <Rule className="my-6" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <GlanceMetric
                    icon={Radar}
                    label="Signals today"
                    source={sources.signals}
                    count={
                        sources.signals?.records.filter((record) => isToday(record.created)).length
                    }
                    href="/app/signals"
                />
                <GlanceMetric
                    icon={Target}
                    label="Active missions"
                    source={sources.missions}
                    count={activeMissions(sources.missions?.records || []).length}
                    href="/app/missions"
                />
                <GlanceMetric
                    icon={BadgeCheck}
                    label="Evidence marked verified"
                    source={sources.evidence}
                    count={verifiedEvidence(sources.evidence?.records || []).length}
                    href="/app/evidence"
                />
                <GlanceMetric
                    icon={Gauge}
                    label="Revenue sources reporting"
                    source={sources.support}
                    count={
                        sources.support?.records.filter((record) => hasReportedRevenue(record))
                            .length
                    }
                    href="/app/support"
                />
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
                Today uses your local date. Revenue is listed separately below by source and
                currency; a pending connection is never counted as a payment.
            </p>
        </Section>
    );
}

function ChallengeForm({ challenges }) {
    const [problem, setProblem] = useState('');
    const [receipt, setReceipt] = useState(null);
    const pending = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const submit = async (event) => {
        event.preventDefault();
        if (pending.current || challenges.demo || !problem.trim()) return;
        pending.current = true;
        setReceipt(null);
        try {
            const result = await challenges.create({
                problem: problem.trim(),
                status: 'submitted',
            });
            if (mounted.current && result.ok) {
                setReceipt(result.record);
                setProblem('');
            }
        } finally {
            pending.current = false;
        }
    };
    return (
        <form onSubmit={submit} className="space-y-4">
            <label htmlFor="challenge" className="block text-sm font-semibold">
                Your business challenge
            </label>
            <textarea
                id="challenge"
                value={problem}
                onChange={(event) => {
                    setProblem(event.target.value);
                    setReceipt(null);
                }}
                rows={5}
                maxLength={2000}
                required
                disabled={challenges.saving || challenges.demo}
                placeholder="e.g. Friday appointment no-shows are rising and I don't know why."
                className="w-full resize-y border border-border bg-background px-3 py-2 text-base text-foreground"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-evidence text-xs text-muted-foreground">
                    {problem.length}/2000 · stored as user-provided
                </span>
                <Button
                    type="submit"
                    size="sm"
                    disabled={challenges.saving || challenges.demo || !problem.trim()}
                >
                    {challenges.saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <Send className="h-4 w-4" aria-hidden="true" />
                    )}
                    Submit challenge
                </Button>
            </div>
            {challenges.demo && (
                <p className="text-sm text-muted-foreground">
                    Turn off demonstration mode to submit a real challenge.
                </p>
            )}
            <WriteErrorNotice
                message={challenges.writeError}
                onDismiss={challenges.clearWriteError}
            />
            {receipt && (
                <div role="status" className="space-y-2 border-t border-border pt-3 text-sm">
                    <p className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                        Challenge saved. Receipt:{' '}
                        <span className="break-all font-evidence">{receipt.id}</span>
                    </p>
                    <StatePill state={receipt.status || 'saved'} />
                </div>
            )}
        </form>
    );
}

function ChallengeDesk({ challenges }) {
    const { isAuthed } = useAuth();
    return (
        <Section id="challenge-desk" className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-4">
                    <SectionLabel icon={Send}>Challenge Desk</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Describe a real business problem.
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        Save an input to your active workspace and follow its recorded status here.
                        Submitting a challenge does not start an automation or create a verified
                        result.
                    </p>
                    <Button href="/app/missions" size="sm" variant="secondary" className="mt-4">
                        Plan a mission
                    </Button>
                </div>
                <div className="min-w-0 space-y-5 lg:col-span-8">
                    <Card className="p-5">
                        {challenges ? (
                            <ChallengeForm challenges={challenges} />
                        ) : (
                            <div className="space-y-4 py-4">
                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    {isAuthed
                                        ? 'Open or set up a workspace before submitting a challenge.'
                                        : 'Sign in to submit a challenge to your workspace.'}
                                </p>
                                <Button href={isAuthed ? '/app' : '/login'} size="sm">
                                    {isAuthed ? 'Open workspace' : 'Sign in'}
                                </Button>
                            </div>
                        )}
                    </Card>
                    <div>
                        <h3 className="mb-3 font-display text-lg font-semibold">
                            Recent challenges
                        </h3>
                        <SourceState
                            source={challenges}
                            label="challenge submissions"
                            empty={!challenges?.records.length}
                        >
                            <ul className="space-y-3">
                                {challenges?.records.slice(0, 5).map((record) => (
                                    <li key={record.id}>
                                        <details className="border border-border p-4">
                                            <summary className="cursor-pointer font-semibold">
                                                {truncate(record.problem, 100)}
                                            </summary>
                                            <p className="mt-3 whitespace-pre-wrap text-sm">
                                                {record.problem}
                                            </p>
                                            {record.context && (
                                                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                                                    {record.context}
                                                </p>
                                            )}
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <StatePill state={record.status} />
                                                <span className="text-xs text-muted-foreground">
                                                    {recordTimestamp(record.created)}
                                                </span>
                                            </div>
                                            <p className="mt-2 break-all font-evidence text-xs text-muted-foreground">
                                                Receipt: {record.id}
                                            </p>
                                        </details>
                                    </li>
                                ))}
                            </ul>
                        </SourceState>
                    </div>
                </div>
            </div>
        </Section>
    );
}

function PreviewSection({ id, label, title, icon, href, source, empty, emptyMessage, children }) {
    return (
        <Section id={id} className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <SectionLabel icon={icon}>{label}</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        {title}
                    </h2>
                </div>
                <Button href={href} size="sm" variant="secondary">
                    Open {label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
            </div>
            <Rule className="my-6" />
            <SourceState
                source={source}
                label={label.toLowerCase() + ' records'}
                empty={empty}
                emptyMessage={emptyMessage}
            >
                {children}
            </SourceState>
        </Section>
    );
}

function EvidenceLedger({ evidence }) {
    return (
        <PreviewSection
            id="evidence-ledger"
            label="Evidence Ledger"
            title="Every claim carries its source."
            icon={Scale}
            href="/app/evidence"
            source={evidence}
            empty={!evidence?.records.length}
        >
            <ul className="grid gap-4 sm:grid-cols-2">
                {evidence?.records.slice(0, 4).map((record) => (
                    <li key={record.id} className="min-w-0">
                        <Card className="h-full space-y-3 p-5">
                            <StatePill state={record.type} />
                            <h3 className="font-display text-lg font-semibold">
                                {record.title || truncate(record.content, 100)}
                            </h3>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                {truncate(record.content, 400)}
                            </p>
                            <ProvenanceTag
                                source={record.source || 'No source recorded'}
                                timestamp={recordTimestamp(record.created)}
                            />
                            <p className="break-all font-evidence text-xs text-muted-foreground">
                                Receipt: {record.id}
                            </p>
                        </Card>
                    </li>
                ))}
            </ul>
        </PreviewSection>
    );
}

function Corrections({ corrections }) {
    const records = verifiedCorrections(corrections?.records || []);
    return (
        <PreviewSection
            id="corrections"
            label="Corrections"
            title="A prediction, checked against an outcome."
            icon={Scale}
            href="/app/corrections"
            source={corrections}
            empty={records.length === 0}
            emptyMessage="No complete, verified corrections are available yet."
        >
            <ul className="space-y-4">
                {records.slice(0, 3).map((record) => (
                    <li key={record.id}>
                        <Card className="space-y-3 p-5">
                            <StatePill state={record.status} />
                            <dl className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                                        Prior prediction
                                    </dt>
                                    <dd className="mt-2 whitespace-pre-wrap text-sm">
                                        {record.prior_prediction}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                                        Observed result
                                    </dt>
                                    <dd className="mt-2 whitespace-pre-wrap text-sm">
                                        {record.observed_result}
                                    </dd>
                                </div>
                            </dl>
                            <ProvenanceTag
                                source={record.reference || 'Workspace correction'}
                                timestamp={recordTimestamp(record.updated || record.created)}
                            />
                        </Card>
                    </li>
                ))}
            </ul>
        </PreviewSection>
    );
}

function DailyEdition({ editions }) {
    const edition = latestPublishedEdition(editions?.records || []);
    return (
        <PreviewSection
            id="daily-edition"
            label="Daily Edition"
            title="The latest published workspace edition."
            icon={Newspaper}
            href="/app/edition"
            source={editions}
            empty={!edition}
            emptyMessage="Publish an edition in the workspace to read it here."
        >
            {edition && (
                <article className="space-y-4 border border-border p-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <StatePill state={edition.status} />
                        <span className="text-xs text-muted-foreground">
                            {recordTimestamp(edition.edition_date || edition.created)}
                        </span>
                    </div>
                    <h3 className="font-display text-2xl font-semibold">{edition.title}</h3>
                    {edition.summary && (
                        <p className="leading-relaxed text-muted-foreground">{edition.summary}</p>
                    )}
                    {edition.body && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {truncate(edition.body, 900)}
                        </p>
                    )}
                    <Button href="/app/edition" variant="secondary" size="sm">
                        Read full edition
                    </Button>
                </article>
            )}
        </PreviewSection>
    );
}

function SupportRevenue({ support }) {
    return (
        <PreviewSection
            id="support-revenue"
            label="Support & Revenue"
            title="Reported amounts, source by source."
            icon={Gauge}
            href="/app/support"
            source={support}
            empty={!support?.records.length}
        >
            <ul className="grid gap-4 sm:grid-cols-2">
                {support?.records.map((record) => (
                    <li key={record.id} className="min-w-0">
                        <Card className="space-y-4 p-5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="font-display text-xl font-semibold">
                                    {record.provider}
                                </h3>
                                <StatePill state={record.status} />
                            </div>
                            {hasReportedRevenue(record) ? (
                                <>
                                    <dl className="space-y-2 text-sm">
                                        {[
                                            ['Gross', reportedMoney(record.gross, record.currency)],
                                            [
                                                'Platform fees',
                                                reportedMoney(
                                                    record.platform_fees,
                                                    record.currency,
                                                ),
                                            ],
                                            [
                                                'Refunds',
                                                reportedMoney(record.refunds, record.currency),
                                            ],
                                            [
                                                'Payout status',
                                                record.payout_status || 'Not reported',
                                            ],
                                            [
                                                'Period starts',
                                                recordTimestamp(record.date_range_start),
                                            ],
                                            ['Period ends', recordTimestamp(record.date_range_end)],
                                        ].map(([label, value]) => (
                                            <div
                                                key={label}
                                                className="flex flex-wrap justify-between gap-3"
                                            >
                                                <dt className="text-muted-foreground">{label}</dt>
                                                <dd>{value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                    <ProvenanceTag
                                        source={record.provider}
                                        timestamp={recordTimestamp(record.last_sync)}
                                        freshness="Last reported sync"
                                    />
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No synced amount is available. A connection request is not a
                                    payment record.
                                </p>
                            )}
                        </Card>
                    </li>
                ))}
            </ul>
        </PreviewSection>
    );
}

function FieldManual() {
    return (
        <Section id="field-manual" className="border-t border-foreground/80 py-12 sm:py-16">
            <SectionLabel icon={BookOpen}>Field Manual</SectionLabel>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                The same lessons, wherever you start.
            </h2>
            <p className="mb-6 mt-3 text-sm text-muted-foreground">
                Read the catalogue and update your saved progress here, in Docs, or in your
                workspace.
            </p>
            <div className="mb-6 flex flex-wrap items-center gap-4"><Button href="/classrooms" variant="secondary">Learn together in Classrooms</Button><p className="text-sm text-muted-foreground">Shared lessons, questions and workspace sessions.</p></div>
            <TutorialCatalog limit={4} />
        </Section>
    );
}

function EditionContent({ sources = {} }) {
    return (
        <>
            <FrontPageHero sources={sources} />
            <BusinessAtAGlance sources={sources} />
            <ChallengeDesk challenges={sources.challenges} />
            <EvidenceLedger evidence={sources.evidence} />
            <Corrections corrections={sources.corrections} />
            <DailyEdition editions={sources.editions} />
            <SupportRevenue support={sources.support} />
            <FieldManual />
        </>
    );
}

function WorkspaceEdition() {
    const { active, workspaces, setActive } = useWorkspace();
    const signals = useWorkspaceRecords('signals', { sort: '-created' });
    const missions = useWorkspaceRecords('missions', { sort: '-created' });
    const evidence = useWorkspaceRecords('evidence', { sort: '-created' });
    const services = useWorkspaceRecords('services', { sort: '-updated' });
    const editions = useWorkspaceRecords('daily_editions', { sort: '-edition_date,-created' });
    const corrections = useWorkspaceRecords('corrections', { sort: '-created' });
    const support = useWorkspaceRecords('support_sources', { sort: '-last_sync' });
    const challenges = useWorkspaceRecords('challenge_submissions', { sort: '-created' });
    const sources = {
        signals,
        missions,
        evidence,
        services,
        editions,
        corrections,
        support,
        challenges,
    };
    return (
        <div data-dd-privacy="mask" className="ph-no-capture">
            <Section className="border-b border-border py-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <label
                            htmlFor="home-workspace"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                            Your workspace edition
                        </label>
                        <select
                            id="home-workspace"
                            value={active.id}
                            onChange={(event) => setActive(event.target.value)}
                            className="min-h-11 w-full max-w-md border border-border bg-background px-3 py-2 text-base"
                        >
                            {workspaces.map((workspace) => (
                                <option key={workspace.id} value={workspace.id}>
                                    {workspace.name}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-xs text-muted-foreground">
                            These records are visible to your signed-in account.
                        </p>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={Object.values(sources).some((source) => source.loading)}
                        onClick={() => {
                            Object.values(sources).forEach((source) => source.refresh());
                        }}
                    >
                        Refresh workspace data
                    </Button>
                </div>
                <DemoModeBanner />
            </Section>
            <EditionContent sources={sources} />
        </div>
    );
}

function HomeEdition() {
    const { isAuthed, user } = useAuth();
    const { active, loading, error, refresh } = useWorkspace();
    const { demo } = useDemoMode();
    // Mount a fresh data/form tree for each account, workspace and demo mode.
    // Late responses and drafts from the old tree cannot appear in this one.
    if (isAuthed && user?.id && active && !loading && !error) {
        return <WorkspaceEdition key={`${user.id}:${active.id}:${demo}`} />;
    }
    return (
        <>
            {isAuthed && (
                <Section className="border-b border-border py-5">
                    {loading ? (
                        <ListSkeleton label="Loading your workspaces…" />
                    ) : error ? (
                        <DegradedNotice message={error} onRetry={refresh} />
                    ) : (
                        <div className="flex flex-wrap items-center gap-4">
                            <p className="text-sm text-muted-foreground">
                                Create a workspace to start your business edition.
                            </p>
                            <Button href="/onboarding" size="sm">
                                Set up workspace
                            </Button>
                        </div>
                    )}
                </Section>
            )}
            <EditionContent />
        </>
    );
}

export default function HomePage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>BuildAndDo — your business, as a daily verified edition</title>
                <meta name="description" content={DESCRIPTION} />
                {structuredData.map((data, i) => (
                    <script key={i} type="application/ld+json">
                        {JSON.stringify(data)}
                    </script>
                ))}
            </Helmet>
            <Seo
                title="BuildAndDo — your business, as a daily verified edition"
                description={DESCRIPTION}
                siteName="BuildAndDo"
                type="website"
            />

            <Header />
            <main id="main-content" tabIndex={-1}>
                <Masthead />
                <ReadingProgress className="mx-auto max-w-6xl px-4" />
                <HomeEdition />
                <EditorialStory />
                <EarlyAccess />
                <Faq />
                <div className="mx-auto max-w-6xl px-4 pb-4 text-center text-[10px] text-muted-foreground/40 sm:px-6">
                    <p className="font-evidence uppercase tracking-[0.14em]">Version log</p>
                    <ul className="mt-1 space-y-0.5">
                        <li>v3 — self-hosted deploy pipeline proof (2026-09-07)</li>
                        <li>v2 — edit-proof-20260907b</li>
                        <li>v1 — edit-proof-20260907</li>
                    </ul>
                </div>
            </main>
            <Footer />
        </div>
    );
}
