import React, { useState } from 'react';
import {
    Server,
    ShieldAlert,
    Loader2,
    Info,
    Clock,
    ArrowRight,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import {
    PageHeader,
    StatusBadge,
    SERVICE_STATUS,
} from '@/components/workspace/workspaceHelpers';
import { Button, Card } from '@/components/site/ui';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

function formatDate(iso) {
    if (!iso) return 'Never';
    try {
        return new Date(iso).toLocaleString();
    } catch (_) {
        return '—';
    }
}

export default function OperationsPage() {
    const { active } = useWorkspace();
    const { records, loading, refresh } = useWorkspaceRecords('services', {
        sort: 'created',
    });
    const [updatingId, setUpdatingId] = useState(null);

    const updateStatus = async (service, status) => {
        setUpdatingId(service.id);
        try {
            await pb.collection('services').update(service.id, {
                status,
                last_health_check: status === 'connected' ? new Date().toISOString() : service.last_health_check,
            });
            refresh();
        } catch (err) {
            console.error('update service failed', err);
        }
        setUpdatingId(null);
    };

    const connectedCount = records.filter((s) => s.status === 'connected').length;

    return (
        <div className="space-y-8">
            <PageHeader
                title="Operations"
                description="The self-hosted stack BuildAndDo is designed to work with. Each service is a connection card with its real status — Planned, Not connected, Connected, Degraded, or Needs attention. Nothing here is claimed to be deployed unless you've actually connected it."
            />

            {/* Warning banner */}
            <Card className="border-[hsl(var(--amber))]/30 bg-[hsl(var(--amber))]/5 p-5">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-warm" />
                    <div className="text-sm leading-relaxed text-muted-foreground">
                        <p className="font-medium text-foreground">
                            Self-hosted services are your responsibility
                        </p>
                        <p className="mt-1">
                            These services must be configured, secured, backed
                            up, and monitored separately by you. BuildAndDo
                            does not deploy, host, or guarantee them. A status
                            here only reflects what you've recorded — it is not
                            a live health probe unless a service is actually
                            connected and reporting.
                        </p>
                    </div>
                </div>
            </Card>

            <Card className="flex items-center gap-4 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                    <Server className="h-5 w-5" />
                </span>
                <div className="text-sm">
                    <p className="font-medium">
                        {connectedCount} of {records.length} services connected
                    </p>
                    <p className="text-muted-foreground">
                        Connection status is recorded per workspace.
                    </p>
                </div>
            </Card>

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </Card>
            ) : records.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    No service cards for this workspace yet.
                </Card>
            ) : (
                <ul className="grid gap-4 lg:grid-cols-2">
                    {records.map((s) => (
                        <li key={s.id}>
                            <Card className="flex h-full flex-col p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-display text-base font-semibold tracking-tight">
                                            {s.name}
                                        </p>
                                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                            {s.purpose}
                                        </p>
                                    </div>
                                    <StatusBadge map={SERVICE_STATUS} value={s.status} />
                                </div>

                                {s.data_boundary && (
                                    <p className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
                                        <span className="font-semibold text-foreground">
                                            Data boundary:{' '}
                                        </span>
                                        {s.data_boundary}
                                    </p>
                                )}

                                <dl className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-3.5 w-3.5 shrink-0" />
                                        <span>
                                            Last health check:{' '}
                                            {formatDate(s.last_health_check)}
                                        </span>
                                    </div>
                                    {s.next_action && (
                                        <div className="flex items-start gap-2">
                                            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            <span>Next: {s.next_action}</span>
                                        </div>
                                    )}
                                </dl>

                                <div className="mt-4 flex items-center gap-2">
                                    <Select
                                        value={s.status}
                                        onValueChange={(v) => updateStatus(s, v)}
                                        disabled={updatingId === s.id}
                                    >
                                        <SelectTrigger className="h-9 w-44">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="planned">Planned</SelectItem>
                                            <SelectItem value="not_connected">Not connected</SelectItem>
                                            <SelectItem value="connected">Connected</SelectItem>
                                            <SelectItem value="degraded">Degraded</SelectItem>
                                            <SelectItem value="needs_attention">Needs attention</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {updatingId === s.id && (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    )}
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Sensitive credentials (API keys, secrets) belong in your own
                secured service instances — never entered or displayed here.
                BuildAndDo stores connection status only, not credentials.
            </p>
        </div>
    );
}
