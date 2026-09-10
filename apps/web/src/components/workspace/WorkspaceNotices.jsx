// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/WorkspaceNotices.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useDemoMode.js,
//              apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useDemoMode.js;
//              VALIDATES apps/web/src/pages/workspace
// Intent:      Give every workspace page one shared vocabulary for the three
//              states that are otherwise indistinguishable on screen: empty,
//              unreachable, and demonstration.
// ───────────────────────────────────────────────────────────────

import { AlertTriangle, FlaskConical, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import React from 'react';

import { Button, Card } from '@/components/site/ui';
import { useDemoMode } from '@/hooks/useDemoMode';
import { cn } from '@/lib/utils';

/**
 * Banner shown on every page for as long as demonstration mode is on.
 *
 * Not dismissible. A dismissible banner would let someone read a demonstration
 * record as their own data, which is the one outcome this whole mechanism
 * exists to prevent.
 *
 * @returns {React.ReactElement|null} The banner, or null when mode is off.
 */
export function DemoModeBanner() {
    const { demo, setDemo } = useDemoMode();
    if (!demo) return null;
    return (
        <Card className="border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber))]/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-warm" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground">
                            Demonstration data.
                        </span>{' '}
                        Nothing here belongs to your workspace and nothing you do
                        is saved. It ends when you close this tab.
                    </p>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setDemo(false)}
                >
                    Show real data
                </Button>
            </div>
        </Card>
    );
}

/**
 * Control that turns demonstration mode on. Rendered next to an empty state so
 * the offer only appears where there is nothing else to look at.
 *
 * @param {{className?: string}} props Styling.
 * @returns {React.ReactElement|null} The control, or null when mode is on.
 */
export function DemoModeToggle({ className }) {
    const { demo, setDemo } = useDemoMode();
    if (demo) return null;
    return (
        <Button
            variant="ghost"
            size="sm"
            className={className}
            onClick={() => setDemo(true)}
        >
            <FlaskConical className="h-4 w-4" />
            Show me an example
        </Button>
    );
}

/**
 * Notice for a read that failed. Distinct from an empty state on purpose:
 * "you have nothing" and "we cannot tell you what you have" are different
 * answers and must not share a rendering.
 *
 * @param {{message?: string, onRetry?: Function, className?: string}} props Notice content.
 * @returns {React.ReactElement} The notice.
 */
export function DegradedNotice({ message, onRetry, className }) {
    return (
        <Card
            className={cn(
                'border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber))]/5 p-5',
                className,
            )}
            role="status"
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-warm" />
                    <div className="text-sm leading-relaxed">
                        <p className="font-medium text-foreground">
                            This list could not be loaded
                        </p>
                        <p className="mt-1 text-muted-foreground">
                            {message ||
                                'The workspace backend did not answer. This is not the same as having no records — nothing below can be trusted as complete.'}
                        </p>
                    </div>
                </div>
                {onRetry && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        onClick={onRetry}
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try again
                    </Button>
                )}
            </div>
        </Card>
    );
}

/**
 * Inline notice for a rejected write.
 *
 * @param {{message?: string, onDismiss?: Function}} props Notice content.
 * @returns {React.ReactElement|null} The notice, or null when there is no error.
 */
export function WriteErrorNotice({ message, onDismiss }) {
    if (!message) return null;
    return (
        <div
            role="alert"
            className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{message}</span>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    className="shrink-0 text-xs font-semibold uppercase tracking-wider underline"
                >
                    Dismiss
                </button>
            )}
        </div>
    );
}

/**
 * Placeholder rows shown while a list loads. Sized like the content it
 * replaces so the page does not jump when records arrive.
 *
 * @param {{rows?: number, className?: string}} props Row count and styling.
 * @returns {React.ReactElement} The skeleton.
 */
export function ListSkeleton({ rows = 3, className }) {
    return (
        <div className={cn('space-y-3', className)} aria-hidden="true">
            {Array.from({ length: rows }).map((_, index) => (
                <div
                    key={index}
                    className="animate-pulse border border-border bg-card p-5"
                >
                    <div className="h-4 w-1/3 rounded bg-secondary" />
                    <div className="mt-3 h-3 w-2/3 rounded bg-secondary/70" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-secondary/50" />
                </div>
            ))}
        </div>
    );
}

/**
 * Accessible live region announcing that a list is loading.
 *
 * @param {{label?: string}} props Announcement text.
 * @returns {React.ReactElement} The indicator.
 */
export function LoadingRow({ label = 'Loading' }) {
    return (
        <p
            className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
        >
            <Loader2 className="h-4 w-4 animate-spin" />
            {label}
        </p>
    );
}
