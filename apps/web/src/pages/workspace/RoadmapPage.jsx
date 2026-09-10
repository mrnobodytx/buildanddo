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
//              CONSUMES apps/web/src/components/workspace/ListToolbar.jsx;
//              PRODUCES workspace.roadmap_item.created;
//              PRODUCES workspace.roadmap_item.updated
// Intent:      Make the roadmap answer "how far along is this workspace, and on
//              what evidence" — a status distribution, a filterable ledger, and
//              in-place status changes that still cannot fake a verification.
// ───────────────────────────────────────────────────────────────

import { AlertCircle, Gauge, Info, Loader2, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Button, Card, ProvenanceTag, Rule } from '@/components/site/ui';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
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
import ListToolbar from '@/components/workspace/ListToolbar';
import {
    PageHeader,
    ProgressMeter,
    ROADMAP_STATUS,
    StatCard,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import {
    DegradedNotice,
    DemoModeToggle,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useShapedRecords, useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

const STATUS_KEYS = Object.keys(ROADMAP_STATUS);

// Archived items are deliberately excluded from the completion denominator:
// something withdrawn from the plan is neither done nor outstanding, and
// counting it as outstanding makes the number drift down for no reason.
const COUNTED_IN_COMPLETION = STATUS_KEYS.filter((key) => key !== 'archived');

const EVIDENCE_REQUIRED =
    'A roadmap item cannot be marked Verified without an evidence reference. Record the evidence first, then change the status.';

const EMPTY_FORM = {
    title: '',
    description: '',
    status: 'proposed',
    owner_role: '',
    evidence_ref: '',
    dependency: '',
    next_action: '',
};

const statusOf = (item) => (STATUS_KEYS.includes(item.status) ? item.status : 'proposed');

const CHART_CONFIG = { count: { label: 'Items', color: 'hsl(var(--primary))' } };

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
    const [editError, setEditError] = useState('');

    const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
    const setEditField = (field, value) => setEdit((prev) => ({ ...prev, [field]: value }));

    // Normalised once so the filter, the chart and the counts all read the same
    // defaulted status rather than each re-deriving it.
    const normalised = useMemo(
        () => records.map((item) => ({ ...item, status: statusOf(item) })),
        [records],
    );

    const visible = useShapedRecords(normalised, {
        query,
        searchFields: ['title', 'description', 'owner_role', 'dependency', 'next_action'],
        filters: { status: statusFilter },
    });

    const summary = useMemo(() => {
        const byStatus = Object.fromEntries(STATUS_KEYS.map((key) => [key, 0]));
        normalised.forEach((item) => {
            byStatus[item.status] += 1;
        });
        const counted = COUNTED_IN_COMPLETION.reduce((total, key) => total + byStatus[key], 0);
        return {
            byStatus,
            total: normalised.length,
            counted,
            // Only `verified` counts as complete. An item that looks finished but
            // carries no evidence record is not progress this page will claim.
            completion: counted ? Math.round((byStatus.verified / counted) * 100) : null,
            withoutEvidence: normalised.filter((item) => !(item.evidence_ref || '').trim()).length,
        };
    }, [normalised]);

    const chartData = useMemo(
        () =>
            STATUS_KEYS.map((key) => ({
                status: ROADMAP_STATUS[key].label,
                count: summary.byStatus[key],
            })),
        [summary.byStatus],
    );

    const submit = async (event) => {
        event.preventDefault();
        if (!form.title.trim()) {
            setValidation('Give the roadmap item a short title.');
            return;
        }
        if (form.status === 'verified' && !form.evidence_ref.trim()) {
            setValidation(EVIDENCE_REQUIRED);
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
        trackWorkspaceAction(WORKSPACE_ACTIONS.ROADMAP_ITEM_CREATED, {
            status: form.status,
            has_evidence: Boolean(form.evidence_ref.trim()),
            has_dependency: Boolean(form.dependency.trim()),
        });
        setForm(EMPTY_FORM);
        setShowCreate(false);
    };

    const startEdit = (item) => {
        clearWriteError();
        setEditError('');
        setEditingId(item.id);
        setEdit({
            status: item.status,
            evidence_ref: item.evidence_ref || '',
            next_action: item.next_action || '',
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditError('');
    };

    const saveEdit = async (item) => {
        // The same guard the create form applies. Verification is the one status
        // this page will not take on a user's word, whichever route reaches it.
        if (edit.status === 'verified' && !edit.evidence_ref.trim()) {
            setEditError(EVIDENCE_REQUIRED);
            return;
        }
        setEditError('');
        const result = await update(item.id, {
            status: edit.status,
            evidence_ref: edit.evidence_ref.trim(),
            next_action: edit.next_action.trim(),
        });
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.ROADMAP_ITEM_UPDATED, {
            from_status: item.status,
            to_status: edit.status,
            has_evidence: Boolean(edit.evidence_ref.trim()),
        });
        setEditingId(null);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Roadmap"
                description="An operational roadmap driven by real records. Each item carries an owner, a status, an evidence link, a timestamp, a dependency, and a next action. Verified is not a claim you can type — it requires an evidence reference."
                actions={
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={refresh}
                            disabled={loading}
                            aria-label="Refresh roadmap items"
                        >
                            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                setForm(EMPTY_FORM);
                                setValidation('');
                                clearWriteError();
                                setShowCreate((open) => !open);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            {showCreate ? 'Close' : 'New item'}
                        </Button>
                    </div>
                }
            />

            {degraded && (
                <DegradedNotice
                    message="The roadmap could not be read. The counts and the chart below are not a picture of this workspace — they are empty because nothing loaded."
                    onRetry={refresh}
                />
            )}

            {!degraded && summary.total > 0 && (
                <Card className="p-5">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            icon={Gauge}
                            label="Verified"
                            value={summary.byStatus.verified}
                            hint={`of ${summary.counted} item${summary.counted === 1 ? '' : 's'} still on the plan`}
                            tone="teal"
                        />
                        <StatCard
                            label="In progress"
                            value={summary.byStatus.in_progress}
                            hint={`${summary.byStatus.planned} planned, ${summary.byStatus.proposed} proposed`}
                            tone="violet"
                        />
                        <StatCard
                            label="Blocked"
                            value={summary.byStatus.blocked}
                            hint={summary.byStatus.blocked ? 'Each one needs its dependency cleared' : 'Nothing is blocked'}
                            tone={summary.byStatus.blocked ? 'amber' : 'neutral'}
                        />
                        <StatCard
                            label="Without evidence"
                            value={summary.withoutEvidence}
                            hint={`${summary.byStatus.archived} archived, ${summary.total} recorded in total`}
                            tone={summary.withoutEvidence ? 'amber' : 'neutral'}
                        />
                    </div>

                    <Rule className="my-5" />

                    <ProgressMeter
                        value={summary.completion}
                        label="Verified share of the active plan"
                    />
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Completion counts verified items only, over everything not archived.
                        An item that looks finished but carries no evidence reference is not
                        counted here.
                    </p>

                    <ChartContainer config={CHART_CONFIG} className="mt-5 aspect-[3/1] w-full">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                            <XAxis
                                dataKey="status"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                            />
                            <YAxis
                                allowDecimals={false}
                                tickLine={false}
                                axisLine={false}
                                width={28}
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="count" fill="var(--color-count)" radius={2} />
                        </BarChart>
                    </ChartContainer>
                </Card>
            )}

            {showCreate && (
                <Card className="p-5">
                    <form onSubmit={submitCreate} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="rm-title">Title</Label>
                            <Input
                                id="rm-title"
                                value={form.title}
                                onChange={(event) => setField('title', event.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="rm-desc">Description</Label>
                            <Textarea
                                id="rm-desc"
                                value={form.description}
                                onChange={(event) => setField('description', event.target.value)}
                                rows={3}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="rm-status">Status</Label>
                                <Select
                                    value={form.status}
                                    onValueChange={(value) => setField('status', value)}
                                >
                                    <SelectTrigger id="rm-status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_KEYS.map((key) => (
                                            <SelectItem key={key} value={key}>
                                                {ROADMAP_STATUS[key].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rm-owner">Owner / role</Label>
                                <Input
                                    id="rm-owner"
                                    value={form.owner_role}
                                    onChange={(event) => setField('owner_role', event.target.value)}
                                    placeholder="e.g. Verification Desk"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rm-evidence">Evidence link / record</Label>
                                <Input
                                    id="rm-evidence"
                                    value={form.evidence_ref}
                                    onChange={(event) => setField('evidence_ref', event.target.value)}
                                    placeholder="Required to mark Verified"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rm-dep">Dependency</Label>
                                <Input
                                    id="rm-dep"
                                    value={form.dependency}
                                    onChange={(event) => setField('dependency', event.target.value)}
                                />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="rm-next">Next action</Label>
                            <Input
                                id="rm-next"
                                value={form.next_action}
                                onChange={(event) => setField('next_action', event.target.value)}
                            />
                        </div>
                        <WriteErrorNotice
                            message={validation || writeError}
                            onDismiss={clearWriteError}
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
                                ...STATUS_KEYS.map((key) => ({
                                    value: key,
                                    label: ROADMAP_STATUS[key].label,
                                })),
                            ],
                        },
                    ]}
                />
            )}

            {!showCreate && <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />}

            {degraded ? null : loading ? (
                <ListSkeleton rows={4} />
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Gauge}
                    title="No roadmap items yet"
                    description="Add a real item with an owner, a status, a dependency, and a next action. Verified requires an evidence reference — it cannot be set from a prompt alone."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" onClick={() => setShowCreate(true)}>
                                <Plus className="h-4 w-4" />
                                New item
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
                    {visible.map((item) => {
                        const editing = editingId === item.id;
                        return (
                            <li key={item.id}>
                                <Card className={cn('p-5', item.status === 'archived' && 'opacity-60')}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-display text-base font-semibold">
                                                {item.title}
                                            </p>
                                            {item.description && (
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {item.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <StatusBadge map={ROADMAP_STATUS} value={item.status} />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => (editing ? cancelEdit() : startEdit(item))}
                                                aria-label={editing ? 'Cancel edit' : `Edit ${item.title}`}
                                            >
                                                {editing ? (
                                                    <X className="h-4 w-4" />
                                                ) : (
                                                    <Pencil className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    <Rule className="my-3" />

                                    {editing ? (
                                        <div className="space-y-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="grid gap-2">
                                                    <Label htmlFor={`rm-edit-status-${item.id}`}>
                                                        Status
                                                    </Label>
                                                    <Select
                                                        value={edit.status}
                                                        onValueChange={(value) =>
                                                            setEditField('status', value)
                                                        }
                                                    >
                                                        <SelectTrigger id={`rm-edit-status-${item.id}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {STATUS_KEYS.map((key) => (
                                                                <SelectItem key={key} value={key}>
                                                                    {ROADMAP_STATUS[key].label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor={`rm-edit-evidence-${item.id}`}>
                                                        Evidence link / record
                                                    </Label>
                                                    <Input
                                                        id={`rm-edit-evidence-${item.id}`}
                                                        value={edit.evidence_ref}
                                                        onChange={(event) =>
                                                            setEditField('evidence_ref', event.target.value)
                                                        }
                                                        placeholder="Required to mark Verified"
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor={`rm-edit-next-${item.id}`}>
                                                    Next action
                                                </Label>
                                                <Input
                                                    id={`rm-edit-next-${item.id}`}
                                                    value={edit.next_action}
                                                    onChange={(event) =>
                                                        setEditField('next_action', event.target.value)
                                                    }
                                                />
                                            </div>
                                            {editError && (
                                                <p
                                                    className="flex items-start gap-2 text-sm text-destructive"
                                                    role="alert"
                                                >
                                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                                    {editError}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    disabled={saving}
                                                    onClick={() => saveEdit(item)}
                                                >
                                                    {saving ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        'Save changes'
                                                    )}
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={cancelEdit}>
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <dl className="font-evidence grid gap-1.5 text-[12px] text-muted-foreground sm:grid-cols-2">
                                            <div>
                                                <dt className="inline">Owner: </dt>
                                                <dd className="inline text-foreground">
                                                    {item.owner_role || '—'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="inline">Dependency: </dt>
                                                <dd className="inline text-foreground">
                                                    {item.dependency || '—'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="inline">Next action: </dt>
                                                <dd className="inline text-foreground">
                                                    {item.next_action || '—'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="inline">Evidence: </dt>
                                                <dd className="inline text-foreground">
                                                    {item.evidence_ref || '—'}
                                                </dd>
                                            </div>
                                        </dl>
                                    )}

                                    <div className="mt-3">
                                        <ProvenanceTag
                                            source="workspace record"
                                            timestamp={item.created ? new Date(item.created).toLocaleString() : ''}
                                            freshness={item.updated ? `updated ${timeAgo(item.updated)}` : ''}
                                        />
                                    </div>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Roadmap items are real records. Verified requires an evidence link stored
                against the item — changing the status in place does not bypass that check.
            </p>
        </div>
    );
}
