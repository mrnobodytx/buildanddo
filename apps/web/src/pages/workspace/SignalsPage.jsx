// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/SignalsPage.jsx
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
//              PRODUCES workspace.signal.acknowledged;
//              PRODUCES workspace.signal.created
// Intent:      Turn an append-only feed into something triageable: severity,
//              acknowledge and dismiss, and a default view of what is still open.
// ───────────────────────────────────────────────────────────────

import { BellOff, Check, Info, Loader2, Plus, Radar, RefreshCw, Undo2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { Button, Card } from '@/components/site/ui';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
    SIGNAL_SEVERITY,
    SIGNAL_STATE,
    SIGNAL_TYPE,
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

const SEVERITY_ORDER = Object.keys(SIGNAL_SEVERITY);

const EMPTY_FORM = {
    title: '',
    description: '',
    source: '',
    type: 'fact',
    severity: 'medium',
    confidence: '',
};

// Rows carrying no explicit state predate the field. They are unread, not
// dismissed, so they read as 'new'.
const stateOf = (signal) => signal.state || 'new';
const severityOf = (signal) => signal.severity || 'info';

export default function SignalsPage() {
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
    } = useWorkspaceRecords('signals', { sort: '-created' });

    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [validation, setValidation] = useState('');
    const [query, setQuery] = useState('');
    const [stateFilter, setStateFilter] = useState('new');
    const [severityFilter, setSeverityFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);

    const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    // Normalised once so filtering and sorting both see the defaulted values
    // rather than each re-deriving them.
    const normalised = useMemo(
        () => records.map((signal) => ({ ...signal, state: stateOf(signal), severity: severityOf(signal) })),
        [records],
    );

    const bySeverityThenAge = useMemo(
        () => (a, b) =>
            SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
            new Date(b.created) - new Date(a.created),
        [],
    );

    const visible = useShapedRecords(normalised, {
        query,
        searchFields: ['title', 'description', 'source'],
        filters: { state: stateFilter, severity: severityFilter },
        sort: bySeverityThenAge,
    });

    const counts = useMemo(() => {
        const open_ = normalised.filter((s) => s.state === 'new');
        return {
            open: open_.length,
            urgent: open_.filter((s) => s.severity === 'critical' || s.severity === 'high').length,
            total: normalised.length,
        };
    }, [normalised]);

    const submit = async (event) => {
        event.preventDefault();
        if (!form.title.trim()) {
            setValidation('Give the signal a short title.');
            return;
        }
        setValidation('');
        const result = await create({
            title: form.title.trim(),
            description: form.description.trim(),
            source: form.source.trim(),
            type: form.type,
            severity: form.severity,
            state: 'new',
            confidence: form.confidence === '' ? null : Number(form.confidence),
        });
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.SIGNAL_CREATED, {
            signal_type: form.type,
            severity: form.severity,
            has_confidence: form.confidence !== '',
        });
        setForm(EMPTY_FORM);
        setOpen(false);
    };

    const setState = async (signal, next) => {
        setBusyId(signal.id);
        const result = await update(signal.id, {
            state: next,
            acknowledged_at: next === 'new' ? null : new Date().toISOString(),
        });
        setBusyId(null);
        if (!result.ok) return;
        if (next === 'acknowledged') {
            trackWorkspaceAction(WORKSPACE_ACTIONS.SIGNAL_ACKNOWLEDGED, {
                severity: signal.severity,
                signal_type: signal.type,
                age_minutes: Math.round((Date.now() - new Date(signal.created).getTime()) / 60000),
            });
        } else if (next === 'dismissed') {
            trackWorkspaceAction(WORKSPACE_ACTIONS.SIGNAL_DISMISSED, {
                severity: signal.severity,
                signal_type: signal.type,
            });
        }
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Signals"
                description="Observed changes in your business. Each entry shows its source, timestamp, confidence, and whether it's a fact, an inference, or information you provided."
                actions={
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={refresh}
                            disabled={loading}
                            aria-label="Refresh signals"
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
                                setOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            Add signal
                        </Button>
                    </div>
                }
            />


            {counts.total > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span>
                        <span className="font-semibold text-foreground">{counts.open}</span> awaiting
                        triage
                    </span>
                    <span>
                        <span
                            className={cn(
                                'font-semibold',
                                counts.urgent ? 'text-amber-warm' : 'text-foreground',
                            )}
                        >
                            {counts.urgent}
                        </span>{' '}
                        high or critical
                    </span>
                    <span>
                        <span className="font-semibold text-foreground">{counts.total}</span> collected
                    </span>
                </div>
            )}

            {records.length > 0 && (
                <ListToolbar
                    query={query}
                    onQueryChange={setQuery}
                    placeholder="Search signals"
                    resultCount={visible.length}
                    totalCount={records.length}
                    filters={[
                        {
                            key: 'state',
                            label: 'State',
                            value: stateFilter,
                            onChange: setStateFilter,
                            options: [
                                { value: 'all', label: 'All states' },
                                ...Object.entries(SIGNAL_STATE).map(([key, meta]) => ({
                                    value: key,
                                    label: meta.label,
                                })),
                            ],
                        },
                        {
                            key: 'severity',
                            label: 'Severity',
                            value: severityFilter,
                            onChange: setSeverityFilter,
                            options: [
                                { value: 'all', label: 'All severities' },
                                ...SEVERITY_ORDER.map((key) => ({
                                    value: key,
                                    label: SIGNAL_SEVERITY[key].label,
                                })),
                            ],
                        },
                    ]}
                />
            )}

            <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />

            {degraded ? (
                <DegradedNotice onRetry={refresh} />
            ) : loading ? (
                <ListSkeleton rows={4} />
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Radar}
                    title="No signals collected yet"
                    description="Signals are observed changes — a no-show spike, a schedule gap, a follow-up that slipped. Each one is labeled fact, inference, or user-provided so you always know what's measured versus guessed. Add your first signal, or connect a source in Operations to collect them automatically."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" onClick={() => setOpen(true)}>
                                <Plus className="h-4 w-4" />
                                Add a signal
                            </Button>
                            <DemoModeToggle />
                        </div>
                    }
                />
            ) : visible.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    {stateFilter === 'new'
                        ? 'Nothing is awaiting triage. Switch the state filter to see acknowledged and dismissed signals.'
                        : 'No signal matches those filters.'}
                </Card>
            ) : (
                <ul className="space-y-3">
                    {visible.map((signal) => {
                        const busy = busyId === signal.id;
                        const triaged = signal.state !== 'new';
                        return (
                            <li key={signal.id}>
                                <Card
                                    className={cn(
                                        'p-5 transition-opacity',
                                        signal.state === 'dismissed' && 'opacity-60',
                                    )}
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium">{signal.title}</p>
                                            {signal.description && (
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {signal.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                                            <StatusBadge
                                                map={SIGNAL_SEVERITY}
                                                value={signal.severity}
                                            />
                                            <StatusBadge map={SIGNAL_TYPE} value={signal.type} />
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                                        <span>Source: {signal.source || '—'}</span>
                                        <span>{timeAgo(signal.created)}</span>
                                        {signal.confidence != null && (
                                            <span>Confidence: {Math.round(signal.confidence)}%</span>
                                        )}
                                        <StatusBadge map={SIGNAL_STATE} value={signal.state} />
                                        {signal.acknowledged_at && (
                                            <span>Triaged {timeAgo(signal.acknowledged_at)}</span>
                                        )}
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {triaged ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={busy}
                                                onClick={() => setState(signal, 'new')}
                                            >
                                                <Undo2 className="h-4 w-4" />
                                                Reopen
                                            </Button>
                                        ) : (
                                            <>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => setState(signal, 'acknowledged')}
                                                >
                                                    {busy ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Check className="h-4 w-4" />
                                                    )}
                                                    Acknowledge
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() => setState(signal, 'dismissed')}
                                                >
                                                    <BellOff className="h-4 w-4" />
                                                    Dismiss
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
                    <DialogHeader>
                        <DialogTitle>Record a signal</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="sig-title">Title</Label>
                            <Input
                                id="sig-title"
                                value={form.title}
                                onChange={(event) => setField('title', event.target.value)}
                                placeholder="e.g. No-show rate up this week"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="sig-desc">Description</Label>
                            <Textarea
                                id="sig-desc"
                                value={form.description}
                                onChange={(event) => setField('description', event.target.value)}
                                placeholder="What changed and why it matters"
                                rows={3}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="sig-source">Source</Label>
                                <Input
                                    id="sig-source"
                                    value={form.source}
                                    onChange={(event) => setField('source', event.target.value)}
                                    placeholder="e.g. Appointment calendar"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sig-type">Type</Label>
                                <Select
                                    value={form.type}
                                    onValueChange={(value) => setField('type', value)}
                                >
                                    <SelectTrigger id="sig-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fact">Fact</SelectItem>
                                        <SelectItem value="inference">Inference</SelectItem>
                                        <SelectItem value="user">User-provided</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="sig-sev">Severity</Label>
                                <Select
                                    value={form.severity}
                                    onValueChange={(value) => setField('severity', value)}
                                >
                                    <SelectTrigger id="sig-sev">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SEVERITY_ORDER.map((key) => (
                                            <SelectItem key={key} value={key}>
                                                {SIGNAL_SEVERITY[key].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sig-conf">Confidence (0–100, optional)</Label>
                                <Input
                                    id="sig-conf"
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={form.confidence}
                                    onChange={(event) => setField('confidence', event.target.value)}
                                    placeholder="e.g. 72"
                                />
                            </div>
                        </div>
                        <WriteErrorNotice
                            message={validation || writeError}
                            onDismiss={clearWriteError}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="ghost" size="sm">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button type="submit" size="sm" disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save signal'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Facts come from connected sources. Inferences are BuildAndDo's best-effort
                conclusions and are always labeled as such. User-provided entries are things you
                told BuildAndDo directly. Acknowledging a signal records that you saw it — it does
                not resolve whatever caused it.
            </p>
        </div>
    );
}
