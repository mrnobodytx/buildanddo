import React from 'react';
import { Loader2, Info, Plug } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useDemoMode } from '@/hooks/useDemoMode';
import { describeAccess } from '@/hooks/useWorkspaceControl';
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

// The claims authority runs support.request for owners and admins only, so an
// editor holds a settled write grant that still cannot press these buttons.
const ADMIN_ONLY = 'A current workspace owner or administrator must request a connection.';
// With the read failed the provider cards are withheld, and an absent card must
// not be read as a provider nobody requested.
const UNREAD = 'Support connection records could not be loaded, so no provider is shown rather than every provider being shown as not requested.';

function SupportDesk() {
    const control = useWorkspaceRecords('support_sources');
    const { records, loading, refresh } = control;
    const access = useWorkspaceAccess();
    const canRequest = access.data?.can_admin === true && !access.loading && !access.error && !control.demo;
    // describeAccess separates "still checking", "read-only" and "never
    // answered"; past those, a grant short of admin is this page's own case.
    // Once the role is actually known and falls short of admin, the reader is
    // also told who CAN make the request - a viewer used to get only "read-only"
    // and no way to find the person to ask. While the check is out or failed
    // the role is not known, so no sentence about roles is added then.
    const described = describeAccess(access);
    const roleKnown = Boolean(access.data) && !access.loading && !access.error;
    const accessNotice = roleKnown && access.data.can_admin !== true
        ? [described, ADMIN_ONLY].filter(Boolean).join(' ')
        : described;
    const byProvider = (key) => records.find((r) => r.provider === key);
    const connect = async (key) => {
        if (!canRequest || control.saving || control.uncertain || control.degraded || loading) return;
        const existing = byProvider(key);
        // A request already on file is as far as this product can take it; the
        // card does not offer this press for it (see below).
        if (existing?.requested_at || existing?.status === 'pending') return;
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
            {accessNotice && <p className="text-sm text-muted-foreground">{accessNotice}</p>}
            {/* A read that FAILED and a workspace with no requests are different facts. This
                branch comes first so a failure never renders four "not requested" cards for
                data the page never managed to load. */}
            {control.degraded ? <DegradedNotice message={UNREAD} onRetry={refresh} /> : loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {PROVIDERS.map((p) => {
                        const rec = byProvider(p.key);
                        // requested_at is the claims authority's stamp. A row still at 'pending'
                        // without it is what connect() wrote before that authority existed: the same
                        // request on file, only without a recorded requester. 'pending' promotes
                        // nothing, unlike the health labels this page refuses to repeat.
                        const requested = Boolean(rec?.requested_at) || rec?.status === 'pending';
                        const historical = rec && Boolean(rec.last_sync || rec.currency || rec.payout_status);
                        const duplicate = records.filter((record) => record.provider === p.key).length > 1;
                        return (
                            <Card key={p.key} className="p-5">
                                <div className="flex items-center justify-between">
                                    <p className="font-display text-lg font-semibold">{p.label}</p>
                                    {/* With no row at all nothing has been reported, so the pill must not say "reported". */}
                                    <StatePill state={requested ? 'pending' : rec ? 'reported' : 'not-connected'} />
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>
                                <Rule className="my-4" />
                                {historical && (
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
                                )}
                                {/* The claims route writes status 'pending' and refuses any other status
                                    ("cannot promote verification or provider health"), the raw write path
                                    is closed, and no ingestor is installed - so nothing in this repository
                                    advances a request past it. Say that, rather than promising a sync no
                                    code performs or relabelling the button as a retry, which reads as
                                    "that failed" when the request is in fact on file. */}
                                {requested ? (
                                    <p className={historical ? 'mt-3 text-sm text-muted-foreground' : 'text-sm text-muted-foreground'}>
                                        Connection requested, and the request is recorded. Nothing in the product
                                        takes it further: the {p.label} connection has to be completed by an
                                        operator outside BuildAndDo.
                                        {historical
                                            ? ' The figures above are earlier self-reported records, not a result of this request.'
                                            : ' No payment ingestor is installed, so this card shows no gross, fee, refund or payout figures.'}
                                    </p>
                                ) : !historical && (
                                    <p className="text-sm text-muted-foreground">
                                        No provider-confirmed payment data is available. A request does not connect this source.
                                    </p>
                                )}
                                {rec?.requested_at && <ProvenanceTag source={`Requested by account ${rec.requested_by}`} timestamp={recordTimestamp(rec.requested_at)} />}
                                {duplicate && <p role="alert" className="mt-3 text-sm">Duplicate provider records need operator review.</p>}
                                <div className="mt-4">
                                    {requested ? (
                                        // A second press could only re-stamp the same pending row, an
                                        // affordance pretending to a power the product does not have. The
                                        // sentence above is the reason this button is off.
                                        <Button variant="secondary" size="sm" disabled>
                                            <Plug className="h-4 w-4" />
                                            Connection requested
                                        </Button>
                                    ) : (
                                        <Button variant="secondary" size="sm" onClick={() => connect(p.key)} disabled={!canRequest || control.saving || control.uncertain || duplicate}>
                                            <Plug className="h-4 w-4" />
                                            Request connection
                                        </Button>
                                    )}
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
