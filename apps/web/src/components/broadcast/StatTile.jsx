// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/StatTile.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/utils.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/utils.js
// DAG Node:    none
// Intent:      Show one headline number with its label, or say it was not measured instead of showing zero.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { cn } from '@/lib/utils';

/** @param {number} value @returns {string} 1,284 · 12.9K · 4.2M */
function compact(value) {
    const size = Math.abs(value);
    if (size >= 1e6) return `${(value / 1e6).toFixed(size >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
    if (size >= 1e4) return `${(value / 1e3).toFixed(size >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
    return value.toLocaleString();
}

/** @param {{label: string, value?: number|null, unit?: string, note?: string, className?: string}} props */
export default function StatTile({ label, value, unit, note, className }) {
    const measured = typeof value === 'number' && Number.isFinite(value);
    return <div className={cn('grid content-start gap-1 bg-card px-4 py-3', className)}>
        <p className="text-xs text-muted-foreground">{label}</p>
        {measured
            ? <p className="text-2xl font-semibold leading-tight tracking-tight">{compact(value)}{unit && <span className="text-sm font-medium text-muted-foreground"> {unit}</span>}</p>
            : <p className="font-evidence text-[11px] uppercase leading-8 tracking-wide text-muted-foreground">Unmeasured</p>}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>;
}
