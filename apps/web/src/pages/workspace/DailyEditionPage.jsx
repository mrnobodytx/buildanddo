// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/DailyEditionPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js,
//              apps/web/src/lib/dailyDigest.js, apps/web/src/lib/workspaceControl.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js;
//              CONSUMES apps/web/src/lib/dailyDigest.js; CONSUMES apps/web/src/lib/workspaceControl.js
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
import React, { useEffect, useMemo, useState } from 'react';

import { Button, Card, ProvenanceTag, Rule } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/workspace/EmptyState';
import {
    EDITION_STATUS,
    MISSION_PRIORITY,
    PageHeader,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import {
    DegradedNotice,
    DemoModeToggle,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useDemoMode } from '@/hooks/useDemoMode';
import { timeAgo } from '@/lib/format';
import { dailyDigest } from '@/lib/dailyDigest';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { workspaceLifecycleKey } from '@/lib/workspaceControl';

const EMPTY_FORM = { title: '', summary: '', body: '', edition_date: '' };

function fmtDate(iso) {
    if (!iso) return '—';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return String(iso);
    return parsed.toLocaleDateString();
}

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

function DailyEditionDesk() {
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
        demo,
        uncertain,
        retry,
    } = useWorkspaceRecords('daily_editions', { sort: '-created' });
    const access = useWorkspaceAccess();
    const canWrite = !demo && !access.loading && !access.error && access.data?.can_write === true;
    const canCreate = canWrite && !loading && !degraded;
    const canPublish = canCreate && access.data?.can_admin === true;

    const missions = useWorkspaceRecords('missions', { sort: '-created' });
    const signals = useWorkspaceRecords('signals', { sort: '-created' });

    const [show, setShow] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [validation, setValidation] = useState('');
    const [day, setDay] = useState(() => new Date().toDateString());
    useEffect(() => {
        const currentDay = () => setDay(new Date().toDateString());
        const timer = setInterval(currentDay, 60000);
        document.addEventListener('visibilitychange', currentDay);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', currentDay); };
    }, []);

    const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    // The digest is derived, never stored. Storing it would create a second
    // copy of the truth that starts drifting the moment a mission changes.
    const digest = useMemo(() => dailyDigest(missions, signals),
        [missions.records, missions.loading, missions.degraded, signals.records, signals.loading, signals.degraded, day]);

    const submit = async (event) => {
        event.preventDefault();
        if (!canCreate || saving || uncertain) return;
        if (!form.title.trim()) {
            setValidation('An edition needs a headline.');
            return;
        }
        setValidation('');
        const result = await create({
            title: form.title.trim(),
            summary: form.summary.trim(),
            body: form.body.trim(),
            edition_date: form.edition_date || '',
        });
        if (!result.ok) return;
        setForm(EMPTY_FORM);
        setShow(false);
    };

    const publish = async (edition) => {
        if (!canPublish || saving || uncertain) return;
        await update(edition.id, { status: 'published' }, edition);
    };

    const digestLoading = digest.loading;

    return (
        <div className="space-y-8">
            <PageHeader
                title="Daily Edition"
                description="Today's state of the workspace, and the edition records written from it. The summary below is derived live from your missions and signals — it is not stored, and no headline is invented."
                actions={
                    <Button
                        size="sm"
                        disabled={!canCreate || uncertain}
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
            {!show && <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />}
            {uncertain && <Button size="sm" disabled={!canWrite || saving} onClick={async () => {
                const result = await retry(); if (result.ok) { setForm(EMPTY_FORM); setShow(false); }
            }}>Retry previous save</Button>}
            <p className="text-sm text-muted-foreground">Save a draft first. A current workspace administrator can publish that saved version; publication records an account and server timestamp, not independent verification.</p>

            {digest.unavailable.length > 0 ? (
                <DegradedNotice message={`Daily summary unavailable: ${digest.unavailable.join(' and ')} could not be read.`}
                    onRetry={() => { missions.refresh(); signals.refresh(); }} />
            ) : digestLoading ? (
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
                                        {timeAgo(mission.mission_reviewed_at)}
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
                    {digest.undated > 0 && <p role="status" className="mt-3 text-sm text-muted-foreground">{digest.undated} verified mission(s) have no usable review date and are excluded from today’s total.</p>}
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
                        <fieldset className="space-y-4" disabled={saving || !canCreate || uncertain}>
                        <div className="grid gap-2">
                            <Label htmlFor="ed-title">Headline</Label>
                            <Input
                                id="ed-title"
                                maxLength={200}
                                value={form.title}
                                onChange={(event) => set('title', event.target.value)}
                                placeholder="e.g. Friday no-shows down 40% after reminder mission"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ed-summary">Standfirst (summary)</Label>
                            <Input
                                id="ed-summary"
                                maxLength={1000}
                                value={form.summary}
                                onChange={(event) => set('summary', event.target.value)}
                                placeholder="One-sentence summary of today's intelligence"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ed-body">Body</Label>
                            <Textarea
                                id="ed-body"
                                maxLength={10000}
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
                            <p className="text-sm text-muted-foreground">New editions are saved as drafts.</p>
                        </div>
                        <WriteErrorNotice
                            message={validation || writeError}
                            onDismiss={clearWriteError}
                        />
                        <Button type="submit" size="sm">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save edition'}
                        </Button>
                        </fieldset>
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
                    description="Write a draft from the workspace observations you can support. No sample headlines, publication or verification is inferred from an empty record list."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" disabled={!canCreate || uncertain} onClick={() => setShow(true)}>
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
                                    {edition.status === 'published' && (!edition.published_by || !edition.published_at) ?
                                        <span className="text-xs text-muted-foreground">Historical reported publication</span> : <StatusBadge
                                        map={EDITION_STATUS}
                                        value={edition.status}
                                        className="shrink-0"
                                    />}
                                </div>
                                {edition.body && (
                                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                                        {edition.body}
                                    </p>
                                )}
                                <Rule className="my-3" />
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <ProvenanceTag
                                        source={edition.published_by ? `Published by account ${edition.published_by}` : 'Authored workspace record'}
                                        timestamp={fmtDate(edition.published_at || edition.edition_date || edition.created)}
                                    />
                                    {edition.status === 'draft' && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={saving || !canPublish || uncertain}
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

export default function DailyEditionPage() {
    const { user, sessionEpoch } = useAuth(), { active } = useWorkspace(), access = useWorkspaceAccess(), { demo } = useDemoMode();
    return <DailyEditionDesk key={workspaceLifecycleKey({ accountId: user?.id, workspaceId: active?.id, demo, sessionEpoch, access })} />;
}
