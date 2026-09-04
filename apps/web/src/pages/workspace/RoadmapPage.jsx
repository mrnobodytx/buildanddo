import React, { useState } from 'react';
import { Gauge, Plus, Loader2, AlertCircle, Info } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Button, Card, Rule, StatePill, ProvenanceTag } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const STATUSES = ['proposed', 'planned', 'in_progress', 'blocked', 'verified', 'archived'];

export default function WorkspaceRoadmapPage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('roadmap_items', { sort: '-created' });
    const [show, setShow] = useState(false);
    const [form, setForm] = useState({
        title: '', description: '', status: 'proposed',
        owner_role: '', evidence_ref: '', dependency: '', next_action: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const set = (f, v) => setForm((p) => ({ ...p, [f]: v }));

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active || !form.title.trim()) return;
        if (form.status === 'verified' && !form.evidence_ref.trim()) {
            setError('A roadmap item cannot be marked Verified without an evidence reference or explicit confirmation.');
            return;
        }
        setSaving(true); setError('');
        try {
            await pb.collection('roadmap_items').create({
                title: form.title.trim(),
                description: form.description.trim(),
                status: form.status,
                owner_role: form.owner_role.trim(),
                evidence_ref: form.evidence_ref.trim(),
                dependency: form.dependency.trim(),
                next_action: form.next_action.trim(),
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ title: '', description: '', status: 'proposed', owner_role: '', evidence_ref: '', dependency: '', next_action: '' });
            setShow(false); refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the roadmap item.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Roadmap"
                description="A real operational roadmap driven by actual records. Each item carries owner, status, evidence link, timestamp, dependency, and next action. An item is never marked complete from a prompt alone — Verified requires an evidence record or explicit user confirmation."
                actions={
                    <Button size="sm" onClick={() => setShow((s) => !s)}>
                        <Plus className="h-4 w-4" /> {show ? 'Close' : 'New item'}
                    </Button>
                }
            />

            <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => <StatePill key={s} state={s} />)}
            </div>

            {show && (
                <Card className="p-5">
                    <form onSubmit={submit} className="space-y-4">
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
                                <select id="rm-status" value={form.status} onChange={(e) => set('status', e.target.value)} className="h-9 border border-border bg-background px-3 text-sm">
                                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
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
                        {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                        <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save item'}</Button>
                    </form>
                </Card>
            )}

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Gauge}
                    title="No roadmap items yet"
                    description="Add a real item with an owner, status, dependency, and next action. Verified status requires an evidence reference — it cannot be set from a prompt alone."
                    action={<Button size="sm" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> New item</Button>}
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((r) => (
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
                                <div className="mt-3"><ProvenanceTag source="workspace record" timestamp={r.created ? new Date(r.created).toLocaleString() : ''} /></div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Roadmap items are real records. Verified requires an evidence link or explicit confirmation stored in the system.
            </p>
        </div>
    );
}
