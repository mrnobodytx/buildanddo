import React, { useState } from 'react';
import { Workflow, Plus, Loader2, AlertCircle, Info } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { usePreviousWork } from '@/hooks/usePreviousWork';
import EmptyState from '@/components/workspace/EmptyState';
import PreviousWorkNote from '@/components/workspace/PreviousWorkNote';
import {
    PageHeader,
    StatusBadge,
    WORKFLOW_STATUS,
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

export default function WorkflowsPage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('workflows', {
        sort: '-created',
    });
    const { history } = usePreviousWork(
        'workflow',
        records.map((w) => w.id),
    );
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: '', description: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active) return;
        if (!form.name.trim()) {
            setError('Name the workflow.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await pb.collection('workflows').create({
                name: form.name.trim(),
                description: form.description.trim(),
                status: 'draft',
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ name: '', description: '' });
            setOpen(false);
            refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not create the workflow.');
        }
        setSaving(false);
    };

    const toggleStatus = async (w) => {
        const next = w.status === 'active' ? 'paused' : 'active';
        try {
            await pb.collection('workflows').update(w.id, { status: next });
            refresh();
        } catch (err) {
            console.error('update workflow failed', err);
        }
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Workflows"
                description="Repeatable automations for this workspace. Workflows start as drafts — you activate them once the steps and boundaries are clear. Connect n8n in Operations to run them outside BuildAndDo."
                actions={
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4" />
                                Create workflow
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="border-border bg-card">
                            <DialogHeader>
                                <DialogTitle>Create a workflow</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={submit} className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="w-name">Name</Label>
                                    <Input
                                        id="w-name"
                                        value={form.name}
                                        onChange={(e) =>
                                            setForm((p) => ({ ...p, name: e.target.value }))
                                        }
                                        placeholder="e.g. Weekly appointment reminders"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="w-desc">What it does</Label>
                                    <Textarea
                                        id="w-desc"
                                        value={form.description}
                                        onChange={(e) =>
                                            setForm((p) => ({
                                                ...p,
                                                description: e.target.value,
                                            }))
                                        }
                                        placeholder="Trigger, steps, and where the result lands"
                                        rows={3}
                                    />
                                </div>
                                {error && (
                                    <p
                                        className="flex items-start gap-2 text-sm text-destructive"
                                        role="alert"
                                    >
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
                                        {saving ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            'Create draft'
                                        )}
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
                    icon={Workflow}
                    title="No workflows connected"
                    description="A workflow is a repeatable automation — reminders, follow-ups, end-of-week summaries. Define one here as a draft, then connect n8n in Operations to actually run it. BuildAndDo won't pretend to execute automations that aren't wired up."
                    action={
                        <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Create a workflow
                        </Button>
                    }
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((w) => (
                        <li key={w.id}>
                            <Card className="p-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="font-medium">{w.name}</p>
                                        {w.description && (
                                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                {w.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <StatusBadge map={WORKFLOW_STATUS} value={w.status} />
                                    </div>
                                </div>
                                <PreviousWorkNote history={history[w.id]} />
                                <div className="mt-4 border-t border-border/60 pt-3">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => toggleStatus(w)}
                                        disabled={w.status === 'draft'}
                                    >
                                        {w.status === 'active' ? 'Pause' : 'Activate'}
                                    </Button>
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Activating a workflow here marks its intent. Actual execution
                happens in your connected n8n instance — BuildAndDo does not
                run automations on its own.
            </p>
        </div>
    );
}
