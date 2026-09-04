import React, { useState } from 'react';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Button, Card, Rule, StatePill } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DESKS = [
    { key: 'research', label: 'Research', scope: 'Gathers observed facts from connected sources.' },
    { key: 'strategy', label: 'Strategy', scope: 'Proposes bounded next steps from evidence.' },
    { key: 'operations', label: 'Operations', scope: 'Executes approved actions within their scope.' },
    { key: 'verification', label: 'Verification', scope: 'Checks outcomes against observed results.' },
    { key: 'risk', label: 'Risk', scope: 'Flags scope, authorization, and safety concerns.' },
    { key: 'recovery', label: 'Recovery', scope: 'Rolls back or remediates failed actions.' },
    { key: 'history', label: 'History', scope: 'Maintains the replayable record of past missions.' },
    { key: 'optimization', label: 'Optimization', scope: 'Suggests improvements from verified outcomes.' },
];

export default function SpecialistDeskPage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('specialist_desks');
    const [editing, setEditing] = useState(null); // desk key or 'new'
    const [scope, setScope] = useState('');
    const [status, setStatus] = useState('idle');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const byDesk = (key) => records.find((r) => r.desk === key);

    const open = (key) => {
        const existing = byDesk(key);
        setEditing(key);
        setScope(existing?.scope || DESKS.find((d) => d.key === key)?.scope || '');
        setStatus(existing?.status || 'idle');
    };

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !active || !editing) return;
        setSaving(true); setError('');
        try {
            const existing = byDesk(editing);
            if (existing) {
                await pb.collection('specialist_desks').update(existing.id, { scope: scope.trim(), status });
            } else {
                await pb.collection('specialist_desks').create({
                    desk: editing, scope: scope.trim(), status,
                    workspace: active.id, owner: pb.authStore.record.id,
                });
            }
            setEditing(null); refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not save the desk.');
        }
        setSaving(false);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Specialist Desks"
                description="Internal roles represented as desks. Each shows its actual scope and current status. No fictional agent activity or invented autonomous work is rendered."
            />

            {editing && (
                <Card className="p-5">
                    <form onSubmit={submit} className="space-y-4">
                        <p className="font-display text-base font-semibold">{DESKS.find((d) => d.key === editing)?.label} Desk</p>
                        <div className="grid gap-2">
                            <Label htmlFor="desk-scope">Scope</Label>
                            <Textarea id="desk-scope" value={scope} onChange={(e) => setScope(e.target.value)} rows={3} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="desk-status">Status</Label>
                            <select id="desk-status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 border border-border bg-background px-3 text-sm">
                                <option value="idle">Idle</option>
                                <option value="active">Active</option>
                                <option value="blocked">Blocked</option>
                            </select>
                        </div>
                        {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                        <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save desk'}</Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                        </div>
                    </form>
                </Card>
            )}

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {DESKS.map((d) => {
                        const rec = byDesk(d.key);
                        return (
                            <Card key={d.key} className="p-5">
                                <div className="flex items-center justify-between">
                                    <p className="font-display text-base font-semibold">{d.label}</p>
                                    <StatePill state={rec?.status || 'idle'} />
                                </div>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    {rec?.scope || d.scope}
                                </p>
                                <Rule className="my-3" />
                                <Button variant="secondary" size="sm" onClick={() => open(d.key)}>
                                    {rec ? 'Edit scope' : 'Define scope'}
                                </Button>
                            </Card>
                        );
                    })}
                </div>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                A desk reflects real configuration and status. It does not imply autonomous work is happening.
            </p>
        </div>
    );
}
