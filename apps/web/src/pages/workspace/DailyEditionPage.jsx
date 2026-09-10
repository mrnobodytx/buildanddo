// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/DailyEditionPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js,
//              apps/web/src/lib/workspaceActions.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js;
//              PRODUCES workspace.edition.published
// Intent:      Show the day the edition is about — today's priorities, what was
//              completed, what is blocked — beside the editions themselves.
// ───────────────────────────────────────────────────────────────

import {
    AlertTriangle,
    CheckCircle2,
    Info,
    Loader2,
    Newspaper,
    Plus,
    Radar,
    Target,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { Button, Card, ProvenanceTag, Rule } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/workspace/EmptyState';
import {
    EDITION_STATUS,
    MISSION_PRIORITY,
    PageHeader,
    SIGNAL_SEVERITY,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import {
    DegradedNotice,
    DemoModeToggle,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { timeAgo } from '@/lib/format';
import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

const EMPTY_FORM = { title: '', summary: '', body: '', edition_date: '', status: 'draft' };

const PRIORITY_RANK = Object.keys(MISSION_PRIORITY);
const SEVERITY_RANK = Object.keys(SIGNAL_SEVERITY);

function fmtDate(iso) {
    if (!iso) return '—';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return String(iso);
    return parsed.toLocaleDateString();
}

const isToday = (iso) => {
    if (!iso) return false;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return false;
    const now = new Date();
    return (
        parsed.getFullYear() === now.getFullYear() &&
        parsed.getMonth() === now.getMonth() &&
        parsed.getDate() === now.getDate()
    );
};

function DigestColumn({ icon: Icon, title, emptyLabel, children, count }) {
    return (
        <section className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2.1} />
                <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
                {count > 0 && (
                    <span className="font-evidence text-xs text-muted-foreground">{count}</span>
                )}
            </div>
            {count === 0 ? (
                <p className="border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    {emptyLabel}
                </p>
            ) : (
                <ul className="space-y-2">{children}</ul>
            )}
        </section>
    );
}

export default function DailyEditionPage() {
    const {
        records,
        loading,
        degraded,
        refresh,
        create,
        update,
        saving,
        writeError,
        clearWriteError,
    } = useWorkspaceRecords('daily_editions', { sort: '-created' });

    const missions = useWorkspaceRecords('missions', { sort: '-created' });
    const signals = useWorkspaceRecords('signals', { sort: '-created' });

    const [show, setShow] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [validation, setValidation] = useState('');

    const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    // The digest is derived, never stored. Storing it would create a second
    // copy of the truth that starts drifting the moment a mission changes.
    const digest = useMemo(() => {
        const open = missions.records.filter(
            (mission) => !['verified', 'failed'].includes(mission.status),
        );
        const priorities = [...open]
            .sort((a, b) => {
                const rank = (mission) => {
                    const index = PRIORITY_RANK.indexOf(mission.priority || 'normal');
                    return index === -1 ? PRIORITY_RANK.indexOf('normal') : index;
                };
                const overdue = (mission) =>
                    mission.due_date && new Date(mission.due_date).getTime() < Date.now() ? 0 : 1;
                return overdue(a) - overdue(b) || rank(a) - rank(b);
            })
            .slice(0, 5);

        const completed = missions.records.filter(
            (mission) => mission.status === 'verified' && isToday(mission.updated || mission.created),
        );

        const blockedMissions = missions.records
            .filter((mission) => mission.status === 'needs_attention' || mission.status === 'failed')
            .map((mission) => ({
                id: mission.id,
                label: mission.title,
                detail: mission.status === 'failed' ? 'Mission failed' : 'Mission needs attention',
            }));

        const urgentSignals = signals.records
            .filter(
                (signal) =>
                    (signal.state || 'new') === 'new' &&
                    ['critical', 'high'].includes(signal.severity || ''),
            )
            .sort(
                (a, b) =>
                    SEVERITY_RANK.indexOf(a.severity) - SEVERITY_RANK.indexOf(b.severity),
            )
            .map((signal) => ({
                id: signal.id,
                label: signal.title,
                detail: `Untriaged ${SIGNAL_SEVERITY[signal.severity].label.toLowerCase()} signal`,
            }));

        return { priorities, completed, blockers: [...blockedMissions, ...urgentSignals] };
    }, [missions.records, signals.records]);

    const submit = async (event) => {
        event.preventDefault();
        if (!form.title.trim()) {
            setValidation('An edition needs a headline.');
            return;
        }
        setValidation('');
        const result = await create({
            title: form.title.trim(),
            summary: form.summary.trim(),
            body: form.body.trim(),
            edition_date: form.edition_date || null,
            status: form.status,
        });
        if (!result.ok) return;
        if (form.status === 'published') {
            trackWorkspaceAction(WORKSPACE_ACTIONS.EDITION_PUBLISHED, {
                has_body: Boolean(form.body.trim()),
                blockers: digest.blockers.length,
            });
        }
        setForm(EMPTY_FORM);
        setShow(false);
    };

    const publish = async (edition) => {
        const result = await update(edition.id, { status: 'published' });
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.EDITION_PUBLISHED, {
            has_body: Boolean(edition.body),
            blockers: digest.blockers.length,
        });
    };

    const digestLoading = missions.loading || signals.loading;

    return (
        <div className="space-y-8">
            <PageHeader
                title="Daily Edition"
                description="Today's state of the workspace, and the edition records written from it. The summary below is derived live from your missions and signals — it is not stored, and no headline is invented."
                actions={
                    <Button
                        size="sm"
                        onClick={() => {
                            setValidation('');
                            clearWriteError();
                            setShow((prev) => !prev);
                        }}
                    >
                        <Plus className="h-4 w-4" /> {show ? 'Close' : 'New edition'}
                    </Button>
                }
            />


            {digestLoading ? (
                <ListSkeleton rows={1} />
            ) : (
                <Card className="p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                        Today
                    </p>
                    <div className="mt-4 grid gap-6 lg:grid-cols-3">
                        <DigestColumn
                            icon={Target}
                            title="Priorities"
                            count={digest.priorities.length}
                            emptyLabel="No open missions. Nothing is scheduled to happen today."
                        >
                            {digest.priorities.map((mission) => (
                                <li
                                    key={mission.id}
                                    className="flex items-start justify-between gap-2 border-b border-border/50 pb-2 text-sm last:border-0"
                                >
                                    <span className="min-w-0 flex-1">{mission.title}</span>
                                    <StatusBadge
                                        map={MISSION_PRIORITY}
                                        value={mission.priority || 'normal'}
                                    />
                                </li>
                            ))}
                        </DigestColumn>

                        <DigestColumn
                            icon={CheckCircle2}
                            title="Verified today"
                            count={digest.completed.length}
                            emptyLabel="Nothing has been verified today. That is a fact, not a failure."
                        >
                            {digest.completed.map((mission) => (
                                <li
                                    key={mission.id}
                                    className="border-b border-border/50 pb-2 text-sm last:border-0"
                                >
                                    <span>{mission.title}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                        {timeAgo(mission.updated || mission.created)}
                                    </span>
                                </li>
                            ))}
                        </DigestColumn>

                        <DigestColumn
                            icon={AlertTriangle}
                            title="Blockers"
                            count={digest.blockers.length}
                            emptyLabel="Nothing is flagged as blocked or awaiting urgent triage."
                        >
                            {digest.blockers.map((item) => (
                                <li
                                    key={item.id}
                                    className="border-b border-border/50 pb-2 text-sm last:border-0"
                                >
                                    <span>{item.label}</span>
                                    <span className="mt-0.5 block text-xs text-amber-warm">
                                        {item.detail}
                                    </span>
                                </li>
                            ))}
                        </DigestColumn>
                    </div>
                    <Rule className="my-4" />
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Radar className="h-3.5 w-3.5" />
                        Derived from {missions.records.length} mission
                        {missions.records.length === 1 ? '' : 's'} and {signals.records.length}{' '}
                        signal{signals.records.length === 1 ? '' : 's'} in this workspace.
                    </p>
                </Card>
            )}

            {show && (
                <Card className="p-5">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="ed-title">Headline</Label>
                            <Input
                                id="ed-title"
                                value={form.title}
                                onChange={(event) => set('title', event.target.value)}
                                placeholder="e.g. Friday no-shows down 40% after reminder mission"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ed-summary">Standfirst (summary)</Label>
                            <Input
                                id="ed-summary"
                                value={form.summary}
                                onChange={(event) => set('summary', event.target.value)}
                                placeholder="One-sentence summary of today's intelligence"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ed-body">Body</Label>
                            <Textarea
                                id="ed-body"
                                value={form.body}
                                onChange={(event) => set('body', event.target.value)}
                                rows={6}
                                placeholder="The full edition body — what changed, what was done, what was verified."
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="ed-date">Edition date</Label>
                                <Input
                                    id="ed-date"
                                    type="date"
                                    value={form.edition_date}
                                    onChange={(event) => set('edition_date', event.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="ed-status">Status</Label>
                                <Select
                                    value={form.status}
                                    onValueChange={(value) => set('status', value)}
                                >
                                    <SelectTrigger id="ed-status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="published">Published</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <WriteErrorNotice
                            message={validation || writeError}
                            onDismiss={clearWriteError}
                        />
                        <Button type="submit" size="sm" disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save edition'}
                        </Button>
                    </form>
                </Card>
            )}

            {degraded ? (
                <DegradedNotice onRetry={refresh} />
            ) : loading ? (
                <ListSkeleton rows={2} />
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Newspaper}
                    title="No editions yet"
                    description="The first edition will appear after the system receives verified events. No sample headlines are generated. Write one from the summary above once you have real intelligence to record."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" onClick={() => setShow(true)}>
                                <Plus className="h-4 w-4" /> New edition
                            </Button>
                            <DemoModeToggle />
                        </div>
                    }
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((edition) => (
                        <li key={edition.id}>
                            <Card className="p-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="font-display text-lg font-semibold">
                                            {edition.title}
                                        </p>
                                        {edition.summary && (
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {edition.summary}
                                            </p>
                                        )}
                                    </div>
                                    <StatusBadge
                                        map={EDITION_STATUS}
                                        value={edition.status}
                                        className="shrink-0"
                                    />
                                </div>
                                {edition.body && (
                                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                                        {edition.body}
                                    </p>
                                )}
                                <Rule className="my-3" />
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <ProvenanceTag
                                        source="workspace record"
                                        timestamp={fmtDate(edition.edition_date || edition.created)}
                                    />
                                    {edition.status === 'draft' && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={saving}
                                            onClick={() => publish(edition)}
                                        >
                                            Publish
                                        </Button>
                                    )}
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                An edition is a real record. It is never auto-filled with invented headlines — the
                summary above only counts and orders what already exists in your workspace.
            </p>
        </div>
    );
}
