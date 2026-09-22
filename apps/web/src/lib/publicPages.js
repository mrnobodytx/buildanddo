// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/publicPages.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
// EnumType:    ConfigDoc
// EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
// DAG Node:    none
// Intent:      Keep public navigation, canonical metadata and crawler output on the same route catalogue.
// ───────────────────────────────────────────────────────────────

// Measured 2026-09-20 from a fleet box (rig1 cannot measure TLS - its antivirus terminates and
// re-signs every connection): buildanddo.com resolves through Cloudflare and answers 200, while
// buildanddo.tech has NO DNS RECORD AT ALL. This constant feeds the canonical link, the Open
// Graph image and the JSON-LD WebSite.url in Seo.jsx, so production was telling search engines
// its canonical home was a host that does not exist and pointing every shared link's preview
// image at the same nowhere. sitemap.xml, robots.txt and llms.txt are all generated from this
// one value by tools/generate-seo.mjs, so it is the single point where that was fixable.
export const SITE_ORIGIN = 'https://buildanddo.com';
export const PUBLIC_PAGES = [
    {
        path: '/',
        label: 'Home',
        title: 'BuildAndDo — learn by doing, together',
        description:
            'Learn with people and AI, build something real, verify what happened and keep the evidence. A daily learning edition built from the sources you connect.',
        type: 'WebPage',
    },
    {
        path: '/hostinger-challenge',
        label: 'Challenge',
        title: 'BuildAndDo — Hostinger 21-Day Challenge',
        description:
            'See the focused business problem, verified mission story and Hostinger product roles behind the BuildAndDo challenge entry.',
        type: 'WebPage',
    },
    {
        path: '/platform',
        label: 'Platform',
        title: 'MetaFunction Fabric Platform | BuildAndDo',
        description:
            'Explore the governed execution flow, capability mesh and illustrative monitoring of the MetaFunction Fabric.',
        type: 'WebPage',
    },
    {
        path: '/practice',
        label: 'Practice',
        title: 'BuildAndDo — Practice library',
        description:
            'Community-audited methods for real objectives, with evidence, knowledge states and lessons from each attempt.',
        type: 'CollectionPage',
    },
    {
        path: '/roadmap',
        label: 'Roadmap',
        title: 'BuildAndDo — Public roadmap',
        description:
            'Follow the BuildAndDo plan, its current state and the evidence needed to call work complete.',
        type: 'CollectionPage',
    },
    {
        path: '/pricing',
        label: 'Pricing',
        title: 'Pricing & early access | BuildAndDo',
        description:
            'Discuss a managed paid pilot for one workspace and one approved operation, or explore early access and team rollouts.',
        type: 'WebPage',
    },
    {
        path: '/about',
        label: 'About',
        title: 'About & team | BuildAndDo',
        description:
            'Meet the people and principles behind BuildAndDo, a Citadel Nexus Inc. product built around accountable work.',
        type: 'AboutPage',
    },
    {
        path: '/classrooms',
        label: 'Classrooms',
        title: 'Classrooms & shared lessons | BuildAndDo',
        description: 'Learn together in workspace classrooms with host-led Field Manual lessons, attendance and saved discussion.',
        type: 'CollectionPage',
    },
    {
        path: '/docs',
        label: 'Docs',
        title: 'Documentation | BuildAndDo',
        description:
            'Get started with workspaces, signals, missions, workflows and the evidence ledger. Learn what each state means.',
        type: 'CollectionPage',
    },
    {
        path: '/blog',
        label: 'Blog',
        title: 'The BuildAndDo journal',
        description:
            'Field notes on learning by doing, bounded work and keeping a traceable record of what you built.',
        type: 'Blog',
    },
    {
        path: '/contact',
        label: 'Contact',
        title: 'Contact | BuildAndDo',
        description:
            'Request a scoped paid pilot, discuss commercial licensing with Citadel Nexus Inc., or ask a product question.',
        type: 'ContactPage',
    },
];

export const PUBLIC_NAV = PUBLIC_PAGES.filter((page) => page.path !== '/');

// Header grouping: product routes carry the primary weight; company/editorial routes
// (About, Blog, Contact) sit in a small secondary cluster. Footer and crawlers keep the flat list.
const SECONDARY_NAV_PATHS = new Set(['/about', '/blog', '/contact']);
export const PUBLIC_NAV_PRIMARY = PUBLIC_NAV.filter((page) => !SECONDARY_NAV_PATHS.has(page.path));
export const PUBLIC_NAV_SECONDARY = PUBLIC_NAV.filter((page) => SECONDARY_NAV_PATHS.has(page.path));
