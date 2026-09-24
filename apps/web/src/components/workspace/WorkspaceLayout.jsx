// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/WorkspaceLayout.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/contexts/WorkspaceAccessContext.jsx, apps/web/src/pages/workspace/CareerPage.jsx, apps/web/src/lib/workspaceControl.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/contexts/WorkspaceAccessContext.jsx; CONSUMES apps/web/src/pages/workspace/CareerPage.jsx; CONSUMES apps/web/src/lib/workspaceControl.js
// Intent:      Keep workspace navigation tied to observed account and government membership while preserving ordinary work areas.
// ───────────────────────────────────────────────────────────────

import MotionToggle from '@/components/motion/MotionToggle';
import React, { useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '@/components/brand/BrandMark';
import Wordmark from '@/components/brand/Wordmark';
import {
    Activity,
    Compass,
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
    BookOpen,
    Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Helmet } from 'react-helmet';
import { ThemeToggle } from '@/components/ThemeControls';
import { useAuth } from '@/contexts/AuthContext';
import { isMasterSeat } from '@/lib/estateAccess';
import { workspaceLifecycleKey } from '@/lib/workspaceControl';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { WorkspaceAccessProvider, useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/site/ui';
import { StatusBadge, DOMAIN_STATUS } from './workspaceHelpers';
import { DemoModeBanner } from './WorkspaceNotices';
import WorkspaceAssistant from './WorkspaceAssistant';

// Build and Do lead; the rest is grouped so a new user sees five headings, not
// thirty-five links. Every destination is still here; only its placement changed.
const NAV_TOP = [
    { to: '/app/journey', label: 'Start a journey', icon: Compass },
    { to: '/app', label: 'Front Page', icon: LayoutDashboard, end: true },
];
const NAV_GROUPS = [
    { id: 'build', label: 'Build', hint: 'Learn it and make it', items: [
        { to: '/app/tutorials', label: 'Field Manual', icon: GraduationCap },
        { to: '/app/classrooms', label: 'Classrooms', icon: Users },
        { to: '/app/blueprints', label: 'Blueprints', icon: FileSearch },
        { to: '/app/knowledge', label: 'Knowledge & context', icon: Network },
        { to: '/app/research', label: 'Mission research', icon: FileSearch },
        { to: '/app/policy', label: 'Policy intelligence', icon: Scale },
        { to: '/app/government', label: 'Government research', icon: Scale },
    ] },
    { id: 'do', label: 'Do', hint: 'Put it to work', items: [
        { to: '/app/missions', label: 'Challenge Desk', icon: Target },
        { to: '/app/signals', label: 'Signals', icon: Radar },
        { to: '/app/workflows', label: 'Workflows', icon: Workflow },
        { to: '/app/erp', label: 'ERP', icon: Boxes },
        { to: '/app/operator', label: 'Operator cockpit', icon: Activity },
        { to: '/app/desks', label: 'Specialist desks', icon: Boxes },
        { to: '/app/suite', label: 'Mission suite', icon: Boxes, government: true },
        { to: '/app/operations', label: 'Operations Desk', icon: Server },
    ] },
    { id: 'prove', label: 'Prove', hint: 'Show what you did', items: [
        { to: '/app/career', label: 'Career Passport', icon: BookOpen },
        { to: '/app/evidence', label: 'Evidence Ledger', icon: FileSearch },
        { to: '/app/replay', label: 'Execution replay', icon: Workflow },
        { to: '/app/passport', label: 'Capability Passport', icon: ShieldCheck },
        { to: '/app/corrections', label: 'Corrections', icon: Scale },
        { to: '/app/dossier', label: 'My dossier', icon: BookOpen },
    ] },
    { id: 'community', label: 'Community', hint: 'People and news', items: [
        { to: '/app/edition', label: 'Daily Edition', icon: Newspaper },
        { to: '/app/rooms/organization', label: 'Living Rooms', icon: Network },
        { to: '/app/community', label: 'Community & Social', icon: MessageCircle },
        { to: '/app/support', label: 'Support & Revenue', icon: Coins },
    ] },
    { id: 'workspace', label: 'Workspace', hint: 'Run this workspace', items: [
        { to: '/app/wiki', label: 'Workspace wiki', icon: BookOpen },
        { to: '/app/forums', label: 'Workspace forum', icon: Users },
        { to: '/app/roadmap', label: 'Roadmap', icon: Gauge },
        { to: '/app/platforms', label: 'Platform Health', icon: Plug, estate: true },
        { to: '/app/fleet', label: 'Fleet', icon: Network, estate: true },
        { to: '/app/integrations', label: 'Sinks & extensions', icon: Plug },
        { to: '/app/admin', label: 'Administration', icon: ShieldCheck, admin: true },
    ] },
];
const NAV_BOTTOM = [{ to: '/app/settings', label: 'Settings', icon: Settings }];
/** Return the group holding a path, so that group starts open. */
function groupFor(pathname) {
    const match = (item) => pathname === item.to || pathname.startsWith(item.to + '/') ||
        (item.to === '/app/rooms/organization' && pathname.startsWith('/app/rooms'));
    // Settings sits pinned at the bottom but belongs with the workspace controls.
    if (pathname.startsWith('/app/settings')) return 'workspace';
    return NAV_GROUPS.find((group) => group.items.some(match))?.id || '';
}

function NavItem({ item, onNavigate }) {
    return (
        <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
                cn(
                    'motion-nav-link flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )
            }
        >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={2.1} />
            {item.label}
        </NavLink>
    );
}

function NavList({ onNavigate }) {
    const access = useWorkspaceAccess();
    const { user } = useAuth();
    const { pathname } = useLocation();
    const base = useId();
    // Estate entries (Fleet, Platform Health) are for master-level CNWB seats only; the level is backend-owned
    // (estate.pb.js). An entry left off this filter stays in the sidebar and bounces the reader back to /app.
    const masterSeat = isMasterSeat(user);
    const allowed = (item) => (!item.admin || access.data?.can_admin) && (!item.estate || masterSeat) && (!item.government || access.data?.government?.allowed);
    const current = groupFor(pathname);
    const [open, setOpen] = useState(() => new Set(current ? [current] : []));
    const [seen, setSeen] = useState(current);
    if (current !== seen) { setSeen(current); if (current && !open.has(current)) setOpen(new Set([...open, current])); }
    const toggle = (id) => setOpen((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    return (
        <nav className="flex flex-col gap-1" aria-label="Workspace">
            {NAV_TOP.map((item) => <NavItem key={item.to} item={item} onNavigate={onNavigate} />)}
            {NAV_GROUPS.map((group) => {
                const items = group.items.filter(allowed);
                if (!items.length) return null;
                const expanded = open.has(group.id);
                const panel = `${base}-${group.id}`;
                return (
                    <div key={group.id} className="mt-2">
                        <button type="button" aria-expanded={expanded} aria-controls={panel} onClick={() => toggle(group.id)}
                            className="flex w-full items-baseline justify-between rounded-md px-3 py-1.5 text-left hover:bg-secondary/60">
                            <span className="text-xs font-semibold uppercase tracking-wider">{group.label}</span>
                            <span className="text-xs text-muted-foreground">{group.hint}</span>
                        </button>
                        {expanded && <div id={panel} className="flex flex-col gap-1">
                            {items.map((item) => <NavItem key={item.to} item={item} onNavigate={onNavigate} />)}
                        </div>}
                    </div>
                );
            })}
            <div className="mt-2">{NAV_BOTTOM.map((item) => <NavItem key={item.to} item={item} onNavigate={onNavigate} />)}</div>
        </nav>
    );
}

// The mark and the wordmark together. Named for what it is, so it no longer collides with the
// mark component it now draws.
function BrandLockup() {
    return (
        <Link to="/" className="flex items-center gap-2.5" aria-label="BuildAndDo home">
            <BrandMark size={32} decorative />
            <Wordmark className="text-base" />
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

function WorkspacePages() {
    const access = useWorkspaceAccess();
    const key = workspaceLifecycleKey({ access });
    const [draft, setDraft] = useState({ key, epoch: 0, value: { answers: {}, step: 0, saved: null, saveState: 'idle' } });
    // Reset only the journey, not every routed desk. Polling leaves this key
    // unchanged; each changed grant fences old save callbacks, even on return.
    if (draft.key !== key) setDraft({ key, epoch: draft.epoch + 1, value: { answers: {}, step: 0, saved: null, saveState: 'idle' } });
    const setJourney = (update) => setDraft((current) => current.epoch !== draft.epoch || current.key !== key ? current : {
        ...current, value: typeof update === 'function' ? update(current.value) : update,
    });
    return <Outlet context={{ journey: draft.value, setJourney, journeyEpoch: draft.epoch }} />;
}

export default function WorkspaceLayout() {
    const { user, logout, sessionEpoch } = useAuth();
    const { active, loading } = useWorkspace();
    const { demo } = useDemoMode();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);
    const scope = workspaceLifecycleKey({ accountId: user?.id, workspaceId: active?.id, demo, sessionEpoch });

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const domainRecord = active?.expand?.domain;
    const domainLabel = domainRecord?.domain || (active?.domain ? 'Website details unavailable' : 'No website yet');
    const domainStatus = domainRecord?.status || (active && !active.domain ? 'selected' : null);

    return (
        <WorkspaceAccessProvider key={scope}>
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <meta name="robots" content="noindex,nofollow" />
            </Helmet>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                {/* Desktop sidebar */}
                <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-secondary/15 lg:flex">
                    <div className="flex h-14 items-center border-b border-border/60 px-4">
                        <BrandLockup />
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-4">
                        <NavList />
                    </div>
                    <div className="space-y-3 border-t border-border/60 p-3">
                        <WorkspaceSwitcher />
                        <div className="flex items-center justify-between gap-2 rounded-md px-1">
                            {/* Display name first, the way DossierPage already does it. A seat's
                                email is derived from the machine it signs on, so rendering it here
                                put a fleet hostname on every workspace screen and into any
                                screenshot or recording of one. Settings still shows the address,
                                which is where someone actually looks for it. */}
                            <span className="truncate text-xs text-muted-foreground">
                                {user?.name || user?.email}
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
                        <BrandLockup />
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
                    <MotionToggle />
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
                        data-assistant-surface
                        id="main-content"
                        tabIndex={-1}
                        className="workspace-content px-4 py-8 sm:px-6 lg:px-8"
                    >
                        <div key={scope} className="mx-auto max-w-6xl space-y-6">
                            {/* Rendered by the shell, not by each page, so a page
                            that forgets it cannot present demonstration data
                            as the operator's own. */}
                            <DemoModeBanner />
                            <WorkspacePages />
                        </div>
                    </main>
                </div>
            </Sheet>
            <WorkspaceAssistant />
        </div>
        </WorkspaceAccessProvider>
    );
}
