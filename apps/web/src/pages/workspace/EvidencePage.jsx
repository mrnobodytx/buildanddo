import React, { useState } from 'react';
import { FileSearch, Plus, Loader2, AlertCircle, Info } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import {
    PageHeader,
    StatusBadge,
    EVIDENCE_TYPE,
} from '@/components/workspace/workspaceHelpers';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

function timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function EvidencePage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('evidence', {
        sort: '-created',
        expand: 'mission',
    });
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ content: '', type: 'observed', source: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active) return;
        if (!form.content.trim()) {
            setError('Describe what was observed, decided, attempted, or verified.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await pb.collection('evidence').create({
                content: form.content.trim(),
                type: form.type,
                source: form.source.trim(),
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ content: '', type: 'observed', source: '' });
            setOpen(false);
            refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the evidence.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Evidence & replay"
                description="Inspect what BuildAndDo observed, decided, attempted, and verified. Every mission's trail lives here so you can replay the reasoning and check the outcome — not just trust a result."
                actions={
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4" />
                                Add evidence
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="border-border bg-card">
                            <DialogHeader>
                                <DialogTitle>Record evidence</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={submit} className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="ev-type">Type</Label>
                                    <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                                        <SelectTrigger id="ev-type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="observed">Observed</SelectItem>
                                            <SelectItem value="decided">Decided</SelectItem>
                                            <SelectItem value="attempted">Attempted</SelectItem>
                                            <SelectItem value="verified">Verified</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="ev-content">What happened</Label>
                                    <Textarea
                                        id="ev-content"
                                        value={form.content}
                                        onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                                        rows={4}
                                        placeholder="Describe the observation, decision, attempt, or verification"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="ev-source">Source (optional)</Label>
                                    <Input
                                        id="ev-source"
                                        value={form.source}
                                        onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                                        placeholder="e.g. Appointment calendar, n8n run"
                                    />
                                </div>
                                {error && (
                                    <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                        {error}
                                    </p>
                                )}
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button type="button" variant="ghost" size="sm">Cancel</Button>
                                    </DialogClose>
                                    <Button type="submit" size="sm" disabled={saving}>
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                }
            />

            <div className="flex flex-wrap gap-2">
                {Object.entries(EVIDENCE_TYPE).map(([key, meta]) => (
                    <StatusBadge key={key} map={EVIDENCE_TYPE} value={key} />
                ))}
            </div>

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={FileSearch}
                    title="No evidence available yet"
                    description="Evidence is the trail behind every mission — what was observed, what BuildAndDo decided, what it attempted, and what was verified. It appears here as missions run. Add a note manually, or start a mission to generate it."
                    action={
                        <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add evidence
                        </Button>
                    }
                />
            ) : (
                <ol className="relative space-y-4 border-l border-border/60 pl-6">
                    {records.map((ev) => (
                        <li key={ev.id} className="relative">
                            <span className="absolute -left-[31px] top-1 flex h-3 w-3 items-center justify-center rounded-full border border-border bg-background">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            </span>
                            <Card className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm leading-relaxed">{ev.content}</p>
                                    <StatusBadge map={EVIDENCE_TYPE} value={ev.type} />
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    {ev.expand?.mission && (
                                        <span>Mission: {ev.expand.mission.title}</span>
                                    )}
                                    {ev.source && <span>Source: {ev.source}</span>}
                                    <span>{timeAgo(ev.created)}</span>
                                </div>
                            </Card>
                        </li>
                    ))}
                </ol>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                'Verified' evidence means an outcome was checked against a real
                source — not that BuildAndDo guaranteed a result. 'Attempted'
                means an approved action ran; its success still needs verifying.
            </p>
        </div>
    );
}
