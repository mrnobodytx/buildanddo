import React, { useState } from 'react';
import { Scale, Plus, Loader2, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useDemoMode } from '@/hooks/useDemoMode';
import { describeAccess } from '@/hooks/useWorkspaceControl';
import { DegradedNotice, DemoModeBanner, WriteErrorNotice } from '@/components/workspace/WorkspaceNotices';
import EmptyState from '@/components/workspace/EmptyState';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Button, Card, Rule, StatePill, ProvenanceTag } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { workspaceLifecycleKey } from '@/lib/workspaceControl';

const EMPTY_FORM = { prior_prediction: '', observed_result: '', reference: '' };
// Says what a failed read means for this page, and why the Record controls are
// off meanwhile: canCreate requires a read that succeeded.
const UNREAD = 'Corrections could not be loaded, so this page cannot say whether any exist, and recording stays off until they do.';

function CorrectionsDesk() {
    const control = useWorkspaceRecords('corrections', { sort: '-created' });
    const { records, loading, refresh, saving } = control;
    const access = useWorkspaceAccess();
    const canWrite = access.data?.can_write === true && !access.loading && !access.error && !control.demo;
    const canCreate = canWrite && !control.degraded && !loading;
    // Every Record control below greys out on the access result, and a greyed
    // control with nothing beside it reads as "you are not allowed" even when
    // the check is still out or never answered. describeAccess names which.
    const accessNotice = describeAccess(access);
    const [show, setShow] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [error, setError] = useState('');

    const set = (f, v) => setForm((p) => ({ ...p, [f]: v }));

    const submit = async (e) => {
        e.preventDefault();
        if (saving || !canCreate || control.uncertain) return;
        if (!form.prior_prediction.trim() || !form.observed_result.trim()) { setError('Record both the prediction and observed comparison.'); return; }
        setError('');
        const result = await control.create({
            prior_prediction: form.prior_prediction.trim(),
            observed_result: form.observed_result.trim(),
            reference: form.reference.trim(),
        });
        if (result.ok) { setForm(EMPTY_FORM); setShow(false); }
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Corrections & Verification"
                description="Record your prediction and observed comparison as a pending author report. No independent correction-review authority is bound, so verified or rejected decisions cannot be recorded here. Historical labels are retained as reports, not verified outcomes."
                actions={
                    <Button size="sm" disabled={!canCreate || control.uncertain} onClick={() => setShow((s) => !s)}>
                        <Plus className="h-4 w-4" /> {show ? 'Close' : 'Record correction'}
                    </Button>
                }
            />
            {control.demo && <DemoModeBanner />}
            {accessNotice && <p className="text-sm text-muted-foreground">{accessNotice}</p>}
            <WriteErrorNotice message={control.writeError} onDismiss={control.clearWriteError} />
            {control.uncertain && <Button size="sm" disabled={!canWrite || saving} onClick={async () => { const result = await control.retry(); if (result.ok) { setForm(EMPTY_FORM); setShow(false); } }}>Retry previous comparison</Button>}

            {show && (
                <Card className="p-5">
                    <form onSubmit={submit} className="space-y-4">
                        <fieldset className="space-y-4" disabled={!canCreate || saving || control.uncertain}>
                        <div className="grid gap-2">
                            <Label htmlFor="co-prior">Prior prediction</Label>
                            <Textarea id="co-prior" required maxLength={2000} value={form.prior_prediction} onChange={(e) => set('prior_prediction', e.target.value)} rows={3} placeholder="What was predicted or claimed earlier" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="co-obs">Observed result</Label>
                            <Textarea id="co-obs" required maxLength={2000} value={form.observed_result} onChange={(e) => set('observed_result', e.target.value)} rows={3} placeholder="What was actually observed later" />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <p className="text-sm text-muted-foreground">Saved as pending. A reference is not independent verification.</p>
                            <div className="grid gap-2">
                                <Label htmlFor="co-ref">Reference / receipt</Label>
                                <Input id="co-ref" maxLength={300} value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Optional reference id" />
                            </div>
                        </div>
                        {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                        <Button type="submit" size="sm">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save correction'}</Button>
                        </fieldset>
                    </form>
                </Card>
            )}

            {/* A read that FAILED and a workspace that is genuinely empty are different
                facts. This branch comes first so a failure never falls through to the empty
                state, whose copy asserts that nothing is recorded. The hook's own error text
                is one generic sentence ("what you see may be incomplete") that is wrong here,
                where nothing is shown at all, so the page says what the failure means for it. */}
            {control.degraded ? <DegradedNotice message={UNREAD} onRetry={refresh} /> : loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Scale}
                    title="No comparison reports yet"
                    description="No authored comparisons are recorded in this workspace. This is not a verification result."
                    action={<Button size="sm" disabled={!canCreate || control.uncertain} onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Record a correction</Button>}
                />
            ) : (
                <ul className="space-y-3">
                    {records.map((r) => (
                        <li key={r.id}>
                            <Card className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm font-medium">Prior: {r.prior_prediction}</p>
                                    <StatePill state="reported" />
                                </div>
                                {r.observed_result && <p className="mt-2 text-sm text-muted-foreground">Observed: {r.observed_result}</p>}
                                <p className="mt-2 text-xs text-muted-foreground">Reported status: {r.status}. No independent review is bound.</p>
                                <Rule className="my-3" />
                                <ProvenanceTag source={`Author account: ${r.owner || 'not recorded'}`} timestamp={r.created ? new Date(r.created).toLocaleString() : ''} />
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

export default function CorrectionsPage() {
    const { user, sessionEpoch } = useAuth(), { active } = useWorkspace(), access = useWorkspaceAccess(), { demo } = useDemoMode();
    return <CorrectionsDesk key={workspaceLifecycleKey({ accountId: user?.id, workspaceId: active?.id, demo, sessionEpoch, access })} />;
}
