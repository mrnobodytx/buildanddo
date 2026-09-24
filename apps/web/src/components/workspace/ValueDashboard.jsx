// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/ValueDashboard.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/workspaceValue.js, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/workspaceValue.js; CONSUMES apps/web/src/components/workspace/ControlPrimitives.jsx
// Intent:      Translate one scoped evidence projection into owner, operator and reviewer questions with drill-downs and honest unknowns.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { dateLabel } from '@/components/workspace/ControlPrimitives';

const labels = { owner: 'Owner', operator: 'Operator', reviewer: 'Reviewer' };
const words = (value) => value.replaceAll('_', ' ').toLowerCase();

function OutcomeLineage({ outcome }) {
    return <details className="min-w-0 rounded-md border border-border p-3">
        <summary className="cursor-pointer break-words font-semibold">{outcome.title}</summary>
        <dl className="mt-3 grid gap-2 text-sm">
            <div><dt className="font-semibold">Recorded result</dt><dd>{words(outcome.state)} · Mission {words(outcome.mission_state)}</dd></div>
            <div><dt className="font-semibold">Source</dt><dd className="break-all">missions/{outcome.id}</dd></div>
            <div><dt className="font-semibold">Owner</dt><dd>{outcome.owner || 'Unknown'}</dd></div>
            <div><dt className="font-semibold">Review</dt><dd>{outcome.reviewer || 'Not recorded'} · {dateLabel(outcome.reviewed_at)}</dd>
                <dd>{outcome.independent ? 'Independent review enforced by the mission policy.' : 'Independent review not established.'}</dd></div>
            <div><dt className="font-semibold">Required authority</dt><dd>{outcome.required_authority || 'Unknown'} · Current grant and ceiling unmeasured</dd></div>
            <div><dt className="font-semibold">Semantic identity</dt><dd>{outcome.canonical_identity || 'Unresolved; link this record through its canonical owner.'}</dd></div>
        </dl>
        <h4 className="mt-4 font-semibold">Evidence</h4>
        {!outcome.evidence.length && <p className="text-sm">No complete readable review evidence is available.</p>}
        <ul className="mt-2 space-y-2 text-sm">{outcome.evidence.map((row) => <li key={row.id}>
            <p className="break-all">{row.source_ref}</p>
            <p>Author: {row.owner || 'Unknown'} · {dateLabel(row.observed_at)}</p>
        </li>)}</ul>
        <h4 className="mt-4 font-semibold">Actions and provider observations</h4>
        {outcome.actions.state === 'unavailable' && <p className="text-sm">Action history is unavailable. No execution or release is inferred.</p>}
        {outcome.actions.state === 'available' && !outcome.actions.items.length && <p className="text-sm">No actions were recorded for this mission.</p>}
        {outcome.actions.has_more && <p className="text-sm">Showing the first 20 actions. Open the mission for its complete bounded export.</p>}
        <ul className="mt-2 space-y-3 text-sm">{outcome.actions.items.map((row) => <li key={row.id} className="min-w-0 border-l-2 border-border pl-3">
            <p>{row.provider} · {words(row.status)} · {words(row.state)}</p>
            <p className="break-all">Workflow run: {row.run || 'Not recorded'} · Evidence: {row.evidence || 'Not recorded'}</p>
            <p>Observed {dateLabel(row.observed_at)}</p>
            <p className="break-all">Receipt: {row.receipt_ref}</p>
            <p className="break-all">Result SHA-256: {row.result_sha256 || 'Unmeasured'}</p>
            <p className="break-all">Declared release: {row.release ? row.release.candidate_sha + ' · ' + row.release.environment : 'Unmeasured'}</p>
            <p className="text-muted-foreground">Provider success does not establish independent review, deployment verification or exercised rollback.</p>
        </li>)}</ul>
        <Link to={outcome.href} className="mt-4 inline-block text-sm underline underline-offset-4">Open mission, evidence and replay export</Link>
    </details>;
}

/** Render different questions over the same immutable value facts. */
export default function ValueDashboard({ model, operator }) {
    const [lens, setLens] = useState('owner');
    return <section aria-label="Business value" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h2 className="font-headline text-3xl">What this work returns</h2>
                <p className="mt-1 text-sm text-muted-foreground">{model.period.label} · Observed {dateLabel(model.observed_at)} · {words(model.freshness)}</p>
            </div>
            <div role="group" aria-label="Value view" className="flex flex-wrap gap-2">
                {Object.entries(labels).map(([key, title]) => <Button key={key} type="button"
                    variant={lens === key ? 'default' : 'secondary'} aria-pressed={lens === key} onClick={() => setLens(key)}>{title}</Button>)}
            </div>
        </div>
        <p className="text-sm text-muted-foreground">These cards use the same readable workspace sample. Expand a card to inspect its evidence or missing measurement.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {model.metrics.map((metric) => <Card key={metric.id} className="min-w-0 p-4">
                <details>
                    <summary className="cursor-pointer space-y-3">
                        <span className="block text-sm font-semibold">{metric.title}</span>
                        <span className="block break-words font-headline text-2xl">{metric.display}</span>
                        <span className="block text-xs text-muted-foreground">{metric.id === 'verified' && metric.independent !== null
                            ? metric.independent + ' independently reviewed in this sample' : metric.benefit}</span>
                    </summary>
                    <div className="mt-4 space-y-3 text-sm">
                        <p>Measurement: {words(metric.state)}</p>
                        {metric.missing.map((gap) => <p key={gap}>{gap}</p>)}
                        {metric.id === 'verified' && <p>Count distinct missions reviewed this month with four passing observations and retained evidence that is still readable and unchanged. This is a record of the mission policy decision.</p>}
                        {metric.outcome_ids.map((id) => <OutcomeLineage key={id} outcome={model.outcomes.find((row) => row.id === id)} />)}
                    </div>
                </details>
            </Card>)}
        </div>
        <p className="text-xs text-muted-foreground">Coverage: {model.coverage === 'PARTIAL' ? 'partial visible sample' : 'visible records on this page'}.
            Counts describe this sample; they do not measure all business activity or ecosystem coverage.</p>

        {lens === 'owner' && <Card className="space-y-3 p-5" aria-label="Owner view">
            <h3 className="font-headline text-xl">What needs attention</h3>
            {model.next_action ? <>
                <p className="break-words font-semibold">{model.next_action.title}</p>
                <p className="text-sm">{model.next_action.reason}</p>
                <Link to={model.next_action.href} className="inline-block text-sm underline">Review the next recorded action</Link>
            </> : <p className="text-sm">No next action is supported by this sample. Check coverage before concluding that nothing needs attention.</p>}
            <p className="text-sm text-muted-foreground">Measured value, BuildAndDo cost and return: not yet measured.</p>
        </Card>}
        {lens === 'operator' && <Card className="space-y-3 p-5" aria-label="Operator view">
            <h3 className="font-headline text-xl">Work and blockers</h3>
            <p className="text-sm">{operator.active_missions.length} active missions and {operator.human_decisions.length} recorded decisions in this sample.</p>
            <ul className="space-y-2 text-sm">{operator.work_queue.slice(0, 5).map((row) => <li key={row.id}>
                <Link to={row.href} className="underline">{row.title}</Link><p>{row.reason}</p>
            </li>)}</ul>
            <p className="text-sm text-muted-foreground">Resolve the recorded blocker, collect evidence, then use the existing review and approval path.</p>
        </Card>}
        {lens === 'reviewer' && <Card className="space-y-3 p-5" aria-label="Reviewer view">
            <h3 className="font-headline text-xl">Trace each outcome</h3>
            <p className="text-sm">Mission → action → evidence → reviewer → provider receipt → declared release.
                Unresolved semantic identities stay explicit.</p>
            {!model.outcomes.length && <p className="text-sm">No readable mission lineage appears in this sample.</p>}
            {model.outcomes.map((outcome) => <OutcomeLineage key={outcome.id} outcome={outcome} />)}
        </Card>}
        <details className="rounded-md border border-border p-4">
            <summary className="cursor-pointer font-semibold">Progression and unmeasured value</summary>
            <p className="mt-3 text-sm">Declared plans, provider observations and reviewed outcomes remain separate.
                The next development step follows missing evidence; this view cannot raise an authority level.</p>
            <ul className="mt-3 space-y-2 text-sm">{model.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </details>
    </section>;
}
