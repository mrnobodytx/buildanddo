// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/ControlPrimitives.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceControl.js, apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceControl.js; CONSUMES apps/web/src/components/site/ui.jsx
// DAG Node:    none
// Intent:      Make control loading, denied access, pending saves and paginated text readable with keyboard and mobile layouts.
// ───────────────────────────────────────────────────────────────

import { MotionEntrance } from '@/components/motion/MotionPrimitives';
import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';

export const controlInput = 'min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';
export const dateLabel = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';

/** Return keyboard focus to recovery when the original opener is disabled. */
export function focusPendingRetry(event) {
    const retry = document.querySelector('[data-workspace-retry]:not([disabled])');
    if (retry) { event.preventDefault(); retry.focus(); }
}

export function ControlState({ control, children }) {
    if (control.loading) return <p role="status" className="p-4 text-sm text-muted-foreground">Loading workspace controls…</p>;
    if (control.error || !control.data) return <Card className="space-y-3 p-5">
        <p role="alert" className="text-sm">{control.error || 'Workspace controls are unavailable.'}</p>
        {!control.demo && <Button variant="secondary" size="sm" onClick={control.refresh}>Retry loading</Button>}
    </Card>;
    return children;
}

export function ControlFeedback({ control }) {
    return <div aria-live="polite" className="space-y-2">
        {control.writeError && <p role="alert" className="text-sm text-destructive">{control.writeError}</p>}
        {control.uncertain && <Button type="button" data-workspace-retry="true" variant="secondary" size="sm" disabled={control.saving} onClick={control.retry}>Retry previous save</Button>}
        {control.writeError && !control.uncertain && <div className="space-y-2"><p className="text-xs text-muted-foreground">Reloading replaces open drafts with the saved records.</p>
            <Button type="button" variant="secondary" size="sm" disabled={control.saving} onClick={control.refresh}>Reload current records</Button></div>}
        {control.saved && <MotionEntrance as="p" category="community" role="status" className="text-sm text-success">{control.saved.action.startsWith('integration.') ? 'Request saved. Waiting for an operator receipt.' : 'Saved and recorded in workspace history.'}</MotionEntrance>}
    </div>;
}

export function PageControls({ page, hasMore, onPage, label = 'Results', disabled = false }) {
    return <nav aria-label={`${label} pages`} className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button type="button" variant="secondary" size="sm" disabled={disabled || !hasMore} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>;
}

export function FeatureDisabled({ feature, admin }) {
    return <Card className="space-y-3 p-5"><p className="text-sm">The workspace {feature} is disabled.</p>
        {admin ? <Link to="/app/admin" className="text-sm underline underline-offset-4">Enable it in Administration</Link> : <p className="text-sm text-muted-foreground">Ask your workspace administrator to enable it.</p>}
    </Card>;
}

export function PlainArticle({ text }) {
    return <div className="min-w-0 space-y-4 break-words text-sm leading-7">{String(text || '').split(/\n\s*\n/).map((paragraph, index) =>
        <p key={index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{paragraph}</p>)}</div>;
}
