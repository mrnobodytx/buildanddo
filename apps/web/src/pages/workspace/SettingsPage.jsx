import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Globe,
    ShieldCheck,
    LogOut,
    Loader2,
    Info,
    Plus,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
    PageHeader,
    StatusBadge,
    DOMAIN_STATUS,
} from '@/components/workspace/workspaceHelpers';
import { Button, Card } from '@/components/site/ui';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export default function SettingsPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { active, workspaces, refresh } = useWorkspace();
    const [savingDomain, setSavingDomain] = useState(false);

    const domainRecord = active?.expand?.domain;

    const updateDomainStatus = async (status) => {
        if (!domainRecord) return;
        setSavingDomain(true);
        try {
            await pb.collection('domains').update(domainRecord.id, { status });
            await refresh();
        } catch (err) {
            console.error('update domain failed', err);
        }
        setSavingDomain(false);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Settings"
                description="Workspace profile, domain authorization, and your account. The selected domain stays visible across the workspace so you always know which business you're operating on."
            />

            {/* Workspace profile */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Workspace
                </h2>
                <Card className="p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="font-medium">{active?.name || '—'}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {workspaces.length} workspace
                                {workspaces.length === 1 ? '' : 's'} on your account.
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate('/onboarding')}
                        >
                            <Plus className="h-4 w-4" />
                            New workspace
                        </Button>
                    </div>
                </Card>
            </section>

            {/* Domain authorization */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Domain authorization
                </h2>
                <Card className="p-5">
                    <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                            <Globe className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">
                                    {domainRecord?.domain || 'No website connected'}
                                </p>
                                {domainRecord && (
                                    <StatusBadge
                                        map={DOMAIN_STATUS}
                                        value={domainRecord.status}
                                    />
                                )}
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                A found domain is <strong>not</strong> an
                                authorized domain. Confirm ownership or
                                authorization before deeper analysis or actions.
                                Updating the status here is your record of that
                                confirmation — BuildAndDo does not verify
                                ownership automatically.
                            </p>
                            {domainRecord && (
                                <div className="mt-4 flex items-center gap-2">
                                    <Select
                                        value={domainRecord.status}
                                        onValueChange={updateDomainStatus}
                                        disabled={savingDomain}
                                    >
                                        <SelectTrigger className="h-9 w-52">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="selected">Selected</SelectItem>
                                            <SelectItem value="analyzing">Analyzing</SelectItem>
                                            <SelectItem value="verified">Verified</SelectItem>
                                            <SelectItem value="needs_attention">Needs attention</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {savingDomain && (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            </section>

            {/* Security & trust */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Security & trust
                </h2>
                <Card className="p-5">
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                            <li>
                                BuildAndDo distinguishes observed facts, inferred
                                conclusions, proposed actions, approved actions,
                                and verified outcomes — each is labeled in the
                                product.
                            </li>
                            <li>
                                Self-hosted services require explicit connection
                                and your own security controls. BuildAndDo never
                                claims a service is deployed, healthy, or
                                production-ready unless you've connected it.
                            </li>
                            <li>
                                Sensitive credentials are never displayed in the
                                dashboard. Keep API keys and secrets in your own
                                secured service instances.
                            </li>
                            <li>
                                You must confirm ownership or authorization of a
                                domain before deeper analysis or actions run
                                against it.
                            </li>
                        </ul>
                    </div>
                </Card>
            </section>

            {/* Account */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Account
                </h2>
                <Card className="p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium">{user?.email}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                BuildAndDo sign-in · no external provider connected
                            </p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={handleLogout}>
                            <LogOut className="h-4 w-4" />
                            Sign out
                        </Button>
                    </div>
                </Card>
            </section>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Multi-workspace support is intentionally lightweight for now —
                you can create and switch between workspaces, but advanced
                multi-tenant management arrives later.
            </p>
        </div>
    );
}
