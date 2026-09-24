// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/BusinessActionEditor.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/lib/businessExecution.js, apps/web/src/components/workspace/ConnectorBinding.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/lib/businessExecution.js; CONSUMES apps/web/src/components/workspace/ConnectorBinding.jsx
// DAG Node:    none
// Intent:      Let operators define reviewable ERP, source-capture and registered workflow effects without client-side endpoints.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { defaultBusinessAction } from '@/lib/businessExecution';
import ConnectorBinding from '@/components/workspace/ConnectorBinding';
const selectClass = 'w-full border border-border bg-background p-2 text-sm';
/** Edit only supported business effects; endpoints and credentials stay with registered bindings. */
export default function BusinessActionEditor({ value, onChange }) {
    const action = value || defaultBusinessAction(), p = action.parameters;
    const contacts = useWorkspaceRecords('erp_contacts'), objectives = useWorkspaceRecords('erp_objectives');
    const [json, setJson] = useState(JSON.stringify(p.input || {}, null, 2)), [error, setError] = useState('');
    const field = (name, next) => onChange({ ...action, parameters: { ...p, [name]: next } });
    const provider = (next) => { setError(''); setJson('{}'); onChange(next === 'erp' ? defaultBusinessAction() : { provider: next, binding: '', max_seconds: 30,
        parameters: next === 'firecrawl' ? { url: '' } : { operation: '', input: {} } }); };
    return <fieldset className="space-y-3 border border-border p-3"><legend className="px-1 text-sm font-semibold">Bounded action</legend>
        <label className="block text-sm">Action type<select className={selectClass} value={action.provider} onChange={(event) => provider(event.target.value)}>
            <option value="erp">Create an ERP task</option><option value="firecrawl">Capture a public source</option><option value="n8n">Run a registered n8n action</option></select></label>
        {action.provider === 'erp' ? <>
            <label className="block text-sm">Task title<Input value={p.title} maxLength={200} onChange={(event) => field('title', event.target.value)} /></label>
            <label className="block text-sm">Task details<Textarea value={p.description} maxLength={2000} onChange={(event) => field('description', event.target.value)} /></label>
            <label className="block text-sm">Objective<select className={selectClass} disabled={objectives.loading || objectives.degraded} value={p.objective} onChange={(event) => field('objective', event.target.value)}><option value="">No objective link</option>{objectives.records.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className="block text-sm">Contact<select className={selectClass} disabled={contacts.loading || contacts.degraded} value={p.contact} onChange={(event) => field('contact', event.target.value)}><option value="">No contact link</option>{contacts.records.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {(objectives.degraded || contacts.degraded) && <p role="alert">Related records are unavailable. Reload their desks before choosing a link.</p>}
            <label className="block text-sm">Priority<select className={selectClass} value={p.priority} onChange={(event) => field('priority', event.target.value)}>{['low', 'normal', 'high'].map((name) => <option key={name}>{name}</option>)}</select></label>
            <label className="block text-sm">Due date<Input type="date" value={p.due_date} onChange={(event) => field('due_date', event.target.value)} /></label>
        </> : <>
            <ConnectorBinding provider={action.provider} value={action.binding} onChange={(binding) => onChange({ ...action, binding })} />
            {action.provider === 'firecrawl' ? <label className="block text-sm">Public HTTPS source<Input type="url" value={p.url} maxLength={2048} onChange={(event) => field('url', event.target.value)} /></label> : <>
                <label className="block text-sm">Registered operation<Input value={p.operation} maxLength={64} onChange={(event) => field('operation', event.target.value)} /></label>
                <label className="block text-sm">Operation input (JSON)<Textarea value={json} maxLength={4000} onChange={(event) => { setJson(event.target.value); try {
                    const parsed = JSON.parse(event.target.value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object');
                    field('input', parsed); setError('');
                } catch { setError('Enter a JSON object before adding this step.'); field('input', null); } }} /></label>
                {error && <p role="alert">{error}</p>}
            </>}
            <p className="text-xs text-muted-foreground">The connector must have a registered worker and a current health receipt. An uncertain external result stops for reconciliation.</p>
        </>}
        <label className="block text-sm">Time limit (5–60 seconds)<Input type="number" min={5} max={60} value={action.max_seconds} onChange={(event) => onChange({ ...action, max_seconds: Number(event.target.value) })} /></label>
    </fieldset>;
}
