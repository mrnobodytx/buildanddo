// CGRF: SRS=SRS-BUILDANDDO-PURPOSE-001 | CAPS=B | Seat=C-ONE
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
    Activity,
    Search,
    Loader2,
    Globe,
    AlertCircle,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    Building2,
    Info,
} from 'lucide-react';
import { Button, PaperCard, Badge, SectionLabel } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{2,63})+$/i;

// Illustrative demo search results. These are NOT live DNS / website / SEO
// findings — they are labeled demo data so the selection flow is usable
// before a real domain-search service (e.g. Firecrawl) is connected.
const DEMO_RESULTS = [
    {
        domain: 'lunastudio.example',
        label: 'Luna Studio — a study project site',
        hint: 'Illustrative result · Demo data',
    },
    {
        domain: 'harborcuts.example',
        label: 'Harbor Cuts — barbershop',
        hint: 'Illustrative result · Demo data',
    },
    {
        domain: 'brightpathconsulting.example',
        label: 'Bright Path Consulting',
        hint: 'Illustrative result · Demo data',
    },
];

const PLANNED_SERVICES = [
    {
        name: 'Firecrawl',
        purpose: 'Controlled website and web-content extraction for domain discovery and research.',
        data_boundary: 'Only fetches public web pages you target. No credentials stored.',
        next_action: 'Add API key in Operations to enable live domain research.',
    },
    {
        name: 'n8n',
        purpose: 'Workflow orchestration for repeatable business automations.',
        data_boundary: 'Runs workflows you define. Credentials live in your n8n instance.',
        next_action: 'Connect your self-hosted n8n URL in Operations.',
    },
    {
        name: 'Supabase',
        purpose: 'Self-hosted authentication, database, storage, and workspace data layer.',
        data_boundary: 'Holds workspace data you own. Keys stay in your instance.',
        next_action: 'Point BuildAndDo at your Supabase project in Operations.',
    },
    {
        name: 'Mautic',
        purpose: 'Self-hosted marketing automation and campaign workflows.',
        data_boundary: 'Sends campaigns to your audiences. Contacts stay in Mautic.',
        next_action: 'Connect your Mautic base URL in Operations.',
    },
    {
        name: 'Twenty',
        purpose: 'Self-hosted CRM and customer relationship records.',
        data_boundary: 'Customer records live in your Twenty instance.',
        next_action: 'Connect your Twenty instance in Operations.',
    },
    {
        name: 'Tutorial system',
        purpose: 'Guided onboarding, product education, and task-based learning.',
        data_boundary: 'Read-only lessons and your per-user progress.',
        next_action: 'Already available — browse Tutorials any time.',
    },
    {
        name: 'ERP system',
        purpose: 'Operational records, processes, and resource workflows for a workspace.',
        data_boundary: 'Objectives, tasks, and contacts for this workspace.',
        next_action: 'Start recording objectives in the ERP workspace.',
    },
];

export default function OnboardingPage() {
    const navigate = useNavigate();
    const { refresh } = useWorkspace();
    const [query, setQuery] = useState('');
    const [phase, setPhase] = useState('search'); // search | results | noresults | invalid | selected
    const [selected, setSelected] = useState(null);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    const runSearch = (e) => {
        e?.preventDefault();
        const q = query.trim().toLowerCase();
        if (!q) {
            setPhase('search');
            return;
        }
        if (!DOMAIN_RE.test(q)) {
            setPhase('invalid');
            return;
        }
        // Demo matching: filter the illustrative set by substring; fall back
        // to a generated illustrative entry so the flow is always usable.
        const matches = DEMO_RESULTS.filter(
            (r) =>
                r.domain.includes(q) ||
                r.label.toLowerCase().includes(q),
        );
        if (matches.length > 0) {
            setPhase('results');
            // store matches in a ref-like state
            setResults(matches);
        } else {
            setResults([
                {
                    domain: q,
                    label: q,
                    hint: 'Illustrative result · Demo data (no live lookup performed)',
                },
            ]);
            setPhase('results');
        }
    };

    const [results, setResults] = useState([]);

    const chooseDomain = (entry) => {
        setSelected(entry);
        setPhase('selected');
    };

    const chooseNoWebsite = () => {
        setSelected({ domain: null, label: 'No website yet', hint: 'Continue without a website' });
        setPhase('selected');
    };

    const createWorkspace = async () => {
        if (creating) return;
        setCreating(true);
        setCreateError('');
        try {
            const ownerId = pb.authStore.record.id;
            // 1. Domain record (or skip if no website).
            let domainId = null;
            if (selected.domain) {
                const domainRec = await pb.collection('domains').create({
                    domain: selected.domain,
                    status: 'selected',
                    has_website: true,
                    owner: ownerId,
                });
                domainId = domainRec.id;
            }
            // 2. Workspace around the domain.
            const wsName = selected.domain
                ? selected.domain.split('.')[0].replace(/-/g, ' ')
                : 'My project';
            const ws = await pb.collection('workspaces').create({
                name: wsName.charAt(0).toUpperCase() + wsName.slice(1),
                domain: domainId,
                owner: ownerId,
            });
            // 3. Seed the 7 planned service cards for this workspace.
            await Promise.all(
                PLANNED_SERVICES.map((s, i) =>
                    pb.collection('services').create(
                        {
                            name: s.name,
                            purpose: s.purpose,
                            data_boundary: s.data_boundary,
                            status: s.name === 'Tutorial system' ? 'connected' : 'planned',
                            next_action: s.next_action,
                            workspace: ws.id,
                            owner: ownerId,
                        },
                        { requestKey: `seed-service-${i}` },
                    ),
                ),
            );
            await refresh();
            navigate('/app');
        } catch (err) {
            console.error('onboarding create failed', err);
            setCreateError(
                err?.response?.message ||
                    'We couldn\u2019t create your workspace. Please try again.',
            );
            setCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>Set up your workspace · BuildAndDo</title>
                <meta
                    name="description"
                    content="Choose the domain or project BuildAndDo should understand. A found domain is only marked for analysis — not ownership or access."
                />
            </Helmet>
            <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                        <Activity className="h-4 w-4" strokeWidth={2.4} />
                    </span>
                    <span className="font-display text-lg font-semibold tracking-tight">
                        BuildAndDo
                    </span>
                </div>

                <div className="mt-10">
                    <SectionLabel>Onboarding · Step 1 of 1</SectionLabel>
                    <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                        Which project should BuildAndDo understand?
                    </h1>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        A workspace is where you and your guild do the work.
                        Search for or enter the domain of the project you want
                        to learn on — your own site, a study project, or a real
                        objective. You’ll explicitly choose one before we
                        continue, and choosing a domain only marks it for
                        analysis, not ownership or access.
                    </p>
                </div>

                <PaperCard className="mt-8 p-6 sm:p-7">
                    {/* Search */}
                    <form onSubmit={runSearch} className="space-y-3">
                        <Label htmlFor="ob-domain" className="text-paper-fg">
                            Domain or project name
                        </Label>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="relative flex-1">
                                <Search
                                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-muted"
                                    aria-hidden="true"
                                />
                                <Input
                                    id="ob-domain"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="e.g. lunastudio.example"
                                    className="h-11 border-paper bg-paper-subtle pl-9 text-paper-fg placeholder:text-paper-muted/70 focus-visible:border-[hsl(var(--paper-foreground)/0.4)]"
                                    aria-describedby="ob-domain-help"
                                />
                            </div>
                            <Button
                                type="submit"
                                variant="ink"
                                size="lg"
                                disabled={creating}
                            >
                                <Search className="h-4 w-4" />
                                Search
                            </Button>
                        </div>
                        <p
                            id="ob-domain-help"
                            className="flex items-start gap-1.5 text-xs leading-relaxed text-paper-muted"
                        >
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Demo data only — no live DNS, website, traffic, or
                            SEO lookup is performed until a search service is
                            connected.
                        </p>
                    </form>

                    {/* States */}
                    {phase === 'invalid' && (
                        <div
                            className="mt-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                            role="alert"
                        >
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            That doesn’t look like a valid domain (e.g.
                            <span className="mx-1 font-mono">yourproject.com</span>
                            ). Try again.
                        </div>
                    )}

                    {phase === 'noresults' && (
                        <div className="mt-5 rounded-md border border-paper bg-paper-subtle p-4 text-sm text-paper-muted">
                            No illustrative matches for{' '}
                            <span className="font-medium text-paper-fg">
                                {query}
                            </span>
                            . You can still enter it directly, or continue
                            without a website.
                        </div>
                    )}

                    {phase === 'results' && (
                        <div className="mt-6">
                            <p className="text-xs font-semibold uppercase tracking-wider text-paper-muted">
                                Results
                            </p>
                            <ul className="mt-3 space-y-2.5">
                                {results.map((r) => (
                                    <li key={r.domain}>
                                        <button
                                            type="button"
                                            onClick={() => chooseDomain(r)}
                                            className="flex w-full items-center gap-3 rounded-md border border-paper bg-paper p-3 text-left transition-colors hover:bg-paper-subtle"
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-paper bg-paper-subtle text-paper-fg">
                                                <Globe className="h-4 w-4" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-medium text-paper-fg">
                                                    {r.label}
                                                </span>
                                                <span className="block truncate text-xs text-paper-muted">
                                                    {r.domain}
                                                </span>
                                            </span>
                                            <Badge tone="paper">{r.hint}</Badge>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {phase === 'selected' && (
                        <div className="mt-6">
                            <div className="flex items-start gap-3 rounded-md border border-[hsl(var(--teal))]/40 bg-[hsl(var(--teal))]/10 p-4">
                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal" />
                                <div className="text-sm">
                                    <p className="font-semibold text-paper-fg">
                                        Selected:{' '}
                                        {selected.domain || selected.label}
                                    </p>
                                    <p className="mt-1 text-paper-muted">
                                        This domain is marked for analysis
                                        only. A found domain is{' '}
                                        <strong>not</strong> an authorized
                                        domain — you’ll confirm ownership
                                        or authorization before any deeper
                                        analysis or actions run.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <Button
                                    variant="ink"
                                    size="lg"
                                    onClick={createWorkspace}
                                    disabled={creating}
                                    className="flex-1"
                                >
                                    {creating ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Creating workspace…
                                        </>
                                    ) : (
                                        <>
                                            Create workspace
                                            <ArrowRight className="h-4 w-4" />
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outlinePaper"
                                    size="lg"
                                    onClick={() => {
                                        setSelected(null);
                                        setPhase('search');
                                    }}
                                    disabled={creating}
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Choose again
                                </Button>
                            </div>
                            {createError && (
                                <p
                                    className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                                    role="alert"
                                >
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    {createError}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Always-available: continue without a website */}
                    {phase !== 'selected' && (
                        <div className="mt-6 border-t border-paper pt-5">
                            <p className="text-sm text-paper-muted">
                                No website yet?{' '}
                                <button
                                    type="button"
                                    onClick={chooseNoWebsite}
                                    className="font-semibold text-paper-fg underline-offset-2 hover:underline"
                                >
                                    Continue without a website
                                </button>
                            </p>
                        </div>
                    )}
                </PaperCard>

                <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    After this step, BuildAndDo creates a workspace profile
                    around your chosen domain and takes you to your dashboard —
                    starting empty, with clear next actions.
                </p>
            </div>
        </div>
    );
}
