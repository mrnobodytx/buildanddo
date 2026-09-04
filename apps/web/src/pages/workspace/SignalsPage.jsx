import React, { useState } from 'react';
import { Radar, Plus, Loader2, AlertCircle, Info } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import {
    PageHeader,
    StatusBadge,
    SIGNAL_TYPE,
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

export default function SignalsPage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('signals', {
        sort: '-created',
    });
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        title: '',
        description: '',
        source: '',
        type: 'fact',
        confidence: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const setField = (f, v) => setForm((p) => ({ ...p, [f]: v }));

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active) return;
        if (!form.title.trim()) {
            setError('Give the signal a short title.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await pb.collection('signals').create({
                title: form.title.trim(),
                description: form.description.trim(),
                source: form.source.trim(),
                type: form.type,
                confidence: form.confidence === '' ? null : Number(form.confidence),
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ title: '', description: '', source: '', type: 'fact', confidence: '' });
            setOpen(false);
            refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the signal.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Signals"
                description="Observed changes in your business. Each entry shows its source, timestamp, confidence, and whether it's a fact, an inference, or information you provided."
                actions={
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4" />
                                Add signal
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="border-border bg-card">
                            <DialogHeader>
                                <DialogTitle>Record a signal</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={submit} className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="sig-title">Title</Label>
                                    <Input
                                        id="sig-title"
                                        value={form.title}
                                        onChange={(e) => setField('title', e.target.value)}
                                        placeholder="e.g. No-show rate up this week"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="sig-desc">Description</Label>
                                    <Textarea
                                        id="sig-desc"
                                        value={form.description}
                                        onChange={(e) => setField('description', e.target.value)}
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
                                            onChange={(e) => setField('source', e.target.value)}
                                            placeholder="e.g. Appointment calendar"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="sig-type">Type</Label>
                                        <Select value={form.type} onValueChange={(v) => setField('type', v)}>
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
                                <div className="grid gap-2">
                                    <Label htmlFor="sig-conf">Confidence (0–100, optional)</Label>
                                    <Input
                                        id="sig-conf"
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={form.confidence}
                                        onChange={(e) => setField('confidence', e.target.value)}
                                        placeholder="e.g. 72"
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
                }
            />

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Radar}
                    title="No signals collected yet"
                    description="Signals are observed changes — a no-show spike, a schedule gap, a follow-up that slipped. Each one is labeled fact, inference, or user-provided so you always know what's measured versus guessed. Add your first signal, or connect a source in Operations to collect them automatically."
                    action={
                        <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add a signal
                        </Button>
                    }
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((s) => (
                        <li key={s.id}>
                            <Card className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-medium">{s.title}</p>
                                        {s.description && (
                                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                {s.description}
                                            </p>
                                        )}
                                    </div>
                                    <StatusBadge map={SIGNAL_TYPE} value={s.type} />
                                </div>
                                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                                    <span>Source: {s.source || '—'}</span>
                                    <span>{timeAgo(s.created)}</span>
                                    {s.confidence != null && (
                                        <span>Confidence: {Math.round(s.confidence)}%</span>
                                    )}
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Facts come from connected sources. Inferences are BuildAndDo's
                best-effort conclusions and are always labeled as such.
                User-provided entries are things you told BuildAndDo directly.
            </p>
        </div>
    );
}
