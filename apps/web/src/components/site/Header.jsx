import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/site/ui';
import { useAuth } from '@/contexts/AuthContext';

const NAV_LINKS = [
    { label: 'At a glance', href: '#glance' },
    { label: 'Challenge Desk', href: '#challenge-desk' },
    { label: 'Evidence Ledger', href: '#evidence-ledger' },
    { label: 'Daily Edition', href: '#daily-edition' },
    { label: 'Field Manual', href: '#field-manual' },
    { label: 'Roadmap', href: '/roadmap' },
    { label: 'FAQ', href: '#faq' },
];

function Logo() {
    return (
        <a href="#top" className="flex items-center gap-2.5" aria-label="BuildAndDo home">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                <Activity className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">
                BuildAndDo
            </span>
        </a>
    );
}

export default function Header({
    navLinks = NAV_LINKS,
    ctaHref = '#early-access',
    ctaLabel = 'Join early access',
}) {
    const [open, setOpen] = useState(false);
    const { isAuthed } = useAuth();

    return (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
                <Logo />

                <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
                    {navLinks.map((link) =>
                        link.href.startsWith('/') ? (
                            <Link
                                key={link.href}
                                to={link.href}
                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {link.label}
                            </Link>
                        ) : (
                            <a
                                key={link.href}
                                href={link.href}
                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {link.label}
                            </a>
                        ),
                    )}
                </nav>

                <div className="flex items-center gap-3">
                    {isAuthed ? (
                        <Button
                            href="/app"
                            size="sm"
                            className="hidden sm:inline-flex"
                        >
                            Open workspace
                        </Button>
                    ) : (
                        <>
                            <Link
                                to="/login"
                                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
                            >
                                Sign in
                            </Link>
                            <Button
                                href={ctaHref}
                                size="sm"
                                className="hidden sm:inline-flex"
                            >
                                {ctaLabel}
                            </Button>
                        </>
                    )}

                    <Sheet open={open} onOpenChange={setOpen}>
                        <SheetTrigger
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground lg:hidden"
                            aria-label="Open menu"
                        >
                            <Menu className="h-5 w-5" />
                        </SheetTrigger>
                        <SheetContent side="right" className="w-72 border-border bg-card">
                            <SheetTitle className="sr-only">Menu</SheetTitle>
                            <div className="mt-8 flex flex-col gap-1">
                                {navLinks.map((link) =>
                                    link.href.startsWith('/') ? (
                                        <Link
                                            key={link.href}
                                            to={link.href}
                                            onClick={() => setOpen(false)}
                                            className="rounded-md px-3 py-3 text-base text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                        >
                                            {link.label}
                                        </Link>
                                    ) : (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            onClick={() => setOpen(false)}
                                            className="rounded-md px-3 py-3 text-base text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                        >
                                            {link.label}
                                        </a>
                                    ),
                                )}
                                {isAuthed ? (
                                    <Button
                                        href="/app"
                                        onClick={() => setOpen(false)}
                                        className="mt-4 w-full"
                                    >
                                        Open workspace
                                    </Button>
                                ) : (
                                    <>
                                        <Link
                                            to="/login"
                                            onClick={() => setOpen(false)}
                                            className="mt-2 rounded-md px-3 py-3 text-base text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                        >
                                            Sign in
                                        </Link>
                                        <Button
                                            href={ctaHref}
                                            onClick={() => setOpen(false)}
                                            className="mt-2 w-full"
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
