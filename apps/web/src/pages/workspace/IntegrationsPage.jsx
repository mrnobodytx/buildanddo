// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/IntegrationsPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/workspace/IntegrationControls.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/workspace/IntegrationControls.jsx
// DAG Node:    none
// Intent:      Give workspace members one discoverable view of integration requests and observed service state.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import IntegrationControls from '@/components/workspace/IntegrationControls';

export default function IntegrationsPage() {
    return <div className="space-y-6"><PageHeader title="Sinks & extensions" description="Discord, Reddit, telemetry sinks and service extensions for the active workspace." />
        <IntegrationControls />
    </div>;
}
