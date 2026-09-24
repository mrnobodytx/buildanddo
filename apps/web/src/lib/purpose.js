// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/purpose.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PURPOSE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-PURPOSE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     none
// EnumType:    ConfigDoc
// EnumEdges:   CONSUMED_BY apps/web/src/pages/AboutPage.jsx; CONSUMED_BY apps/web/src/components/site/Footer.jsx;
//              CONSUMED_BY apps/web/src/components/site/Faq.jsx; CONSUMED_BY apps/web/src/components/site/Hero.jsx;
//              CONSUMED_BY apps/web/src/components/Seo.jsx; CONSUMED_BY apps/web/tools/generate-seo.mjs;
//              VALIDATED_BY apps/web/src/lib/__tests__/purpose.test.js
// Intent:      Say what BuildAndDo is exactly once, so every page that describes it says the same thing.
// ───────────────────────────────────────────────────────────────

// WHY ONE FILE. The operator decided on 2026-09-11 that BuildAndDo is an educational, collaborative
// platform, not small-business software. On 2026-09-23 the FAQ, the About intro, the footer and the
// early-access form still called it small-business software, and Buddi, the voice agent, repeated that
// pitch word for word in a live check. src/lib/__tests__/purpose.test.js fails if a retired phrase comes
// back to a public page.
//
// This module is plain JavaScript with no imports, because tools/generate-seo.mjs reads it under bare
// Node at build time, where the "@" alias does not exist.

export const PURPOSE = Object.freeze({
    /** The canonical line: the sign-in page and the share image say it this way. */
    line: 'Learn by doing. Build something real. Together.',
    /** What BuildAndDo is, in one sentence. The app manifest carries the same sentence. */
    summary:
        'BuildAndDo is a learning platform for building real things together: bring a question or a project, '
        + 'work through it with people and AI, verify what happened, and keep the evidence.',
    /** What the share image shows, for screen readers and link previews. */
    shareImageAlt: 'BuildAndDo — learn by doing, together',
});

/**
 * Phrases from the retired small-business framing. No public page may say them again, and neither may the
 * Hostinger challenge entry or its judge bundle (reframed on the operator's direction, 2026-09-23). Matched
 * case-insensitively.
 */
export const RETIRED_PHRASES = Object.freeze([
    'software for small-business owners',
    'helps small-business owners',
    'primarily small-business owners',
    'first group of small-business owners',
    'people who run businesses',
    'small-business operating help',
    'your business, in evidence',
    'first-time business owner',
    'set up your business next',
    'repetitive task would you like',
    'watches the important parts of a small business',
    'small business owners and operators',
    'operational problem for small-business owners',
    'one business problem',
    'one real business problem',
    'try a business challenge',
    'real business challenge',
    'observed business problem',
    'focused business problem',
]);
