// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/MotionToggle.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/motion/MotionSettings.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/components/motion/MotionSettings.jsx
// DAG Node:    none
// Intent:      Let visitors reach the same personal motion controls without signing in.
// ───────────────────────────────────────────────────────────────

import React, { lazy, Suspense, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
const MotionSettings = lazy(() => import('./MotionSettings'));

export default function MotionToggle() {
    const [open, setOpen] = useState(false);
    return <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><button type="button" aria-label="Motion settings" title="Motion settings"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-background text-foreground hover:bg-secondary">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </button></DialogTrigger>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto" data-dd-privacy="mask">
            <DialogHeader><DialogTitle>Personal display preferences</DialogTitle><DialogDescription>These choices apply on this device across the site.</DialogDescription></DialogHeader>
            {open && <Suspense fallback={<p role="status">Loading motion controls…</p>}><MotionSettings compact /></Suspense>}
        </DialogContent>
    </Dialog>;
}
