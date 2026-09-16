// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/DossierPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/usePrivateDossier.js, apps/web/src/components/workspace/DossierEditors.jsx, apps/web/src/lib/privateDossier.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/usePrivateDossier.js; CONSUMES apps/web/src/components/workspace/DossierEditors.jsx; CONSUMES apps/web/src/lib/privateDossier.js
// DAG Node:    none
// Intent:      Make encrypted personal entity context, provenance, recall and corrections usable from the same account linked to Discord.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { controlInput, dateLabel, PageControls } from '@/components/workspace/ControlPrimitives';
import { EntityEditor, NoteEditor, ForgetEntity } from '@/components/workspace/DossierEditors';
import { usePrivateDossier } from '@/hooks/usePrivateDossier';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DOSSIER_ACTIONS, ENTITY_KINDS } from '@/lib/privateDossier';

function Profile({ dossier, control }) {
    const [about, setAbout] = useState(dossier.about); const id = useId();
    const save = async (event) => { event.preventDefault(); await control.command('dossier.update', { about }, dossier.revision); };
    return <details className="rounded border border-border p-4"><summary className="cursor-pointer font-medium">Personal context</summary>
        <form onSubmit={save} className="mt-4 space-y-3"><label htmlFor={id} className="block text-sm">Your goals and context (private)</label>
            <textarea id={id} maxLength={2000} value={about} onChange={(event) => setAbout(event.target.value)}
                className={`${controlInput} min-h-28 resize-y`} disabled={control.saving || control.uncertain} autoComplete="off" />
            <Button type="submit" variant="secondary" disabled={control.saving || control.uncertain || about === dossier.about}>Save personal context</Button>
        </form>
    </details>;
}
function History({ control }) {
    const [open, setOpen] = useState(false); const [page, setPage] = useState(1); const [state, setState] = useState({ data: null, error: '' });
    useEffect(() => {
        let current = true; setState({ data: null, error: '' });
        if (open) control.history(page).then((result) => {
            if (current) setState({ data: result.ok ? result.data : null, error: result.error || '' });
        });
        return () => { current = false; };
    }, [open, page, control.history, control.data?.dossier.revision]);
    return <details className="rounded border border-border p-4" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer font-medium">Change history</summary>
        {open && <div className="mt-4 space-y-3"><p className="text-sm text-muted-foreground">Receipts record the operation and date. They do not retain previous note text.</p>
            {state.error ? <p role="alert">{state.error}</p> : !state.data ? <p role="status">Loading history…</p> : <>
                {!state.data.items.length && <p className="text-sm">No saved changes yet.</p>}
                <ul className="divide-y divide-border">{state.data.items.map((item) => <li key={item.id} className="space-y-1 py-3 text-sm">
                    <p>{DOSSIER_ACTIONS[item.action]} · {item.origin} · {dateLabel(item.created)}</p>
                    <p className="break-all font-evidence text-xs text-muted-foreground">Record {item.target} · revision {item.revision}</p>
                </li>)}</ul>
                <PageControls page={page} hasMore={state.data.has_more} onPage={setPage} label="Dossier history" />
            </>}
        </div>}
    </details>;
}
function EntityDetail({ id, control, onClose }) {
    const [state, setState] = useState({ entity: null, error: '' });
    useEffect(() => {
        let current = true; setState({ entity: null, error: '' });
        control.detail(id).then((result) => { if (current) setState({ entity: result.ok ? result.data.entity : null,
            error: result.error || (!result.ok ? 'This entity is unavailable.' : '') }); });
        return () => { current = false; };
    }, [id, control.detail, control.data?.dossier.revision]);
    const entity = state.entity;
    return <Card role="region" aria-label="Selected private entity" className="min-w-0 space-y-5 p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="break-words font-display text-xl font-semibold">{entity?.label || 'Entity details'}</h2>
        <Button type="button" variant="secondary" onClick={onClose}>Close entity</Button></div>
        {state.error ? <p role="alert">{state.error}</p> : !entity ? <p role="status">Loading private notes…</p> : <>
            <p className="break-all text-xs text-muted-foreground">{ENTITY_KINDS[entity.kind]} · {entity.id} · revision {entity.revision}</p>
            {entity.aliases.length > 0 && <p className="break-words text-sm">Also known as: {entity.aliases.join(', ')}</p>}
            {entity.tags.length > 0 && <p className="break-words text-sm text-muted-foreground">Tags: {entity.tags.join(', ')}</p>}
            <div className="flex flex-wrap gap-3"><EntityEditor entity={entity} control={control} /><NoteEditor entity={entity} control={control} />
                <ForgetEntity entity={entity} control={control} onDeleted={onClose} /></div>
            <div className="space-y-4"><h3 className="font-display text-lg font-semibold">Saved notes ({entity.notes.length}/20)</h3>
                {!entity.notes.length && <p className="text-sm text-muted-foreground">No notes remain. Add a dated observation when you have one.</p>}
                {entity.notes.map((note) => <article key={note.id} className="min-w-0 space-y-3 border-t border-border pt-4">
                    <p className="whitespace-pre-wrap break-words text-sm leading-7">{note.text}</p>
                    <p className="text-xs text-muted-foreground">Saved from {note.origin} · {dateLabel(note.created)}
                        {note.corrected_via && ` · Corrected from ${note.corrected_via} ${dateLabel(note.updated)}`}</p>
                    {(note.source_label || note.source_url) && <p className="break-words text-sm">Source: {note.source_url ?
                        <a href={note.source_url} target="_blank" rel="noopener noreferrer" data-dd-action-name="Open dossier source" className="underline underline-offset-4">{note.source_label || note.source_url}</a> : note.source_label}</p>}
                    <div className="flex flex-wrap gap-3"><NoteEditor entity={entity} note={note} control={control} />
                        <ForgetEntity entity={entity} note={note} control={control} /></div>
                </article>)}
            </div>
        </>}
    </Card>;
}
function DossierDesk({ control, search, onSearch, page, onPage, selected, onSelect }) {
    const [draft, setDraft] = useState(search); const searchId = useId(); const data = control.data;
    return <div className="ph-no-capture min-w-0 space-y-6" data-dd-privacy="hidden" data-dd-action-name="Private dossier interaction">
        <PageHeader title="My dossier" description="Private entities and dated notes attached to your BuildAndDo identity. Available across your workspaces." />
        <div className="flex flex-wrap items-center gap-4 text-sm">
            <Link to="/app/settings#discord-account" className="underline underline-offset-4">Manage linked Discord account</Link>
            <Button type="button" variant="secondary" onClick={control.refresh} disabled={control.loading || control.saving}>Refresh dossier</Button>
        </div>
        <div aria-live="polite" className="space-y-3">
            {control.error && <p role="alert">{control.error}</p>}
            {control.writeError && <p role="alert">{control.writeError}</p>}
            {control.uncertain && <Button type="button" variant="secondary" onClick={control.retry} disabled={control.saving}>Recover previous save</Button>}
            {control.saved && <p role="status" className="text-sm">{DOSSIER_ACTIONS[control.saved.action]}. Refresh reads the current record; replaying a receipt cannot restore deleted content.</p>}
            {control.loading && <p role="status">Loading your private dossier…</p>}
        </div>
        {data && <>
            <Card className="space-y-3 p-4 sm:p-5"><p className="text-sm">Signed in as <strong>{control.user?.name || control.user?.email || 'your BuildAndDo account'}</strong>.</p>
                <p className="text-sm leading-6 text-muted-foreground">Content is encrypted on the server and private to your account. Workspace roles do not grant access to another person’s dossier. Save only the context you choose; Discord conversations are not collected automatically.</p>
                <Profile key={`${data.dossier.id}:${data.dossier.revision}`} dossier={data.dossier} control={control} />
            </Card>
            <section className="space-y-4" aria-label="Private entity recall">
                <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Entities ({data.entity_count}/200)</h2>
                    <EntityEditor control={control} onSaved={onSelect} /></div>
                <form onSubmit={(event) => { event.preventDefault(); onSearch(draft); }} className="space-y-2">
                    <label htmlFor={searchId} className="text-sm font-medium">Search names, aliases, tags and notes</label>
                    <div className="flex flex-col gap-3 sm:flex-row"><input id={searchId} className={`${controlInput} min-w-0 flex-1`} maxLength={200}
                        autoComplete="off" value={draft} onChange={(event) => setDraft(event.target.value)} />
                        <Button type="submit">Recall</Button><Button type="button" variant="secondary" onClick={() => { setDraft(''); onSearch(''); }}>Clear search</Button></div>
                </form>
                <p role="status" className="text-sm text-muted-foreground">{data.total} {data.total === 1 ? 'match' : 'matches'} · page {page}</p>
                {!data.items.length ? <p className="border border-dashed border-border p-5 text-sm">{search ? 'No saved entities match this search.' : 'Your dossier is empty. Add an entity and its first note.'}</p> :
                    <ul className="grid min-w-0 gap-4 md:grid-cols-2">{data.items.map((item) => <li key={item.id} className="min-w-0">
                        <Card className="h-full min-w-0 space-y-3 p-4"><h3 className="break-words font-display text-lg font-semibold">{item.label}</h3>
                            <p className="text-xs text-muted-foreground">{ENTITY_KINDS[item.kind]} · {item.note_count} notes · {dateLabel(item.updated)}</p>
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.excerpt}</p>
                            <Button type="button" variant="secondary" onClick={() => onSelect(item.id)} aria-label={`Open entity ${item.label}`} data-dd-action-name="Open private entity">Open entity</Button>
                        </Card>
                    </li>)}</ul>}
                <PageControls page={page} hasMore={data.has_more} onPage={onPage} label="Dossier entities" />
            </section>
            {selected && <EntityDetail key={selected} id={selected} control={control} onClose={() => onSelect('')} />}
            <History control={control} />
        </>}
    </div>;
}

function DossierSession() {
    const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
    const [params, setParams] = useSearchParams();
    const candidate = params.get('entity') || ''; const selected = /^[a-zA-Z0-9_-]{1,64}$/.test(candidate) ? candidate : '';
    const control = usePrivateDossier(search, page);
    const select = (id) => { const next = new URLSearchParams(params); if (id) next.set('entity', id); else next.delete('entity'); setParams(next, { replace: true }); };
    return <DossierDesk key={control.scope} control={control} search={search} page={page} onPage={setPage} selected={selected} onSelect={select}
        onSearch={(query) => { setSearch(query); setPage(1); }} />;
}

/** Render a fresh personal session before another account can reuse a private query.
 * @returns {React.ReactElement} The authenticated private entity workspace.
 */
export default function DossierPage() {
    const { user, isAuthed } = useAuth(); const { demo } = useDemoMode();
    return <DossierSession key={`${isAuthed ? user?.id || '' : ''}:${demo}`} />;
}
