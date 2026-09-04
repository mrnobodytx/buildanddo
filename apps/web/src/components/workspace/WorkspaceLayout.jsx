import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
    ChevronDown,
    Plus,
    CheckCircle2,
    Newspaper,
    Scale,
    Coins,
    MessageCircle,
    Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/site/ui';
import { StatusBadge, DOMAIN_STATUS } from './workspaceHelpers';

const NAV = [
    { to: '/app', label: 'Front Page', icon: LayoutDashboard, end: true },
    { to: '/app/signals', label: 'Signals', icon: Radar },
    { to: '/app/missions', label: 'Challenge Desk', icon: Target },
    { to: '/app/workflows', label: 'Workflows', icon: Workflow },
    { to: '/app/evidence', label: 'Evidence Ledger', icon: FileSearch },
    { to: '/app/edition', label: 'Daily Edition', icon: Newspaper },
    { to: '/app/desks', label: 'Specialist Desks', icon: Boxes },
    { to: '/app/corrections', label: 'Corrections', icon: Scale },
    { to: '/app/tutorials', label: 'Field Manual', icon: GraduationCap },
    { to: '/app/erp', label: 'ERP', icon: Boxes },
    { to: '/app/support', label: 'Support & Revenue', icon: Coins },
    { to: '/app/community', label: 'Community & Social', icon: MessageCircle },
    { to: '/app/roadmap', label: 'Roadmap', icon: Gauge },
    { to: '/app/operations', label: 'Operations Desk', icon: Server },
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
        <a
            href="/"
            className="flex items-center gap-2.5"
            aria-label="BuildAndDo home"
        >
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                <Activity className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">
                BuildAndDo
            </span>
        </a>
    );
}

function WorkspaceSwitcher() {
    const { workspaces, active, setActive } = useWorkspace();
    const [open, setOpen] = useState(false);
    if (workspaces.length <= 1) {
        return (
            <div className="rounded-md border border-border bg-secondary/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Workspace
                </p>
                <p className="mt-1 truncate text-sm font-medium">
                    {active?.name || '—'}
                </p>
            </div>
        );
    }
    return (
        <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workspace
            </p>
            <div className="relative mt-1">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                >
                    <span className="truncate">{active?.name || 'Select'}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                {open && (
                    <ul
                        className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg"
                        role="listbox"
                    >
                        {workspaces.map((w) => (
                            <li key={w.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActive(w.id);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary',
                                        w.id === active?.id && 'text-primary',
                                    )}
                                >
                                    <span className="truncate">{w.name}</span>
                                    {w.id === active?.id && (
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default function WorkspaceLayout() {
    const { user, logout } = useAuth();
    const { active, loading } = useWorkspace();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const domainRecord = active?.expand?.domain;
    const domainLabel = domainRecord?.domain || 'No website yet';
    const domainStatus = domainRecord?.status || (active ? 'selected' : null);

    return (
        <div className="min-h-screen bg-background text-foreground">
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
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetContent side="left" className="w-72 border-border bg-card p-0">
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
            </Sheet>

            {/* Main column */}
            <div className="lg:pl-60">
                {/* Top header */}
                <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md sm:px-6">
                    <div className="flex items-center gap-3">
                        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                            <SheetTrigger
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground lg:hidden"
                                aria-label="Open navigation"
                            >
                                <Menu className="h-5 w-5" />
                            </SheetTrigger>
                        </Sheet>
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-display text-sm font-semibold tracking-tight">
                                {loading ? 'Loading…' : active?.name || 'No workspace'}
                            </span>
                            <span className="hidden text-muted-foreground/50 sm:inline">
                                ·
                            </span>
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
                    <Button
                        size="sm"
                        onClick={() => navigate('/app/missions')}
                        className="shrink-0"
                    >
                        <Plus className="h-4 w-4" />
                        Start a mission
                    </Button>
                </header>

                <main className="px-4 py-8 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-6xl">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}


