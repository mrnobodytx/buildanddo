// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/BlueprintPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        BITS-CODEGEN, C-ONE (status link kept on the domain)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/web/src/pages/workspace/BlueprintSavedPage.jsx, apps/web/src/lib/blueprints.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/pages/workspace/BlueprintSavedPage.jsx; CONSUMES apps/web/src/lib/blueprints.js
// DAG Node:    none
// Intent:      Present all extraction passes, dependency planning and source-linked prompts for human review.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { controlInput } from '@/components/workspace/ControlPrimitives';
import BlueprintSavedPage from './BlueprintSavedPage';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createBlueprintClient, exportMissionPlan } from '@/lib/blueprints';
import { STATUS_PATH } from '@/lib/communityLinks';

const percent = (value) => Number.isFinite(value) ? Math.round(value * 100) + '%' : 'Unavailable';
const warningLabel = (value) => value.replaceAll('_', ' ').replaceAll(':', ' — ');

function BlueprintResults({ data, busy, generate }) {
    const { blueprint, component_graph: graph, mission_plan: mission, session_prompts: prompts } = data;
    const { scan, parsed, assessment } = blueprint;
    const components = new Map(graph.components.map((item) => [item.id, item]));
    const sections = new Map(parsed.sections.map((item) => [item.id, item]));
    const metrics = [
        ['Requirement coverage', assessment.requirement_coverage, assessment.counts.sections > 0],
        ['Heading regularity', assessment.structural_regularity, assessment.counts.headings > 0],
        ['Table parse quality', assessment.table_parse_quality, assessment.counts.detected_tables > 0],
        ['Section references resolved', assessment.cross_reference_resolution_rate, assessment.counts.section_references > 0],
        ['Entity consistency', assessment.entity_consistency, assessment.counts.entities > 0],
    ];
    return <div className="min-w-0 space-y-5">
        <p className="break-all text-xs font-evidence">PDF SHA-256: {blueprint.input_sha256}</p>
        <Card className="min-w-0 space-y-3 p-5">
            <h2 className="font-display text-xl">Pass 1 — Scan</h2>
            <p className="text-sm">{scan.pages.length} pages · {scan.headings.length} headings · {scan.table_regions.length} table regions · {scan.list_items.length} list items</p>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead><tr><th scope="col">Page</th><th scope="col">Text characters</th><th scope="col">Columns</th><th scope="col">Layout</th></tr></thead>
                <tbody>{scan.pages.map((page) => <tr key={page.page} className="border-t border-border">
                    <td className="py-2">{page.page}</td><td>{page.text_characters}</td><td>{page.columns}</td>
                    <td>{page.diagram_only ? 'Sparse text; possible diagram or scan' : page.positions_available ? 'Positioned text' : 'Text order fallback'}</td>
                </tr>)}</tbody></table></div>
        </Card>
        <Card className="min-w-0 space-y-4 p-5">
            <h2 className="font-display text-xl">Pass 2 — Parsed structure</h2>
            {parsed.sections.length ? <ul className="space-y-2">{parsed.sections.map((section) => <li key={section.id} className="break-words">
                <span className="text-xs text-muted-foreground">Level {section.level} · Page {section.source.page} · </span>
                {section.number} {section.title}
                {section.parent_id && <span className="text-xs text-muted-foreground"> (under {sections.get(section.parent_id)?.title})</span>}
                <span className="text-xs"> · {section.requirement_ids.length} requirements</span>
            </li>)}</ul> : <p>No text sections were detected.</p>}
            <h3 className="font-medium">Requirements and extraction confidence</h3>
            {!parsed.requirements.length && <p className="text-sm">No requirements were extracted. Review the original PDF.</p>}
            <ol className="space-y-3">{parsed.requirements.map((requirement) => <li key={requirement.id} className="space-y-1 rounded border border-border p-3">
                <p className="text-xs font-evidence">{requirement.source_id || requirement.id} · Page {requirement.source.page} · Confidence {percent(requirement.confidence)}</p>
                <p className="whitespace-pre-wrap break-words text-sm">{requirement.text}</p>
                <p className="text-xs text-muted-foreground">{requirement.confidence_reasons.map(warningLabel).join('; ')}</p>
            </li>)}</ol>
            {parsed.tables.map((table) => <details key={table.id}><summary className="cursor-pointer text-sm">Table {table.id} · Page {table.source.page}</summary>
                <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><tbody>{table.rows.map((row, i) => <tr key={i} className="border-t border-border">{row.map((cell, j) => <td key={j} className="whitespace-pre-wrap p-2">{cell}</td>)}</tr>)}</tbody></table></div>
            </details>)}
            <details><summary className="cursor-pointer text-sm">Cross-references, acronyms and open items</summary>
                <ul className="mt-2 space-y-2 text-sm">
                    {parsed.cross_references.map((ref) => <li key={ref.id}>{ref.text} · {ref.resolved_id ? 'Resolved to ' + (sections.get(ref.resolved_id)?.title || ref.resolved_id) : 'Unresolved or external'} · Page {ref.source.page}</li>)}
                    {parsed.acronyms.map((item, i) => <li key={'acronym-' + i}>{item.acronym}: {item.full_name} · Page {item.source.page}</li>)}
                    {parsed.open_items.map((item, i) => <li key={'open-' + i}>{item.marker}: {item.text} · Page {item.source.page}</li>)}
                </ul>
            </details>
        </Card>
        <Card className="space-y-4 p-5">
            <h2 className="font-display text-xl">Pass 3 — Assessment</h2>
            <dl className="grid gap-3 sm:grid-cols-2">{metrics.map(([label, value, applicable]) => <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-evidence">{applicable ? percent(value) : 'Not applicable'}</dd>
            </div>)}<div><dt className="text-sm text-muted-foreground">Vague phrases</dt><dd>{assessment.ambiguity_score}</dd></div></dl>
            <p className="text-sm">Descriptive sections without requirements: {assessment.sections_without_requirements.map((id) => sections.get(id)?.title || id).join(', ') || 'None'}</p>
            {assessment.duplicate_requirements.map((item, i) => <p key={i} className="text-sm">Possible duplicate: {item.requirement_ids.join(' / ')} · {percent(item.similarity)} text overlap</p>)}
            <ul className="space-y-1 text-xs text-muted-foreground">{assessment.warnings.map((warning, i) => <li key={i}>{warningLabel(warning)}</li>)}</ul>
        </Card>
        <Card className="space-y-4 p-5">
            <h2 className="font-display text-xl">Component dependencies</h2>
            <ul className="space-y-3">{graph.components.map((component) => <li key={component.id} className="space-y-1">
                <p className="font-medium">{component.name} <span className="font-evidence text-xs">({component.type})</span></p>
                <p className="text-sm">{component.requirements.length} requirements · Depends on: {[...new Set(component.dependencies.map((dep) => components.get(dep.component_id)?.name || dep.component_id))].join(', ') || 'None'}</p>
                {component.dependencies.map((dep, i) => <p key={i} className="text-xs text-muted-foreground">{warningLabel(dep.reason)} · {dep.requirement_ids.join(', ')}</p>)}
            </li>)}</ul>
            {graph.warnings.map((warning, i) => <p key={i} className="break-words text-xs">{warningLabel(warning)}</p>)}
        </Card>
        <Card className="space-y-4 p-5">
            <h2 className="font-display text-xl">Mission plan</h2>
            {data.planning_error && <p role="alert">Planning needs review: {warningLabel(data.planning_error)}. Resolve the dependencies before generating prompts.</p>}
            {mission && <><p className="text-sm">Draft · A0 review · Unverified</p>
                <ol className="space-y-3">{mission.challenges.map((challenge) => <li key={challenge.id}>
                    <h3 className="font-medium">{challenge.order}. {challenge.component.name}</h3>
                    <p className="text-sm">Requirements: {challenge.requirement_ids.join(', ')} · Complexity: {challenge.estimated_complexity === null ? 'Unknown' : challenge.estimated_complexity + '/5'}</p>
                    <details><summary className="cursor-pointer text-xs">BDR evaluation scores and provenance</summary>
                        {challenge.component.evaluations.map((evaluation) => <div key={evaluation.id} className="my-2 space-y-1 text-xs">
                            <p className="break-all font-evidence">{evaluation.requirement_id} · {evaluation.id} · Page {evaluation.source.page}</p>
                            {Object.entries(evaluation.decision.answers).map(([key, answer]) => <p key={key}>{warningLabel(key)}: {answer.abstained ? 'Abstained' : String(answer.value)} · Confidence {percent(answer.confidence)}</p>)}
                        </div>)}
                    </details>
                </li>)}</ol>
                {!mission.challenges.length && <p className="text-sm">No component challenges can be proposed without requirements.</p>}
                <div className="flex flex-wrap gap-3"><Button onClick={generate} disabled={busy || !mission.challenges.length}>Generate session prompts</Button>
                    <Button variant="secondary" onClick={() => exportMissionPlan(mission)}>Export mission plan as JSON</Button></div>
            </>}
            {prompts.length > 0 && <section className="space-y-3" aria-label="Session prompts for review">
                <h3 className="font-medium">Session prompts for review</h3>
                <p className="text-sm">Review the source and approve a separate implementation dispatch before creating a session.</p>
                {prompts.map((prompt, i) => <details key={prompt.id}><summary className="cursor-pointer text-sm">Prompt {i + 1} · {components.get(prompt.component_id)?.name}</summary>
                    <label className="mt-2 block text-xs">Review prompt {i + 1}<textarea className={controlInput + ' mt-1 font-mono text-xs'} value={prompt.prompt} readOnly rows={16} /></label>
                </details>)}
            </section>}
        </Card>
    </div>;
}

function BlueprintDesk({ accountId, workspaceId, demo }) {
    const live = useRef(true);
    const pending = useRef(false);
    const [file, setFile] = useState(null);
    const [state, setState] = useState({ busy: false, data: null, error: '' });
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    const client = useMemo(() => createBlueprintClient({ client: pb, accountId, workspaceId, demo, isCurrent: () => live.current }),
        [accountId, workspaceId, demo]);
    const analyze = async (includePrompts = false) => {
        if (pending.current) return;
        pending.current = true;
        setState((old) => ({ busy: true, data: includePrompts ? old.data : null, error: '' }));
        const result = await client.analyze(file, includePrompts);
        pending.current = false;
        if (!live.current) return;
        setState((old) => ({ busy: false, data: result.ok ? result.data : old.data, error: result.error || '' }));
    };
    const enabled = Boolean(accountId && workspaceId && !demo);
    return <div className="min-w-0 space-y-6 ph-no-capture" data-dd-privacy="mask">
        <PageHeader title="Blueprints" description="Review a PDF’s requirements, component dependencies and proposed mission challenges." />
        <p className="text-sm text-muted-foreground">CPU extraction produces heuristic, unverified observations. Session prompts require human review.</p>
        <Link to="/app/missions" className="text-sm underline underline-offset-4">Open Challenge Desk</Link>
        {!enabled && <p role="status">Sign in, select a workspace and turn off demonstration mode to analyze a PDF.</p>}
        <Card className="space-y-3 p-5"><form aria-label="Analyze blueprint" className="space-y-3" onSubmit={(e) => { e.preventDefault(); void analyze(); }}>
            <label className="block text-sm">Blueprint PDF (up to 20 MiB)
                <input type="file" accept=".pdf,application/pdf" disabled={!enabled || state.busy} className={controlInput + ' mt-1'} onChange={(e) => {
                    setFile(e.target.files?.[0] || null); setState({ busy: false, data: null, error: '' });
                }} /></label>
            <Button type="submit" disabled={!enabled || !file || state.busy}>{state.busy ? 'Analyzing…' : 'Analyze blueprint'}</Button>
        </form>{state.busy && <p role="status">Processing the PDF and its review plan…</p>}{state.error && <p role="alert">{state.error}</p>}</Card>
        {state.data && <BlueprintResults data={state.data} busy={state.busy} generate={() => analyze(true)} />}
        <footer className="text-xs text-muted-foreground">Powered by Citadel Nexus Inc. · <a href={STATUS_PATH} className="underline">Service status</a></footer>
    </div>;
}

export default function BlueprintPage() {
    const [view, setView] = useState('analysis');
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : '';
    return <div className="space-y-5">
        <nav aria-label="Blueprint views" className="flex flex-wrap gap-2">
            <Button variant={view === 'analysis' ? 'default' : 'secondary'} aria-pressed={view === 'analysis'} onClick={() => setView('analysis')}>Analyze PDF</Button>
            <Button variant={view === 'saved' ? 'default' : 'secondary'} aria-pressed={view === 'saved'} onClick={() => setView('saved')}>Saved PDFs</Button>
        </nav>
        {view === 'saved' ? <BlueprintSavedPage /> : <BlueprintDesk key={accountId + ':' + (active?.id || '') + ':' + demo}
            accountId={accountId} workspaceId={active?.id || ''} demo={demo} />}
    </div>;
}
