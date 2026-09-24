// CGRF: SRS=SRS-BUILDANDDO-COMMUNITY-WEB-001, SRS-BUILDANDDO-PURPOSE-001 | CAPS=B | Seat=C-ONE
import React from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '@/components/brand/BrandMark';
import Wordmark from '@/components/brand/Wordmark';
import { PUBLIC_NAV } from '@/lib/publicPages';
import { PURPOSE } from '@/lib/purpose';
import {
    COMMUNITY_LINKS,
    GUILD_PATH,
    STATUS_PATH,
    STORE_LINK,
    communityLink,
} from '@/lib/communityLinks';
import {
    AudioLines,
    BookOpen,
    Bot,
    Github,
    Mail,
    MessageCircle,
    Newspaper,
    ShoppingBag,
    Users,
    Youtube,
} from 'lucide-react';

// Every URL here comes from communityLinks.js; only the icon is chosen in this file.
const ICONS = {
    discord: MessageCircle,
    forum: Users,
    wiki: BookOpen,
    reddit: Newspaper,
    youtube: Youtube,
    github: Github,
    'voice-agent': AudioLines,
};
// The Discord invite is the footer's call to action, so it keeps its imperative wording.
const CALL_TO_ACTION = { discord: 'Join our Discord' };
// The website is this site, so the footer does not link to itself as a community surface.
const FOOTER_COMMUNITY = COMMUNITY_LINKS.filter((link) => link.id !== 'website');
const CONTRIBUTING_URL = `${communityLink('github').url}/blob/main/CONTRIBUTING.md`;

const PRODUCT_LINKS = PUBLIC_NAV.map((page) => ({ label: page.label, href: page.path }));

export default function Footer({
    productLinks = PRODUCT_LINKS,
    earlyAccessHref = '/#early-access',
}) {
    const year = new Date().getFullYear();

    return (
        <footer className="border-t border-border/60 bg-background">
            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
                <div className="grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                        <a
                            href="/"
                            className="flex items-center gap-2.5"
                            aria-label="BuildAndDo home"
                        >
                            <BrandMark size={28} decorative />
                            <Wordmark className="text-base" />
                        </a>
                        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                            {PURPOSE.summary}
                        </p>
                    </div>

                    <nav aria-label="Footer">
                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                            Product
                        </p>
                        <ul className="mt-4 space-y-2.5">
                            {productLinks.map((link) => (
                                <li key={link.href}>
                                    <Link
                                        to={link.href}
                                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {link.label}
                                    </Link>
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
                                    href={earlyAccessHref}
                                    className="text-sm font-medium text-primary transition-colors hover:brightness-125"
                                >
                                    Join early access
                                </a>
                            </li>
                            {FOOTER_COMMUNITY.map((link) => {
                                const Icon = ICONS[link.id];
                                return (
                                    <li key={link.id}>
                                        <a
                                            href={link.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={
                                                link.id === 'discord'
                                                    ? 'flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:brightness-125'
                                                    : 'flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground'
                                            }
                                        >
                                            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                                            {CALL_TO_ACTION[link.id] || link.label}
                                        </a>
                                    </li>
                                );
                            })}
                            <li>
                                <Link
                                    to={GUILD_PATH}
                                    className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <Bot className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    Meet the guildmasters
                                </Link>
                            </li>
                            <li>
                                <a
                                    href={STORE_LINK.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    {STORE_LINK.label}
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
                                <Link to="/contact" className="hover:text-foreground">Contact</Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center">
                    <p className="text-xs text-muted-foreground">
                        © {year} Citadel Nexus Inc. All rights reserved.{' '}
                        <Link to={STATUS_PATH} className="underline underline-offset-4">Service status</Link>
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
