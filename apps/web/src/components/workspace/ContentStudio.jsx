// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/ContentStudio.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js, apps/web/src/lib/businessPlanning.js, apps/web/src/components/workspace/StructuredContent.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js; CONSUMES apps/web/src/lib/businessPlanning.js; CONSUMES apps/web/src/components/workspace/StructuredContent.jsx
// DAG Node:    none
// Intent:      Turn workspace briefs into recoverable drafts with readable previews, explicit review and honest publication receipts.
// ───────────────────────────────────────────────────────────────

import { MotionEntrance } from '@/components/motion/MotionPrimitives';
import React, { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DemoModeBanner, DegradedNotice, ListSkeleton } from '@/components/workspace/WorkspaceNotices';
import StructuredContent from '@/components/workspace/StructuredContent';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { CONTENT_FORMATS, CONTENT_STATUSES, contentOutline, dateInput, publicationUrl, retainedFields } from '@/lib/businessPlanning';
import pb from '@/lib/pocketbaseClient';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm';
const emptyDraft = { title: '', format: 'blog', audience: '', brief: '', call_to_action: '', body: '', channel: '', objective: '' };
const reviewLabels = {
    accuracy: 'Claims are supported and limitations are visible.',
    privacy: 'Unnecessary personal or private information is removed.',
    rights: 'Sources and permissions for reused material are checked.',
    accessibility: 'Structure, language and reading order are usable.',
};

function Studio({ accountId, demo }) {
    const content = useWorkspaceRecords('social_content');
    const objectives = useWorkspaceRecords('erp_objectives');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [format, setFormat] = useState('all');
    const [editor, setEditor] = useState(null);
    const [draft, setDraft] = useState(emptyDraft);
    const [detail, setDetail] = useState(null);
    const [preview, setPreview] = useState(false);
    const [replace, setReplace] = useState(false);
    const [checks, setChecks] = useState({});
    const [note, setNote] = useState('');
    const [plannedDate, setPlannedDate] = useState('');
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');
    const alive = useRef(true);
    const lock = useRef(false);
    const opener = useRef(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const current = () => alive.current && pb.authStore.record?.id === accountId;
    const begin = (record, target, copy = false) => {
        opener.current = target; setError(''); setSaved(''); setPreview(false); setReplace(false);
        setDraft(Object.fromEntries(Object.entries(emptyDraft).map(([name, fallback]) => [name, record?.[name] || fallback])));
        setEditor({ id: copy ? '' : record?.id || '' }); setDetail(null);
    };
    const open = (record, target) => {
        opener.current = target; setDetail(record); setError(''); setSaved(''); setChecks({}); setNote('');
        setPlannedDate(dateInput(record.scheduled_for)); setUrl('');
    };
    const save = async (event) => {
        event.preventDefault();
        if (lock.current || !current() || demo) return;
        if (!draft.title.trim()) { setError('Name the draft.'); return; }
        lock.current = true; setBusy(true); setError('');
        const fields = { ...Object.fromEntries(Object.entries(draft).map(([name, value]) => [name, value.trim()])), status: 'draft' };
        const result = editor.id ? await content.update(editor.id, fields) : await content.create(fields);
        if (current()) {
            if (result.ok && !retainedFields(result.record, fields)) {
                setEditor({ id: result.record.id });
                setError('A record was saved, but some draft fields were not retained. Apply the content migration before updating this saved draft. Your copy is still here.');
            } else if (result.ok) { setEditor(null); setSaved('Draft saved. Request review when the copy is ready.'); }
            else setError(result.error || 'Could not save the draft. Your writing is still here.');
            setBusy(false);
        }
        lock.current = false;
    };
    const transition = async (fields) => {
        if (lock.current || !detail || !current() || demo) return;
        lock.current = true; setBusy(true); setError(''); setSaved('');
        const result = await content.update(detail.id, fields);
        if (current()) {
            if (result.ok) {
                setDetail(result.record);
                const receiptMissing = result.record.status !== fields.status ||
                    (fields.status === 'approved' && (!result.record.reviewed_at || !result.record.reviewed_by)) ||
                    (fields.status === 'published' && (!result.record.published_at || !result.record.published_by || !publicationUrl(result.record.published_url)));
                if (receiptMissing) setError('The backend did not return the required decision receipt. Refresh and check the installed content backend before proceeding.');
                else setSaved(`${CONTENT_STATUSES[result.record.status] || result.record.status} saved.`);
            }
            else setError(result.error || 'Could not save this decision. Your input is retained; refresh before retrying an uncertain result.');
            setBusy(false);
        }
        lock.current = false;
    };
    const visible = content.records.filter((record) =>
        `${record.title || ''} ${record.audience || ''} ${record.channel || ''}`.toLowerCase().includes(query.trim().toLowerCase()) &&
        (filter === 'all' || record.status === filter) && (format === 'all' || (record.format || 'social') === format));
    const field = (name, label, maximum, multiline = false) => <div className="space-y-1">
        <Label htmlFor={`content-${name}`}>{label}</Label>
        {multiline ? <Textarea id={`content-${name}`} value={draft[name]} rows={name === 'body' ? 12 : 3} maxLength={maximum} onChange={(event) => setDraft((before) => ({ ...before, [name]: event.target.value }))} /> :
            <Input id={`content-${name}`} value={draft[name]} maxLength={maximum} required={name === 'title'} onChange={(event) => setDraft((before) => ({ ...before, [name]: event.target.value }))} />}
    </div>;
    const closeFocus = (event) => { event.preventDefault(); opener.current?.focus(); };
    return <div className="ph-no-capture space-y-5" data-dd-privacy="mask">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl font-semibold">Content studio</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Build a brief, write and preview a draft, then review it before recording publication.</p></div><div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={content.loading || busy} onClick={content.refresh}>Refresh content</Button>
            <Button size="sm" disabled={demo || content.loading || content.degraded} onClick={(event) => begin(null, event.currentTarget)}>New draft</Button>
        </div></div>
        {demo && <DemoModeBanner />}
        {saved && !detail && <p role="status" className="text-sm text-success">{saved}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor="content-search">Search content</Label><Input id="content-search" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="content-state">Editorial state</Label><select id="content-state" className={selectClass} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All states</option>{Object.entries(CONTENT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="content-format-filter">Content format</Label><select id="content-format-filter" className={selectClass} value={format} onChange={(event) => setFormat(event.target.value)}><option value="all">All formats</option>{Object.entries(CONTENT_FORMATS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        </div>
        {content.loading ? <ListSkeleton label="Loading content…" /> : content.degraded ? <DegradedNotice message="The content list is unavailable." onRetry={content.refresh} /> : !visible.length ? <Card className="p-6 text-sm text-muted-foreground">{query || filter !== 'all' || format !== 'all' ? 'No content matches these filters.' : 'No drafts yet. Start with a reader, a purpose and the facts you can support.'}</Card> : <ul className="grid gap-3 md:grid-cols-2">
            {visible.map((record) => <li key={record.id} className="min-w-0"><Card className="flex h-full flex-col gap-3 break-words p-4">
                <p className="text-xs font-semibold text-primary">{CONTENT_FORMATS[record.format] || 'Social post'} · {CONTENT_STATUSES[record.status] || record.status}</p>
                <h3 className="font-display text-lg font-semibold">{record.title}</h3>
                <p className="text-sm text-muted-foreground">Audience: {record.audience || 'Not recorded yet.'}</p>
                {record.channel && <p className="text-xs text-muted-foreground">Channel: {record.channel}</p>}
                {dateInput(record.scheduled_for) && <p className="text-xs text-muted-foreground">Planned: {dateInput(record.scheduled_for)}</p>}
                <Button size="sm" variant="secondary" className="mt-auto self-start" aria-label={`Open ${record.title}`} onClick={(event) => open(record, event.currentTarget)}>Open draft and history</Button>
            </Card></li>)}
        </ul>}
        <p className="text-xs leading-6 text-muted-foreground">Outlines use your brief and editable writing prompts. Planned dates do not send posts. Publication records an operator-checked URL; channel delivery remains a separate authorized action.</p>
        {editor && <Dialog open onOpenChange={(open) => { if (!open && !busy) setEditor(null); }}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto" data-dd-privacy="mask" onCloseAutoFocus={closeFocus}>
            <div className="ph-no-capture space-y-4"><DialogHeader><DialogTitle>{editor.id ? 'Edit draft' : 'New content draft'}</DialogTitle><DialogDescription>Save a brief and editable copy. Drafts are private to the workspace.</DialogDescription></DialogHeader>
                <form className="space-y-4" onSubmit={save}><fieldset disabled={busy} className="min-w-0 space-y-4">
                    {field('title', 'Title', 200)}
                    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="content-format">Format</Label><select id="content-format" className={selectClass} value={draft.format} onChange={(event) => setDraft((before) => ({ ...before, format: event.target.value }))}>{Object.entries(CONTENT_FORMATS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{field('channel', 'Intended channel', 160)}</div>
                    {field('audience', 'Intended audience', 300)}{field('brief', 'Brief and supporting facts', 2000, true)}{field('call_to_action', 'Next action for the reader', 400)}
                    <div className="space-y-1"><Label htmlFor="content-objective">Business objective</Label><select id="content-objective" className={selectClass} disabled={objectives.loading || objectives.degraded} value={draft.objective} onChange={(event) => setDraft((before) => ({ ...before, objective: event.target.value }))}><option value="">No link</option>{objectives.records.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}{draft.objective && !objectives.records.some((record) => record.id === draft.objective) && <option value={draft.objective}>Current objective unavailable</option>}</select>{objectives.degraded && <p className="text-xs text-muted-foreground">Objectives are unavailable; the current link is retained.</p>}</div>
                    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => { if (draft.body.trim()) setReplace(true); else setDraft((before) => ({ ...before, body: contentOutline(before) })); }}>Create outline</Button><Button type="button" size="sm" variant="secondary" aria-pressed={preview} onClick={() => setPreview((value) => !value)}>{preview ? 'Edit copy' : 'Preview copy'}</Button></div>
                    {replace && <div className="space-y-3 rounded-md border border-border p-3"><p className="text-sm">Replace the current body with a new outline? Your saved copy is unchanged until you save.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => { setDraft((before) => ({ ...before, body: contentOutline(before) })); setReplace(false); }}>Replace current text</Button><Button type="button" size="sm" variant="ghost" onClick={() => setReplace(false)}>Keep draft</Button></div></div>}
                    {preview ? <MotionEntrance as="section" category="community" aria-label="Draft preview" className="rounded-md border border-border p-4"><StructuredContent body={draft.body} />{!draft.body.trim() && <p className="text-sm text-muted-foreground">Add copy to preview it.</p>}</MotionEntrance> : field('body', 'Draft body', 5000, true)}
                    <p className="text-xs leading-6 text-muted-foreground">Use # headings, blank lines, - bullets and numbered lists. Replace outline prompts and verify claims before requesting review.</p>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <div className="flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" size="sm">{busy ? 'Saving…' : 'Save draft'}</Button></div>
                </fieldset></form>
            </div>
        </DialogContent></Dialog>}
        {detail && <Dialog open onOpenChange={(open) => { if (!open && !busy) setDetail(null); }}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto" data-dd-privacy="mask" onCloseAutoFocus={closeFocus}>
            <div className="ph-no-capture space-y-5"><DialogHeader><DialogTitle>{detail.title}</DialogTitle><DialogDescription>{CONTENT_STATUSES[detail.status] || detail.status} · {CONTENT_FORMATS[detail.format] || 'Social post'}</DialogDescription></DialogHeader>
                <p className="text-sm leading-6">Audience: {detail.audience || 'Not recorded yet.'}</p>
                {detail.brief && <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">Brief: {detail.brief}</p>}
                <section aria-label="Saved content preview" className="rounded-md border border-border p-4"><StructuredContent body={detail.body} />{!detail.body && <p className="text-sm text-muted-foreground">This draft has no body yet.</p>}</section>
                {detail.reviewed_at && <Card className="space-y-2 p-4"><h3 className="font-display text-lg">Saved review</h3><p className="text-xs text-muted-foreground">Recorded {detail.reviewed_at}</p><p className="whitespace-pre-wrap text-sm leading-6">{detail.review_note}</p></Card>}
                {detail.status === 'published' && <div className="space-y-2 text-sm">{publicationUrl(detail.published_url) ? <><a href={publicationUrl(detail.published_url)} target="_blank" rel="noreferrer" className="break-all text-primary underline">Open recorded publication<span className="sr-only"> (opens in a new tab)</span></a><p className="text-xs text-muted-foreground">Receipt recorded {detail.published_at || 'at an unavailable time'}; this does not establish external delivery time.</p></> : <p>This legacy published state has no publication receipt from the content desk.</p>}</div>}
                {saved && <p role="status" className="text-sm text-success">{saved}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <fieldset disabled={busy || demo} className="min-w-0 space-y-4">
                    {detail.status === 'draft' && <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => begin(detail, opener.current)}>Edit draft</Button><Button size="sm" onClick={() => transition({ status: 'awaiting_approval' })}>Request review</Button></div>}
                    {detail.status === 'awaiting_approval' && <div className="space-y-3"><h3 className="font-display text-lg font-semibold">Review this saved copy</h3><p className="text-xs text-muted-foreground">Approval requires a current workspace owner or admin. Record what you actually checked.</p>{Object.entries(reviewLabels).map(([name, label]) => <label key={name} className="flex items-start gap-3 py-1 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={checks[name] === true} onChange={(event) => setChecks((before) => ({ ...before, [name]: event.target.checked }))} /><span>{label}</span></label>)}<Label htmlFor="content-review-note">Review note</Label><Textarea id="content-review-note" value={note} maxLength={1200} rows={3} onChange={(event) => setNote(event.target.value)} /><Button size="sm" disabled={!Object.keys(reviewLabels).every((name) => checks[name]) || !note.trim()} onClick={() => transition({ status: 'approved', review_checks: checks, review_note: note.trim() })}>Approve reviewed copy</Button></div>}
                    {['approved', 'scheduled'].includes(detail.status) && (detail.reviewed_at && detail.reviewed_by ? <div className="space-y-4"><div className="space-y-2"><Label htmlFor="content-planned-date">Planned publication date</Label><Input id="content-planned-date" type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /><Button size="sm" variant="secondary" disabled={!plannedDate} onClick={() => transition({ status: 'scheduled', scheduled_for: `${plannedDate} 12:00:00.000Z` })}>Save publication plan</Button><p className="text-xs text-muted-foreground">This saves a date; it does not schedule an external job.</p></div><div className="space-y-2"><Label htmlFor="content-publication-url">Checked publication URL</Label><Input id="content-publication-url" type="url" placeholder="https://…" value={url} maxLength={2048} onChange={(event) => setUrl(event.target.value)} /><Button size="sm" disabled={!publicationUrl(url)} onClick={() => transition({ status: 'published', published_url: publicationUrl(url) })}>Record publication</Button><p className="text-xs text-muted-foreground">An owner or admin records a URL after checking the authorized publication.</p></div></div> : <p className="text-sm text-muted-foreground">This state has no saved review receipt. Return to draft and request review before proceeding.</p>)}
                    {['awaiting_approval', 'approved', 'scheduled', 'failed'].includes(detail.status) && <Button size="sm" variant="secondary" onClick={() => transition({ status: 'draft' })}>Return to draft</Button>}
                    <Button size="sm" variant="ghost" onClick={() => begin(detail, opener.current, true)}>Copy to a new draft</Button>
                </fieldset>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDetail(null)}>Close content</Button>
            </div>
        </DialogContent></Dialog>}
    </div>;
}

/** @returns {React.ReactElement} Workspace content desk, reset on account/workspace/demo changes. */
export default function ContentStudio() {
    const { active } = useWorkspace();
    const { user } = useAuth();
    const { demo } = useDemoMode();
    return active && user?.id ? <Studio key={`${user.id}:${active.id}:${demo}`} accountId={user.id} demo={demo} /> : <p>Select a workspace to manage content.</p>;
}
