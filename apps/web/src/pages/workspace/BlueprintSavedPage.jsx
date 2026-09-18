// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/BlueprintSavedPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/web/src/lib/blueprints.js, apps/web/src/contexts/WorkspaceContext.jsx, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/blueprints.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx; CONSUMES apps/web/src/components/workspace/ControlPrimitives.jsx
// DAG Node:    none
// Intent:      Let workspace members review PDF requirements and unknown design decisions before exporting a proposed mission or challenge.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { PageControls, PlainArticle, controlInput, dateLabel } from '@/components/workspace/ControlPrimitives';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { createBlueprintClient, blueprintDefinition, blueprintExtraction } from '@/lib/blueprints';
import { RESEARCH_STATES } from '@/lib/missionResearch';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';

const linkClass = 'text-sm underline underline-offset-4';
const displayScore = (value) => value === null || value === undefined ? 'Needs review' : `${value}/10`;

function Assessment({ evaluation }) {
    if (!evaluation) return <p className="text-sm text-muted-foreground">Assessment unavailable. Review this requirement manually.</p>;
    return <div className="space-y-2">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <div><dt className="text-muted-foreground">Feasibility</dt><dd>{displayScore(evaluation.feasibility)}</dd></div>
            <div><dt className="text-muted-foreground">Complexity</dt><dd>{displayScore(evaluation.complexity)}</dd></div>
            <div><dt className="text-muted-foreground">Risk</dt><dd>{displayScore(evaluation.risk)}</dd></div>
            <div><dt className="text-muted-foreground">Component type</dt><dd>{evaluation.component_type || 'Needs review'}</dd></div>
            <div><dt className="text-muted-foreground">Automatable</dt><dd>{evaluation.automatable === null ? 'Needs review' : evaluation.automatable ? 'Yes' : 'No'}</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">BDR confidence: {Object.entries(evaluation.confidence).map(([key, value]) => `${key.replace('_', ' ')} ${Math.round(value * 100)}%`).join(' · ')}</p>
    </div>;
}

function BlueprintResult({ record, onExport }) {
    const blueprint = record.blueprint;
    if (!blueprint) return <div className="space-y-3"><p className="text-sm">Structured extraction was unavailable. The extracted text and original PDF are retained for review.</p><PlainArticle text={record.text} /></div>;
    const sections = Object.fromEntries(blueprint.sections.map((section) => [section.id, section.title]));
    const evaluations = Object.fromEntries((record.evaluation?.requirements || []).map((row) => [row.requirement_id, row]));
    return <div className="space-y-6">
        <div className="space-y-2"><h2 className="font-headline text-2xl break-words">{blueprint.title}</h2>
            <p className="text-sm text-muted-foreground">{blueprint.page_count} pages · Extraction confidence {Math.round(blueprint.extraction_confidence * 100)}% · {dateLabel(blueprint.extracted_at)}</p>
            <p className="break-all text-xs text-muted-foreground">Source SHA-256: {blueprint.source_hash}</p>
            <p className="text-sm">Assessments are advisory. “Needs review” means BDR abstained or no assessment is available.</p>
            {record.evaluation_failure && <p role="status" className="text-sm">The decision assessment is unavailable; the extracted blueprint is saved.</p>}
            <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => onExport('mission')}>Export mission definition</Button>
                <Button variant="secondary" onClick={() => onExport('challenge')}>Export challenge definition</Button>
                <Button variant="secondary" onClick={() => onExport('extraction')}>Export extracted blueprint</Button></div>
            <p className="text-xs text-muted-foreground">Exports are proposals for review. Complete the plan and obtain approval before implementation.</p>
        </div>
        <section aria-label="Extracted requirements" className="space-y-4"><h3 className="font-headline text-xl">Requirements ({blueprint.requirements.length})</h3>
            {blueprint.requirements.map((requirement) => <article key={requirement.id} className="space-y-3 rounded-md border border-border p-4">
                <h4 className="break-words font-semibold">{requirement.id} · {requirement.priority} · {requirement.type}</h4>
                <PlainArticle text={requirement.text} />
                <p className="text-xs text-muted-foreground">Section: {sections[requirement.section] || requirement.section}</p>
                <Assessment evaluation={evaluations[requirement.id]} />
                <details className="text-sm"><summary className="cursor-pointer">Source context</summary><PlainArticle text={requirement.raw_context} /></details>
            </article>)}
        </section>
        <section aria-label="Component dependencies" className="space-y-3"><h3 className="font-headline text-xl">Components and dependencies</h3>
            {!blueprint.components.length && <p className="text-sm">No named components were identified.</p>}
            <ul className="space-y-3">{blueprint.components.map((component) => <li key={component.name} className="rounded-md border border-border p-3 text-sm">
                <p className="break-words font-semibold">{component.name} ({component.type})</p><PlainArticle text={component.description} />
                <p className="break-words">{component.dependencies.length ? `${component.name} → ${component.dependencies.join(', ')}` : 'No dependencies specified.'}</p>
                <p className="break-words text-xs text-muted-foreground">Requirements: {component.requirements.join(', ') || 'No explicit mapping found'}</p>
            </li>)}</ul>
        </section>
        {[['Constraints', blueprint.constraints], ['Assumptions', blueprint.assumptions], ['Open questions', blueprint.open_questions]].map(([label, items]) =>
            <section key={label} className="space-y-2"><h3 className="font-headline text-xl">{label}</h3>
                {items.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((item, index) => <li className="break-words" key={index}>{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">None explicitly identified.</p>}
            </section>)}
    </div>;
}

function BlueprintDesk({ accountId, workspaceId }) {
    const live = useRef(true); const listing = useRef(0); const reading = useRef(0); const input = useRef(null);
    const api = useMemo(() => createBlueprintClient({ client: pb, accountId, workspaceId, isCurrent: () => live.current,
        observe: observeMutation }), [accountId, workspaceId]);
    const [page, setPage] = useState(1); const [selected, setSelected] = useState(''); const [file, setFile] = useState(null);
    const [snapshot, setSnapshot] = useState({ page: 1, loading: true, data: null, error: '' });
    const [detail, setDetail] = useState({ id: '', record: null, error: '', loading: false });
    const [write, setWrite] = useState({ saving: false, uncertain: false, error: '' });
    const [original, setOriginal] = useState({ id: '', url: '', error: '' });
    const load = useCallback(async () => {
        const attempt = ++listing.current;
        const result = await api.read(page);
        if (!live.current || listing.current !== attempt) return;
        setSnapshot({ page, loading: false, data: result.ok ? result.data : null, error: result.error || '' });
        if (!result.ok) { reading.current++; setDetail({ id: '', record: null, error: '', loading: false }); setOriginal({ id: '', url: '', error: '' }); }
    }, [api, page]);
    const inspect = useCallback(async () => {
        const attempt = ++reading.current;
        if (!selected) return;
        const result = await api.detail(selected);
        if (!live.current || reading.current !== attempt) return;
        setDetail({ id: selected, record: result.ok ? result.data.record : null, error: result.error || '', loading: false });
        if (result.ok) setSnapshot((old) => old.data ? { ...old, data: { ...old.data, items: old.data.items.map((item) =>
            item.id === selected ? { ...item, status: result.data.record.status, revision: result.data.record.revision, attempt: result.data.record.attempt } : item) } } : old);
        if (!result.ok) setOriginal({ id: '', url: '', error: '' });
    }, [api, selected]);
    useEffect(() => { live.current = true; return () => { live.current = false; listing.current++; reading.current++; }; }, []);
    useEffect(() => { setSnapshot({ page, loading: true, data: null, error: '' }); void load(); }, [load, page]);
    useEffect(() => {
        reading.current++; setDetail({ id: selected, record: null, error: '', loading: Boolean(selected) }); setOriginal({ id: '', url: '', error: '' });
        void inspect();
    }, [inspect, selected]);
    const record = detail.id === selected ? detail.record : null;
    useEffect(() => {
        if (!record || !['queued', 'processing'].includes(record.status)) return undefined;
        const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void inspect(); }, 3000);
        return () => window.clearInterval(timer);
    }, [inspect, record]);
    const save = async (operation) => {
        setWrite({ saving: true, uncertain: false, error: '' });
        const result = await operation();
        if (!live.current) return;
        setWrite({ saving: false, uncertain: result.reason === 'uncertain', error: result.error || '' });
        if (result.ok) {
            const saved = result.data.record;
            setSelected(saved.id); setDetail({ id: saved.id, record: saved, error: '', loading: false });
            if (result.kind === 'upload') { setFile(null); if (input.current) input.current.value = ''; }
            void load();
        }
    };
    const download = (kind) => {
        try {
            const payload = kind === 'extraction' ? blueprintExtraction(record) : blueprintDefinition(record, kind);
            const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = `blueprint-${record.id}-${kind}.json`;
            link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch { setWrite((old) => ({ ...old, error: 'This blueprint could not be exported. Refresh it and try again.' })); }
    };
    const originalFile = async () => {
        const selectedId = record.id;
        const result = await api.original(record.upload);
        if (live.current) setOriginal({ id: selectedId, url: result.ok ? result.url : '', error: result.error || '' });
    };
    const data = snapshot.page === page ? snapshot.data : null;
    const writable = data && data.role !== 'viewer';
    const disabled = !writable || write.saving || write.uncertain;
    return <div className="space-y-6 ph-no-capture" data-dd-privacy="mask">
        <PageHeader title="Blueprints" description="Upload a specification PDF, review its requirements and dependencies, and prepare a mission or challenge proposal." />
        <div className="flex flex-wrap gap-4"><Link className={linkClass} to="/app/research">Mission research</Link><Link className={linkClass} to="/app/missions">Challenge Desk</Link><Link className={linkClass} to="/app/operator">Operator</Link><Link className={linkClass} to="/app/integrations">Processing settings</Link></div>
        {snapshot.loading && <p role="status">Loading blueprints…</p>}
        {snapshot.error && <p role="alert">{snapshot.error}</p>}
        <Button variant="secondary" onClick={() => { void load(); void inspect(); }}>Refresh status</Button>
        {data && <Card className="space-y-4 p-5"><form aria-label="Upload blueprint" className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(() => api.upload(file)); }}>
            <label className="block space-y-2 text-sm">Blueprint PDF<input ref={input} type="file" accept=".pdf,application/pdf" className={controlInput} disabled={disabled} onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
            <p className="text-xs text-muted-foreground">Up to 20 MiB. Text-based PDFs only; scanned images and diagrams need separate review.</p>
            <Button type="submit" disabled={disabled || !file}>{write.saving ? 'Saving…' : 'Upload blueprint'}</Button>
            {!writable && <p className="text-sm">A workspace editor can upload blueprints.</p>}
        </form></Card>}
        <div aria-live="polite">{write.error && <p role="alert" className="text-sm">{write.error}</p>}
            {write.uncertain && <Button variant="secondary" disabled={write.saving} onClick={() => save(api.retry)}>Retry previous request</Button>}</div>
        {data && <Card className="space-y-4 p-5"><h2 className="font-headline text-xl">Saved blueprints</h2>
            {!data.items.length && <p className="text-sm text-muted-foreground">No blueprints have been uploaded to this workspace.</p>}
            <ul className="space-y-2">{data.items.map((item) => <li key={item.id}><button type="button" aria-pressed={selected === item.id} className="w-full rounded-md border border-border p-3 text-left text-sm hover:bg-accent" onClick={() => setSelected(item.id)}>
                <span className="break-words font-semibold">{item.source_file}</span><span className="ml-3 text-muted-foreground">{RESEARCH_STATES[item.status]}</span></button></li>)}</ul>
            <PageControls page={page} hasMore={data.has_more} onPage={setPage} label="Blueprint" />
        </Card>}
        {detail.loading && <p role="status">Loading selected blueprint…</p>}
        {detail.error && <p role="alert">{detail.error}</p>}
        {data && record && <Card className="space-y-5 p-5" aria-label="Blueprint details"><p role="status">{RESEARCH_STATES[record.status]}</p>
            {record.status === 'blocked' && <p className="text-sm">Document processing is unavailable. Check the workspace processing settings, then retry.</p>}
            {record.status === 'failed' && <p className="text-sm">Extraction failed ({record.failure}). The original PDF is retained.</p>}
            {['queued', 'processing'].includes(record.status) && <p className="text-sm">The research worker is extracting this PDF. Status refreshes while this page is visible.</p>}
            {(record.truncated || record.blueprint?.truncated) && <p role="status" className="text-sm">Extraction is truncated. Review the original PDF for omitted material.</p>}
            {record.status === 'ready' && <BlueprintResult record={record} onExport={download} />}
            <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={originalFile}>Prepare original PDF download</Button>
                {writable && ['blocked', 'failed'].includes(record.status) && record.attempt < 5 && <Button disabled={disabled} onClick={() => save(() => api.command(record.id, 'retry', record.revision))}>Retry extraction</Button>}
                {writable && ['queued', 'processing', 'blocked', 'failed'].includes(record.status) && <Button disabled={disabled} variant="secondary" onClick={() => save(() => api.command(record.id, 'cancel', record.revision))}>Cancel extraction</Button>}</div>
            {original.id === record.id && original.url && <a className={linkClass} href={original.url} download rel="noreferrer">Download original PDF</a>}
            {original.id === record.id && original.error && <p role="alert" className="text-sm">{original.error}</p>}
        </Card>}
    </div>;
}

export default function BlueprintSavedPage() {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    if (!isAuthed || !user?.id || !active?.id || demo) return <div className="space-y-4"><PageHeader title="Blueprints" description="Review specification PDFs in your workspace." />
        <Card className="p-5"><p>Sign in, select a workspace and turn off demonstration mode to manage blueprints.</p></Card></div>;
    return <BlueprintDesk key={`${user.id}:${active.id}`} accountId={user.id} workspaceId={active.id} />;
}
