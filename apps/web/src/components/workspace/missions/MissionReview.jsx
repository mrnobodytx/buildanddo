// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/missions/MissionReview.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/web/src/lib/missionLearning.js
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/missionLearning.js
// DAG Node:     none
// Intent:       Record TEVV observations and mission-scoped evidence with explicit review, retry handling and honest failure outcomes.
// ───────────────────────────────────────────────────────────────

import React, { useId, useRef, useState } from 'react';
import { Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    TEVV,
    emptyReview,
    missionEvidence,
    planIssues,
    reviewIssues,
} from '@/lib/missionLearning';

/** Record observed TEVV outcomes and real evidence before changing the mission outcome. */
export default function MissionReview({
    mission,
    evidence,
    evidenceLoading,
    evidenceDegraded,
    onRefreshEvidence,
    onSave,
    onEvidence,
    disabled = false,
}) {
    const uid = useId();
    const [review, setReview] = useState(() => ({ ...emptyReview(), ...mission.mission_review }));
    const [progress, setProgress] = useState(mission.progress ?? 0);
    const [attested, setAttested] = useState(false);
    const [receipt, setReceipt] = useState({ title: '', source: '', content: '' });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const pending = useRef(false);
    const terminal = ['verified', 'failed'].includes(mission.status);
    const locked = disabled || saving || terminal;
    const records = missionEvidence(mission, evidence);
    const issues = reviewIssues(mission, review, evidence);
    const approvedPlan =
        mission.mission_approved_by &&
        mission.mission_approved_at &&
        planIssues(mission.mission_plan).length === 0;
    const setItem = (id, field, value) => {
        setAttested(false);
        setReview((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
    };
    const persist = async (status) => {
        if (pending.current || locked) return;
        if (
            status === 'verified' &&
            (!approvedPlan || !attested || issues.length || evidenceLoading || evidenceDegraded)
        ) {
            setError('Review all four outcomes and their evidence before verifying.');
            return;
        }
        if (status === 'failed' && !review.reflection.trim()) {
            setError('Record the failure and what to try next in the reflection.');
            return;
        }
        if (
            progress === '' ||
            !Number.isFinite(Number(progress)) ||
            Number(progress) < 0 ||
            Number(progress) > 100
        ) {
            setError('Use a progress estimate between 0 and 100.');
            return;
        }
        pending.current = true;
        setSaving(true);
        setMessage('');
        setError('');
        try {
            const result = await onSave({
                mission_review: review,
                progress: Number(progress),
                ...(status ? { status } : {}),
            });
            if (result.ok)
                setMessage(
                    status === 'verified'
                        ? 'Verification recorded against the linked evidence.'
                        : status === 'failed'
                          ? 'Failed outcome recorded. The reflection preserves what you learned.'
                          : 'Review saved. Mission status has not changed.',
                );
            else
                setError(
                    result.error || 'Could not save the review. Your observations are still here.',
                );
        } catch {
            setError('Could not save the review. Your observations are still here.');
        } finally {
            pending.current = false;
            setSaving(false);
        }
    };
    const addEvidence = async (event) => {
        event.preventDefault();
        if (pending.current || locked) return;
        if (!receipt.source.trim() || !receipt.content.trim()) {
            setError('Record a source and the actual observation.');
            return;
        }
        pending.current = true;
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const result = await onEvidence({
                title: receipt.title.trim(),
                source: receipt.source.trim(),
                content: receipt.content.trim(),
                type: 'observed',
                mission: mission.id,
            });
            if (result.ok) {
                setReceipt({ title: '', source: '', content: '' });
                setMessage('Evidence saved. Select it for the checks it supports.');
            } else
                setError(
                    result.error || 'Could not save the evidence. Your observation is still here.',
                );
        } catch {
            setError('Could not save the evidence. Your observation is still here.');
        } finally {
            pending.current = false;
            setSaving(false);
        }
    };
    return (
        <section className="space-y-5" aria-labelledby={`${uid}-review-title`}>
            <h3 id={`${uid}-review-title`} className="font-display text-xl font-semibold">
                TEVV review
            </h3>
            <p className="text-sm text-muted-foreground">
                Report what happened, including failed checks. Each passing claim needs a
                source-backed evidence record from this mission. One record can support several
                checks when it contains the relevant observations.
            </p>
            {terminal && (
                <p className="border border-border p-3 text-sm">
                    This outcome is final. Start a new mission for another attempt. Evidence
                    references remain inspectable records, not signed or immutable proof.
                </p>
            )}
            {evidenceDegraded ? (
                <div role="alert" className="space-y-2 text-sm">
                    <p>Evidence is unavailable. Verification is disabled until it can be read.</p>
                    <Button type="button" size="sm" variant="secondary" onClick={onRefreshEvidence}>
                        Retry evidence
                    </Button>
                </div>
            ) : evidenceLoading ? (
                <p role="status" className="text-sm">
                    Loading mission evidence…
                </p>
            ) : records.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No source-backed evidence is linked yet. Add the actual observation below.
                </p>
            ) : null}
            {!terminal && (
                <details className="border border-border p-4">
                    <summary className="min-h-8 cursor-pointer font-semibold">
                        Add evidence to this mission
                    </summary>
                    <form
                        onSubmit={addEvidence}
                        className="mt-4 space-y-3"
                        aria-label="Mission evidence"
                    >
                        <div className="grid gap-2">
                            <Label htmlFor={`${uid}-e-title`}>Evidence title (optional)</Label>
                            <Input
                                id={`${uid}-e-title`}
                                value={receipt.title}
                                maxLength={200}
                                disabled={locked}
                                onChange={(e) =>
                                    setReceipt((current) => ({ ...current, title: e.target.value }))
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor={`${uid}-e-source`}>Evidence source</Label>
                            <Input
                                id={`${uid}-e-source`}
                                value={receipt.source}
                                maxLength={160}
                                disabled={locked}
                                onChange={(e) =>
                                    setReceipt((current) => ({
                                        ...current,
                                        source: e.target.value,
                                    }))
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor={`${uid}-e-content`}>Actual observation</Label>
                            <Textarea
                                id={`${uid}-e-content`}
                                value={receipt.content}
                                maxLength={2000}
                                rows={4}
                                disabled={locked}
                                onChange={(e) =>
                                    setReceipt((current) => ({
                                        ...current,
                                        content: e.target.value,
                                    }))
                                }
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Include the procedure, observed result and limitations. Use permitted
                            data and omit credentials or personal information.
                        </p>
                        <Button type="submit" size="sm" disabled={locked}>
                            {saving ? 'Saving…' : 'Save evidence'}
                        </Button>
                    </form>
                </details>
            )}
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    persist();
                }}
                className="space-y-5"
                aria-label="TEVV outcomes"
                data-assistant-authority="human"
                aria-busy={saving}
            >
                {TEVV.map((step) => (
                    <fieldset
                        key={step.id}
                        disabled={locked}
                        className="space-y-3 border border-border p-4"
                    >
                        <legend className="px-1 font-semibold">{step.label}</legend>
                        <p className="text-sm">{step.question}</p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                            <strong>Saved method:</strong>{' '}
                            {mission.mission_plan?.[step.id] ||
                                'No method recorded in this legacy mission.'}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor={`${uid}-${step.id}-outcome`}>
                                    {step.label} outcome
                                </Label>
                                <select
                                    id={`${uid}-${step.id}-outcome`}
                                    value={review[step.id].outcome}
                                    onChange={(e) => setItem(step.id, 'outcome', e.target.value)}
                                    className="min-h-11 min-w-0 border border-input bg-background p-2 text-sm"
                                >
                                    <option value="not_run">Not run</option>
                                    <option value="pass">Pass — observed</option>
                                    <option value="fail">Fail — observed</option>
                                </select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor={`${uid}-${step.id}-evidence`}>
                                    {step.label} evidence
                                </Label>
                                <select
                                    id={`${uid}-${step.id}-evidence`}
                                    value={review[step.id].evidence}
                                    onChange={(e) => setItem(step.id, 'evidence', e.target.value)}
                                    disabled={locked || evidenceLoading || evidenceDegraded}
                                    className="min-h-11 min-w-0 w-full border border-input bg-background p-2 text-sm"
                                >
                                    <option value="">Choose evidence</option>
                                    {records.map((record) => (
                                        <option key={record.id} value={record.id}>
                                            {record.title || record.source} · {record.id}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor={`${uid}-${step.id}-observation`}>
                                {step.label} observation
                            </Label>
                            <Textarea
                                id={`${uid}-${step.id}-observation`}
                                value={review[step.id].observation}
                                maxLength={1200}
                                rows={3}
                                onChange={(e) => setItem(step.id, 'observation', e.target.value)}
                            />
                        </div>
                        {review[step.id].evidence && (
                            <details>
                                <summary className="min-h-8 cursor-pointer text-sm">
                                    Inspect selected evidence
                                </summary>
                                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                                    {records.find(
                                        (record) => record.id === review[step.id].evidence,
                                    )?.content ||
                                        'This reference is missing or no longer readable. It cannot support a new verification.'}
                                </p>
                            </details>
                        )}
                    </fieldset>
                ))}
                <div className="grid gap-2">
                    <Label htmlFor={`${uid}-reflection`}>What you learned and the next step</Label>
                    <Textarea
                        id={`${uid}-reflection`}
                        maxLength={1200}
                        rows={3}
                        value={review.reflection}
                        disabled={locked}
                        onChange={(e) => {
                            setAttested(false);
                            setReview((current) => ({ ...current, reflection: e.target.value }));
                        }}
                    />
                </div>
                <div className="grid max-w-xs gap-2">
                    <Label htmlFor={`${uid}-progress`}>Self-reported work progress (%)</Label>
                    <Input
                        id={`${uid}-progress`}
                        type="number"
                        min={0}
                        max={100}
                        value={terminal ? (mission.progress ?? 0) : progress}
                        disabled={locked}
                        onChange={(e) => setProgress(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        An estimate; it is separate from verification and learning points.
                    </p>
                </div>
                {!terminal && (
                    <>
                        <label className="flex min-h-11 items-start gap-3 border border-border p-3 text-sm">
                            <input
                                type="checkbox"
                                checked={attested}
                                disabled={
                                    locked ||
                                    mission.status !== 'running' ||
                                    !approvedPlan ||
                                    issues.length > 0 ||
                                    evidenceLoading ||
                                    evidenceDegraded
                                }
                                onChange={(e) => setAttested(e.target.checked)}
                                className="mt-1"
                            />
                            <span>
                                I reviewed the linked evidence and all four outcomes meet the saved
                                plan.
                            </span>
                        </label>
                        {issues.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Verification needs: {issues.join('; ')}.
                            </p>
                        )}
                        {!terminal && !approvedPlan && (
                            <p className="text-sm text-muted-foreground">
                                Pause this legacy mission and revise it as a proposal to record the
                                plan and approval before verification.
                            </p>
                        )}
                        {mission.status === 'needs_attention' && (
                            <p className="text-sm text-muted-foreground">
                                Resolve the issue and record work resumed before verifying, or
                                record a failed outcome.
                            </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button type="submit" size="sm" variant="secondary" disabled={locked}>
                                {saving ? 'Saving…' : 'Save review'}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => persist('verified')}
                                disabled={
                                    locked ||
                                    mission.status !== 'running' ||
                                    !approvedPlan ||
                                    !attested ||
                                    issues.length > 0 ||
                                    evidenceLoading ||
                                    evidenceDegraded
                                }
                            >
                                Verify with evidence
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={locked}
                                onClick={() => persist('failed')}
                            >
                                Record failed outcome
                            </Button>
                        </div>
                    </>
                )}
            </form>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {message && (
                <p role="status" className="text-sm">
                    {message}
                </p>
            )}
            {Array.isArray(mission.mission_review?.evidence_snapshot) && <section className="space-y-2" aria-label="Evidence captured at verification">
                <h3 className="font-display text-lg">Evidence captured at verification</h3>
                <p className="text-xs text-muted-foreground">These are the exact observations the saved review evaluated.</p>
                {mission.mission_review.evidence_snapshot.map((item) => <details key={item.id} className="border border-border p-3">
                    <summary className="cursor-pointer text-sm">{item.title || item.id} · {item.source}</summary>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.content}</p>
                    <p className="mt-2 text-xs">Recorded version: {item.updated || item.created || 'Date unavailable'}</p>
                </details>)}
            </section>}
            {mission.mission_reviewed_at && (
                <p className="text-xs text-muted-foreground">
                    Review saved at {mission.mission_reviewed_at}. Reviewer account:{' '}
                    {mission.mission_reviewed_by}.
                </p>
            )}
        </section>
    );
}
