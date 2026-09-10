import React, { useCallback, useEffect, useState } from 'react';
import {
    Plus,
    Loader2,
    AlertCircle,
    Info,
    Plug,
    CalendarDays,
    ExternalLink,
    GitMerge,
    GitPullRequest,
    Trophy,
    Users,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords, useRecords } from '@/hooks/useWorkspaceRecords';
import { reportAction } from '@/lib/observability/runtime';
import EmptyState from '@/components/workspace/EmptyState';
import { PageHeader, StatCard } from '@/components/workspace/workspaceHelpers';
import ProgressionPipeline from '@/components/workspace/ProgressionPipeline';
import { Badge, Button, Card, StatePill } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PLATFORMS = [
    { key: 'discord', label: 'Discord', note: 'Community server connection and health.' },
    { key: 'youtube', label: 'YouTube', note: 'Video channel.' },
    { key: 'x', label: 'X', note: 'Posts and engagement.' },
    { key: 'linkedin', label: 'LinkedIn', note: 'Professional posts.' },
    { key: 'instagram', label: 'Instagram', note: 'Visual posts.' },
    { key: 'tiktok', label: 'TikTok', note: 'Short video.' },
    { key: 'bluesky', label: 'Bluesky', note: 'Posts and engagement.' },
];

const REPO_SLUG = import.meta.env.VITE_BUILDANDDO_REPO || 'mrnobodytx/buildanddo';
const REPO_URL = `https://github.com/${REPO_SLUG}`;

const ACTOR_LABELS = [
    {
        label: 'actor:human',
        tone: 'violet',
        meaning:
            'A person wrote the change. Exactly one actor label is required on every pull request, and CI fails the governance check without it.',
    },
    {
        label: 'actor:agent',
        tone: 'teal',
        meaning:
            'An agent seat wrote the change under a dispatch. The seat identity, not the account it authenticated as, is what the label attributes it to.',
    },
    {
        label: 'actor:mixed',
        tone: 'amber',
        meaning:
            'Both. Use this rather than picking the more flattering one — the label is provenance, not credit.',
    },
];

const RISK_TIERS = [
    {
        tier: 'A0',
        tone: 'neutral',
        meaning: 'Documentation, templates, or governance text. No runtime effect.',
    },
    {
        tier: 'A1',
        tone: 'violet',
        meaning: 'Application code against existing collections. No schema, no shared state.',
    },
    {
        tier: 'A2',
        tone: 'amber',
        meaning: 'Schema migration or CI pipeline change. Reviewed by a maintainer who knows both.',
    },
    {
        tier: 'A3',
        tone: 'red',
        meaning:
            'Mutates shared or staging state, or beyond. Needs explicit human approval before work starts — never a first contribution.',
    },
];

function timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

/**
 * Reads open and recently merged pull requests from the public GitHub API.
 *
 * Unauthenticated on purpose: this page never holds a token. The API allows a
 * limited number of anonymous calls per address, so a failure here is expected
 * rather than exceptional — the caller degrades to a link instead of retrying.
 */
async function fetchPublicPulls() {
    const base = `https://api.github.com/repos/${REPO_SLUG}/pulls`;
    const [openRes, closedRes] = await Promise.all([
        fetch(`${base}?state=open&per_page=10&sort=updated&direction=desc`),
        fetch(`${base}?state=closed&per_page=20&sort=updated&direction=desc`),
    ]);
    if (!openRes.ok || !closedRes.ok) {
        throw new Error(`github responded ${openRes.status}/${closedRes.status}`);
    }
    const [open, closed] = await Promise.all([openRes.json(), closedRes.json()]);
    const shape = (pull) => ({
        id: pull.id,
        number: pull.number,
        title: pull.title,
        url: pull.html_url,
        author: pull.user?.login || 'unknown',
        labels: (pull.labels || []).map((l) => l.name),
        draft: Boolean(pull.draft),
        updatedAt: pull.updated_at,
        mergedAt: pull.merged_at || null,
    });
    return {
        open: (Array.isArray(open) ? open : []).map(shape),
        merged: (Array.isArray(closed) ? closed : [])
            .map(shape)
            .filter((p) => p.mergedAt)
            .slice(0, 8),
    };
}

function ContributorHub() {
    const {
        records: contributors,
        loading: leaderboardLoading,
    } = useRecords('contributors', { sort: '-merged_prs' });
    const [pulls, setPulls] = useState({ open: [], merged: [] });
    const [pullsState, setPullsState] = useState('loading');

    useEffect(() => {
        reportAction('community.dashboard_viewed', { repo: REPO_SLUG });
    }, []);

    const loadPulls = useCallback(async () => {
        setPullsState('loading');
        try {
            setPulls(await fetchPublicPulls());
            setPullsState('ready');
        } catch (err) {
            console.error('read public pull requests failed', err);
            setPulls({ open: [], merged: [] });
            setPullsState('unavailable');
        }
    }, []);

    useEffect(() => {
        loadPulls();
    }, [loadPulls]);

    const openPrLink = (pull, position) => {
        reportAction('community.pr_link_clicked', {
            pr_number: pull.number,
            position,
            repo: REPO_SLUG,
        });
    };

    const unavailableNotice = (
        <Card className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                    GitHub did not return pull request data. The request is
                    unauthenticated by design, so anonymous rate limiting is the usual
                    cause. Nothing is cached and nothing is guessed.
                </p>
                <Button variant="secondary" size="sm" href={`${REPO_URL}/pulls`} target="_blank" rel="noreferrer">
                    Open on GitHub
                    <ExternalLink className="h-4 w-4" />
                </Button>
            </div>
        </Card>
    );

    return (
        <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    icon={GitPullRequest}
                    label="Open pull requests"
                    value={pullsState === 'ready' ? pulls.open.length : '—'}
                    hint={pullsState === 'ready' ? `From ${REPO_SLUG}` : 'GitHub data unavailable'}
                    tone="violet"
                />
                <StatCard
                    icon={GitMerge}
                    label="Recent merges"
                    value={pullsState === 'ready' ? pulls.merged.length : '—'}
                    hint={pullsState === 'ready' ? 'Most recently updated first' : 'GitHub data unavailable'}
                    tone="teal"
                />
                <StatCard
                    icon={Users}
                    label="Recorded contributors"
                    value={contributors.length}
                    hint={contributors.length ? 'From the contributors collection' : 'No contributor rows yet'}
                    tone="neutral"
                />
                <StatCard
                    icon={Trophy}
                    label="Merged, all contributors"
                    value={contributors.reduce((sum, c) => sum + (c.merged_prs || 0), 0)}
                    hint="Counted from recorded rows, not from GitHub"
                    tone="amber"
                />
            </div>

            {/* Active pull requests */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-semibold tracking-tight">
                        Active pull requests
                    </h2>
                    <a
                        href={`${REPO_URL}/pulls`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        View all
                    </a>
                </div>
                {pullsState === 'loading' ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </Card>
                ) : pullsState === 'unavailable' ? (
                    unavailableNotice
                ) : pulls.open.length === 0 ? (
                    <EmptyState
                        icon={GitPullRequest}
                        title="Nothing open right now"
                        description="Open pull requests appear here as soon as they exist. Pick a good first issue or a workspace page enhancement and this list stops being empty."
                        action={
                            <Button
                                variant="secondary"
                                size="sm"
                                href={`${REPO_URL}/issues`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Browse issues
                                <ExternalLink className="h-4 w-4" />
                            </Button>
                        }
                    />
                ) : (
                    <ul className="space-y-2.5">
                        {pulls.open.map((pull) => (
                            <li key={pull.id}>
                                <Card className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <a
                                                href={pull.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={() => openPrLink(pull, 'active')}
                                                className="text-sm font-medium underline-offset-4 hover:underline"
                                            >
                                                #{pull.number} {pull.title}
                                            </a>
                                            <p className="mt-0.5 font-evidence text-[11px] text-muted-foreground">
                                                {pull.author} · updated {timeAgo(pull.updatedAt)}
                                            </p>
                                        </div>
                                        <StatePill state={pull.draft ? 'proposed' : 'active'} />
                                    </div>
                                    {pull.labels.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {pull.labels.map((label) => (
                                                <Badge key={label} tone="neutral">
                                                    {label}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Leaderboard */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Contribution leaderboard
                </h2>
                {leaderboardLoading ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </Card>
                ) : contributors.length === 0 ? (
                    <EmptyState
                        icon={Trophy}
                        title="No contributors recorded yet"
                        description="The leaderboard reads the contributors collection. It is deliberately empty rather than seeded — an invented contribution history would be the exact kind of fake data this product refuses to render."
                    />
                ) : (
                    <ol className="space-y-2.5">
                        {contributors.map((c, index) => (
                            <li key={c.id}>
                                <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                                    <span className="font-evidence text-[11px] text-muted-foreground">
                                        {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium">
                                            {c.display_name || c.handle}
                                        </p>
                                        <p className="mt-0.5 font-evidence text-[11px] text-muted-foreground">
                                            {c.handle}
                                            {c.last_contribution_at
                                                ? ` · last ${timeAgo(c.last_contribution_at)}`
                                                : ''}
                                        </p>
                                    </div>
                                    <Badge
                                        tone={
                                            c.actor_type === 'agent'
                                                ? 'teal'
                                                : c.actor_type === 'mixed'
                                                    ? 'amber'
                                                    : 'violet'
                                        }
                                    >
                                        {c.actor_type}
                                    </Badge>
                                    <dl className="flex gap-4 text-xs text-muted-foreground">
                                        <div>
                                            <dt className="uppercase tracking-wider">Merged</dt>
                                            <dd className="font-evidence text-foreground">
                                                {c.merged_prs || 0}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="uppercase tracking-wider">Reviews</dt>
                                            <dd className="font-evidence text-foreground">
                                                {c.reviews || 0}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="uppercase tracking-wider">Pages</dt>
                                            <dd className="font-evidence text-foreground">
                                                {c.pages_enhanced || 0}
                                            </dd>
                                        </div>
                                    </dl>
                                </Card>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            {/* Progression pipeline */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Progression pipeline
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    The path every change walks, from an idea nobody has written down to a
                    release real users load. Steps marked with a pipeline tag are checked
                    automatically; the rest depend on a person doing the work.
                </p>
                <ProgressionPipeline />
            </section>

            {/* Labels and risk tiers */}
            <section className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                    <h2 className="font-display text-lg font-semibold tracking-tight">
                        Actor labels
                    </h2>
                    <ul className="space-y-2.5">
                        {ACTOR_LABELS.map((item) => (
                            <li key={item.label}>
                                <Card className="p-4">
                                    <Badge tone={item.tone}>{item.label}</Badge>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                        {item.meaning}
                                    </p>
                                </Card>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="space-y-3">
                    <h2 className="font-display text-lg font-semibold tracking-tight">
                        Risk tiers
                    </h2>
                    <ul className="space-y-2.5">
                        {RISK_TIERS.map((item) => (
                            <li key={item.tier}>
                                <Card className="p-4">
                                    <Badge tone={item.tone}>{item.tier}</Badge>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                        {item.meaning}
                                    </p>
                                </Card>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* Recent merges */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Recent merges
                </h2>
                {pullsState === 'loading' ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </Card>
                ) : pullsState === 'unavailable' ? (
                    unavailableNotice
                ) : pulls.merged.length === 0 ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground">
                        No merged pull requests in the pages GitHub returned.
                    </Card>
                ) : (
                    <ul className="space-y-2.5">
                        {pulls.merged.map((pull) => (
                            <li key={pull.id}>
                                <Card className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <a
                                                href={pull.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={() => openPrLink(pull, 'recent_merge')}
                                                className="text-sm font-medium underline-offset-4 hover:underline"
                                            >
                                                #{pull.number} {pull.title}
                                            </a>
                                            <p className="mt-0.5 font-evidence text-[11px] text-muted-foreground">
                                                {pull.author} · merged {timeAgo(pull.mergedAt)}
                                            </p>
                                        </div>
                                        <StatePill state="verified" />
                                    </div>
                                    <p className="mt-3 border-t border-border/60 pt-2.5 text-xs leading-relaxed text-muted-foreground">
                                        Acceptance evidence for a merge lives in the pull
                                        request body under the template&apos;s verification
                                        section. Open the pull request to read what was
                                        actually checked — this page does not restate it,
                                        because a restatement is not evidence.
                                    </p>
                                </Card>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function SocialTab() {
    const { active } = useWorkspace();
    const { records: channels, loading: chLoading, refresh: refreshCh } = useWorkspaceRecords('social_channels');
    const { records: content, loading: coLoading, refresh: refreshCo } = useWorkspaceRecords('social_content', { sort: '-created' });
    const [busy, setBusy] = useState('');
    const [show, setShow] = useState(false);
    const [form, setForm] = useState({ title: '', body: '', status: 'draft', channel: '', scheduled_for: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const byPlatform = (key) => channels.find((c) => c.platform === key);

    const connect = async (key) => {
        if (!active) return;
        setBusy(key); setError('');
        try {
            const existing = byPlatform(key);
            if (existing) {
                await pb.collection('social_channels').update(existing.id, { status: 'pending' });
            } else {
                await pb.collection('social_channels').create({
                    platform: key, status: 'pending',
                    workspace: active.id, owner: pb.authStore.record.id,
                });
            }
            refreshCh();
        } catch (err) {
            setError(err?.response?.message || 'Could not update the channel.');
        }
        setBusy('');
    };

    const set = (f, v) => setForm((p) => ({ ...p, [f]: v }));

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active || !form.title.trim()) return;
        setSaving(true); setError('');
        try {
            await pb.collection('social_content').create({
                title: form.title.trim(),
                body: form.body.trim(),
                status: form.status,
                channel: form.channel.trim(),
                scheduled_for: form.scheduled_for || null,
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ title: '', body: '', status: 'draft', channel: '', scheduled_for: '' });
            setShow(false); refreshCo();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the content.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            {/* Channels */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">Channels</h2>
                {chLoading ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {PLATFORMS.map((p) => {
                            const rec = byPlatform(p.key);
                            const connected = rec && !['not_connected', 'pending'].includes(rec.status);
                            return (
                                <Card key={p.key} className="p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="font-display text-sm font-semibold">{p.label}</p>
                                        <StatePill state={rec?.status || 'not-connected'} />
                                    </div>
                                    <p className="mt-1.5 text-xs text-muted-foreground">{p.note}</p>
                                    {!connected && (
                                        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => connect(p.key)} disabled={busy === p.key}>
                                            {busy === p.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                                            {rec?.status === 'pending' ? 'Pending' : 'Connect'}
                                        </Button>
                                    )}
                                    {connected && rec.handle && <p className="mt-2 font-evidence text-[11px] text-muted-foreground">@{rec.handle}</p>}
                                </Card>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Content calendar */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-semibold tracking-tight">Content calendar</h2>
                    <Button size="sm" onClick={() => setShow((s) => !s)}><Plus className="h-4 w-4" /> {show ? 'Close' : 'New item'}</Button>
                </div>

                {show && (
                    <Card className="p-5">
                        <form onSubmit={submit} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="sc-title">Title</Label>
                                <Input id="sc-title" value={form.title} onChange={(e) => set('title', e.target.value)} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sc-body">Body / draft</Label>
                                <Textarea id="sc-body" value={form.body} onChange={(e) => set('body', e.target.value)} rows={4} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="grid gap-2">
                                    <Label htmlFor="sc-channel">Channel</Label>
                                    <Input id="sc-channel" value={form.channel} onChange={(e) => set('channel', e.target.value)} placeholder="e.g. discord" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="sc-status">Status</Label>
                                    <select id="sc-status" value={form.status} onChange={(e) => set('status', e.target.value)} className="h-9 border border-border bg-background px-3 text-sm">
                                        <option value="draft">Draft</option>
                                        <option value="awaiting_approval">Awaiting approval</option>
                                        <option value="scheduled">Scheduled</option>
                                        <option value="published">Published</option>
                                        <option value="failed">Failed</option>
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="sc-when">Scheduled for</Label>
                                    <Input id="sc-when" type="date" value={form.scheduled_for} onChange={(e) => set('scheduled_for', e.target.value)} />
                                </div>
                            </div>
                            {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                            <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save item'}</Button>
                        </form>
                    </Card>
                )}

                {coLoading ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
                ) : content.length === 0 ? (
                    <EmptyState
                        icon={CalendarDays}
                        title="No content queued"
                        description="The calendar holds draft, awaiting-approval, scheduled, published, and failed items. Nothing is created automatically. Publish or send only after an explicit approval gate."
                        action={<Button size="sm" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> New item</Button>}
                    />
                ) : (
                    <ul className="space-y-2.5">
                        {content.map((c) => (
                            <li key={c.id}>
                                <Card className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">{c.title}</p>
                                            {c.channel && <p className="mt-0.5 font-evidence text-[11px] text-muted-foreground">channel: {c.channel}</p>}
                                        </div>
                                        <StatePill state={c.status} />
                                    </div>
                                    {c.scheduled_for && <p className="mt-2 text-xs text-muted-foreground">Scheduled: {new Date(c.scheduled_for).toLocaleDateString()}</p>}
                                </Card>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No fake followers, impressions, comments, or scheduled content. Social listening and engagement metrics appear only when an account is authorized and data is actually returned.
            </p>
        </div>
    );
}

export default function CommunitySocialPage() {
    return (
        <div className="space-y-8">
            <PageHeader
                title="Community"
                description="The contributor hub: what is in flight, who has landed work, and the pipeline every change walks. Pull request data is read from the public GitHub API without a token, so it degrades to a link rather than to a guess. Social operations keep their own tab."
                actions={
                    <Button
                        variant="secondary"
                        size="sm"
                        href={`${REPO_URL}/issues`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Browse issues
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                }
            />

            <Tabs defaultValue="contributors">
                <TabsList>
                    <TabsTrigger value="contributors">Contributors</TabsTrigger>
                    <TabsTrigger value="social">Social operations</TabsTrigger>
                </TabsList>
                <TabsContent value="contributors" className="mt-6">
                    <ContributorHub />
                </TabsContent>
                <TabsContent value="social" className="mt-6">
                    <SocialTab />
                </TabsContent>
            </Tabs>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The leaderboard reads the contributors collection and shows nothing until
                real rows exist. Pull request and merge lists come straight from GitHub
                and are not cached, so an empty list means GitHub returned an empty list.
            </p>
        </div>
    );
}
