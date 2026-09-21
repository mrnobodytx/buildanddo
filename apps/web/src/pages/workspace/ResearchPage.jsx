// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/ResearchPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useMissionResearch.js, apps/web/src/hooks/useWorkspaceRecords.js, apps/web/src/lib/missionResearch.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useMissionResearch.js; CONSUMES apps/web/src/hooks/useWorkspaceRecords.js; CONSUMES apps/web/src/lib/missionResearch.js; CONSUMES apps/web/src/pages/workspace/KnowledgePage.jsx
// DAG Node:    none
// Intent:      Let members submit and review mission sources from either channel without presenting machine extraction as verified evidence.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { ControlState, PageControls, PlainArticle, controlInput, dateLabel } from '@/components/workspace/ControlPrimitives';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useMissionResearch } from '@/hooks/useMissionResearch';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { FILE_ACCEPT, RESEARCH_KINDS, RESEARCH_STATES } from '@/lib/missionResearch';

const linkClass = 'text-sm underline underline-offset-4';
function ResearchDesk({ control, page, onPage, missionFilter, initialSource }) {
    const missions = useWorkspaceRecords('missions', { sort: '-created' });
    const [form, setForm] = useState({ mission: missionFilter, kind: 'search', title: '', input: '', context: '', upload: '' });
    const [file, setFile] = useState(null); const [uploads, setUploads] = useState(null); const [uploadError, setUploadError] = useState('');
    const [selected, setSelected] = useState(initialSource); const [detail, setDetail] = useState(null); const [detailError, setDetailError] = useState('');
    const [note, setNote] = useState(''); const [validation, setValidation] = useState('');
    const [original, setOriginal] = useState({ id: '', url: '', error: '' });
    const fileInput = useRef(null); const live = useRef(true);
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    useEffect(() => { setSelected(initialSource); }, [initialSource]);
    useEffect(() => { setForm((old) => old.mission === missionFilter ? old : { ...old, mission: missionFilter }); }, [missionFilter]);
    useEffect(() => {
        if (control.saved?.action !== 'submit') return;
        setSelected(control.saved.id); setForm((old) => ({ ...old, title: '', input: '', context: '', upload: '' })); setFile(null);
        if (fileInput.current) fileInput.current.value = '';
    }, [control.saved]);
    useEffect(() => {
        let current = true; setDetail(null); setDetailError(''); setNote(''); setOriginal({ id: '', url: '', error: '' });
        if (selected) control.detail(selected).then((result) => {
            if (!current) return;
            if (result.ok) setDetail(result.data.record); else setDetailError(result.error || 'This source is no longer available.');
        });
        return () => { current = false; };
    }, [selected, control.detail, control.data]);
    const writeable = Boolean(control.data && control.data.role !== 'viewer');
    const disabled = !writeable || control.saving || control.uncertain;
    const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
    const recover = async () => {
        setUploadError(''); const result = await control.uploads();
        if (!live.current) return;
        setUploads(result.ok ? result : null); setUploadError(result.ok ? '' : result.error);
    };
    const submit = async (event) => {
        event.preventDefault(); setValidation('');
        if (!form.mission || !form.title.trim()) { setValidation('Choose a mission and name the source.'); return; }
        let upload = form.upload; let kind = form.kind;
        if (!['search', 'url'].includes(kind)) {
            if (!upload && !file) { setValidation('Choose a file or recover a saved upload.'); return; }
            if (!upload) {
                const stored = await control.upload(file);
                if (!live.current || !stored.ok) return;
                upload = stored.result.id; kind = stored.result.kind;
                setForm((old) => ({ ...old, upload, kind }));
            }
        }
        const result = await control.mutate('submit', { ...form, kind, upload, input: ['search', 'url'].includes(kind) ? form.input : '' }, 0);
        if (!live.current || !result.ok) return;
        setSelected(result.result.id); setForm((old) => ({ ...old, title: '', input: '', context: '', upload: '' })); setFile(null);
        if (fileInput.current) fileInput.current.value = '';
    };
    const transition = async (action) => {
        setValidation('');
        if (action === 'attach' && !note.trim()) { setValidation('Record what you checked and why this source supports the mission.'); return; }
        await control.mutate(action, { id: detail.id, ...(action === 'attach' ? { note } : {}) }, detail.revision);
    };
    const prepareOriginal = async () => {
        const source = detail.id;
        const result = await control.original(detail.upload);
        if (live.current) setOriginal({ id: source, url: result.ok ? result.url : '', error: result.error || '' });
    };
    return <div className="space-y-6 ph-no-capture" data-dd-privacy="mask">
        <PageHeader title="Mission research" description="Submit web sources, documents, audio or video. Review extracted material before attaching it to the mission’s Evidence Ledger." />
        <div className="flex flex-wrap gap-4"><Link to="/app/missions" className={linkClass}>Missions</Link><Link to="/app/evidence" className={linkClass}>Evidence Ledger</Link>
            <Link to={form.mission ? `/app/knowledge?mission=${encodeURIComponent(form.mission)}` : '/app/knowledge'} className={linkClass}>Knowledge graph & context</Link>
            <Link to="/app/integrations" className={linkClass}>Processing configuration</Link><Link to="/app/settings#discord-account" className={linkClass}>Link Discord</Link></div>
        <div aria-live="polite" className="space-y-2">
            {(validation || control.writeError) && <p role="alert" className="text-sm text-destructive">{validation || control.writeError}</p>}
            {control.uncertain && <Button type="button" disabled={control.saving} variant="secondary" onClick={control.retry}>Retry previous request</Button>}
            {control.saved?.action && <p role="status" className="text-sm">{control.saved.action === 'attach' ? 'Saved as observed evidence. Mission verification is unchanged.' : 'Request saved. Open its recorded status below.'}</p>}
        </div>
        <ControlState control={control}>
            <Card className="space-y-3 p-5">
                <h2 className="font-display text-lg">Available processing</h2>
                <p className="text-sm">{control.data?.capabilities.kinds.length ? control.data.capabilities.kinds.map((kind) => RESEARCH_KINDS[kind]).join(', ') : 'No processing capability is enabled for this workspace.'}</p>
                <p className="text-xs text-muted-foreground">Firecrawl handles web search and page extraction. File processing uses the registered document or transcription service. A saved request waits for that service; it does not prove that the service ran.</p>
            </Card>
            {writeable ? <Card className="p-5"><form className="space-y-4" onSubmit={submit} aria-label="Submit mission research">
                <h2 className="font-display text-lg">Submit a source</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">Mission<select aria-label="Mission" className={controlInput} value={form.mission} disabled={disabled || missions.loading || missions.degraded} onChange={(e) => update('mission', e.target.value)}>
                        <option value="">Choose a mission</option>{missions.records.filter((item) => !['verified', 'failed'].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select></label>
                    <label className="space-y-1 text-sm">Source type<select className={controlInput} value={form.kind} disabled={disabled || Boolean(form.upload)} onChange={(e) => { update('kind', e.target.value); setFile(null); }}>
                        {Object.entries(RESEARCH_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select></label>
                </div>
                {missions.degraded && <p role="alert" className="text-sm">Mission loading failed. <button type="button" className={linkClass} onClick={missions.refresh}>Reload missions</button></p>}
                <label className="block space-y-1 text-sm">Source title<input className={controlInput} maxLength={160} required value={form.title} disabled={disabled} onChange={(e) => update('title', e.target.value)} /></label>
                {['search', 'url'].includes(form.kind) ? <label className="block space-y-1 text-sm">{form.kind === 'search' ? 'Search query' : 'Public HTTPS URL'}<input className={controlInput} type={form.kind === 'url' ? 'url' : 'text'} maxLength={form.kind === 'search' ? 500 : 2048} required value={form.input} disabled={disabled} onChange={(e) => update('input', e.target.value)} /></label> :
                    <div className="space-y-3"><label className="block space-y-1 text-sm">Source file (up to 20 MiB)<input ref={fileInput} className={controlInput} type="file" accept={FILE_ACCEPT} disabled={disabled || Boolean(form.upload)} onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
                        {form.upload && <p role="status" className="text-sm">Upload saved. It will be reused if submitting the research request fails.</p>}
                        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={recover}>Refresh saved uploads</Button>
                        {uploadError && <p role="alert" className="text-sm">{uploadError}</p>}
                        {uploads && <label className="block space-y-1 text-sm">Recover an upload<select className={controlInput} value={form.upload} disabled={disabled} onChange={(e) => {
                            const chosen = uploads.items.find((item) => item.id === e.target.value); setForm((old) => ({ ...old, upload: chosen?.id || '', kind: chosen?.kind || old.kind }));
                        }}><option value="">Use the selected new file</option>{uploads.items.map((item) => <option key={item.id} value={item.id}>{item.original_name} — {dateLabel(item.created)}</option>)}</select></label>}
                        {uploads?.hasMore && <p className="text-xs">Showing the latest 50 uploads.</p>}
                    </div>}
                <label className="block space-y-1 text-sm">Why this source matters<textarea className={controlInput} rows={3} maxLength={1200} value={form.context} disabled={disabled} onChange={(e) => update('context', e.target.value)} /></label>
                <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={disabled || missions.loading || missions.degraded}>{control.saving ? 'Saving…' : 'Submit research'}</Button><Link to="/app/missions" className={linkClass}>Create a mission first</Link></div>
            </form></Card> : <p className="text-sm">Viewer access permits reading. An editor, administrator or owner can submit and review sources.</p>}
            <section className="space-y-3" aria-label="Research submissions"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg">Submissions from the website and Discord</h2>
                <Button type="button" size="sm" variant="secondary" disabled={control.saving} onClick={control.refresh}>Refresh status</Button></div>
                {!control.data?.items.length && <p className="text-sm text-muted-foreground">No submissions in this view.</p>}
                {control.data?.items.map((item) => <Card key={item.id} className="flex min-w-0 flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><h3 className="break-words font-medium">{item.title}</h3><p className="text-xs text-muted-foreground">{RESEARCH_STATES[item.status]} · {item.origin} · {dateLabel(item.created)}</p></div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setSelected(item.id)}>Review {item.title}</Button>
                </Card>)}
                <PageControls label="Research submissions" page={page} hasMore={control.data?.has_more} onPage={onPage} disabled={control.saving} />
            </section>
        </ControlState>
        {selected && <Card className="min-w-0 space-y-4 p-5" aria-label="Source review">
            <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-display text-lg">{detail?.title || 'Source review'}</h2><Button type="button" size="sm" variant="secondary" onClick={() => setSelected('')}>Close review</Button></div>
            {detailError ? <p role="alert">{detailError}</p> : !detail ? <p role="status">Loading source…</p> : <>
                <p className="text-sm">{RESEARCH_STATES[detail.status]} · {RESEARCH_KINDS[detail.kind]} · {detail.origin}</p>
                <p className="text-xs text-muted-foreground">Submission: <span className="break-all font-evidence">{detail.id}</span> · Attempt {detail.attempt}</p>
                <PlainArticle text={detail.context} />
                {detail.upload && <div className="space-y-2"><Button type="button" variant="secondary" size="sm" onClick={prepareOriginal}>Prepare original file download</Button>
                    {original.id === detail.id && original.url && <a className={`${linkClass} ml-3`} href={original.url} target="_blank" rel="noreferrer">Download original file</a>}
                    {original.id === detail.id && original.error && <p role="alert" className="text-sm">{original.error}</p>}</div>}
                {detail.failure && <p role="status" className="text-sm">{detail.failure === 'capability_unavailable' ? 'An operator must enable a compatible processor before this request can run.' : `The processor reported: ${detail.failure}. Review the input and retry when the cause is resolved.`}</p>}
                {detail.result && <><p className="text-xs text-muted-foreground">Extracted by {detail.result.processor} ({detail.result.version}) at {dateLabel(detail.processed_at)}.</p>
                    <p className="break-all text-xs font-evidence">Input SHA-256: {detail.result.input_sha256}</p>
                    {detail.result.truncated && <p className="text-sm">The saved excerpt is truncated. Review the original before drawing conclusions.</p>}
                    <PlainArticle text={detail.result.text} />
                    <ul className="space-y-2">{detail.result.citations.filter((item) => /^https:\/\//.test(item.url)).map((item, index) => <li key={index}><a className={`${linkClass} break-words`} href={item.url} target="_blank" rel="noreferrer">{item.title}</a></li>)}</ul>
                </>}
                {detail.status === 'ready' && writeable && <div className="space-y-3"><label className="block space-y-1 text-sm">Review note<textarea className={controlInput} rows={3} maxLength={1200} value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} /></label>
                    <p className="text-xs text-muted-foreground">Explain the source’s relevance and limitations. This saves an observed evidence record; mission verification requires the existing TEVV review.</p><Button type="button" disabled={disabled} onClick={() => transition('attach')}>Attach reviewed source to evidence</Button></div>}
                <div className="flex flex-wrap gap-3">{writeable && ['blocked', 'failed'].includes(detail.status) && detail.attempt < 5 && <Button type="button" variant="secondary" disabled={disabled} onClick={() => transition('retry')}>Retry processing</Button>}
                    {writeable && !['cancelled', 'attached'].includes(detail.status) && <Button type="button" variant="secondary" disabled={disabled} onClick={() => transition('cancel')}>Cancel submission</Button>}
                    {detail.evidence && <Link to="/app/evidence" className={linkClass}>Open Evidence Ledger</Link>}</div>
            </>}
        </Card>}
    </div>;
}

function ResearchView({ params }) {
    const [page, setPage] = useState(1);
    const mission = params.get('mission') || ''; const control = useMissionResearch({ page, ...(mission ? { mission } : {}) });
    return <ResearchDesk key={control.scope} control={control} page={page} onPage={setPage} missionFilter={mission} initialSource={params.get('source') || ''} />;
}

export default function ResearchPage() {
    const [params] = useSearchParams(); const { active, workspaces = [], setActive } = useWorkspace();
    const requested = params.get('workspace');
    const target = workspaces.find((item) => item.id === requested);
    if (requested && requested !== active?.id) return <div className="space-y-4"><PageHeader title="Mission research" description="Open the workspace attached to this research link." />
        <Card className="space-y-3 p-5"><p className="text-sm">{target ? `This submission belongs to ${target.name || 'another workspace you can access'}.` : 'This link belongs to a different workspace. Select it from your workspace list, or ask its owner for access.'}</p>
            {target && <Button onClick={() => setActive(target.id)}>Switch to linked workspace</Button>}</Card></div>;
    return <ResearchView params={params} />;
}
