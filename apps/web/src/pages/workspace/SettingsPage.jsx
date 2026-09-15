import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Globe,
    ShieldCheck,
    LogOut,
    Loader2,
    Info,
    Plus,
} from 'lucide-react';
import { workspaceCollection } from '@/lib/observability/mutations';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import {
    PageHeader,
    StatusBadge,
    DOMAIN_STATUS,
} from '@/components/workspace/workspaceHelpers';
import { ThemeSelect } from '@/components/ThemeControls';
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
    const access = useWorkspaceAccess();
    const [savingDomain, setSavingDomain] = useState(false);
    const [domainError, setDomainError] = useState('');

    const domainRecord = active?.expand?.domain;

    const updateDomainStatus = async (status) => {
        if (!domainRecord) return;
        setSavingDomain(true);
        setDomainError('');
        try {
            await workspaceCollection('domains').update(domainRecord.id, { status });
            await refresh();
        } catch (err) {
            setDomainError('Could not update the domain status. Please try again.');
        }
        setSavingDomain(false);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="ph-no-capture space-y-8" data-dd-privacy="mask">
            <PageHeader
                title="Settings"
                description="Workspace profile, domain authorization, and your account. The selected domain stays visible across the workspace so you always know which business you're operating on."
            />

            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">Appearance</h2>
                <Card className="p-5"><ThemeSelect /></Card>
            </section>

            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">Workspace permissions</h2>
                <Card className="space-y-3 p-5">
                    <p className="text-sm">{access.loading ? 'Checking workspace access…' : access.data ? `Your workspace role: ${access.data.role}.` : 'Workspace permissions are unavailable.'}</p>
                    {access.error && <p className="text-sm text-muted-foreground">{access.error}</p>}
                    <p className="text-sm text-muted-foreground">Owners and administrators manage settings, members, integration requests and community moderation. Editors contribute records; viewers read them.</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                        {access.data?.can_admin && <Link to="/app/admin" className="underline underline-offset-4">Open administration</Link>}
                        <Link to="/app/integrations" className="underline underline-offset-4">Sinks & extensions</Link>
                        <Link to="/app/wiki" className="underline underline-offset-4">Workspace wiki</Link>
                        <Link to="/app/forums" className="underline underline-offset-4">Workspace forum</Link>
                    </div>
                </Card>
            </section>

            {/* Workspace profile */}
            <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                    Workspace
                </h2>
                <Card className="p-5">
                    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
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
                            {domainError && <p role="alert" className="mt-3 text-sm text-destructive">{domainError}</p>}
                            {domainRecord && (
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <Select
                                        value={domainRecord.status}
                                        onValueChange={updateDomainStatus}
                                        disabled={savingDomain}
                                    >
                                        <SelectTrigger aria-label="Domain status" className="h-11 w-full sm:w-52">
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
                    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                            <p className="break-all text-sm font-medium">{user?.email}</p>
                            <p className="mt-2 break-all text-xs text-muted-foreground">Account ID: <span className="select-all font-evidence">{user?.id}</span></p>
                            <p className="mt-1 text-xs text-muted-foreground">Share this ID with a workspace owner to request team access.</p>
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
                Permissions are checked by the backend for each workspace. Changing
                browser settings or switching workspaces cannot grant another role.
            </p>
        </div>
    );
}
