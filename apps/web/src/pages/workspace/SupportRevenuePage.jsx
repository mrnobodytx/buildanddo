import React from 'react';
import { Loader2, Info, Plug } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useDemoMode } from '@/hooks/useDemoMode';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { DegradedNotice, DemoModeBanner, WriteErrorNotice } from '@/components/workspace/WorkspaceNotices';
import { Button, Card, Rule, StatePill, ProvenanceTag } from '@/components/site/ui';
import { recordTimestamp, reportedMoney } from '@/lib/workspaceSummary';
import { workspaceLifecycleKey } from '@/lib/workspaceControl';

const PROVIDERS = [
    { key: 'patreon', label: 'Patreon', note: 'Membership and recurring support.' },
    { key: 'kofi', label: 'Ko-fi', note: 'One-off and recurring support.' },
    { key: 'stripe', label: 'Stripe', note: 'Card payments and payouts.' },
    { key: 'gofundme', label: 'GoFundMe', note: 'Campaign donations.' },
];

function SupportDesk() {
    const control = useWorkspaceRecords('support_sources');
    const { records, loading, refresh } = control;
    const access = useWorkspaceAccess();
    const canRequest = access.data?.can_admin === true && !access.loading && !access.error && !control.demo;
    const byProvider = (key) => records.find((r) => r.provider === key);
    const connect = async (key) => {
        if (!canRequest || control.saving || control.uncertain || control.degraded || loading) return;
        const existing = byProvider(key);
        if (existing) await control.update(existing.id, { provider: key }, existing);
        else await control.create({ provider: key });
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Support & Revenue"
                description="Administrators can record connection requests only. No trusted payment ingestor is installed. Historical amounts, sync dates and health labels are self-reported records, not provider-confirmed revenue or metrics."
            />
            {control.demo && <DemoModeBanner />}
            <WriteErrorNotice message={control.writeError} onDismiss={control.clearWriteError} />
            {control.uncertain && <Button size="sm" disabled={!canRequest || control.saving} onClick={control.retry}>Retry previous request</Button>}
            {!access.data?.can_admin && <p className="text-sm text-muted-foreground">A current workspace owner or administrator must request a connection.</p>}
            {control.degraded ? <DegradedNotice onRetry={refresh} /> : loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {PROVIDERS.map((p) => {
                        const rec = byProvider(p.key);
                        const historical = rec && Boolean(rec.last_sync || rec.currency || rec.payout_status);
                        const duplicate = records.filter((record) => record.provider === p.key).length > 1;
                        return (
                            <Card key={p.key} className="p-5">
                                <div className="flex items-center justify-between">
                                    <p className="font-display text-lg font-semibold">{p.label}</p>
                                    <StatePill state={rec?.requested_at ? 'pending' : 'reported'} />
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>
                                <Rule className="my-4" />
                                {historical ? (
                                    <>
                                    <p className="mb-3 text-xs text-muted-foreground">Historical / self-reported values. Recorded state: {rec.status}.</p>
                                    <dl className="font-evidence space-y-1.5 text-[12px] text-muted-foreground">
                                        <div className="flex justify-between"><dt>Reported gross</dt><dd className="text-foreground">{reportedMoney(rec.gross, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Reported platform fees</dt><dd className="text-foreground">{reportedMoney(rec.platform_fees, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Reported refunds</dt><dd className="text-foreground">{reportedMoney(rec.refunds, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Payout status</dt><dd className="text-foreground">{rec.payout_status || 'Unknown'}</dd></div>
                                        <div className="flex justify-between"><dt>Reported sync date</dt><dd className="text-foreground">{recordTimestamp(rec.last_sync)}</dd></div>
                                    </dl>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No provider-confirmed payment data is available. A request does not connect this source.
                                    </p>
                                )}
                                {rec?.requested_at && <ProvenanceTag source={`Requested by account ${rec.requested_by}`} timestamp={recordTimestamp(rec.requested_at)} />}
                                {duplicate && <p role="alert" className="mt-3 text-sm">Duplicate provider records need operator review.</p>}
                                <div className="mt-4">
                                    <Button variant="secondary" size="sm" onClick={() => connect(p.key)} disabled={!canRequest || control.saving || control.uncertain || duplicate}>
                                        <Plug className="h-4 w-4" />
                                        {rec?.requested_at ? 'Request again' : 'Request connection'}
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Requests cannot write amounts, provider health or sync receipts. Historical reports are retained without being promoted into metrics.
            </p>
        </div>
    );
}

export default function SupportRevenuePage() {
    const { user, sessionEpoch } = useAuth(), { active } = useWorkspace(), access = useWorkspaceAccess(), { demo } = useDemoMode();
    return <SupportDesk key={workspaceLifecycleKey({ accountId: user?.id, workspaceId: active?.id, demo, sessionEpoch, access })} />;
}
