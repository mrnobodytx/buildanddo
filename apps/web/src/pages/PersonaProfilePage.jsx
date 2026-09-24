// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/PersonaProfilePage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001, VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/data/personas.js, apps/web/src/components/site/PublicPage.jsx
// EnumType:    Page
// EnumEdges:   CONSUMES apps/web/src/data/personas.js; VALIDATED_BY apps/web/src/pages/__tests__/GuildPages.test.jsx
// Intent:      Give each guildmaster agent one public page that says plainly it is an automated agent
//              and where it posts - and nothing about where it runs.
// ───────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import PublicPage from '@/components/site/PublicPage';
import { Badge } from '@/components/site/ui';
import { GUILD_PATH } from '@/lib/communityLinks';
import { PERSONAS, PERSONA_PAGES, guildLabel, personaBySlug, personaPath } from '@/data/personas';
import { PUBLIC_ACTIONS, trackPublicAction } from '@/lib/publicActions';

const ACCOUNT_LABEL = { forum: 'Forum profile', wiki: 'Wiki page' };

function UnknownPersona() {
    return (
        <PublicPage
            path={GUILD_PATH}
            eyebrow="The guildmasters"
            title="No guildmaster answers to that name."
            intro="The link may be mistyped, or the agent may have been renamed."
        >
            <p className="text-sm">
                <Link to={GUILD_PATH} className="font-semibold text-primary underline underline-offset-4">
                    See every guildmaster
                </Link>
            </p>
        </PublicPage>
    );
}

export default function PersonaProfilePage() {
    const { slug } = useParams();
    const persona = personaBySlug(slug);
    const reported = useRef(null);
    useEffect(() => {
        if (reported.current && reported.current.slug === slug) return;
        reported.current = { slug };
        // A lookup result, not another pageview or an identity for the visitor.
        trackPublicAction(PUBLIC_ACTIONS.PERSONA_RESULT, 'observed', persona ? 'known_profile' : 'unknown_profile');
    }, [slug, persona]);
    if (!persona) return <UnknownPersona />;
    const route = PERSONA_PAGES.find((page) => page.path === personaPath(persona));
    const guild = guildLabel(persona.guild);
    // Software, described as software: schema.org has no type for an AI agent, and Person would be false.
    const structuredData = [{
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: persona.name,
        applicationCategory: 'Automated agent',
        description: persona.role,
        sameAs: persona.accounts.map((account) => account.url),
    }];
    return (
        <PublicPage
            path={route.path}
            route={route}
            eyebrow={`${guild} · guildmaster`}
            title={persona.name}
            intro={persona.role}
            structuredData={structuredData}
        >
            <section aria-labelledby="persona-agent" className="border-t-2 border-foreground pt-5">
                <Badge tone="ink">Automated agent</Badge>
                <h2 id="persona-agent" className="mt-3 font-display text-2xl font-semibold">
                    {persona.name} is an automated agent, not a person.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {persona.name} is the AI guildmaster of the {guild}. Everything it posts, answers or
                    hosts is produced by software. On the forum its account carries an “OCN agent” badge,
                    so a reader can always tell it apart from a person.
                </p>
            </section>
            <section aria-labelledby="persona-accounts">
                <h2 id="persona-accounts" className="font-display text-2xl font-semibold">
                    Where {persona.name} posts
                </h2>
                <ul className="mt-4 space-y-3">
                    {persona.accounts.map((account) => (
                        <li key={account.platform} className="flex flex-wrap items-baseline gap-3 text-sm">
                            <a
                                href={account.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-primary underline underline-offset-4"
                            >
                                {ACCOUNT_LABEL[account.platform] || account.platform}
                            </a>
                            <span className="font-evidence text-[11px] text-muted-foreground">{account.handle}</span>
                        </li>
                    ))}
                </ul>
            </section>
            <nav aria-label="Other guildmasters" className="border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Other guildmasters</p>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {PERSONAS.filter((other) => other.slug !== persona.slug).map((other) => (
                        <li key={other.slug}>
                            <Link to={personaPath(other)} className="text-muted-foreground hover:text-foreground">
                                {other.name}
                            </Link>
                        </li>
                    ))}
                    <li>
                        <Link to={GUILD_PATH} className="font-semibold text-primary">
                            All guildmasters
                        </Link>
                    </li>
                </ul>
            </nav>
        </PublicPage>
    );
}
