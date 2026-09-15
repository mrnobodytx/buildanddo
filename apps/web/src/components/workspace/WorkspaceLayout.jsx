import React, { useId, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
    Activity,
    LayoutDashboard,
    Radar,
    Target,
    Workflow,
    GraduationCap,
    Boxes,
    Server,
    FileSearch,
    Settings,
    LogOut,
    Menu,
    Newspaper,
    Scale,
    ShieldCheck,
    Coins,
    MessageCircle,
    Gauge,
    Network,
    Plug,
    Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Helmet } from 'react-helmet';
import { ThemeToggle } from '@/components/ThemeControls';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/site/ui';
import { StatusBadge, DOMAIN_STATUS } from './workspaceHelpers';
import { DemoModeBanner } from './WorkspaceNotices';

const NAV = [
    { to: '/app', label: 'Front Page', icon: LayoutDashboard, end: true },
    { to: '/app/signals', label: 'Signals', icon: Radar },
    { to: '/app/missions', label: 'Challenge Desk', icon: Target },
    { to: '/app/workflows', label: 'Workflows', icon: Workflow },
    { to: '/app/evidence', label: 'Evidence Ledger', icon: FileSearch },
    { to: '/app/edition', label: 'Daily Edition', icon: Newspaper },
    { to: '/app/passport', label: 'Capability Passport', icon: ShieldCheck },
    { to: '/app/corrections', label: 'Corrections', icon: Scale },
    { to: '/app/tutorials', label: 'Field Manual', icon: GraduationCap },
    { to: '/app/erp', label: 'ERP', icon: Boxes },
    { to: '/app/support', label: 'Support & Revenue', icon: Coins },
    { to: '/app/community', label: 'Community & Social', icon: MessageCircle },
    { to: '/app/roadmap', label: 'Roadmap', icon: Gauge },
    { to: '/app/operations', label: 'Operations Desk', icon: Server },
    { to: '/app/fleet', label: 'Fleet', icon: Network },
    { to: '/app/platforms', label: 'Platform Health', icon: Plug },
    { to: '/app/settings', label: 'Settings', icon: Settings },
];

function NavList({ onNavigate }) {
    return (
        <nav className="flex flex-col gap-1" aria-label="Workspace">
            {NAV.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                        cn(
                            'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                        )
                    }
                >
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={2.1} />
                    {item.label}
                </NavLink>
            ))}
        </nav>
    );
}

function BrandMark() {
    return (
        <Link to="/" className="flex items-center gap-2.5" aria-label="BuildAndDo home">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                <Activity className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">BuildAndDo</span>
        </Link>
    );
}

function WorkspaceSwitcher() {
    const { workspaces, active, setActive } = useWorkspace();
    const id = useId();
    return (
        <div className="border border-border bg-secondary/40 p-3">
            <label
                htmlFor={id}
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
                Workspace
            </label>
            <select
                id={id}
                aria-label="Active workspace"
                value={active?.id || ''}
                onChange={(event) => setActive(event.target.value)}
                className="mt-2 h-11 w-full min-w-0 border border-input bg-background px-2 text-sm text-foreground"
                disabled={workspaces.length === 0}
            >
                {workspaces.length === 0 && <option value="">No workspace</option>}
                {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default function WorkspaceLayout() {
    const { user, logout } = useAuth();
    const { active, loading } = useWorkspace();
    const { demo } = useDemoMode();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const domainRecord = active?.expand?.domain;
    const domainLabel = domainRecord?.domain || (active?.domain ? 'Website details unavailable' : 'No website yet');
    const domainStatus = domainRecord?.status || (active && !active.domain ? 'selected' : null);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <meta name="robots" content="noindex,nofollow" />
            </Helmet>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                {/* Desktop sidebar */}
                <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-secondary/15 lg:flex">
                    <div className="flex h-14 items-center border-b border-border/60 px-4">
                        <BrandMark />
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-4">
                        <NavList />
                    </div>
                    <div className="space-y-3 border-t border-border/60 p-3">
                        <WorkspaceSwitcher />
                        <div className="flex items-center justify-between gap-2 rounded-md px-1">
                            <span className="truncate text-xs text-muted-foreground">
                                {user?.email}
                            </span>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <LogOut className="h-3.5 w-3.5" />
                                Sign out
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Mobile sidebar */}
                <SheetContent
                    side="left"
                    aria-describedby={undefined}
                    className="w-80 max-w-[calc(100vw-1rem)] overflow-y-auto border-border bg-card p-0"
                >
                    <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
                    <div className="flex h-14 items-center border-b border-border/60 px-4">
                        <BrandMark />
                    </div>
                    <div className="px-3 py-4">
                        <NavList onNavigate={() => setMobileOpen(false)} />
                    </div>
                    <div className="space-y-3 border-t border-border/60 p-3">
                        <WorkspaceSwitcher />
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                            <LogOut className="h-4 w-4" />
                            Sign out
                        </button>
                    </div>
                </SheetContent>

                {/* Main column */}
                <div className="min-w-0 lg:pl-60">
                    {/* Top header */}
                    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md sm:px-6">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <SheetTrigger
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-border text-foreground lg:hidden"
                                aria-label="Open navigation"
                            >
                                <Menu className="h-5 w-5" />
                            </SheetTrigger>
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-display text-sm font-semibold tracking-tight">
                                    {loading ? 'Loading…' : active?.name || 'No workspace'}
                                </span>
                                <span className="hidden text-muted-foreground/50 sm:inline">·</span>
                                <span className="hidden truncate text-sm text-muted-foreground sm:inline">
                                    {domainLabel}
                                </span>
                                {domainStatus && (
                                    <StatusBadge
                                        map={DOMAIN_STATUS}
                                        value={domainStatus}
                                        className="hidden sm:inline-flex"
                                    />
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <ThemeToggle />
                            <Button
                                size="sm"
                                onClick={() => navigate('/app/missions')}
                                className="shrink-0"
                            >
                                <Plus className="h-4 w-4" />
                                <span className="hidden sm:inline">Start a mission</span>
                                <span className="sm:hidden">Mission</span>
                            </Button>
                        </div>
                    </header>

                    <main
                        id="main-content"
                        tabIndex={-1}
                        className="workspace-content px-4 py-8 sm:px-6 lg:px-8"
                    >
                        <div key={`${user?.id}:${active?.id}:${demo}`} className="mx-auto max-w-6xl space-y-6">
                            {/* Rendered by the shell, not by each page, so a page
                            that forgets it cannot present demonstration data
                            as the operator's own. */}
                            <DemoModeBanner />
                            <Outlet />
                        </div>
                    </main>
                </div>
            </Sheet>
        </div>
    );
}
