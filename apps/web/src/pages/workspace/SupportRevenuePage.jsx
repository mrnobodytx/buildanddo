import React, { useState } from 'react';
import { Loader2, AlertCircle, Info, Plug } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
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
    const { records, loading, refresh } = useWorkspaceRecords('support_sources');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const byProvider = (key) => records.find((r) => r.provider === key);

    const connect = async (key) => {
        if (!active) return;
        setBusy(key); setError('');
        try {
            const existing = byProvider(key);
            if (existing) {
                await pb.collection('support_sources').update(existing.id, { status: 'pending' });
            } else {
                await pb.collection('support_sources').create({
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
                                {connected ? (
                                    <dl className="font-evidence space-y-1.5 text-[12px] text-muted-foreground">
                                        <div className="flex justify-between"><dt>Gross</dt><dd className="text-foreground">{money(rec.gross, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Platform fees</dt><dd className="text-foreground">{money(rec.platform_fees, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Refunds</dt><dd className="text-foreground">{money(rec.refunds, rec.currency)}</dd></div>
                                        <div className="flex justify-between"><dt>Payout status</dt><dd className="text-foreground">{rec.payout_status || 'Unknown'}</dd></div>
                                        <div className="flex justify-between"><dt>Last sync</dt><dd className="text-foreground">{rec.last_sync ? new Date(rec.last_sync).toLocaleString() : 'Unknown'}</dd></div>
                                    </dl>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {rec?.status === 'pending'
                                            ? 'Connection pending — awaiting authorization and first successful sync. No records shown yet.'
                                            : 'Not connected. No records are displayed until a real sync returns data.'}
                                    </p>
                                )}
                                <div className="mt-4">
                                    <Button variant="secondary" size="sm" onClick={() => connect(p.key)} disabled={busy === p.key}>
                                        {busy === p.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                                        {rec?.status === 'pending' ? 'Re-attempt connection' : 'Connect'}
                                    </Button>
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
