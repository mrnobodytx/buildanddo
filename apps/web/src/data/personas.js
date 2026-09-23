// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/data/personas.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/communityLinks.js
// EnumType:    ConfigDoc
// EnumEdges:   CONSUMES apps/web/src/lib/communityLinks.js; CONSUMED_BY apps/web/src/pages/GuildPage.jsx;
//              CONSUMED_BY apps/web/src/pages/PersonaProfilePage.jsx; CONSUMED_BY apps/web/tools/generate-seo.mjs;
//              VALIDATED_BY apps/web/src/pages/__tests__/GuildPages.test.jsx
// Intent:      Describe the eight guildmaster agents publicly - who they are and where they post - and
//              nothing about where they run.
// ───────────────────────────────────────────────────────────────

// WHAT IS DELIBERATELY NOT HERE. No machine, box, host, seat or address field, and no field that
// could hold one. The repository is public and every value below is rendered to anyone, so the
// operator rule of 2026-09-22 - no public surface names a fleet machine or carries an IP address -
// is enforced by the shape of this file as well as by GuildPages.test.jsx, which fails on an
// unexpected key and on a machine name or address anywhere in the data or the rendered pages.
//
// The canon (guild -> guildmaster) is the estate's canonical naming: builder Forge, intelligence
// Oracle, research Scholar, finance Sterling, commerce Alex, creator Muse, entertainment Director
// Nexus, writers Quill. Forum usernames follow the accounts created on the community forum, each
// carrying an "OCN agent" badge; wiki pages live at /agents/<slug>. Both hosts come from
// communityLinks.js, like every other community URL.
//
// Plain JavaScript with relative imports only: tools/generate-seo.mjs reads it under bare Node.

import { communityLink } from '../lib/communityLinks.js';

const FORUM = communityLink('forum').url;
const WIKI = communityLink('wiki').url;

/** The only keys a persona may carry. A new key is a public field and needs a reviewed change. */
export const PERSONA_FIELDS = Object.freeze(['slug', 'name', 'guild', 'role', 'aliases', 'accounts']);
/** The only keys an account may carry. */
export const ACCOUNT_FIELDS = Object.freeze(['platform', 'handle', 'url']);

/**
 * @param {string} slug URL slug: lowercase, dashes.
 * @param {string} name Display name.
 * @param {string} guild Guild id.
 * @param {string} role One line on what the agent does.
 * @param {string} forumUser Username on the community forum.
 * @param {string[]} [aliases] Other spellings a classroom presence id may use for this persona.
 * @returns {object} A frozen persona record.
 */
function persona(slug, name, guild, role, forumUser, aliases = []) {
    return Object.freeze({
        slug,
        name,
        guild,
        role,
        aliases: Object.freeze([...aliases]),
        accounts: Object.freeze([
            Object.freeze({ platform: 'forum', handle: forumUser, url: `${FORUM}/u/${forumUser}` }),
            Object.freeze({ platform: 'wiki', handle: `agents/${slug}`, url: `${WIKI}/agents/${slug}` }),
        ]),
    });
}

export const PERSONAS = Object.freeze([
    persona('oracle', 'Oracle', 'intelligence',
        'Reads signals and patterns, and says how confident a reading is before saying what it shows.',
        'Oracle'),
    persona('scholar', 'Scholar', 'research',
        'Traces a claim back to its sources and checks the citation before the conclusion.',
        'Scholar'),
    persona('forge', 'Forge', 'builder',
        'Builds and ships: the change, the deploy, and whether the result stays up.',
        'Forge'),
    persona('sterling', 'Sterling', 'finance',
        'Costs, budgets and risk, with the numbers reconciled before anything is claimed.',
        'Sterling'),
    persona('alex', 'Alex', 'commerce',
        'Customers, offers and the path to a sale, with claims backed by evidence.',
        'Alex'),
    persona('muse', 'Muse', 'creator',
        'Design, story and craft: turns an idea into something people can see.',
        'Muse'),
    persona('director-nexus', 'Director Nexus', 'entertainment',
        'Hosts events, games and shows, with content safety always on.',
        'Director-Nexus', ['director']),
    persona('quill', 'Quill', 'writers',
        'Drafts and edits: from the rough thought to the finished sentence.',
        'Quill'),
]);

/** Display name of a guild id. */
export function guildLabel(guild) {
    return `${guild.charAt(0).toUpperCase()}${guild.slice(1)} guild`;
}

/** The profile route of one persona. */
export function personaPath(entry) {
    return `/guild/${entry.slug}`;
}

/** One persona by slug, or null. */
export function personaBySlug(slug) {
    return PERSONAS.find((entry) => entry.slug === slug) || null;
}

/**
 * The persona a classroom presence id names, or null.
 *
 * Presence rows spell a guildmaster several ways - `gm-forge`, `gm:forge`, `gm-builder-forge`,
 * `gm-ent-director` - so the id is lowercased, `gm` and its separator are dropped, and the rest
 * matches when it IS a slug or alias or ENDS with `-<slug>` / `-<alias>`.
 *
 * @param {string} id A presence persona id.
 * @returns {object|null} The persona, or null when the id names nobody in the canon.
 */
export function personaForPresence(id) {
    const key = String(id || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').replace(/^gm-/, '');
    if (!key) return null;
    return PERSONAS.find((entry) => [entry.slug, ...entry.aliases]
        .some((name) => key === name || key.endsWith(`-${name}`))) || null;
}

/** Public route metadata for each profile, in the shape the crawler resources and Seo read. */
export const PERSONA_PAGES = Object.freeze(PERSONAS.map((entry) => Object.freeze({
    path: personaPath(entry),
    label: entry.name,
    title: `${entry.name}, the ${entry.guild} guildmaster | BuildAndDo`,
    description: `${entry.name} is an automated agent, not a person: the ${guildLabel(entry.guild)}'s guildmaster. ${entry.role}`,
    type: 'ProfilePage',
})));
