// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/RoadmapPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js,
//              apps/web/src/components/workspace/ListToolbar.jsx,
//              apps/web/src/components/workspace/WorkspaceNotices.jsx,
//              apps/web/src/lib/workspaceActions.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js;
//              PRODUCES workspace.roadmap.item_created;
//              PRODUCES workspace.roadmap.item_updated
// Intent:      Make the workspace roadmap answer "where are we" and let an
//              operator move an item without deleting and recreating it.
// ───────────────────────────────────────────────────────────────

import { AlertCircle, CheckCircle2, Gauge, Info, ListChecks, Loader2, Plus, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button, Card, ProvenanceTag, Rule, StatePill } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/workspace/EmptyState';
import ListToolbar from '@/components/workspace/ListToolbar';
import { PageHeader, ProgressMeter, StatCard } from '@/components/workspace/workspaceHelpers';
import {
    DegradedNotice,
    DemoModeToggle,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useShapedRecords, useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

const STATUSES = ['proposed', 'planned', 'in_progress', 'blocked', 'verified', 'archived'];

// Archived items are deliberately excluded from the completion denominator:
// an item withdrawn from the plan is neither done nor outstanding, and
// counting it either way misstates the number.
const COUNTED_STATUSES = STATUSES.filter((status) => status !== 'archived');

const STATUS_LABEL = (status) => status.replace(/_/g, ' ');

const BAR_FILL = {
    verified: 'hsl(var(--primary))',
    blocked: 'hsl(var(--destructive, 0 84% 60%))',
};

const EMPTY_FORM = {
    title: '', description: '', status: 'proposed',
    owner_role: '', evidence_ref: '', dependency: '', next_action: '',
};

const VERIFY_WITHOUT_EVIDENCE =
    'A roadmap item cannot be marked Verified without an evidence reference.';

/**
 * Reports whether an item counts as complete.
 *
 * Status alone is not enough. `verified` with an empty `evidence_ref` is an
 * assertion, and this page refuses to count assertions - the same rule the
 * create form and the public roadmap projection apply.
 *
 * @param {object} record A roadmap_items record.
 * @returns {boolean} True when the item is verified and names its evidence.
 */
function isVerified(record) {
    return record.status === 'verified' && Boolean(String(record.evidence_ref || '').trim());
}

export default function WorkspaceRoadmapPage() {
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
    } = useWorkspaceRecords('roadmap_items', { sort: '-created' });

    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [validation, setValidation] = useState('');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [editingId, setEditingId] = useState(null);
    const [edit, setEdit] = useState({ status: 'proposed', evidence_ref: '', next_action: '' });

    const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    const visible = useShapedRecords(records, {
        query,
        searchFields: ['title', 'description', 'owner_role', 'next_action'],
        filters: { status: statusFilter },
    });

    const counts = useMemo(() => {
        const tally = Object.fromEntries(STATUSES.map((status) => [status, 0]));
        records.forEach((record) => {
            if (tally[record.status] === undefined) return;
            tally[record.status] += 1;
        });
        return tally;
    }, [records]);

    const tracked = useMemo(
        () => records.filter((record) => COUNTED_STATUSES.includes(record.status)).length,
        [records],
    );

    const verifiedCount = useMemo(() => records.filter(isVerified).length, [records]);

    // Null rather than 0 when nothing is tracked: ProgressMeter renders nothing
    // for null, and a 0% bar would read as "no progress" when the truth is
    // "nothing to measure yet".
    const completion = tracked > 0 ? Math.round((verifiedCount / tracked) * 100) : null;

    const distribution = useMemo(
        () => STATUSES.map((status) => ({ status, label: STATUS_LABEL(status), count: counts[status] })),
        [counts],
    );

    const submitCreate = async (event) => {
        event.preventDefault();
        if (!form.title.trim()) {
            setValidation('Give the item a title.');
            return;
        }
        if (form.status === 'verified' && !form.evidence_ref.trim()) {
            setValidation(VERIFY_WITHOUT_EVIDENCE);
            return;
        }
        setValidation('');
        const result = await create({
            title: form.title.trim(),
            description: form.description.trim(),
            status: form.status,
            owner_role: form.owner_role.trim(),
            evidence_ref: form.evidence_ref.trim(),
            dependency: form.dependency.trim(),
            next_action: form.next_action.trim(),
        });
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.ROADMAP_ITEM_CREATED, { status: form.status });
        setForm(EMPTY_FORM);
        setShowCreate(false);
    };

    const openEdit = (record) => {
        setValidation('');
        clearWriteError();
        setEditingId(record.id);
        setEdit({
            status: record.status || 'proposed',
            evidence_ref: record.evidence_ref || '',
            next_action: record.next_action || '',
        });
    };

    const submitEdit = async (event, record) => {
        event.preventDefault();
        if (edit.status === 'verified' && !edit.evidence_ref.trim()) {
            setValidation(VERIFY_WITHOUT_EVIDENCE);
            return;
        }
        setValidation('');
        const result = await update(record.id, {
            status: edit.status,
            evidence_ref: edit.evidence_ref.trim(),
            next_action: edit.next_action.trim(),
        });
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.ROADMAP_ITEM_UPDATED, {
            from_status: record.status,
            to_status: edit.status,
        });
        setEditingId(null);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Roadmap"
                description="A real operational roadmap driven by actual records. Each item carries owner, status, evidence link, timestamp, dependency, and next action. An item is never marked complete from a prompt alone - Verified requires an evidence reference."
                actions={
                    <Button size="sm" onClick={() => setShowCreate((open) => !open)}>
                        {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {showCreate ? 'Close' : 'New item'}
                    </Button>
                }
            />

            {degraded && (
                <DegradedNotice
                    message="Could not read the roadmap. The counts below are not a total - they are what one failed read returned, which is nothing."
                    onRetry={refresh}
                />
            )}

            {records.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-12">
                    <div className="grid gap-4 sm:grid-cols-3 lg:col-span-7">
                        <StatCard
                            icon={ListChecks}
                            label="Tracked items"
                            value={tracked}
                            hint={
                                counts.archived
                                    ? `${counts.archived} archived, not counted`
                                    : 'Archived items are excluded'
                            }
                        />
                        <StatCard
                            icon={CheckCircle2}
                            label="Verified"
                            value={verifiedCount}
                            hint={
                                verifiedCount
                                    ? 'Backed by an evidence reference'
                                    : 'Nothing verified with evidence yet'
                            }
                            tone="teal"
                        />
                        <StatCard
                            icon={Gauge}
                            label="In progress"
                            value={counts.in_progress}
                            hint={counts.blocked ? `${counts.blocked} blocked` : 'None blocked'}
                            tone="amber"
                        />
                        <div className="sm:col-span-3">
                            <Card className="p-5">
                                <ProgressMeter
                                    value={completion}
                                    label="Verified share of tracked items"
                                />
                                {completion === null && (
                                    <p className="text-sm text-muted-foreground">
                                        Nothing tracked yet, so there is no completion figure to show.
                                    </p>
                                )}
                            </Card>
                        </div>
                    </div>

                    <Card className="p-5 lg:col-span-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Items by status
                        </p>
                        <div className="mt-4 h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={distribution} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        interval={0}
                                        angle={-35}
                                        textAnchor="end"
                                        height={54}
                                        fontSize={10}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tickLine={false}
                                        axisLine={false}
                                        width={24}
                                        fontSize={10}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'hsl(var(--secondary))' }}
                                        contentStyle={{
                                            background: 'hsl(var(--card))',
                                            border: '1px solid hsl(var(--border))',
                                            fontSize: 12,
                                        }}
                                    />
                                    <Bar dataKey="count" name="Items" radius={[2, 2, 0, 0]}>
                                        {distribution.map((entry) => (
                                            <Cell
                                                key={entry.status}
                                                fill={BAR_FILL[entry.status] || 'hsl(var(--muted-foreground))'}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>
            )}

            {showCreate && (
                <Card className="p-5">
                    <form onSubmit={submitCreate} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="rm-title">Title</Label>
                            <Input id="rm-title" value={form.title} onChange={(e) => set('title', e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="rm-desc">Description</Label>
                            <Textarea id="rm-desc" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="rm-status">Status</Label>
                                <select
                                    id="rm-status"
                                    value={form.status}
                                    onChange={(e) => set('status', e.target.value)}
                                    className="h-9 border border-border bg-background px-3 text-sm"
                                >
                                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL(s)}</option>)}
                                </select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rm-owner">Owner / role</Label>
                                <Input id="rm-owner" value={form.owner_role} onChange={(e) => set('owner_role', e.target.value)} placeholder="e.g. Verification Desk" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rm-evidence">Evidence link / record</Label>
                                <Input id="rm-evidence" value={form.evidence_ref} onChange={(e) => set('evidence_ref', e.target.value)} placeholder="Required to mark Verified" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rm-dep">Dependency</Label>
                                <Input id="rm-dep" value={form.dependency} onChange={(e) => set('dependency', e.target.value)} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="rm-next">Next action</Label>
                            <Input id="rm-next" value={form.next_action} onChange={(e) => set('next_action', e.target.value)} />
                        </div>
                        <WriteErrorNotice
                            message={validation || writeError}
                            onDismiss={() => { setValidation(''); clearWriteError(); }}
                        />
                        <Button type="submit" size="sm" disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save item'}
                        </Button>
                    </form>
                </Card>
            )}

            {records.length > 0 && (
                <ListToolbar
                    query={query}
                    onQueryChange={setQuery}
                    placeholder="Search roadmap items"
                    resultCount={visible.length}
                    totalCount={records.length}
                    filters={[
                        {
                            key: 'status',
                            label: 'Status',
                            value: statusFilter,
                            onChange: setStatusFilter,
                            options: [
                                { value: 'all', label: 'All statuses' },
                                ...STATUSES.map((status) => ({
                                    value: status,
                                    label: `${STATUS_LABEL(status)} (${counts[status]})`,
                                })),
                            ],
                        },
                    ]}
                />
            )}

            {!showCreate && (
                <WriteErrorNotice
                    message={validation || writeError}
                    onDismiss={() => { setValidation(''); clearWriteError(); }}
                />
            )}

            {degraded ? null : loading ? (
                <ListSkeleton rows={3} />
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Gauge}
                    title="No roadmap items yet"
                    description="Add a real item with an owner, status, dependency, and next action. Verified status requires an evidence reference - it cannot be set from a prompt alone."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" onClick={() => setShowCreate(true)}>
                                <Plus className="h-4 w-4" /> New item
                            </Button>
                            <DemoModeToggle />
                        </div>
                    }
                />
            ) : visible.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    No roadmap item matches those filters.
                </Card>
            ) : (
                <ul className="space-y-3">
                    {visible.map((r) => (
                        <li key={r.id}>
                            <Card className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-display text-base font-semibold">{r.title}</p>
                                        {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
                                    </div>
                                    <StatePill state={r.status} />
                                </div>
                                <Rule className="my-3" />
                                <dl className="font-evidence grid gap-1.5 text-[12px] text-muted-foreground sm:grid-cols-2">
                                    <div><dt className="inline">Owner: </dt><dd className="inline text-foreground">{r.owner_role || '—'}</dd></div>
                                    <div><dt className="inline">Dependency: </dt><dd className="inline text-foreground">{r.dependency || '—'}</dd></div>
                                    <div><dt className="inline">Next action: </dt><dd className="inline text-foreground">{r.next_action || '—'}</dd></div>
                                    <div><dt className="inline">Evidence: </dt><dd className="inline text-foreground">{r.evidence_ref || '—'}</dd></div>
                                </dl>

                                {r.status === 'verified' && !r.evidence_ref && (
                                    <p className="mt-3 flex items-start gap-2 text-xs text-amber-warm">
                                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        Marked verified with no evidence reference. This item is not counted
                                        as complete.
                                    </p>
                                )}

                                {editingId === r.id ? (
                                    <form
                                        onSubmit={(event) => submitEdit(event, r)}
                                        className="mt-4 space-y-3 border-t border-border/60 pt-3"
                                    >
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="grid gap-2">
                                                <Label htmlFor={`edit-status-${r.id}`}>Status</Label>
                                                <select
                                                    id={`edit-status-${r.id}`}
                                                    value={edit.status}
                                                    onChange={(e) => setEdit((p) => ({ ...p, status: e.target.value }))}
                                                    className="h-9 border border-border bg-background px-3 text-sm"
                                                >
                                                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL(s)}</option>)}
                                                </select>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor={`edit-evidence-${r.id}`}>Evidence link / record</Label>
                                                <Input
                                                    id={`edit-evidence-${r.id}`}
                                                    value={edit.evidence_ref}
                                                    onChange={(e) => setEdit((p) => ({ ...p, evidence_ref: e.target.value }))}
                                                    placeholder="Required to mark Verified"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor={`edit-next-${r.id}`}>Next action</Label>
                                            <Input
                                                id={`edit-next-${r.id}`}
                                                value={edit.next_action}
                                                onChange={(e) => setEdit((p) => ({ ...p, next_action: e.target.value }))}
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button type="submit" size="sm" disabled={saving}>
                                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => { setEditingId(null); setValidation(''); }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <ProvenanceTag
                                            source="workspace record"
                                            timestamp={r.updated || r.created ? new Date(r.updated || r.created).toLocaleString() : ''}
                                        />
                                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                                            Update status
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Roadmap items are real records. Verified requires an evidence link, and the
                completion figure above counts only items that have one.
            </p>
        </div>
    );
}
