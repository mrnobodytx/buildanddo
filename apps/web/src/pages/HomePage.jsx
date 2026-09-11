// CGRF: SRS=SRS-BUILDANDDO-WORKSPACE-001 | CAPS=B | Seat=C-ONE
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
    AlertCircle,
    CheckCircle2,
    Newspaper,
    Scale,
    Lock,
    CircleSlash,
} from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import EarlyAccess from '@/components/site/EarlyAccess';
import Faq, { FAQ_ITEMS } from '@/components/site/Faq';
import Seo from '@/components/Seo';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { PURPOSE, pageTitle } from '@/lib/purpose';
import {
    Button,
    Section,
    SectionLabel,
    Card,
    Rule,
    StatePill,
    ProvenanceTag,
} from '@/components/site/ui';

const DESCRIPTION = PURPOSE.description;
const TITLE = pageTitle();

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
        applicationCategory: 'EducationalApplication',
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
                        {PURPOSE.tagline} A daily record of what learners and
                        guilds actually did, with the evidence behind it.
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

/* ---- Front-page hero (honest) ------------------------------------------- */
function FrontPageHero() {
    const { isAuthed } = useAuth();
    return (
        <Section className="py-12 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-7">
                    <SectionLabel icon={Newspaper}>Front Page</SectionLabel>
                    <h2 className="mt-3 font-display text-3xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
                        {PURPOSE.headline}
                    </h2>
                    <p className="drop-cap mt-5 max-w-xl text-base leading-relaxed text-foreground/90 sm:text-lg">
                        {PURPOSE.subhead} This front page is a daily edition
                        built only from records you and your guild create.
                        Nothing here is invented: when real work is recorded,
                        this page reports what changed, proposes a bounded
                        next step, and records whether it was verified — with
                        a receipt you can inspect.
                    </p>
                    <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                        Until then, every section below shows its true state:
                        not connected, empty, or pending. That is the product
                        working correctly.
                    </p>

                    <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                        <Button href="#challenge-desk" size="lg">
                            Take on a challenge
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button href="#evidence-ledger" variant="secondary" size="lg">
                            View a verified replay
                        </Button>
                        <Button href="#daily-edition" variant="secondary" size="lg">
                            See today&rsquo;s edition
                        </Button>
                    </div>
                </div>

                <div className="lg:col-span-5">
                    <Card className="h-full p-5">
                        <div className="flex items-center justify-between">
                            <SectionLabel icon={Gauge}>Account state</SectionLabel>
                            <StatePill state={isAuthed ? 'active' : 'not-connected'} />
                        </div>
                        <Rule className="my-4" />
                        <dl className="space-y-3 font-evidence text-[12px] leading-relaxed text-muted-foreground">
                            <div className="flex justify-between gap-3">
                                <dt>Authenticated</dt>
                                <dd className="text-foreground">{isAuthed ? 'Yes' : 'No'}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt>Connected sources</dt>
                                <dd className="text-foreground">0</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt>Verified events today</dt>
                                <dd className="text-foreground">0</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt>Edition generated</dt>
                                <dd className="text-foreground">No — awaiting verified events</dd>
                            </div>
                        </dl>
                        <Rule className="my-4" />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            {isAuthed
                                ? 'Open your workspace to connect a source and generate the first edition.'
                                : 'Create an account or sign in to connect a source. No data is shown until a real source returns records.'}
                        </p>
                        {isAuthed ? (
                            <Button href="/app" size="sm" className="mt-4 w-full">
                                Open workspace
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <div className="mt-4 flex gap-2">
                                <Link to="/signup" className="flex-1">
                                    <Button size="sm" className="w-full">Create account</Button>
                                </Link>
                                <Link to="/login" className="flex-1">
                                    <Button variant="secondary" size="sm" className="w-full">Sign in</Button>
                                </Link>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </Section>
    );
}

/* ---- Your Business at a Glance ------------------------------------------ */
function GlanceMetric({ icon: Icon, label, value, source, timestamp, freshness, state, nextAction }) {
    return (
        <Card className="flex flex-col p-5">
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    <Icon className="h-4 w-4" strokeWidth={2.1} />
                    {label}
                </span>
                <StatePill state={state} />
            </div>
            <p className="mt-3 font-display text-3xl font-bold tracking-tight">{value}</p>
            <div className="mt-3">
                <ProvenanceTag source={source} timestamp={timestamp} freshness={freshness} />
            </div>
            {nextAction && (
                <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Next step:</span>{' '}
                    {nextAction}
                </p>
            )}
        </Card>
    );
}

function BusinessAtAGlance() {
    const { isAuthed } = useAuth();
    const next = isAuthed
        ? 'Connect a source in the Operations Desk to begin receiving records.'
        : 'Create an account, then connect a source in the Operations Desk.';
    return (
        <Section id="glance" className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="flex items-end justify-between">
                <div>
                    <SectionLabel icon={Gauge}>Your Work at a Glance</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Only data supplied by connected sources.
                    </h2>
                </div>
                <span className="hidden font-evidence text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
                    Section A
                </span>
            </div>
            <Rule className="my-6" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <GlanceMetric
                    icon={Radar}
                    label="Signals today"
                    value="—"
                    state="not-connected"
                    nextAction={next}
                />
                <GlanceMetric
                    icon={Target}
                    label="Active missions"
                    value="—"
                    state="not-connected"
                    nextAction={next}
                />
                <GlanceMetric
                    icon={BadgeCheck}
                    label="Verified outcomes"
                    value="—"
                    state="not-connected"
                    nextAction={next}
                />
                <GlanceMetric
                    icon={Gauge}
                    label="Support revenue"
                    value="—"
                    state="not-connected"
                    nextAction="Connect Patreon, Ko-fi, Stripe, or GoFundMe in Support & Revenue."
                />
            </div>
            <p className="mt-5 font-evidence text-[11px] leading-relaxed text-muted-foreground">
                Every metric displays its source, timestamp, freshness, and
                state. A connection alone is never reported as a donation,
                payment, or result.
            </p>
        </Section>
    );
}

/* ---- Challenge Desk ----------------------------------------------------- */
function ChallengeDesk() {
    const { isAuthed } = useAuth();
    const { active } = useWorkspace();
    const [problem, setProblem] = useState('');
    const [status, setStatus] = useState('idle'); // idle | saving | saved | error
    const [savedId, setSavedId] = useState('');

    const canSubmit = isAuthed && active;

    const submit = async (e) => {
        e.preventDefault();
        if (!canSubmit || !problem.trim() || status === 'saving') return;
        setStatus('saving');
        try {
            const rec = await pb.collection('challenge_submissions').create({
                problem: problem.trim(),
                status: 'submitted',
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setSavedId(rec.id);
            setStatus('saved');
            setProblem('');
        } catch (err) {
            console.error('challenge submit failed', err);
            setStatus('error');
        }
    };

    return (
        <Section id="challenge-desk" className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-4">
                    <SectionLabel icon={Send}>Challenge Desk</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Describe a real problem you want to learn to solve.
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        Your submission is preserved exactly as written and
                        recorded as a user-provided input. BuildAndDo shows
                        processing status — it does not invent an analysis or
                        a result.
                    </p>
                </div>
                <div className="lg:col-span-8">
                    <Card className="p-5">
                        {!canSubmit ? (
                            <div className="flex flex-col items-start gap-3 py-6">
                                <span className="flex h-9 w-9 items-center justify-center border border-border bg-secondary text-muted-foreground">
                                    <Lock className="h-4 w-4" />
                                </span>
                                <p className="text-sm text-muted-foreground">
                                    {isAuthed
                                        ? 'Set up a workspace to submit a challenge.'
                                        : 'Sign in to submit a challenge. Submissions are stored on your account.'}
                                </p>
                                <div className="flex gap-2">
                                    {isAuthed ? (
                                        <Button href="/onboarding" size="sm">Set up workspace</Button>
                                    ) : (
                                        <>
                                            <Link to="/login"><Button size="sm">Sign in</Button></Link>
                                            <Link to="/signup"><Button variant="secondary" size="sm">Create account</Button></Link>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={submit} className="space-y-4">
                                <label htmlFor="challenge" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Your challenge
                                </label>
                                <textarea
                                    id="challenge"
                                    value={problem}
                                    onChange={(e) => setProblem(e.target.value)}
                                    rows={5}
                                    maxLength={2000}
                                    placeholder="e.g. I want to ship a small service with tests and a real deploy, and I don't know where to start."
                                    className="w-full resize-y border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-foreground focus:outline-none"
                                />
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="font-evidence text-[11px] text-muted-foreground">
                                        {problem.length}/2000 · stored as user-provided
                                    </span>
                                    <Button type="submit" size="sm" disabled={status === 'saving' || !problem.trim()}>
                                        {status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Submit challenge
                                    </Button>
                                </div>
                                {status === 'saved' && (
                                    <p className="flex items-start gap-2 border-t border-border pt-3 text-sm text-success" role="status">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                        Saved as a user-provided input. Receipt:{' '}
                                        <span className="font-evidence">{savedId}</span>. Status: processing.
                                    </p>
                                )}
                                {status === 'error' && (
                                    <p className="flex items-start gap-2 border-t border-border pt-3 text-sm text-destructive" role="alert">
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                        Could not save the challenge. Please try again.
                                    </p>
                                )}
                            </form>
                        )}
                    </Card>
                </div>
            </div>
        </Section>
    );
}

/* ---- Evidence Ledger ---------------------------------------------------- */
function EvidenceLedger() {
    return (
        <Section id="evidence-ledger" className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="flex items-end justify-between">
                <div>
                    <SectionLabel icon={Scale}>Evidence Ledger</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Every claim carries a receipt.
                    </h2>
                </div>
                <span className="hidden font-evidence text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
                    Section B
                </span>
            </div>
            <Rule className="my-6" />
            <Card className="p-5">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center border border-border bg-secondary text-muted-foreground">
                        <CircleSlash className="h-4 w-4" />
                    </span>
                    <div>
                        <p className="font-display text-lg font-semibold">No evidence records yet.</p>
                        <p className="text-sm text-muted-foreground">
                            The ledger populates only after observed facts,
                            proposed actions, approvals, and verified results
                            exist. No receipt, hash, score, prediction, or
                            result is ever fabricated.
                        </p>
                    </div>
                </div>
                <Rule className="my-4" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                        'Observed fact',
                        'Source + confidence',
                        'Proposed action',
                        'Approval status',
                        'Result',
                        'Verifier status',
                        'Rollback state',
                        'Receipt / reference',
                    ].map((field) => (
                        <div key={field} className="border border-dashed border-border p-3">
                            <p className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                {field}
                            </p>
                            <p className="mt-1 font-evidence text-[12px] text-muted-foreground/70">
                                —
                            </p>
                        </div>
                    ))}
                </div>
            </Card>
        </Section>
    );
}

/* ---- Corrections & Verification ----------------------------------------- */
function Corrections() {
    return (
        <Section id="corrections" className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-4">
                    <SectionLabel icon={Scale}>Corrections &amp; Verification</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        We publish when we were wrong.
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        A correction appears only when the system has an actual
                        prior prediction and a later observed result to compare
                        it against.
                    </p>
                </div>
                <div className="lg:col-span-8">
                    <Card className="p-8 text-center">
                        <p className="font-display text-xl font-semibold">No verified corrections yet.</p>
                        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                            Corrections are recorded automatically once a
                            prediction is checked against an observed outcome.
                        </p>
                    </Card>
                </div>
            </div>
        </Section>
    );
}

/* ---- Daily Edition ------------------------------------------------------ */
function DailyEdition() {
    return (
        <Section id="daily-edition" className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="flex items-end justify-between">
                <div>
                    <SectionLabel icon={Newspaper}>Daily Edition</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Today&rsquo;s intelligence, when it exists.
                    </h2>
                </div>
                <span className="hidden font-evidence text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:block">
                    Section C
                </span>
            </div>
            <Rule className="my-6" />
            <Card className="p-8 text-center">
                <p className="font-display text-xl font-semibold">
                    The first edition will appear after the system receives
                    verified events.
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    No sample headlines. The Daily Edition is generated from
                    real daily intelligence and report records in your
                    workspace.
                </p>
            </Card>
        </Section>
    );
}

/* ---- Field Manual ------------------------------------------------------- */
function FieldManual() {
    const { isAuthed } = useAuth();
    return (
        <Section id="field-manual" className="border-t border-foreground/80 py-12 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-4">
                    <SectionLabel icon={BookOpen}>Field Manual</SectionLabel>
                    <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Real lessons, from real records.
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        The Field Manual links to tutorial and wiki records that
                        exist in your workspace. Nothing is listed here that
                        hasn&rsquo;t been created.
                    </p>
                </div>
                <div className="lg:col-span-8">
                    <Card className="p-8 text-center">
                        <p className="font-display text-xl font-semibold">The catalog is empty.</p>
                        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                            {isAuthed
                                ? 'Open the Field Manual in your workspace to add the first lesson.'
                                : 'Sign in and set up a workspace to build the Field Manual.'}
                        </p>
                        {isAuthed && (
                            <Button href="/app/tutorials" size="sm" className="mt-4">
                                Open Field Manual
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        )}
                    </Card>
                </div>
            </div>
        </Section>
    );
}

export default function HomePage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>{TITLE}</title>
                <meta name="description" content={DESCRIPTION} />
                {structuredData.map((data, i) => (
                    <script key={i} type="application/ld+json">
                        {JSON.stringify(data)}
                    </script>
                ))}
            </Helmet>
            <Seo
                title={TITLE}
                description={DESCRIPTION}
                siteName="BuildAndDo"
                type="website"
            />

            <Header />
            <main id="main-content" tabIndex={-1} className="pt-14 outline-none">
                <Masthead />
                <FrontPageHero />
                <BusinessAtAGlance />
                <ChallengeDesk />
                <EvidenceLedger />
                <Corrections />
                <DailyEdition />
                <FieldManual />
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
