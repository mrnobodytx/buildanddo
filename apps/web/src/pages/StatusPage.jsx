// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/StatusPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/components/site/StatusPanels.jsx, apps/web/src/components/site/PublicPage.jsx
// EnumType:    Page
// EnumEdges:   CONSUMES apps/web/public/community-status.json; CONSUMES apps/web/public/platform-health.json;
//              VALIDATED_BY apps/web/src/pages/__tests__/StatusPage.test.jsx
// Intent:      Keep "is it up" on the site's own domain, and make every answer carry its age.
// ───────────────────────────────────────────────────────────────

// Before this page every status link left the domain for citadel-nexus.com/status, which reports
// the wider estate and says nothing about the forum, the wiki or the Discord this site sends people
// to. This page reads two files published beside it and nothing else: it measures nothing itself,
// and it says so when the files are missing or old.

import PublicPage from '@/components/site/PublicPage';
import { CommunityStatusPanel, PlatformHealthPanel } from '@/components/site/StatusPanels';
import { STATUS_PATH } from '@/lib/communityLinks';

export default function StatusPage() {
    return (
        <PublicPage
            path={STATUS_PATH}
            eyebrow="Service status"
            title="What is up, and how we know."
            intro="Each section is read from a file a probe wrote, with the time it was measured and its age. A reading older than its own window is shown as unmeasured, never as up."
        >
            <section aria-labelledby="status-community" className="border-t-2 border-foreground pt-5">
                <h2 id="status-community" className="font-display text-2xl font-semibold">
                    Community surfaces
                </h2>
                <p className="mb-4 mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    The places this site sends people: the forum, the wiki, Discord, Reddit, YouTube,
                    GitHub and the voice agent, as last measured by the community probe.
                </p>
                <CommunityStatusPanel />
            </section>
            <section aria-labelledby="status-platform" className="border-t-2 border-foreground pt-5">
                <h2 id="status-platform" className="font-display text-2xl font-semibold">
                    Platform
                </h2>
                <p className="mb-4 mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    The services this site is built on, from the platform assessment projected into
                    each build. It is a recorded observation with a date, not a live gauge.
                </p>
                <PlatformHealthPanel />
            </section>
        </PublicPage>
    );
}
