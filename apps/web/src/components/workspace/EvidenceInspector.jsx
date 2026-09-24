// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/EvidenceInspector.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/lib/evidenceInspection.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/evidenceInspection.js
// Intent:      Make linked evidence and the exact reviewed observation inspectable from a durable workspace URL.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/site/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { downloadObservation, inspectEvidence, safeEvidenceUrl } from '@/lib/evidenceInspection';

export default function EvidenceInspector({ id, records, missions, workspace, loading, unavailable, onClose }) {
    const record = records.find((row) => row.id === id && row.workspace === workspace);
    const view = record && !loading && !unavailable ? inspectEvidence(record, missions, workspace) : null;
    return <Dialog open={Boolean(id)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="ph-no-capture max-h-[90dvh] overflow-y-auto" data-dd-privacy="mask">
        <DialogHeader><DialogTitle>Evidence inspection</DialogTitle><DialogDescription>Inspect the observation and the exact copy retained by a completed mission review.</DialogDescription></DialogHeader>
        {loading ? <p role="status">Loading evidence and review…</p> : unavailable || !view ? <p role="alert">This evidence or its review is unavailable in the current workspace. Close this view and refresh the lists.</p> : <div className="space-y-4 text-sm">
            <h3 className="font-semibold">{record.title || 'Recorded observation'}</h3><p className="whitespace-pre-wrap break-words">{record.content}</p>
            <dl><dt>Source</dt><dd className="break-words">{record.source || 'Not recorded'}</dd><dt>Recorded by</dt><dd>{record.owner}</dd><dt>Recorded at</dt><dd>{record.created}</dd></dl>
            {safeEvidenceUrl(record.url) && <a className="block underline" href={safeEvidenceUrl(record.url)} target="_blank" rel="noopener noreferrer">Open source</a>}
            {view.mission && <Link className="block underline" to={`/app/missions?mission=${encodeURIComponent(view.mission.id)}`}>Review mission: {view.mission.title}</Link>}
            <p role={view.integrity === 'changed_since_review' ? 'alert' : 'status'}>{view.integrity === 'matches_review' ? 'This record matches the saved review snapshot.' : view.integrity === 'changed_since_review'
                ? 'The current record differs from the reviewed snapshot. Inspect both before using this evidence.' : 'No frozen mission review was found for this record. A type label alone does not establish verification.'}</p>
            {view.review && <details><summary>Exact reviewed observation</summary><p>Reviewer: {view.review.reviewer || 'Unavailable'} · {view.review.at || 'Time unavailable'}</p>
                <pre className="overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(view.review.snapshot, null, 2)}</pre></details>}
            <Button size="sm" onClick={() => downloadObservation({ schema_version: 'buildanddo.evidence-inspection/v1', captured_at: new Date().toISOString(), ...view,
                evidence_state: 'recorded', independent_verification: 'not_conferred_by_export' }, `evidence-${record.id}.json`)}>Export observation and review</Button>
        </div>}
    </DialogContent></Dialog>;
}
