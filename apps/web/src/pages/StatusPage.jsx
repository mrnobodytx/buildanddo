// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/StatusPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/components/site/StatusPanels.jsx, apps/web/src/components/site/PublicPage.jsx
// EnumType:    Page
// EnumEdges:   CONSUMES apps/web/public/community-status.json;
//              VALIDATED_BY apps/web/src/pages/__tests__/StatusPage.test.jsx
// Intent:      Keep "is it up" on the site's own domain, and make every answer carry its age.
// ───────────────────────────────────────────────────────────────

// Before this page every status link left the domain for citadel-nexus.com/status, which reports
// the wider estate and says nothing about the forum, the wiki or the Discord this site sends people
// to. This page reads the community reachability publication: it measures nothing itself,
// and it says so when the files are missing or old.

import PublicPage from '@/components/site/PublicPage';
import { CommunityStatusPanel } from '@/components/site/StatusPanels';
import { STATUS_PATH } from '@/lib/communityLinks';

export default function StatusPage() {
    return (
        <PublicPage
            path={STATUS_PATH}
            eyebrow="Service status"
            title="What is up, and how we know."
            intro="Public community links carry the time they were checked. Critical system observations are restricted to authorized operators."
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
        </PublicPage>
    );
}
