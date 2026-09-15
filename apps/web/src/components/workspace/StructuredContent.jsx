// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/StructuredContent.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/businessPlanning.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/businessPlanning.js
// DAG Node:    none
// Intent:      Render authored draft structure with React text nodes so preview content cannot execute markup.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { draftBlocks } from '@/lib/businessPlanning';

/** @param {{body: string}} props Draft text. @returns {React.ReactElement} Safe formatted preview. */
export default function StructuredContent({ body }) {
    return <div className="min-w-0 space-y-4 break-words text-sm leading-7">
        {draftBlocks(body).map((block, index) => {
            if (block.kind === 'heading') return <h3 key={index} className="font-display text-lg font-semibold">{block.text}</h3>;
            if (block.kind === 'ordered') return <ol key={index} className="list-decimal space-y-2 pl-6">{block.items.map((item, i) => <li key={i}>{item}</li>)}</ol>;
            if (block.kind === 'unordered') return <ul key={index} className="list-disc space-y-2 pl-6">{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
            return <p key={index} className="whitespace-pre-wrap">{block.text}</p>;
        })}
    </div>;
}
