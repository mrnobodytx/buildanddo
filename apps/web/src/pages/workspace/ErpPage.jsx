import React, { useState } from 'react';
import {
    Boxes,
    Plus,
    Loader2,
    AlertCircle,
    Info,
    Target,
    ListTodo,
    Users,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import { PageHeader, StatusBadge } from '@/components/workspace/workspaceHelpers';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
const OBJECTIVE_STATUS = {
    active: { label: 'Active', tone: 'violet' },
    achieved: { label: 'Achieved', tone: 'teal' },
    archived: { label: 'Archived', tone: 'neutral' },
};
const TASK_STATUS = {
    todo: { label: 'To do', tone: 'neutral' },
    in_progress: { label: 'In progress', tone: 'violet' },
    done: { label: 'Done', tone: 'teal' },
};

function ObjectivesTab({ workspaceId }) {
    const { records, loading, refresh } = useWorkspaceRecords('erp_objectives', {
        enabled: !!workspaceId,
    });
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ title: '', description: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        if (saving) return;
        if (!form.title.trim()) {
            setError('Name the objective.');
            return;
        }
        setSaving(true);
        try {
            await pb.collection('erp_objectives').create({
                title: form.title.trim(),
                description: form.description.trim(),
                status: 'active',
                workspace: workspaceId,
                owner: pb.authStore.record.id,
            });
            setForm({ title: '', description: '' });
            setOpen(false);
            refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the objective.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="h-4 w-4" />
                            Add objective
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="border-border bg-card">
                        <DialogHeader>
                            <DialogTitle>Add a business objective</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={submit} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="obj-title">Objective</Label>
                                <Input
                                    id="obj-title"
                                    value={form.title}
                                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                                    placeholder="e.g. Cut no-shows to under 5%"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="obj-desc">Description</Label>
                                <Textarea
                                    id="obj-desc"
                                    value={form.description}
                                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                                    rows={3}
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
            </div>
            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Target}
                    title="No business objectives yet"
                    description="An objective is a goal this workspace works toward — like cutting no-shows or automating weekly summaries. Missions and tasks can tie back to it. Add your first one to give BuildAndDo direction."
                    action={
                        <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add objective
                        </Button>
                    }
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((o) => (
                        <li key={o.id}>
                            <Card className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-medium">{o.title}</p>
                                        {o.description && (
                                            <p className="mt-1 text-sm text-muted-foreground">{o.description}</p>
                                        )}
                                    </div>
                                    <StatusBadge map={OBJECTIVE_STATUS} value={o.status} />
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function TasksTab({ workspaceId }) {
    const { records, loading, refresh } = useWorkspaceRecords('erp_tasks', {
        enabled: !!workspaceId,
        expand: 'objective',
    });
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ title: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        if (saving) return;
        if (!form.title.trim()) {
            setError('Name the task.');
            return;
        }
        setSaving(true);
        try {
            await pb.collection('erp_tasks').create({
                title: form.title.trim(),
                status: 'todo',
                workspace: workspaceId,
                owner: pb.authStore.record.id,
            });
            setForm({ title: '' });
            setOpen(false);
            refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the task.');
        }
        setSaving(false);
    };

    const cycle = async (t) => {
        const next = t.status === 'todo' ? 'in_progress' : t.status === 'in_progress' ? 'done' : 'todo';
        try {
            await pb.collection('erp_tasks').update(t.id, { status: next });
            refresh();
        } catch (err) {
            console.error('update task failed', err);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="h-4 w-4" />
                            Add task
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="border-border bg-card">
                        <DialogHeader>
                            <DialogTitle>Add a task</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={submit} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="task-title">Task</Label>
                                <Input
                                    id="task-title"
                                    value={form.title}
                                    onChange={(e) => setForm({ title: e.target.value })}
                                    placeholder="e.g. Draft reminder message template"
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
            </div>
            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={ListTodo}
                    title="No tasks yet"
                    description="Tasks are the concrete steps behind your objectives. Add one when you know the next thing to do — BuildAndDo won't invent work for you."
                    action={
                        <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add task
                        </Button>
                    }
                />
            ) : (
                <ul className="space-y-2.5">
                    {records.map((t) => (
                        <li key={t.id}>
                            <Card className="flex items-center justify-between gap-3 p-4">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{t.title}</p>
                                    {t.expand?.objective && (
                                        <p className="truncate text-xs text-muted-foreground">
                                            Objective: {t.expand.objective.title}
                                        </p>
                                    )}
                                </div>
                                <button type="button" onClick={() => cycle(t)}>
                                    <StatusBadge map={TASK_STATUS} value={t.status} />
                                </button>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ContactsTab({ workspaceId }) {
    const { records, loading, refresh } = useWorkspaceRecords('erp_contacts', {
        enabled: !!workspaceId,
    });
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: '', role: '', email: '', notes: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const submit = async (e) => {
        e.preventDefault();
        if (saving) return;
        if (!form.name.trim()) {
            setError('A name is required.');
            return;
        }
        setSaving(true);
        try {
            await pb.collection('erp_contacts').create({
                name: form.name.trim(),
                role: form.role.trim(),
                email: form.email.trim(),
                notes: form.notes.trim(),
                workspace: workspaceId,
                owner: pb.authStore.record.id,
            });
            setForm({ name: '', role: '', email: '', notes: '' });
            setOpen(false);
            refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the contact.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="h-4 w-4" />
                            Add contact
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="border-border bg-card">
                        <DialogHeader>
                            <DialogTitle>Add a contact</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={submit} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="c-name">Name</Label>
                                <Input id="c-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="c-role">Role</Label>
                                    <Input id="c-role" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} placeholder="e.g. Front desk" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="c-email">Email</Label>
                                    <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="c-notes">Notes</Label>
                                <Textarea id="c-notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
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
            </div>
            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No contacts yet"
                    description="Keep a small list of people relevant to this workspace — staff, vendors, key clients. This is a lightweight foundation, not a full CRM. Connect Twenty in Operations when you need richer relationship records."
                    action={
                        <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Add contact
                        </Button>
                    }
                />
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {records.map((c) => (
                        <li key={c.id}>
                            <Card className="p-4">
                                <p className="font-medium">{c.name}</p>
                                {c.role && <p className="text-sm text-muted-foreground">{c.role}</p>}
                                {c.email && <p className="mt-1 text-xs text-muted-foreground">{c.email}</p>}
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function ErpPage() {
    const { active } = useWorkspace();
    return (
        <div className="space-y-8">
            <PageHeader
                title="ERP workspace"
                description="A deliberately small foundation: business objectives, tasks, and contacts for this workspace. It's not a full ERP suite — it's the structure real operational records can grow into."
            />

            <Tabs defaultValue="objectives">
                <TabsList>
                    <TabsTrigger value="objectives">Objectives</TabsTrigger>
                    <TabsTrigger value="tasks">Tasks</TabsTrigger>
                    <TabsTrigger value="contacts">Contacts</TabsTrigger>
                </TabsList>
                <TabsContent value="objectives" className="mt-6">
                    <ObjectivesTab workspaceId={active?.id} />
                </TabsContent>
                <TabsContent value="tasks" className="mt-6">
                    <TasksTab workspaceId={active?.id} />
                </TabsContent>
                <TabsContent value="contacts" className="mt-6">
                    <ContactsTab workspaceId={active?.id} />
                </TabsContent>
            </Tabs>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This ERP view is a foundation. BuildAndDo does not fabricate
                customer data, inventory, or financial records. Add what's real
                and connect a dedicated ERP system in Operations when you need more.
            </p>
        </div>
    );
}
