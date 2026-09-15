// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/SkipNavigation.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/App.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/App.jsx
// DAG Node:    none
// Intent:      Give keyboard users a direct path past public and workspace navigation.
// ───────────────────────────────────────────────────────────────

export default function SkipNavigation() {
    return (
        <a
            href="#main-content"
            className="skip-navigation"
            onClick={() => document.getElementById('main-content')?.focus()}
        >
            Skip to main content
        </a>
    );
}
