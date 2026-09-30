// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/pages/PracticePage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/components/site/PublicPage.jsx, apps/web/src/components/workspace/TutorialCatalog.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/site/PublicPage.jsx; CONSUMES apps/web/src/components/workspace/TutorialCatalog.jsx
// Intent:      Offer authored public learning without anonymously reading the global operational evidence fabric.
// ----------------------------------------------------------------


import PublicPage from '@/components/site/PublicPage';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';

export default function PracticePage() {
    return <PublicPage path="/practice" eyebrow="Practice library"
        title="Choose a lesson. Try one useful step."
        intro="Read an authored lesson, follow its practice checklist, and continue in your workspace. Sign in to save progress and use guided checks.">
        <TutorialCatalog />
    </PublicPage>;
}
