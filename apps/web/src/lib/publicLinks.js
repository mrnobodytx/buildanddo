// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/publicLinks.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     -
// EnumType:    Lib
// EnumEdges:   CONSUMED_BY apps/web/src/components/site/Footer.jsx;
//              CONSUMED_BY apps/web/src/components/roadmap/LiveSourcesPanel.jsx
// Intent:      One list of the public community surfaces so the footer and the
//              roadmap's live-source tiles point at the same URLs.
// ───────────────────────────────────────────────────────────────

export const PUBLIC_LINKS = Object.freeze({
    github: 'https://github.com/mrnobodytx/buildanddo',
    contributing: 'https://github.com/mrnobodytx/buildanddo/blob/main/CONTRIBUTING.md',
    wiki: 'https://wiki.buildanddo.com',
    forum: 'https://forum.buildanddo.com',
    discord: 'https://discord.gg/vTDZxmpHHC',
    reddit: 'https://www.reddit.com/r/BuildAndDo',
});

// Kept OUT of PUBLIC_LINKS deliberately. That map is the fallback table for
// `publicUrlForSource`, whose whole contract is "returns an https URL or null" —
// dropping a mailto: into it would let a signal-source id resolve to a non-https
// value and quietly break that guarantee. The contact address is not a signal
// source, so it gets its own export.
export const CONTACT_EMAIL = 'contact@buildanddo.com';

/**
 * Resolves the public URL for a live-source tile.
 *
 * The signals record wins when it carries one (`url`, `public_url`, an
 * `invite_url` for Discord, or a `repo` slug for GitHub); otherwise the tile
 * falls back to the same public surface the footer links to. Sources with no
 * public surface (Datadog, PostHog, the Citadel rail) return null and render
 * without a link.
 *
 * Reddit moved OUT of that no-surface list on 2026-09-13: the subreddit is now
 * a public surface the footer links to, so its tile resolves like any other.
 * Note the tile still MEASURES the devvit verification checks, not subreddit
 * activity — the link is where a reader goes, not what the metric counts.
 *
 * @param {string} sourceId Signal source id, e.g. "github".
 * @param {object} [record] The source's record from roadmap-status.json.
 * @returns {string|null} An https URL or null.
 */
export function publicUrlForSource(sourceId, record = {}) {
    const explicit = record?.url || record?.public_url || record?.invite_url;
    if (typeof explicit === 'string' && /^https:\/\//.test(explicit)) return explicit;
    if (sourceId === 'github' && typeof record?.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(record.repo)) {
        return `https://github.com/${record.repo}`;
    }
    return PUBLIC_LINKS[sourceId] || null;
}
