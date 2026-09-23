// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/site/PublicPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        BITS-CODEGEN, C-ONE (route metadata for pages outside the catalogue)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/lib/publicPages.js
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/lib/publicPages.js
// DAG Node:    none
// Intent:      Give the new public pages a consistent broadsheet layout and metadata.
// ───────────────────────────────────────────────────────────────

import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import Seo from '@/components/Seo';
import ReadingProgress from '@/components/motion/ReadingProgress';
import { MotionReveal } from '@/components/motion/MotionPrimitives';
import { SectionLabel } from '@/components/site/ui';
import { PUBLIC_PAGES } from '@/lib/publicPages';

export default function PublicPage({ path, eyebrow, title, intro, children, structuredData, route }) {
    // A route outside PUBLIC_PAGES (a persona profile) supplies its own metadata as `route`.
    const page = PUBLIC_PAGES.find((entry) => entry.path === path) || route;
    return (
        <div className="min-h-screen bg-background text-foreground">
            <Seo
                title={page.title}
                description={page.description}
                path={path}
                route={route}
                structuredData={structuredData}
            />
            <Header />
            <main id="main-content" tabIndex={-1} className="public-content pt-14">
                <ReadingProgress className="mx-auto max-w-6xl px-4" />
                <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
                    <MotionReveal className="border-b-4 border-double border-foreground pb-8">
                        <SectionLabel>{eyebrow}</SectionLabel>
                        <h1 className="motion-heading mt-4 max-w-4xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
                            {title}
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                            {intro}
                        </p>
                    </MotionReveal>
                    <div className="mt-10 space-y-12">{children}</div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
