// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/KnowledgeContext.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/hooks/useWorkspaceKnowledge.js, apps/web/src/hooks/useFailureTelemetry.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceKnowledge.js; CONSUMES apps/web/src/hooks/useFailureTelemetry.js
// DAG Node:    none
// Intent:      Surface automatically assembled mission context with readable citations, explicit omissions and an intentional export.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { dateLabel } from '@/components/workspace/ControlPrimitives';
import { useWorkspaceKnowledge } from '@/hooks/useWorkspaceKnowledge';
import { useFailureTelemetry } from '@/hooks/useFailureTelemetry';

/**
 * THIS COMPONENT IS FED BY TWO DIFFERENT PAYLOADS AND ONLY ONE CARRIES A CONTEXT.
 * `workspace-knowledge.js` adds `context: assembleContext(...)` to what it returns; the
 * assistant's `workspace-assistant.js` returns the same graph WITHOUT that key. Both reach
 * `GraphBrowser`, which rendered this unconditionally, so `JSON.parse(undefined.text)` threw and
 * the page boundary replaced the whole of Knowledge & context with an error card. It fired on a
 * WORKING backend answering 200, which is why every route sweep called the page healthy.
 *
 * A missing context is a real state, not a fault: it means nothing was assembled. It renders as
 * absence. A context whose text will not parse IS a fault, and says so rather than showing
 * nothing, because a silent blank is the failure this page already had.
 *
 * Displays the exact cited packet offered for export.
 */
export function KnowledgeContextResults({ context, onSelect }) {
    // Read the packet, or say why it cannot be read; never throw. Parsed here rather than in a
    // module helper so everything before the first JSX is the component's whole state.
    let state = 'absent', packet = null;
    if (context && typeof context.text === 'string') {
        try {
            const parsed = JSON.parse(context.text);
            if (parsed && Array.isArray(parsed.sources)) { state = 'ok'; packet = parsed; } else state = 'unreadable';
        } catch { state = 'unreadable'; }
    }
    // Hooks run before any return. A packet that will not parse is reported as an invalid
    // response; a readable one with an unavailable source is reported as degraded.
    useFailureTelemetry(state === 'unreadable', 'control_state', 'invalid_response', 200);
    useFailureTelemetry(Boolean(packet?.source_coverage?.some((entry) => entry.state === 'unavailable')), 'control_state', 'degraded', 200);
    const download = () => {
        const url = URL.createObjectURL(new Blob([context.text], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'buildanddo-context.json';
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
    };
    if (state === 'absent')
        return <p role="status" className="text-sm text-muted-foreground">No context has been assembled for this view.</p>;
    if (state === 'unreadable')
        return <p role="alert" className="text-sm">The assembled context could not be read. Refresh to assemble it again; if it persists the packet is malformed and an operator should look at it.</p>;
    return <div className="min-w-0 space-y-3">
        {/* A packet can parse and still omit its budget counters; a number that is not there is
            reported as unknown rather than crashing the page it is one line of. */}
        <p className="text-sm text-muted-foreground">{packet.sources.length} cited sources{Number.isFinite(context.characters) && Number.isFinite(context.max_chars)
            ? ` · ${context.characters.toLocaleString()} / ${context.max_chars.toLocaleString()} character budget`
            : ' · character budget unknown'}</p>
        {context.truncated && <p role="status" className="text-sm">Context is partial: {context.omitted_sources} matching sources omitted. Excerpts or source reads may also be limited.</p>}
        {!packet.sources.length && <p className="text-sm">{context.empty_reason === 'budget_too_small' ? 'Increase the context size to include a cited source.' : 'No readable sources match this request. Try another question or add research and evidence.'}</p>}
        <ol aria-label="Context citations" className="max-h-96 space-y-4 overflow-y-auto pr-1">
            {packet.sources.map((source) => <li key={source.citation} className="space-y-1 border-l-2 border-primary pl-3">
                {onSelect ? <button type="button" onClick={() => onSelect(source.citation)} className="min-h-11 text-left font-medium underline underline-offset-4">{source.title}</button> : <p className="font-medium">{source.title}</p>}
                <p className="text-xs text-muted-foreground">Recorded state: {source.state} · Updated {dateLabel(source.provenance.updated_at)}</p>
                <p className="whitespace-pre-wrap break-words text-sm">{source.content}</p>
                {source.truncated && <p className="text-xs text-muted-foreground">Excerpt shortened; inspect the original source for full context.</p>}
                <p className="break-all font-evidence text-xs">{source.citation}</p>
            </li>)}
        </ol>
        {packet.sources.length > 0 && <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={download}>Download cited context</Button>
            <span className="text-xs text-muted-foreground">Contains workspace source excerpts.</span>
        </div>}
        <details><summary className="cursor-pointer text-sm">Inspect context packet</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{context.text}</pre>
        </details>
    </div>;
}

/** Assemble the selected mission's current context when its detail view opens. */
export default function MissionKnowledgeContext({ missionId }) {
    const control = useWorkspaceKnowledge({ mission: missionId, max_chars: 8000, max_sources: 8 });
    // Rendered context state is not another knowledge read attempt.
    useFailureTelemetry(!control.loading && !control.demo && Boolean(control.error && control.readFailure),
        'control_state', control.readFailure?.reason, control.readFailure?.status);
    return <Card className="space-y-3 p-4 ph-no-capture" data-dd-privacy="mask">
        <h3 className="font-display text-lg">Assembled mission context</h3>
        <p className="text-sm text-muted-foreground">Current mission, research and evidence, with relevant shared signals and published wiki pages.</p>
        {control.loading ? <p role="status" className="text-sm">Assembling context…</p> : control.data ?
            <KnowledgeContextResults context={control.data.context} /> : <p role="status" className="text-sm">{control.error}</p>}
        <div className="flex flex-wrap items-center gap-4">
            <Link to={`/app/knowledge?mission=${encodeURIComponent(missionId)}`} className="min-h-11 py-3 text-sm underline underline-offset-4">Explore this mission’s knowledge graph</Link>
            <Button type="button" variant="ghost" size="sm" disabled={control.loading} onClick={control.refresh}>Refresh context</Button>
        </div>
    </Card>;
}
