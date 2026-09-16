// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/suite/SuiteResult.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/lib/missionSuite.js, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/missionSuite.js; DEPENDS_ON apps/web/src/components/workspace/ControlPrimitives.jsx
// DAG Node:    none
// Intent:      Display scoped suite evidence, contradictions and review actions without promoting candidates or readiness to operational authority.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { controlInput, dateLabel } from '@/components/workspace/ControlPrimitives';
import { SUITE_STATES } from '@/lib/missionSuite';

/** @param {object} props Run and permitted mutations. @returns {React.ReactElement} Readable evidence and review. */
export default function SuiteResult({ record, disabled, onAction }) {
    const [note, setNote] = useState(''); const [error, setError] = useState('');
    useEffect(() => { setNote(''); setError(''); }, [record.id]);
    const result = record.result; const analysis = result?.analysis;
    return <Card className="min-w-0 space-y-4 break-words p-5 [overflow-wrap:anywhere]" aria-label="Suite run details">
        <h2 className="font-display text-xl">{record.suite === 'maritime' ? 'Maritime analysis' : 'Submission readiness'} · {SUITE_STATES[record.status]}</h2>
        <p className="text-sm text-muted-foreground">Requested {dateLabel(record.created)}. {record.processed_at ? `Processed ${dateLabel(record.processed_at)}.` : 'No processing result recorded.'}</p>
        {record.failure && <p role="status" className="text-sm">{record.failure === 'worker_unbound' ? 'The operator must connect the worker before this can run.' : `Recorded processing failure: ${record.failure}.`}</p>}
        {analysis && record.suite === 'maritime' && <div className="space-y-4">
            <p className="text-sm">{analysis.summary.observations} observations · {analysis.summary.entities} supplied vessel identities · {analysis.summary.candidates} candidates · 0 admitted cues</p>
            <ul className="space-y-3">{analysis.entities.map((entity) => <li key={entity.entity_id} className="space-y-1 border border-border p-3 text-sm">
                <h3 className="font-semibold break-words">{entity.entity_id}</h3><p>{entity.state_class} at {dateLabel(entity.valid_at)}</p>
                <p>{entity.position ? `${entity.position.latitude}, ${entity.position.longitude}` : 'Position unresolved because evidence conflicts.'}</p>
                <p>{entity.observation_ids.length} retained observations; {entity.contradicting_evidence.length} contradictory observations.</p>
            </li>)}</ul>
            <ul className="space-y-3">{analysis.candidates.map((cue) => <li key={cue.candidate_id} className="space-y-2 border border-border p-3 text-sm">
                <h3 className="font-semibold">{cue.cue_type.replaceAll('_', ' ')} · {cue.priority} · HOLD</h3>
                <p>{cue.recommended_collection}</p><p>Independent upstream groups: {cue.independent_source_groups.length}. Confidence is uncalibrated.</p>
                <p>Supporting observations: {cue.supporting_evidence.join(', ')}.</p><p>Contradictory observations: {cue.contradicting_evidence.join(', ') || 'None recorded'}.</p>
                <p className="text-muted-foreground">NNC admission and operational release context are not connected.</p>
            </li>)}</ul>
        </div>}
        {analysis && record.suite === 'submission' && <div className="space-y-3">
            <p role="status" className="font-semibold">{analysis.state === 'READY_FOR_HUMAN_REVIEW' ? 'Declared evidence is ready for human review' : 'Evidence gaps need review'}</p>
            <p className="text-sm">{analysis.summary.referenced} of {analysis.summary.requirements} requirement records reference verified evidence. No government submission has been made.</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{analysis.document_issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            <ul className="space-y-2">{analysis.checks.map((check) => <li key={check.id} className="border border-border p-3 text-sm"><h3 className="font-semibold">{check.id}</h3>
                {check.issues.length ? <ul className="list-disc space-y-1 pl-5">{check.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>References recorded; the official rule and supporting facts still need human review.</p>}
            </li>)}</ul>
        </div>}
        {result && <details><summary className="cursor-pointer py-2 text-sm">Reproducibility and limits</summary>
            <dl className="mt-2 grid gap-1 break-all text-xs"><dt>Input SHA-256</dt><dd>{result.input_sha256}</dd><dt>Source package SHA-256</dt><dd>{result.source_sha256}</dd><dt>Evidence root</dt><dd>{result.proof.root_digest}</dd></dl>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{analysis.limits.map((line) => <li key={line}>{line}</li>)}</ul>
            <p className="mt-2 text-sm">This is a worker-reported evidence fingerprint. Use the matching package to replay the full retained input. Release admission stays on hold.</p>
        </details>}
        {record.status === 'ready' && <form className="space-y-3" aria-label="Review suite evidence" onSubmit={(event) => {
            event.preventDefault(); setError(''); if (!note.trim()) { setError('Record what you reviewed.'); return; } onAction('attach', { note: note.trim() });
        }}><label className="block space-y-1 text-sm">Human review note<textarea className={controlInput} rows={3} required maxLength={1200} value={note} disabled={disabled} onChange={(e) => setNote(e.target.value)} /></label>
            <p className="text-sm text-muted-foreground">Attachment creates observed evidence. Verify the underlying result separately before using it to satisfy a requirement.</p>
            <Button type="submit" disabled={disabled}>Attach reviewed result to mission</Button>{error && <p role="alert">{error}</p>}
        </form>}
        <div className="flex flex-wrap gap-3">
            {['blocked', 'failed'].includes(record.status) && <Button type="button" disabled={disabled || record.attempt >= 3} variant="secondary" onClick={() => onAction('retry')}>Retry run</Button>}
            {['blocked', 'queued', 'processing', 'failed'].includes(record.status) && <Button type="button" disabled={disabled} variant="secondary" onClick={() => onAction('cancel')}>Cancel run</Button>}
            {record.evidence && <Link className="text-sm underline underline-offset-4" to="/app/evidence">Open Evidence Ledger</Link>}
        </div>
    </Card>;
}
