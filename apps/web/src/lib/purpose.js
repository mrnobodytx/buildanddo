// CGRF: SRS=SRS-BUILDANDDO-PURPOSE-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/purpose.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PURPOSE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     -
// EnumType:    Lib
// EnumEdges:   CONSUMED_BY apps/web/src/components/site/Hero.jsx;
//              CONSUMED_BY apps/web/src/components/site/Footer.jsx;
//              CONSUMED_BY apps/web/src/pages/HomePage.jsx;
//              VALIDATES apps/web/index.html
// Intent:      The one canonical statement of what BuildAndDo is. Every
//              surface that describes the product reads it from here, and the
//              purpose test checks the static index.html against it, so the
//              site cannot drift back into describing a different product.
// ───────────────────────────────────────────────────────────────

/**
 * Canonical purpose statement.
 *
 * BuildAndDo is an educational, collaborative platform: people learn by doing
 * real, verified work together with Citadel Nexus guilds and agents. It is not
 * a tool that sets up or runs a company on someone's behalf. Nothing here
 * claims a feature or a number that the product does not have.
 */
export const PURPOSE = Object.freeze({
    name: 'BuildAndDo',
    headline: 'Learn by doing real, verified work — together.',
    subhead:
        'An educational, collaborative platform where people take on real objectives '
        + 'alongside Citadel Nexus guilds and agents, and every step is recorded with '
        + 'the evidence behind it.',
    description:
        'BuildAndDo is an educational, collaborative platform. People learn by doing real, '
        + 'verified work together with Citadel Nexus guilds and agents: pick an objective, '
        + 'work it in bounded steps with a guild, and keep a receipt for what was actually '
        + 'verified. Nothing here is invented — a claim is only verified when evidence exists.',
    audience:
        'Learners, builders and collaborators who want to practise real work with real '
        + 'feedback — students, self-taught developers, researchers, and anyone joining a '
        + 'Citadel Nexus guild.',
    tagline: 'Learn by doing. Verify what you did. Do it together.',
});

/**
 * Document title for a page: "BuildAndDo — <page>" or the site headline.
 *
 * @param {string} [page] Page-specific suffix.
 * @returns {string} The <title> text.
 */
export function pageTitle(page) {
    return page ? `${PURPOSE.name} — ${page}` : `${PURPOSE.name} — ${PURPOSE.headline}`;
}
