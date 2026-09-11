// CGRF: SRS=SRS-BUILDANDDO-WORKSPACE-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/site/Header.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/lib/roadmapStatus.js,
//              apps/web/src/components/ui/sheet.jsx,
//              apps/web/src/contexts/AuthContext.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/public/roadmap-status.json;
//              CONSUMED_BY apps/web/src/pages/HomePage.jsx;
//              CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx;
//              CONSUMED_BY apps/web/src/pages/PracticePage.jsx
// Intent:      One site header for every public page: grouped navigation
//              (Learn / Do / Roadmap / FAQ) that works from any route, a real
//              mobile menu, aria-current on the active route, a skip link, and
//              a status chip that quotes the same projection the roadmap
//              reads - hidden, never guessed, when that fetch fails.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, ChevronDown, Menu, Radio } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/site/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useRoadmapStatus, signalsStateOf } from '@/lib/roadmapStatus';
import { cn } from '@/lib/utils';

// Every `to` is an absolute route (with hash where the target is a section of
// the front page) so the same header navigates correctly from /roadmap and
// /practice, not only from /.
export const NAV = [
    {
        label: 'Learn',
        items: [
            { label: 'Field Manual', to: '/#field-manual' },
            { label: 'Daily Edition', to: '/#daily-edition' },
        ],
    },
    {
        label: 'Do',
        items: [
            { label: 'Challenge Desk', to: '/#challenge-desk' },
            { label: 'Evidence Ledger', to: '/#evidence-ledger' },
            { label: 'Practice', to: '/practice' },
        ],
    },
    { label: 'Roadmap', to: '/roadmap' },
    { label: 'FAQ', to: '/#faq' },
];

const COMPACT_AFTER_PX = 24;

/**
 * @param {string} to A route, optionally with a hash.
 * @param {{pathname:string, hash:string}} location Current router location.
 * @returns {boolean} Whether `to` is the page (and section) being viewed.
 */
export function isActiveRoute(to, location) {
    const [path, hash] = to.split('#');
    if (location.pathname !== path) return false;
    return hash ? location.hash === `#${hash}` : true;
}

function Brand() {
    return (
        <Link to="/" className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]" aria-label="BuildAndDo home">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary" aria-hidden="true">
                <Activity className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">BuildAndDo</span>
        </Link>
    );
}

const linkBase = 'inline-flex items-center rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';
const linkIdle = 'text-muted-foreground hover:text-foreground';
const linkActive = 'text-foreground font-semibold';

function NavLink({ item, location, onNavigate, className }) {
    const active = isActiveRoute(item.to, location);
    return (
        <Link
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(linkBase, active ? linkActive : linkIdle, className)}
        >
            {item.label}
        </Link>
    );
}

/**
 * Desktop disclosure for a nav group. Click or Enter toggles, Escape closes
 * and returns focus to the button, clicking outside closes.
 */
function NavGroup({ group, location }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const buttonRef = useRef(null);
    const panelId = useId();
    const groupActive = group.items.some((i) => isActiveRoute(i.to, location));

    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const onKeyDown = (e) => {
        if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
            buttonRef.current?.focus();
        }
    };

    return (
        <div ref={rootRef} className="relative" onKeyDown={onKeyDown} onPointerLeave={() => setOpen(false)}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
                aria-expanded={open}
                aria-haspopup="true"
                aria-controls={panelId}
                data-active={groupActive ? 'true' : undefined}
                className={cn(linkBase, 'gap-1', groupActive ? linkActive : linkIdle)}
            >
                {group.label}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            </button>
            <div
                id={panelId}
                hidden={!open}
                className="absolute left-0 top-full z-50 min-w-[12rem] border border-border bg-card p-1 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)]"
            >
                <ul className="flex flex-col" aria-label={group.label}>
                    {group.items.map((item) => (
                        <li key={item.to}>
                            <NavLink item={item} location={location} onNavigate={() => setOpen(false)} className="w-full px-3 py-2 hover:bg-secondary/60" />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

/**
 * Live-signals chip. Quotes roadmap-status.json's `signals_state`; renders
 * nothing until the file is read and nothing at all if the read fails.
 */
function SignalsChip({ state, className }) {
    if (!state) return null;
    const measured = state === 'MEASURED';
    return (
        <Link
            to="/roadmap#live-sources"
            data-testid="header-signals-chip"
            aria-label={`Live signals: ${state}. Open the roadmap live sources.`}
            className={cn(
                'inline-flex h-7 items-center gap-1.5 border px-2 font-evidence text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]',
                measured
                    ? 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-success hover:bg-[hsl(var(--success))]/20'
                    : 'border-border bg-secondary/60 text-muted-foreground hover:text-foreground',
                className,
            )}
        >
            <Radio className="h-3 w-3" aria-hidden="true" />
            <span className="hidden sm:inline">Live signals ·</span> {state}
        </Link>
    );
}

export default function Header() {
    const [open, setOpen] = useState(false);
    const [compact, setCompact] = useState(false);
    const { isAuthed } = useAuth();
    const location = useLocation();
    // One read of the projection per header; null hides the chip (fail-soft).
    const { status, error } = useRoadmapStatus();
    const signalsState = error || !status ? null : signalsStateOf(status);

    const onScroll = useCallback(() => {
        setCompact(window.scrollY > COMPACT_AFTER_PX);
    }, []);

    useEffect(() => {
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [onScroll]);

    const closeMenu = () => setOpen(false);

    return (
        <header
            className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md"
            data-compact={compact ? 'true' : 'false'}
        >
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-[60] focus:border focus:border-primary focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground"
            >
                Skip to content
            </a>
            <div
                className={cn(
                    'mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 transition-[height] duration-200 sm:px-6',
                    compact ? 'h-11' : 'h-14',
                )}
            >
                <div className="flex items-center gap-4">
                    <Brand />
                    <SignalsChip state={signalsState} className="hidden md:inline-flex" />
                </div>

                <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
                    {NAV.map((entry) =>
                        entry.items ? (
                            <NavGroup key={entry.label} group={entry} location={location} />
                        ) : (
                            <NavLink key={entry.to} item={entry} location={location} />
                        ),
                    )}
                </nav>

                <div className="flex items-center gap-3">
                    {isAuthed ? (
                        <Button href="/app" size="sm" className="hidden sm:inline-flex">
                            Open workspace
                        </Button>
                    ) : (
                        <>
                            <Link
                                to="/login"
                                aria-current={location.pathname === '/login' ? 'page' : undefined}
                                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
                            >
                                Sign in
                            </Link>
                            <Button to="/#early-access" size="sm" className="hidden sm:inline-flex">
                                Join early access
                            </Button>
                        </>
                    )}

                    <Sheet open={open} onOpenChange={setOpen}>
                        <SheetTrigger
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] lg:hidden"
                            aria-label="Open menu"
                        >
                            <Menu className="h-5 w-5" aria-hidden="true" />
                        </SheetTrigger>
                        <SheetContent side="right" className="w-80 border-border bg-card" aria-label="Site menu">
                            <SheetTitle className="sr-only">Menu</SheetTitle>
                            <SheetDescription className="sr-only">Site navigation</SheetDescription>
                            <div className="mt-6 flex items-center justify-between">
                                <Brand />
                            </div>
                            <SignalsChip state={signalsState} className="mt-4" />
                            <nav className="mt-6 flex flex-col gap-5" aria-label="Mobile">
                                {NAV.map((entry) =>
                                    entry.items ? (
                                        <div key={entry.label}>
                                            <p className="px-2 font-evidence text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                                {entry.label}
                                            </p>
                                            <ul className="mt-1 flex flex-col">
                                                {entry.items.map((item) => (
                                                    <li key={item.to}>
                                                        <NavLink item={item} location={location} onNavigate={closeMenu} className="w-full px-3 py-3 text-base hover:bg-secondary" />
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : (
                                        <NavLink key={entry.to} item={entry} location={location} onNavigate={closeMenu} className="px-3 py-3 text-base hover:bg-secondary" />
                                    ),
                                )}
                            </nav>
                            <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5">
                                {isAuthed ? (
                                    <Button href="/app" onClick={closeMenu} className="w-full">Open workspace</Button>
                                ) : (
                                    <>
                                        <Link
                                            to="/login"
                                            onClick={closeMenu}
                                            className="rounded-md px-3 py-3 text-base text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                        >
                                            Sign in
                                        </Link>
                                        <Button to="/#early-access" onClick={closeMenu} className="w-full">
                                            Join early access
                                        </Button>
                                    </>
                                )}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    );
}
