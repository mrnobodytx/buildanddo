// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/PageBoundary.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/runtime.js
// EnumType:    Widget
// EnumEdges:   PRODUCES datadog.rum.error;
//              CONSUMES apps/web/src/lib/observability/runtime.js;
//              EXTENDS apps/web/src/components/observability/TelemetryBoundary.jsx
// Intent:      Contain a page-level render failure to the outlet, so the
//              workspace shell and its navigation survive one broken page.
// ───────────────────────────────────────────────────────────────

import { AlertOctagon } from 'lucide-react';
import React from 'react';

import { Button, Card } from '@/components/site/ui';
import { trackRenderError } from '@/lib/observability/runtime';

/**
 * Error boundary scoped to a single workspace page.
 *
 * The app already has TelemetryBoundary at the root, but a root boundary
 * replaces the whole screen: one page that throws takes the navigation with it
 * and the operator's only move is a reload. This one keeps the shell, names the
 * page that failed, and offers a retry that remounts just that subtree.
 */
class PageBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { failed: false, attempt: 0 };
        this.retry = this.retry.bind(this);
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error, info) {
        trackRenderError(error, {
            ...info,
            componentStack: info && info.componentStack,
        });
    }

    retry() {
        // Bumping the key remounts the children, discarding whatever state
        // produced the throw. Without it, retry re-renders straight back into
        // the same failure.
        this.setState((prev) => ({ failed: false, attempt: prev.attempt + 1 }));
    }

    render() {
        const { failed, attempt } = this.state;
        const { children, name } = this.props;

        if (!failed) {
            return <React.Fragment key={attempt}>{children}</React.Fragment>;
        }

        return (
            <Card className="border-destructive/40 bg-destructive/5 p-6">
                <div className="flex items-start gap-3">
                    <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                        <p className="font-display text-base font-semibold tracking-tight">
                            {name ? `${name} could not be displayed` : 'This page could not be displayed'}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            The failure has been reported. Your records are not
                            affected — nothing was written. The rest of the
                            workspace still works.
                        </p>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="mt-4"
                            onClick={this.retry}
                        >
                            Try this page again
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }
}

export default PageBoundary;

export { PageBoundary };
