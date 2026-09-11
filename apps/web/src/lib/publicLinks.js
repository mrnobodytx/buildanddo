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
});

/**
 * Resolves the public URL for a live-source tile.
 *
 * The signals record wins when it carries one (`url`, `public_url`, an
 * `invite_url` for Discord, or a `repo` slug for GitHub); otherwise the tile
 * falls back to the same public surface the footer links to. Sources with no
 * public surface (Datadog, PostHog, Reddit verification, the Citadel rail)
 * return null and render without a link.
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
