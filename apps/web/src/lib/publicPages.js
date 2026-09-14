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

export const SITE_ORIGIN = 'https://buildanddo.tech';
export const PUBLIC_PAGES = [
    {
        path: '/',
        label: 'Home',
        title: 'BuildAndDo — Your business, in evidence',
        description:
            'Notice what changed, approve a bounded mission, and verify the outcome. A business newspaper built from the sources you connect.',
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
            'Explore BuildAndDo early access and discuss a team rollout. Public subscription pricing has not been announced.',
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
            'Field notes on evidence, bounded work and running a business with a traceable record of decisions.',
        type: 'Blog',
    },
    {
        path: '/contact',
        label: 'Contact',
        title: 'Contact | BuildAndDo',
        description:
            'Ask a product question, report an issue or discuss commercial licensing with Citadel Nexus Inc.',
        type: 'ContactPage',
    },
];

export const PUBLIC_NAV = PUBLIC_PAGES.filter((page) => page.path !== '/');
