// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/observability/TelemetryBoundary.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/runtime.js
// EnumType:    Widget
// EnumEdges:   PRODUCES datadog.rum.error; CONSUMES apps/web/src/lib/observability/runtime.js
// Intent:      Capture React render failures with their component stack, which
//              window-level error handlers cannot see, and keep the page
//              recoverable instead of blank.
// ───────────────────────────────────────────────────────────────

import React from 'react';

import { trackRenderError } from '@/lib/observability/runtime';

class TelemetryBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error, info) {
        trackRenderError(error, info);
    }

    render() {
        if (!this.state.failed) return this.props.children;

        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
                <p className="text-muted-foreground">
                    Something broke while rendering this page. The failure has been reported.
                </p>
                <button
                    type="button"
                    className="rounded-md border px-4 py-2 text-sm font-medium"
                    onClick={() => window.location.reload()}
                >
                    Reload
                </button>
            </div>
        );
    }
}

export default TelemetryBoundary;

export { TelemetryBoundary };
