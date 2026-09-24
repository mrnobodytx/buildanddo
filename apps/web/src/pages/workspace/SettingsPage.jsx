import React, { useEffect, useState } from 'react';
import MotionSettings from '@/components/motion/MotionSettings';
import DiscordAccountLink from '@/components/workspace/DiscordAccountLink';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    ShieldCheck,
    LogOut,
    Info,
    Plus,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import WebsiteDomainPanel from '@/components/workspace/WebsiteDomainPanel';
import { ThemeSelect } from '@/components/ThemeControls';
import { Button, Card } from '@/components/site/ui';

const TAB_FOR_HASH = { '#discord-account': 'account', '#motion-settings': 'motion', '#website-domain': 'workspace' };

export default function SettingsPage() {
    const navigate = useNavigate();
    const { hash } = useLocation();
    const [settingsTab, setSettingsTab] = useState(TAB_FOR_HASH[hash] || 'appearance');
    useEffect(() => { if (TAB_FOR_HASH[hash]) setSettingsTab(TAB_FOR_HASH[hash]); }, [hash]);
    const { user, logout } = useAuth();
    const { active, workspaces } = useWorkspace();
    const access = useWorkspaceAccess();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="ph-no-capture space-y-8" data-dd-privacy="mask">
            <PageHeader
                title="Settings"
                description="Personal appearance and motion, workspace permissions, and your account."
            />

            <Tabs value={settingsTab} onValueChange={setSettingsTab} className="space-y-6">
                <TabsList aria-label="Settings sections" className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
                    <TabsTrigger value="appearance">Appearance</TabsTrigger>
                    <TabsTrigger value="motion">Motion & interaction</TabsTrigger>
                    <TabsTrigger value="workspace">Workspace</TabsTrigger>
                    <TabsTrigger value="account">Account</TabsTrigger>
                </TabsList>
                <TabsContent value="appearance" className="space-y-6">
                    <section className="space-y-3">
                        <h2 className="font-display text-lg font-semibold tracking-tight">Appearance</h2>
                        <Card className="p-5"><ThemeSelect /></Card>
                    </section>

                    <Card className="space-y-3 p-5"><h2 className="font-display text-lg font-semibold">Choose how the site moves</h2>
                        <p className="text-sm leading-6 text-muted-foreground">Set motion preferences, explore live examples and see where each technique is used.</p>
                        <Button size="sm" variant="secondary" onClick={() => setSettingsTab('motion')}>Open motion settings</Button>
                    </Card>
                </TabsContent>
                <TabsContent value="motion"><MotionSettings /></TabsContent>
                <TabsContent value="workspace" className="space-y-8">
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

            {/* Website domain */}
                    <section className="space-y-3">
                        <h2 className="font-display text-lg font-semibold tracking-tight">
                            Website domain
                        </h2>
                        <WebsiteDomainPanel />
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
                                        A domain counts as yours only after BuildAndDo
                                        finds your DNS TXT verification record. Until
                                        then it is context only and unlocks nothing.
                                    </li>
                                </ul>
                            </div>
                        </Card>
                    </section>

                </TabsContent>
                <TabsContent value="account" className="space-y-8">
                    <DiscordAccountLink />
                    <Card className="space-y-3 p-5">
                        <h2 className="font-display text-lg font-semibold">My dossier</h2>
                        <p className="text-sm text-muted-foreground">Keep private entities, source notes and personal context under this account. Your linked Discord identity uses the same dossier.</p>
                        <Link to="/app/dossier" className="text-sm underline underline-offset-4">Open my private dossier</Link>
                    </Card>
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
                                </div>
                                <Button variant="secondary" size="sm" onClick={handleLogout}>
                                    <LogOut className="h-4 w-4" />
                                    Sign out
                                </Button>
                            </div>
                        </Card>
                    </section>

                </TabsContent>
            </Tabs>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Permissions are checked by the backend for each workspace. Changing
                browser settings or switching workspaces cannot grant another role.
            </p>
        </div>
    );
}
