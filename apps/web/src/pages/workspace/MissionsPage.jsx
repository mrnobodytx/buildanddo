import React, { useState } from 'react';
import { Target, Plus, Loader2, AlertCircle, Info } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import {
    PageHeader,
    StatusBadge,
    MISSION_STATUS,
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

const STAGE_ORDER = [
    'proposed',
    'approved',
    'running',
    'needs_attention',
    'verified',
    'failed',
];

export default function MissionsPage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('missions', {
        sort: '-created',
    });
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ title: '', description: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active) return;
        if (!form.title.trim()) {
            setError('Give the mission a clear goal.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await pb.collection('missions').create({
                title: form.title.trim(),
                description: form.description.trim(),
                status: 'proposed',
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ title: '', description: '' });
            setOpen(false);
            refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not create the mission.');
        }
        setSaving(false);
    };

    const advance = async (mission) => {
        const idx = STAGE_ORDER.indexOf(mission.status);
        // Skip 'failed' when advancing normally.
        const next = STAGE_ORDER.find((s, i) => i > idx && s !== 'failed');
        if (!next) return;
        try {
            await pb.collection('missions').update(mission.id, { status: next });
            refresh();
        } catch (err) {
            console.error('advance mission failed', err);
        }
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Challenge Desk"
                description="A mission is a bounded, approved task with a clear goal and scope. You review the plan before anything runs, and you can inspect what BuildAndDo observed, decided, attempted, and verified."
                actions={
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4" />
                                Start a mission
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="border-border bg-card">
                            <DialogHeader>
                                <DialogTitle>Start a mission</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={submit} className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="m-title">Goal</Label>
                                    <Input
                                        id="m-title"
                                        value={form.title}
                                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                                        placeholder="e.g. Reduce next-week no-shows with reminder texts"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="m-desc">Scope & plan</Label>
                                    <Textarea
                                        id="m-desc"
                                        value={form.description}
                                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                                        placeholder="What's in scope, what's out, and how success is verified"
                                        rows={4}
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
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Propose mission'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                }
            />

            {/* Stage legend */}
            <div className="flex flex-wrap gap-2">
                {STAGE_ORDER.map((s) => (
                    <StatusBadge key={s} map={MISSION_STATUS} value={s} />
                ))}
            </div>

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Target}
                    title="No missions yet"
                    description="Start a mission to turn a signal into a bounded task. It begins as 'proposed' — you approve it before BuildAndDo runs anything, and you verify the outcome when it's done."
                    action={
                        <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Start a mission
                        </Button>
                    }
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((m) => {
                        const canAdvance =
                            m.status !== 'verified' && m.status !== 'failed';
                        return (
                            <li key={m.id}>
                                <Card className="p-5">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium">{m.title}</p>
                                            {m.description && (
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {m.description}
                                                </p>
                                            )}
                                        </div>
                                        <StatusBadge map={MISSION_STATUS} value={m.status} />
                                    </div>
                                    {canAdvance && (
                                        <div className="mt-4 border-t border-border/60 pt-3">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => advance(m)}
                                            >
                                                Advance to next stage
                                            </Button>
                                        </div>
                                    )}
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                'Proposed' and 'approved' mean nothing has run yet. 'Running'
                means an approved action is in progress. 'Verified' means the
                outcome was checked against evidence.
            </p>
        </div>
    );
}
