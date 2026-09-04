import React, { useState } from 'react';
import { Scale, Plus, Loader2, AlertCircle, Info } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Button, Card, Rule, StatePill, ProvenanceTag } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function CorrectionsPage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('corrections', { sort: '-created' });
    const [show, setShow] = useState(false);
    const [form, setForm] = useState({ prior_prediction: '', observed_result: '', status: 'pending', reference: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const set = (f, v) => setForm((p) => ({ ...p, [f]: v }));

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active || !form.prior_prediction.trim()) return;
        setSaving(true); setError('');
        try {
            await pb.collection('corrections').create({
                prior_prediction: form.prior_prediction.trim(),
                observed_result: form.observed_result.trim(),
                status: form.status,
                reference: form.reference.trim(),
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ prior_prediction: '', observed_result: '', status: 'pending', reference: '' });
            setShow(false); refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the correction.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Corrections & Verification"
                description="A correction appears only when the system has an actual prior prediction and a later observed result to compare it against. Empty state is the truthful default."
                actions={
                    <Button size="sm" onClick={() => setShow((s) => !s)}>
                        <Plus className="h-4 w-4" /> {show ? 'Close' : 'Record correction'}
                    </Button>
                }
            />

            {show && (
                <Card className="p-5">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="co-prior">Prior prediction</Label>
                            <Textarea id="co-prior" value={form.prior_prediction} onChange={(e) => set('prior_prediction', e.target.value)} rows={3} placeholder="What was predicted or claimed earlier" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="co-obs">Observed result</Label>
                            <Textarea id="co-obs" value={form.observed_result} onChange={(e) => set('observed_result', e.target.value)} rows={3} placeholder="What was actually observed later" />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="co-status">Status</Label>
                                <select id="co-status" value={form.status} onChange={(e) => set('status', e.target.value)} className="h-9 border border-border bg-background px-3 text-sm">
                                    <option value="pending">Pending</option>
                                    <option value="verified">Verified</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="co-ref">Reference / receipt</Label>
                                <Input id="co-ref" value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Optional reference id" />
                            </div>
                        </div>
                        {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                        <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save correction'}</Button>
                    </form>
                </Card>
            )}

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Scale}
                    title="No verified corrections yet"
                    description="Corrections are recorded once a prediction is checked against an observed outcome. None exist in this workspace yet."
                    action={<Button size="sm" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Record a correction</Button>}
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((r) => (
                        <li key={r.id}>
                            <Card className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm font-medium">Prior: {r.prior_prediction}</p>
                                    <StatePill state={r.status} />
                                </div>
                                {r.observed_result && <p className="mt-2 text-sm text-muted-foreground">Observed: {r.observed_result}</p>}
                                <Rule className="my-3" />
                                <ProvenanceTag source="workspace record" timestamp={r.created ? new Date(r.created).toLocaleString() : ''} />
                                {r.reference && <p className="mt-2 font-evidence text-[11px] text-muted-foreground">ref: {r.reference}</p>}
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Corrections are honest records of being wrong. They are never generated to look active.
            </p>
        </div>
    );
}
