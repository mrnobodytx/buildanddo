import MotionToggle from '@/components/motion/MotionToggle';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Activity, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/site/ui';
import { ThemeToggle } from '@/components/ThemeControls';
import { useAuth } from '@/contexts/AuthContext';
import { useRoomsLive } from '@/hooks/useRoomsLive';
import { PUBLIC_NAV, PUBLIC_NAV_PRIMARY, PUBLIC_NAV_SECONDARY } from '@/lib/publicPages';

const primaryLinkClass = ({ isActive }) =>
    `motion-link inline-flex h-9 items-center rounded-sm px-3 text-sm transition-colors hover:bg-secondary/60 hover:text-foreground ${
        isActive ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground'
    }`;

const secondaryLinkClass = ({ isActive }) =>
    `inline-flex h-9 items-center px-2 font-evidence text-[11px] uppercase tracking-widest transition-colors hover:text-foreground ${
        isActive ? 'text-foreground' : 'text-muted-foreground/80'
    }`;

export default function Header({
    navLinks = [],
    ctaHref = '/#early-access',
    ctaLabel = 'Join early access',
}) {
    const [open, setOpen] = useState(false);
    const { isAuthed } = useAuth();
    const roomsLive = useRoomsLive();
    return (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 2xl:max-w-[88rem]">
                <Link
                    to="/"
                    className="flex shrink-0 items-center gap-2"
                    aria-label="BuildAndDo home"
                >
                    <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
                    <span className="font-display text-lg font-semibold tracking-tight">
                        BuildAndDo
                    </span>
                </Link>
                <nav className="hidden min-w-0 flex-1 items-center justify-center xl:flex" aria-label="Primary">
                    <ul className="flex items-center gap-0.5">
                        {PUBLIC_NAV_PRIMARY.map((page) => (
                            <li key={page.path}>
                                <NavLink to={page.path} className={primaryLinkClass}>
                                    {page.label}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                    <span aria-hidden="true" className="mx-3 hidden h-5 w-px bg-border 2xl:block" />
                    <ul className="hidden items-center gap-0.5 2xl:flex" aria-label="Company">
                        {PUBLIC_NAV_SECONDARY.map((page) => (
                            <li key={page.path}>
                                <NavLink to={page.path} className={secondaryLinkClass}>
                                    {page.label}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    {roomsLive && (
                        <Link
                            to="/app/rooms"
                            className="hidden items-center gap-1.5 border border-primary/40 px-2.5 py-1 font-evidence text-[10px] uppercase tracking-widest text-primary transition-colors hover:bg-primary/10 lg:inline-flex"
                            aria-label="Living Rooms are live"
                        >
                            <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse"
                            />
                            Rooms live
                        </Link>
                    )}
                    <ThemeToggle />
                    <MotionToggle />
                    {isAuthed ? (
                        <Button href="/app" size="sm" className="hidden sm:inline-flex">
                            Open workspace
                        </Button>
                    ) : (
                        <>
                            <Link
                                to="/login"
                                className="hidden py-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
                            >
                                Sign in
                            </Link>
                            <Button href={ctaHref} size="sm" className="hidden sm:inline-flex">
                                {ctaLabel}
                            </Button>
                        </>
                    )}
                    <Sheet open={open} onOpenChange={setOpen}>
                        <SheetTrigger
                            className="inline-flex h-10 w-10 items-center justify-center border border-border text-foreground xl:hidden"
                            aria-label="Open menu"
                        >
                            <Menu className="h-5 w-5" aria-hidden="true" />
                        </SheetTrigger>
                        <SheetContent
                            side="right"
                            aria-describedby={undefined}
                            className="w-80 max-w-[calc(100vw-1rem)] overflow-y-auto border-border bg-card"
                        >
                            <SheetTitle>Browse BuildAndDo</SheetTitle>
                            <nav aria-label="Mobile primary" className="mt-6 flex flex-col gap-1">
                                {PUBLIC_NAV.map((page) => (
                                    <NavLink
                                        key={page.path}
                                        to={page.path}
                                        onClick={() => setOpen(false)}
                                        className={({ isActive }) =>
                                            `px-3 py-3 text-base hover:bg-secondary ${isActive ? 'font-semibold text-primary' : 'text-muted-foreground'}`
                                        }
                                    >
                                        {page.label}
                                    </NavLink>
                                ))}
                            </nav>
                            {navLinks.length > 0 && (
                                <nav
                                    aria-label="On this page"
                                    className="mt-4 border-t border-border pt-4"
                                >
                                    {navLinks.map((link) => (
                                        <Link
                                            key={link.href}
                                            to={link.href}
                                            onClick={() => setOpen(false)}
                                            className="block px-3 py-3 text-sm text-muted-foreground hover:text-foreground"
                                        >
                                            {link.label}
                                        </Link>
                                    ))}
                                </nav>
                            )}
                            <div className="mt-4 space-y-3 border-t border-border pt-4">
                                {isAuthed ? (
                                    <Button
                                        href="/app"
                                        onClick={() => setOpen(false)}
                                        className="w-full"
                                    >
                                        Open workspace
                                    </Button>
                                ) : (
                                    <>
                                        <Link
                                            to="/login"
                                            onClick={() => setOpen(false)}
                                            className="block px-3 py-3 text-muted-foreground"
                                        >
                                            Sign in
                                        </Link>
                                        <Button
                                            href={ctaHref}
                                            onClick={() => setOpen(false)}
                                            className="w-full"
                                        >
                                            {ctaLabel}
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
