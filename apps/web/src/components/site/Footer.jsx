import React from 'react';
import { Activity, Mail, MessageCircle, BookOpen, Users, Github } from 'lucide-react';

const DISCORD_INVITE_URL = 'https://discord.gg/vTDZxmpHHC';
const WIKI_URL = 'https://wiki.buildanddo.com';
const FORUM_URL = 'https://forum.buildanddo.com';
const GITHUB_URL = 'https://github.com/mrnobodytx/buildanddo';
const CONTRIBUTING_URL = 'https://github.com/mrnobodytx/buildanddo/blob/main/CONTRIBUTING.md';

const PRODUCT_LINKS = [
    { label: 'At a glance', href: '#glance' },
    { label: 'Challenge Desk', href: '#challenge-desk' },
    { label: 'Evidence Ledger', href: '#evidence-ledger' },
    { label: 'Daily Edition', href: '#daily-edition' },
    { label: 'Field Manual', href: '#field-manual' },
    { label: 'FAQ', href: '#faq' },
];

export default function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="border-t border-border/60 bg-background">
            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
                <div className="grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                        <a
                            href="#top"
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
                        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                            Early-stage software that helps small-business owners notice changes,
                            understand them in plain language, approve a bounded mission, and verify
                            what happened.
                        </p>
                    </div>

                    <nav aria-label="Footer">
                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                            Product
                        </p>
                        <ul className="mt-4 space-y-2.5">
                            {PRODUCT_LINKS.map((link) => (
                                <li key={link.href}>
                                    <a
                                        href={link.href}
                                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                            Get involved
                        </p>
                        <ul className="mt-4 space-y-2.5">
                            <li>
                                <a
                                    href="#early-access"
                                    className="text-sm font-medium text-primary transition-colors hover:brightness-125"
                                >
                                    Join early access
                                </a>
                            </li>
                            <li>
                                <a
                                    href={DISCORD_INVITE_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:brightness-125"
                                >
                                    <MessageCircle className="h-4 w-4 shrink-0" />
                                    Join our Discord
                                </a>
                            </li>
                            <li>
                                <a
                                    href={FORUM_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <Users className="h-4 w-4 shrink-0" />
                                    Community forum
                                </a>
                            </li>
                            <li>
                                <a
                                    href={WIKI_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <BookOpen className="h-4 w-4 shrink-0" />
                                    Wiki
                                </a>
                            </li>
                            <li>
                                <a
                                    href={GITHUB_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <Github className="h-4 w-4 shrink-0" />
                                    GitHub
                                </a>
                            </li>
                            <li>
                                <a
                                    href={CONTRIBUTING_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    How to contribute
                                </a>
                            </li>
                            <li className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="h-4 w-4 shrink-0" />
                                Contact — coming soon
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center">
                    <p className="text-xs text-muted-foreground">
                        © {year} BuildAndDo. All rights reserved.{' '}
                        <span className="text-muted-foreground/40">(edit-proof-20260907)</span>
                    </p>
                    <div className="flex items-center gap-5 text-xs text-muted-foreground/70">
                        <span aria-disabled="true">Privacy — coming soon</span>
                        <span aria-disabled="true">Terms — coming soon</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
