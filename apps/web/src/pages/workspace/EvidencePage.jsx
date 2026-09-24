// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/EvidencePage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js, apps/web/src/lib/workspaceActions.js, apps/web/src/components/workspace/EvidenceInspector.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js; PRODUCES workspace.evidence.create; CONSUMES apps/web/src/components/workspace/EvidenceInspector.jsx; CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json
// Intent:      Make the evidence trail searchable and linkable, so a ledger stays a ledger past its first thirty entries.
// ───────────────────────────────────────────────────────────────

import { ExternalLink, FileSearch, Info, Link2, Loader2, Plus, Tag } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import broadcastCurriculum from '../../../../pocketbase/pb_migrations/data/broadcast-classroom-lessons.json';

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
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import EvidenceInspector from '@/components/workspace/EvidenceInspector';
import { safeEvidenceUrl } from '@/lib/evidenceInspection';
import { lessonLink } from '@/lib/tutorialCurriculum';
import ListToolbar from '@/components/workspace/ListToolbar';
import {
    EVIDENCE_TYPE,
    PageHeader,
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

const EMPTY_FORM = {
    title: '',
    content: '',
    type: 'observed',
    category: '',
    source: '',
    url: '',
    tags: '',
    mission: '',
};

const CATEGORIES = ['measurement', 'decision', 'execution', 'document', 'correspondence'];

const splitTags = (value) =>
    String(value || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

function SourceCaseStudies() {
    const tutorial = broadcastCurriculum.lessons[0];
    const evidence = broadcastCurriculum.source_evidence;
    const observation = evidence.observation;
    return <section aria-labelledby="source-case-studies" className="space-y-4 border-t border-border pt-6">
        <h2 id="source-case-studies" className="font-display text-xl font-semibold">Source case studies</h2>
        <p className="text-sm leading-6 text-muted-foreground">{evidence.boundary}</p>
        <p className="text-sm leading-6 text-muted-foreground">Public learning material, separate from workspace evidence records, totals and verification badges. It does not verify mission outcomes or award progress or XP.</p>
        <Card className="min-w-0 space-y-3 p-5">
            <h3 className="font-display text-lg font-semibold">{tutorial.title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{tutorial.summary}</p>
            <p className="text-xs text-muted-foreground">Curriculum {broadcastCurriculum.version}</p>
            <Link to={`/app/tutorials?lesson=${encodeURIComponent(tutorial.slug)}`} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Read the repair lesson</Link>
            <p className="text-sm">{evidence.validation.map((check) => `${check.label}: ${check.status}`).join(' | ')}</p>
            <details className="space-y-3">
                <summary className="cursor-pointer py-2 text-sm font-semibold">Validation evidence and public source references</summary>
                <div className="space-y-2 text-sm" aria-label="Recorded source run">
                    <p>Local source run: {observation.counts.pass}/{observation.counts.tests} passed, {observation.counts.fail} failed, {observation.counts.skipped} skipped. Node {observation.runtime}.</p>
                    <p>Observed <time dateTime={observation.observed_at}>{observation.observed_at}</time>. These results used explicit local doubles, not a native backend or live media.</p>
                    <p className="break-all font-mono text-xs">Tested source SHA-256: {observation.source_sha256}</p>
                    <p className="break-all font-mono text-xs">Captured command-output SHA-256: {observation.output_sha256}</p>
                    <a href={lessonLink(evidence.artifact.url)} download className="inline-flex min-h-11 items-center underline underline-offset-4">Download the captured source test output</a>
                    <p className="break-all font-mono text-xs">Public capture SHA-256: {evidence.artifact.sha256}</p>
                    <p className="text-xs text-muted-foreground">The source fingerprint covers the listed files, not a deployed release or the whole repository. Hashes check consistency, not reviewer identity.</p>
                    <ul aria-label="Tested source scope" className="space-y-1 break-all font-mono text-xs">{observation.source_files.map((path) => <li key={path}>{path}</li>)}</ul>
                </div>
                <ul aria-label="Case study validation plan" className="space-y-4 text-sm leading-6">
                    {evidence.validation.map((check) => <li key={check.label} className="space-y-2">
                        <h4 className="font-semibold">{check.label}: {check.status}</h4>
                        <p className="text-muted-foreground">{check.description}</p>
                        {check.commands.map((command) => <code key={command} className="block whitespace-pre-wrap break-all rounded border border-border p-3 text-xs">{command}</code>)}
                    </li>)}
                </ul>
                <nav aria-label="Case study source references" className="space-y-2 text-sm">
                    <p className="text-muted-foreground">These links inspect the pre-repair source and test definitions, not recorded results for the repair candidate.</p>
                    {tutorial.lesson.references.filter((reference) => reference.url.startsWith('https://')).map((reference) =>
                        <a key={reference.url} href={lessonLink(reference.url)} target="_blank" rel="noopener noreferrer" className="block break-words text-primary underline underline-offset-4">{reference.label}<span className="sr-only"> (opens in a new tab)</span></a>)}
                </nav>
            </details>
        </Card>
    </section>;
}

export default function EvidencePage() {
    const [params, setParams] = useSearchParams();
    const { active } = useWorkspace();
    const selectedId = params.get('evidence') || '';
    const selectEvidence = (id) => { const next = new URLSearchParams(params); if (id) next.set('evidence', id); else next.delete('evidence'); setParams(next); };
    const {
        records,
        loading,
        degraded,
        refresh,
        create,
        saving,
        writeError,
        clearWriteError,
    } = useWorkspaceRecords('evidence', { sort: '-created', expand: 'mission' });

    const missions = useWorkspaceRecords('missions', { sort: '-created' });

    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [validation, setValidation] = useState('');
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    // The category filter offers what the workspace actually holds plus the
    // suggested set, so a category typed once is still filterable later.
    const categoryOptions = useMemo(() => {
        const used = new Set(records.map((record) => record.category).filter(Boolean));
        CATEGORIES.forEach((category) => used.add(category));
        return Array.from(used).sort();
    }, [records]);

    const newestFirst = useMemo(() => (a, b) => new Date(b.created) - new Date(a.created), []);

    const visible = useShapedRecords(records, {
        query,
        searchFields: ['title', 'content', 'source', 'tags', 'category'],
        filters: { type: typeFilter, category: categoryFilter },
        sort: newestFirst,
    });

    const submit = async (event) => {
        event.preventDefault();
        if (!form.content.trim()) {
            setValidation('Describe what was observed, decided, attempted, or verified.');
            return;
        }
        setValidation('');
        const result = await create({
            title: form.title.trim(),
            content: form.content.trim(),
            type: form.type,
            category: form.category.trim(),
            source: form.source.trim(),
            url: form.url.trim(),
            tags: splitTags(form.tags).join(', '),
            mission: form.mission || null,
        });
        if (!result.ok) return;

        setForm(EMPTY_FORM);
        setOpen(false);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Evidence & replay"
                description="Inspect what BuildAndDo observed, decided, attempted, and verified. Every mission's trail lives here so you can replay the reasoning and check the outcome — not just trust a result."
                actions={
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
                        Add evidence
                    </Button>
                }
            />


            <Link to="/app/research" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Submit and review research sources</Link>
            <div className="flex flex-wrap gap-2">
                {Object.keys(EVIDENCE_TYPE).map((key) => (
                    <StatusBadge key={key} map={EVIDENCE_TYPE} value={key} />
                ))}
            </div>

            {records.length > 0 && (
                <ListToolbar
                    query={query}
                    onQueryChange={setQuery}
                    placeholder="Search evidence, sources and tags"
                    resultCount={visible.length}
                    totalCount={records.length}
                    filters={[
                        {
                            key: 'type',
                            label: 'Type',
                            value: typeFilter,
                            onChange: setTypeFilter,
                            options: [
                                { value: 'all', label: 'All types' },
                                ...Object.entries(EVIDENCE_TYPE).map(([key, meta]) => ({
                                    value: key,
                                    label: meta.label,
                                })),
                            ],
                        },
                        {
                            key: 'category',
                            label: 'Category',
                            value: categoryFilter,
                            onChange: setCategoryFilter,
                            options: [
                                { value: 'all', label: 'All categories' },
                                ...categoryOptions.map((category) => ({
                                    value: category,
                                    label: category,
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
                    icon={FileSearch}
                    title="No evidence available yet"
                    description="Evidence is the trail behind every mission — what was observed, what BuildAndDo decided, what it attempted, and what was verified. It appears here as missions run. Add a note manually, or start a mission to generate it."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" onClick={() => setOpen(true)}>
                                <Plus className="h-4 w-4" />
                                Add evidence
                            </Button>
                            <DemoModeToggle />
                        </div>
                    }
                />
            ) : visible.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    No evidence matches that search.
                </Card>
            ) : (
                <ol className="relative space-y-4 border-l border-border/60 pl-6">
                    {visible.map((entry) => (
                        <li key={entry.id} className="relative">
                            <span className="absolute -left-[31px] top-1 flex h-3 w-3 items-center justify-center rounded-full border border-border bg-background">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            </span>
                            <Card className="p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        {entry.title && (
                                            <p className="font-medium">{entry.title}</p>
                                        )}
                                        <p className="mt-1 text-sm leading-relaxed">{entry.content}</p>
                                    </div>
                                    <StatusBadge
                                        map={EVIDENCE_TYPE}
                                        value={entry.type}
                                        className="shrink-0"
                                    />
                                </div>

                                <Button size="sm" variant="ghost" onClick={() => selectEvidence(entry.id)}>Inspect evidence</Button>
                                <Link className="ml-3 text-sm underline" to={`/app/evidence?evidence=${encodeURIComponent(entry.id)}`}>Evidence link</Link>
                                {safeEvidenceUrl(entry.url) && (
                                    <a
                                        href={safeEvidenceUrl(entry.url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                                    >
                                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{entry.url}</span>
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                )}

                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    {entry.expand && entry.expand.mission && (
                                        <span>Mission: {entry.expand.mission.title}</span>
                                    )}
                                    {entry.category && <span>Category: {entry.category}</span>}
                                    {entry.source && <span>Source: {entry.source}</span>}
                                    <span>{timeAgo(entry.created)}</span>
                                </div>

                                {splitTags(entry.tags).length > 0 && (
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        {splitTags(entry.tags).map((tag) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => setQuery(tag)}
                                                className="font-evidence inline-flex items-center gap-1 border border-border bg-secondary/40 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                <Tag className="h-3 w-3" />
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        </li>
                    ))}
                </ol>
            )}

            <EvidenceInspector id={selectedId} records={records} missions={missions.records} workspace={active?.id}
                loading={loading || missions.loading} unavailable={degraded || missions.degraded} onClose={() => selectEvidence('')} />
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Record evidence</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="ev-type">Type</Label>
                                <Select value={form.type} onValueChange={(value) => set('type', value)}>
                                    <SelectTrigger id="ev-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(EVIDENCE_TYPE).map(([key, meta]) => (
                                            <SelectItem key={key} value={key}>
                                                {meta.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="ev-category">Category</Label>
                                <Select
                                    value={form.category || 'measurement'}
                                    onValueChange={(value) => set('category', value)}
                                >
                                    <SelectTrigger id="ev-category">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map((category) => (
                                            <SelectItem key={category} value={category}>
                                                {category}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ev-title">Title (optional)</Label>
                            <Input
                                id="ev-title"
                                value={form.title}
                                onChange={(event) => set('title', event.target.value)}
                                placeholder="A line you could find this by later"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ev-content">What happened</Label>
                            <Textarea
                                id="ev-content"
                                value={form.content}
                                onChange={(event) => set('content', event.target.value)}
                                rows={4}
                                placeholder="Describe the observation, decision, attempt, or verification"
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="ev-source">Source (optional)</Label>
                                <Input
                                    id="ev-source"
                                    value={form.source}
                                    onChange={(event) => set('source', event.target.value)}
                                    placeholder="e.g. Appointment calendar, n8n run"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="ev-url">Link (optional)</Label>
                                <Input
                                    id="ev-url"
                                    type="url"
                                    value={form.url}
                                    onChange={(event) => set('url', event.target.value)}
                                    placeholder="https://"
                                />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ev-tags">Tags (comma separated, optional)</Label>
                            <Input
                                id="ev-tags"
                                value={form.tags}
                                onChange={(event) => set('tags', event.target.value)}
                                placeholder="reminders, no-shows"
                            />
                        </div>
                        {missions.records.length > 0 && (
                            <div className="grid gap-2">
                                <Label htmlFor="ev-mission">Attach to a mission (optional)</Label>
                                <Select
                                    value={form.mission || 'none'}
                                    onValueChange={(value) =>
                                        set('mission', value === 'none' ? '' : value)
                                    }
                                >
                                    <SelectTrigger id="ev-mission">
                                        <SelectValue placeholder="No mission" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No mission</SelectItem>
                                        {missions.records.map((mission) => (
                                            <SelectItem key={mission.id} value={mission.id}>
                                                {mission.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
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
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                'Verified' evidence means an outcome was checked against a real source — not that
                BuildAndDo guaranteed a result. 'Attempted' means an approved action ran; its
                success still needs verifying. A link points at evidence held elsewhere; BuildAndDo
                stores the reference, not a copy.
            </p>
            <SourceCaseStudies />
        </div>
    );
}
