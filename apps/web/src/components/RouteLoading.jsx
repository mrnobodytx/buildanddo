// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/RouteLoading.jsx
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
// Intent:      Announce deferred route loading while preserving the existing spinner pattern.
// ───────────────────────────────────────────────────────────────

import { Loader2 } from 'lucide-react';

export default function RouteLoading({ fullPage = false }) {
    const Tag = fullPage ? 'main' : 'div';
    return (
        <Tag
            id={fullPage ? 'main-content' : undefined}
            tabIndex={fullPage ? -1 : undefined}
            data-route-loading="true"
            className={`flex items-center justify-center gap-3 text-muted-foreground ${fullPage ? 'min-h-screen' : 'min-h-48'}`}
        >
            <Loader2
                className="h-5 w-5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
            />
            <span role="status">Loading page…</span>
        </Tag>
    );
}
