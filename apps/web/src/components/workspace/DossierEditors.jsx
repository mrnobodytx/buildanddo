// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/DossierEditors.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/privateDossier.js, apps/web/src/components/ui/dialog.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/privateDossier.js; CONSUMES apps/web/src/components/ui/dialog.jsx
// DAG Node:    none
// Intent:      Let account owners explicitly save, correct and remove entity notes through accessible privacy-masked dialogs.
// ───────────────────────────────────────────────────────────────

import React, { useId, useState } from 'react';
import { Button } from '@/components/site/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { controlInput } from '@/components/workspace/ControlPrimitives';
import { ENTITY_KINDS } from '@/lib/privateDossier';

function Field({ label, name, value, onChange, maximum, required = false, multiline = false }) {
    const unique = useId(); const id = `${unique}-${name}`; const Input = multiline ? 'textarea' : 'input';
    return <div className="space-y-1.5"><label htmlFor={id} className="block text-sm font-medium">{label}</label>
        <Input id={id} name={name} className={`${controlInput} ${multiline ? 'min-h-28 resize-y' : ''}`} value={value}
            onChange={(event) => onChange(event.target.value)} maxLength={maximum} required={required} autoComplete="off" />
    </div>;
}
function SourceFields({ value, set }) {
    return <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source label (optional)" name="source-label" value={value.source_label} onChange={(text) => set('source_label', text)} maximum={160} />
        <Field label="Public HTTPS source (optional)" name="source-url" value={value.source_url} onChange={(text) => set('source_url', text)} maximum={2048} />
    </div>;
}
function Feedback({ control }) {
    return <div aria-live="polite" className="space-y-2">
        {control.writeError && <p role="alert" className="text-sm text-destructive">{control.writeError}</p>}
        {control.uncertain && <Button type="button" variant="secondary" disabled={control.saving} onClick={control.retry}>Recover previous save</Button>}
    </div>;
}
function EntityForm({ entity, control, onSaved }) {
    const [value, setValue] = useState({ label: entity?.label || '', kind: entity?.kind || 'topic',
        aliases: entity?.aliases.join(', ') || '', tags: entity?.tags.join(', ') || '', note: '', source_url: '', source_label: '' });
    const set = (key, text) => setValue((old) => ({ ...old, [key]: text }));
    const kindId = useId();
    const submit = async (event) => {
        event.preventDefault();
        const split = (text) => text.split(',').map((item) => item.trim()).filter(Boolean);
        const labels = { label: value.label, kind: value.kind, aliases: split(value.aliases), tags: split(value.tags) };
        const result = await control.command(entity ? 'entity.update' : 'entity.create', entity ? { id: entity.id, ...labels } :
            { ...labels, note: value.note, source_url: value.source_url, source_label: value.source_label }, entity?.revision || 0);
        if (result.ok) onSaved(result.result.id);
    };
    return <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={control.saving || control.uncertain} className="space-y-4">
            <Field label="Entity name" name="entity-name" value={value.label} onChange={(text) => set('label', text)} maximum={160} required />
            <div className="space-y-1.5"><label htmlFor={kindId} className="text-sm font-medium">Entity kind</label>
                <select id={kindId} className={controlInput} value={value.kind} onChange={(event) => set('kind', event.target.value)}>
                    {Object.entries(ENTITY_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select></div>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Aliases (up to 10, comma separated)" name="aliases" value={value.aliases} onChange={(text) => set('aliases', text)} maximum={1210} />
                <Field label="Tags (up to 10, comma separated)" name="tags" value={value.tags} onChange={(text) => set('tags', text)} maximum={410} />
            </div>
            {!entity && <><Field label="First note" name="first-note" value={value.note} onChange={(text) => set('note', text)} maximum={2000} required multiline />
                <SourceFields value={value} set={set} /></>}
            <Button type="submit">{control.saving ? 'Saving…' : entity ? 'Save entity details' : 'Save entity'}</Button>
        </fieldset>
        <Feedback control={control} />
    </form>;
}

/** Open a private entity creation or correction dialog.
 * @param {object} props Saved entity, current control and completion callback.
 * @returns {React.ReactElement} A keyboard-accessible editor with native dialog focus handling.
 */
export function EntityEditor({ entity = null, control, onSaved = () => {} }) {
    const [open, setOpen] = useState(false);
    return <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button type="button" variant="secondary" disabled={control.saving || control.uncertain}>
            {entity ? 'Edit entity details' : 'Add entity'}</Button></DialogTrigger>
        <DialogContent className="ph-no-capture max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-dd-privacy="hidden" data-dd-action-name="Private dossier interaction">
            <DialogHeader><DialogTitle>{entity ? 'Correct entity details' : 'Remember an entity'}</DialogTitle>
                <DialogDescription>Saved to your personal dossier. Equal names remain separate entities; aliases improve recall.</DialogDescription></DialogHeader>
            <EntityForm entity={entity} control={control} onSaved={(id) => { setOpen(false); onSaved(id); }} />
        </DialogContent>
    </Dialog>;
}
function NoteForm({ entity, note, control, done }) {
    const [value, setValue] = useState({ text: note?.text || '', source_label: note?.source_label || '', source_url: note?.source_url || '' });
    const set = (key, text) => setValue((old) => ({ ...old, [key]: text }));
    const submit = async (event) => {
        event.preventDefault();
        const result = await control.command(note ? 'note.update' : 'note.add', { id: entity.id,
            ...(note ? { note_id: note.id } : {}), ...value }, entity.revision);
        if (result.ok) done();
    };
    return <form onSubmit={submit} className="space-y-4"><fieldset disabled={control.saving || control.uncertain} className="space-y-4">
        <Field label="Note text" name="note-text" value={value.text} onChange={(text) => set('text', text)} maximum={2000} required multiline />
        <SourceFields value={value} set={set} /><Button type="submit">{control.saving ? 'Saving…' : note ? 'Save corrected note' : 'Save note'}</Button>
    </fieldset><Feedback control={control} /></form>;
}

/** Add or correct an explicit dated note without retaining its old text in audit receipts.
 * @param {object} props Saved entity, optional note and command control.
 * @returns {React.ReactElement} A private note editor.
 */
export function NoteEditor({ entity, note = null, control }) {
    const [open, setOpen] = useState(false);
    return <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button type="button" variant="secondary" disabled={control.saving || control.uncertain || (!note && entity.notes.length >= 20)}>
            {note ? 'Correct note' : 'Add note'}</Button></DialogTrigger>
        <DialogContent className="ph-no-capture max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-dd-privacy="hidden" data-dd-action-name="Private dossier interaction">
            <DialogHeader><DialogTitle>{note ? 'Correct a saved note' : 'Add a note'}</DialogTitle>
                <DialogDescription>{entity.label} · Revision {entity.revision}. Record what you know and where it came from.</DialogDescription></DialogHeader>
            <NoteForm entity={entity} note={note} control={control} done={() => setOpen(false)} />
        </DialogContent>
    </Dialog>;
}

/** Require an explicit review before removing personal content at a saved revision.
 * @param {object} props Saved entity, optional note, control and deletion callback.
 * @returns {React.ReactElement} A private deletion confirmation dialog.
 */
export function ForgetEntity({ entity, note = null, control, onDeleted = () => {} }) {
    const [open, setOpen] = useState(false); const [confirmation, setConfirmation] = useState('');
    const remove = async (event) => {
        event.preventDefault(); if (confirmation !== entity.label) return;
        const result = await control.command(note ? 'note.delete' : 'entity.delete', { id: entity.id, ...(note ? { note_id: note.id } : {}) }, entity.revision);
        if (result.ok) { setOpen(false); onDeleted(); }
    };
    return <Dialog open={open} onOpenChange={(value) => { setConfirmation(''); setOpen(value); }}>
        <DialogTrigger asChild><Button type="button" variant="secondary" disabled={control.saving || control.uncertain}>{note ? 'Remove note' : 'Forget entity'}</Button></DialogTrigger>
        <DialogContent className="ph-no-capture max-h-[90dvh] overflow-y-auto" data-dd-privacy="hidden" data-dd-action-name="Private dossier interaction">
            <DialogHeader><DialogTitle>{note ? 'Remove this note' : 'Forget this entity'}</DialogTitle>
                <DialogDescription>This removes {note ? 'the selected note' : 'the entity and all its notes'} from your dossier. Content-free receipts remain to prevent duplicate retries. Server backup retention is managed separately.</DialogDescription></DialogHeader>
            <p className="break-words text-sm">Type <strong>{entity.label}</strong> to confirm revision {entity.revision}.</p>
            <form onSubmit={remove} className="space-y-4">
                <Field label="Confirm entity name" name="confirmation" value={confirmation} onChange={setConfirmation} maximum={160} required />
                <div className="flex flex-wrap gap-3"><Button type="submit" disabled={control.saving || control.uncertain || confirmation !== entity.label}>
                    {control.saving ? 'Removing…' : note ? 'Confirm note removal' : 'Confirm entity deletion'}</Button>
                    <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
                <Feedback control={control} />
            </form>
        </DialogContent>
    </Dialog>;
}
