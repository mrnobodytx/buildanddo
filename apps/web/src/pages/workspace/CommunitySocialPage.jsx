import React, { useState } from 'react';
import { Plus, Loader2, AlertCircle, Info, Plug, CalendarDays } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import EmptyState from '@/components/workspace/EmptyState';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Button, Card, Rule, StatePill, ProvenanceTag } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const PLATFORMS = [
    { key: 'discord', label: 'Discord', note: 'Community server connection and health.' },
    { key: 'youtube', label: 'YouTube', note: 'Video channel.' },
    { key: 'x', label: 'X', note: 'Posts and engagement.' },
    { key: 'linkedin', label: 'LinkedIn', note: 'Professional posts.' },
    { key: 'instagram', label: 'Instagram', note: 'Visual posts.' },
    { key: 'tiktok', label: 'TikTok', note: 'Short video.' },
    { key: 'bluesky', label: 'Bluesky', note: 'Posts and engagement.' },
];

export default function CommunitySocialPage() {
    const { active } = useWorkspace();
    const { records: channels, loading: chLoading, refresh: refreshCh } = useWorkspaceRecords('social_channels');
    const { records: content, loading: coLoading, refresh: refreshCo } = useWorkspaceRecords('social_content', { sort: '-created' });
    const [busy, setBusy] = useState('');
    const [show, setShow] = useState(false);
    const [form, setForm] = useState({ title: '', body: '', status: 'draft', channel: '', scheduled_for: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const byPlatform = (key) => channels.find((c) => c.platform === key);

    const connect = async (key) => {
        if (!active) return;
        setBusy(key); setError('');
        try {
            const existing = byPlatform(key);
            if (existing) {
                await pb.collection('social_channels').update(existing.id, { status: 'pending' });
            } else {
                await pb.collection('social_channels').create({
                    platform: key, status: 'pending',
                    workspace: active.id, owner: pb.authStore.record.id,
                });
            }
            refreshCh();
        } catch (err) {
            setError(err?.response?.message || 'Could not update the channel.');
        }
        setBusy('');
    };

    const set = (f, v) => setForm((p) => ({ ...p, [f]: v }));

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active || !form.title.trim()) return;
        setSaving(true); setError('');
        try {
            await pb.collection('social_content').create({
                title: form.title.trim(),
                body: form.body.trim(),
                status: form.status,
                channel: form.channel.trim(),
                scheduled_for: form.scheduled_for || null,
                workspace: active.id,
                owner: pb.authStore.record.id,
            });
            setForm({ title: '', body: '', status: 'draft', channel: '', scheduled_for: '' });
            setShow(false); refreshCo();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the content.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Community & Social"
                description="Discord community and broader social operations. Service cards and operational queues only — no fake posts, followers, impressions, or engagement. Explicit approval gates before anything is published or sent."
            />

            {/* Channels */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">Channels</h2>
                {chLoading ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {PLATFORMS.map((p) => {
                            const rec = byPlatform(p.key);
                            const connected = rec && !['not_connected', 'pending'].includes(rec.status);
                            return (
                                <Card key={p.key} className="p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="font-display text-sm font-semibold">{p.label}</p>
                                        <StatePill state={rec?.status || 'not-connected'} />
                                    </div>
                                    <p className="mt-1.5 text-xs text-muted-foreground">{p.note}</p>
                                    {!connected && (
                                        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => connect(p.key)} disabled={busy === p.key}>
                                            {busy === p.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                                            {rec?.status === 'pending' ? 'Pending' : 'Connect'}
                                        </Button>
                                    )}
                                    {connected && rec.handle && <p className="mt-2 font-evidence text-[11px] text-muted-foreground">@{rec.handle}</p>}
                                </Card>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Content calendar */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-semibold tracking-tight">Content calendar</h2>
                    <Button size="sm" onClick={() => setShow((s) => !s)}><Plus className="h-4 w-4" /> {show ? 'Close' : 'New item'}</Button>
                </div>

                {show && (
                    <Card className="p-5">
                        <form onSubmit={submit} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="sc-title">Title</Label>
                                <Input id="sc-title" value={form.title} onChange={(e) => set('title', e.target.value)} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sc-body">Body / draft</Label>
                                <Textarea id="sc-body" value={form.body} onChange={(e) => set('body', e.target.value)} rows={4} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="grid gap-2">
                                    <Label htmlFor="sc-channel">Channel</Label>
                                    <Input id="sc-channel" value={form.channel} onChange={(e) => set('channel', e.target.value)} placeholder="e.g. discord" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="sc-status">Status</Label>
                                    <select id="sc-status" value={form.status} onChange={(e) => set('status', e.target.value)} className="h-9 border border-border bg-background px-3 text-sm">
                                        <option value="draft">Draft</option>
                                        <option value="awaiting_approval">Awaiting approval</option>
                                        <option value="scheduled">Scheduled</option>
                                        <option value="published">Published</option>
                                        <option value="failed">Failed</option>
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="sc-when">Scheduled for</Label>
                                    <Input id="sc-when" type="date" value={form.scheduled_for} onChange={(e) => set('scheduled_for', e.target.value)} />
                                </div>
                            </div>
                            {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                            <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save item'}</Button>
                        </form>
                    </Card>
                )}

                {coLoading ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
                ) : content.length === 0 ? (
                    <EmptyState
                        icon={CalendarDays}
                        title="No content queued"
                        description="The calendar holds draft, awaiting-approval, scheduled, published, and failed items. Nothing is created automatically. Publish or send only after an explicit approval gate."
                        action={<Button size="sm" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> New item</Button>}
                    />
                ) : (
                    <ul className="space-y-2.5">
                        {content.map((c) => (
                            <li key={c.id}>
                                <Card className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">{c.title}</p>
                                            {c.channel && <p className="mt-0.5 font-evidence text-[11px] text-muted-foreground">channel: {c.channel}</p>}
                                        </div>
                                        <StatePill state={c.status} />
                                    </div>
                                    {c.scheduled_for && <p className="mt-2 text-xs text-muted-foreground">Scheduled: {new Date(c.scheduled_for).toLocaleDateString()}</p>}
                                </Card>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No fake followers, impressions, comments, or scheduled content. Social listening and engagement metrics appear only when an account is authorized and data is actually returned.
            </p>
        </div>
    );
}
