// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/communityLinks.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/publicPages.js
// EnumType:    ConfigDoc
// EnumEdges:   CONSUMED_BY apps/web/src/components/site/Footer.jsx; CONSUMED_BY apps/web/src/components/Seo.jsx;
//              CONSUMED_BY apps/web/tools/generate-seo.mjs; CONSUMED_BY apps/web/src/pages/ContactPage.jsx;
//              VALIDATED_BY apps/web/src/lib/__tests__/communityLinks.test.jsx
// Intent:      Hold every place BuildAndDo lives outside this site exactly once, so a link cannot drift.
// ───────────────────────────────────────────────────────────────

// WHY ONE FILE. Measured 2026-09-22: the footer, the contact page and llms.txt each carried their
// own copy of these URLs, and they had already diverged - llms.txt named Reddit and Gumroad and
// nothing else. The Discord invite is the sharpest case: only ONE invite may be published, because
// every other invite lands in a moderator-only channel. A second hand-typed copy is how the wrong
// one ships. src/lib/__tests__/communityLinks.test.jsx fails if any other file under src/ or tools/
// hard-codes a Discord invite, the forum, the wiki or the subreddit.
//
// This module is plain JavaScript with relative imports only, because tools/generate-seo.mjs runs
// it under bare Node at build time, where the "@" alias does not exist.

import { SITE_ORIGIN } from './publicPages.js';

/**
 * Every community surface, in the order the footer and llms.txt present them.
 *
 * `profile: true` marks an official public profile of BuildAndDo itself. Those, and only those,
 * go into the JSON-LD `sameAs` list: the website is the subject of that list, not a member of it,
 * and the voice agent is a conversation, not a profile.
 */
export const COMMUNITY_LINKS = Object.freeze([
    {
        id: 'website',
        label: 'BuildAndDo',
        url: SITE_ORIGIN,
        profile: false,
        summary: 'this site, with the daily edition, the public roadmap and the workspace.',
    },
    {
        id: 'discord',
        label: 'Discord',
        url: 'https://discord.gg/vTDZxmpHHC',
        profile: true,
        summary: 'the community server. This is the only public invite.',
    },
    {
        id: 'forum',
        label: 'Community forum',
        url: 'https://forum.buildanddo.com',
        profile: true,
        summary: 'long-form discussion; the guildmaster agents post here under an OCN agent badge.',
    },
    {
        id: 'wiki',
        label: 'Wiki',
        url: 'https://wiki.buildanddo.com',
        profile: true,
        summary: 'reference pages, including one page per guildmaster agent.',
    },
    {
        id: 'reddit',
        label: 'r/buildanddo on Reddit',
        url: 'https://www.reddit.com/r/buildanddo',
        profile: true,
        summary: 'the public subreddit.',
    },
    {
        id: 'youtube',
        label: 'YouTube',
        // The handle really is "buildndo", without the "a". Do not correct it: the corrected
        // spelling is a different channel.
        url: 'https://www.youtube.com/@buildndo',
        profile: true,
        summary: 'video walkthroughs and recordings.',
    },
    {
        id: 'github',
        label: 'GitHub',
        url: 'https://github.com/mrnobodytx/buildanddo',
        profile: true,
        summary: 'the public source repository, issues and contribution guide.',
    },
    {
        id: 'voice-agent',
        label: 'Talk to our agent',
        url: 'https://elevenlabs.io/app/talk-to?agent_id=agent_7801m2nrs2cney49mz2jgc5cc1yz',
        profile: false,
        summary: 'a voice conversation with the BuildAndDo agent. It is an automated agent, not a person.',
    },
]);

/** Where the playbooks and courses are sold. A store, not a community surface. */
export const STORE_LINK = Object.freeze({
    id: 'gumroad',
    label: 'Playbooks and courses on Gumroad',
    url: 'https://citadelnexus.gumroad.com',
    summary: 'the Citadel Nexus store.',
});

/** Same-domain pages that belong beside the community links: the persona directory and status. */
export const GUILD_PATH = '/guild';
export const STATUS_PATH = '/status';

/**
 * One community link by id. Throws on an unknown id, so a typo fails the build and the tests
 * instead of rendering a link to nowhere.
 *
 * @param {string} id A `COMMUNITY_LINKS` id.
 * @returns {{id: string, label: string, url: string, profile: boolean, summary: string}} The link.
 */
export function communityLink(id) {
    const link = COMMUNITY_LINKS.find((entry) => entry.id === id);
    if (!link) throw new Error(`Unknown community link: ${id}`);
    return link;
}

/** The official public profiles, as JSON-LD `sameAs` wants them: URLs only. */
export const SAME_AS = Object.freeze(
    COMMUNITY_LINKS.filter((link) => link.profile).map((link) => link.url),
);
