import React, { useState } from 'react';
import { Newspaper, Plus, Loader2, AlertCircle, Info } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Button, Card, Rule, StatePill, ProvenanceTag } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

export default function DailyEditionPage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('daily_editions', { sort: '-created' });
    const [show, setShow] = useState(false);
    const [form, setForm] = useState({ title: '', summary: '', body: '', edition_date: '', status: 'draft' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const set = (f, v) => setForm((p) => ({ ...p, [f]: v }));

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active || !form.title.trim()) return;
        setSaving(true); setError('');
        try {
            await pb.collection('daily_editions').create({
                title: form.title.trim(),
                summary: form.summary.trim(),
                body: form.body.trim(),
                edition_date: form.edition_date || null,
                status: form.status,
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ title: '', summary: '', body: '', edition_date: '', status: 'draft' });
            setShow(false); refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the edition.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Daily Edition"
                description="Real daily intelligence and report records from your workspace. The first edition appears only after verified events exist — no sample headlines."
                actions={
                    <Button size="sm" onClick={() => setShow((s) => !s)}>
                        <Plus className="h-4 w-4" /> {show ? 'Close' : 'New edition'}
                    </Button>
                }
            />

            {show && (
                <Card className="p-5">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="ed-title">Headline</Label>
                            <Input id="ed-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Friday no-shows down 40% after reminder mission" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ed-summary">Standfirst (summary)</Label>
                            <Input id="ed-summary" value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="One-sentence summary of today's intelligence" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ed-body">Body</Label>
                            <Textarea id="ed-body" value={form.body} onChange={(e) => set('body', e.target.value)} rows={6} placeholder="The full edition body — what changed, what was done, what was verified." />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="ed-date">Edition date</Label>
                                <Input id="ed-date" type="date" value={form.edition_date} onChange={(e) => set('edition_date', e.target.value)} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="ed-status">Status</Label>
                                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                                    <SelectTrigger id="ed-status"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="published">Published</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                        <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save edition'}</Button>
                    </form>
                </Card>
            )}

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Newspaper}
                    title="No editions yet"
                    description="The first edition will appear after the system receives verified events. No sample headlines are generated. Create one manually once you have real intelligence to record."
                    action={<Button size="sm" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> New edition</Button>}
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((r) => (
                        <li key={r.id}>
                            <Card className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-display text-lg font-semibold">{r.title}</p>
                                        {r.summary && <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>}
                                    </div>
                                    <StatePill state={r.status} />
                                </div>
                                {r.body && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{r.body}</p>}
                                <Rule className="my-3" />
                                <ProvenanceTag source="workspace record" timestamp={fmtDate(r.edition_date || r.created)} />
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                An edition is a real record. It is never auto-filled with invented headlines.
            </p>
        </div>
    );
}
