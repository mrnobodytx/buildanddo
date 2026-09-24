import React, { useState } from 'react';
import { Loader2, AlertCircle, Info, Plug } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { workspaceCollection } from '@/lib/observability/mutations';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { DegradedNotice } from '@/components/workspace/WorkspaceNotices';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Button, Card, Rule, StatePill, ProvenanceTag } from '@/components/site/ui';

const PROVIDERS = [
    { key: 'patreon', label: 'Patreon', note: 'Membership and recurring support.' },
    { key: 'kofi', label: 'Ko-fi', note: 'One-off and recurring support.' },
    { key: 'stripe', label: 'Stripe', note: 'Card payments and payouts.' },
    { key: 'gofundme', label: 'GoFundMe', note: 'Campaign donations.' },
];

function money(n, currency) {
    if (n == null || n === '') return '—';
    const cur = currency || '';
    return `${cur}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SupportRevenuePage() {
    const { active } = useWorkspace();
    const { records, loading, degraded, error: readError, refresh } = useWorkspaceRecords('support_sources');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const byProvider = (key) => records.find((r) => r.provider === key);

    const connect = async (key) => {
        if (!active) return;
        setBusy(key); setError('');
        try {
            const existing = byProvider(key);
            if (existing) {
                await workspaceCollection('support_sources').update(existing.id, { status: 'pending' });
            } else {
                await workspaceCollection('support_sources').create({
                    provider: key, status: 'pending',
                    workspace: active.id, owner: pb.authStore.record.id,
                });
            }
            refresh();
        } catch (err) {
            setError(err?.response?.message || 'Could not update the connection.');
        }
        setBusy('');
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Support & Revenue"
                description="Ingest real records only after explicit connection and authorization from each source. A connection alone is never reported as a donation or payment. Gross, fees, refunds, currency, payout status, and date range are kept separate — never merged or estimated across sources."
            />

            {/* A read that FAILED and a workspace that is genuinely empty are different facts, and useWorkspaceRecords already tells them apart - its catch sets degraded and empties the list. Dropping `degraded` on the floor made every failure render as the empty state, so the page calmly reported nothing-to-show for data it never managed to load. Here it meant a page that shows every provider as not-connected when the truth
                is that we could not find out. */}
            {degraded && (
                <DegradedNotice message={readError || 'Support connections could not be loaded, so no provider below should be read as disconnected.'} onRetry={refresh} />
            )}

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {PROVIDERS.map((p) => {
                        const rec = byProvider(p.key);
                        const connected = rec && !['not_connected', 'pending'].includes(rec.status);
                        return (
                            <Card key={p.key} className="p-5">
                                <div className="flex items-center justify-between">
                                    <p className="font-display text-lg font-semibold">{p.label}</p>
                                    <StatePill state={rec?.status || 'not-connected'} />
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>
                                <Rule className="my-4" />
                                {/* connect() writes status 'pending', and nothing in this repository ever
                                    advances a support_sources row past it - so 'pending' is where a request
                                    stops until a person acts. The copy here used to promise a "first
                                    successful sync" no code performs, and the button relabelled itself
                                    "Re-attempt connection", which reads to a person as "that failed, press it
                                    again" when in truth the request was recorded and a second press would only
                                    rewrite the same row. Say what is actually true instead. */}
                                {connected ? (
                                    /* Reachable only through that out-of-band step: an operator advancing the
                                       row is the one thing that fills these fields, so they stay. */
                                    <dl className="font-evidence space-y-1.5 text-[12px] text-muted-foreground">
                                        <div className="flex justify-between"><dt>Gross</dt><dd className="text-foreground">{money(rec.gross, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Platform fees</dt><dd className="text-foreground">{money(rec.platform_fees, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Refunds</dt><dd className="text-foreground">{money(rec.refunds, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Payout status</dt><dd className="text-foreground">{rec.payout_status || 'Unknown'}</dd></div>
                                        <div className="flex justify-between"><dt>Last sync</dt><dd className="text-foreground">{rec.last_sync ? new Date(rec.last_sync).toLocaleString() : 'Unknown'}</dd></div>
                                    </dl>
                                ) : rec?.status === 'pending' ? (
                                    <p className="text-sm text-muted-foreground">
                                        Connection requested, and the request is recorded. Nothing in the product
                                        takes it further: the {p.label} connection has to be completed by an
                                        operator outside BuildAndDo. No gross, fee, refund or payout figures
                                        appear on this card until that has happened.
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Not connected. No records are displayed until a real sync returns data.
                                    </p>
                                )}
                                <div className="mt-4">
                                    {rec?.status === 'pending' ? (
                                        // Offering a press that can only rewrite the same 'pending' row would be
                                        // an affordance pretending to a power the product does not have.
                                        <Button variant="secondary" size="sm" disabled>
                                            <Plug className="h-4 w-4" />
                                            Connection requested
                                        </Button>
                                    ) : (
                                        <Button variant="secondary" size="sm" onClick={() => connect(p.key)} disabled={busy === p.key}>
                                            {busy === p.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                                            Connect
                                        </Button>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Totals are never merged across sources without a transparent calculation and source breakdown. A donation or payment is never claimed just because a connection exists.
            </p>
        </div>
    );
}
