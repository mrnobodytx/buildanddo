// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/components/workspace/GuildPublicationsPanel.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/web/src/lib/guildPublications.js, apps/web/src/data/personas.js, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/guildPublications.js; CONSUMES apps/web/src/data/personas.js; CONSUMES apps/web/src/components/workspace/ControlPrimitives.jsx; CONSUMED_BY apps/web/src/pages/workspace/AdminPage.jsx
// Intent:      Let workspace owners and administrators see what each guildmaster published and withdraw it with a recorded note.
// ----------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/site/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageControls, controlInput, dateLabel } from '@/components/workspace/ControlPrimitives';
import { personaBySlug } from '@/data/personas';
import pb from '@/lib/pocketbaseClient';
import { list, withdraw } from '@/lib/guildPublications';

const KIND_NAMES = { daily_edition: 'Daily Edition', social_content: 'Social content', forum_topic: 'Forum topic', forum_reply: 'Forum reply',
    wiki_page: 'Wiki page', guild_lesson: 'Guild lesson' };
// What withdrawal leaves behind. Nothing is deleted; the record and both audit rows are retained.
const OUTCOMES = { daily_edition: 'marked withdrawn', social_content: 'marked withdrawn', forum_topic: 'hidden from members',
    forum_reply: 'hidden from members', wiki_page: 'archived', guild_lesson: 'marked withdrawn and can no longer be shared into a class' };
const STATES = { published: 'Published', withdrawn: 'Withdrawn', open: 'Open', locked: 'Locked', visible: 'Visible', hidden: 'Hidden',
    archived: 'Archived', draft: 'Draft', pending: 'Pending', unavailable: 'No longer available' };

/** @param {{workspaceId: string, canAdmin: boolean, client?: object, keyFactory?: Function}} props */
export default function GuildPublicationsPanel({ workspaceId, canAdmin, client = pb, keyFactory }) {
    const scope = `${workspaceId || ''}:${canAdmin}`;
    const live = useRef({ scope, mounted: true }); live.current.scope = scope;
    const [page, setPage] = useState(1);
    const [view, setView] = useState({ scope: '', loading: true, items: [], has_more: false, error: '' });
    const [selected, setSelected] = useState(null);
    const [note, setNote] = useState('');
    const [write, setWrite] = useState({ saving: false, error: '', uncertain: false, reason: '' });
    const [notice, setNotice] = useState('');
    const load = useCallback(async () => {
        if (!canAdmin || !workspaceId) return;
        setView((before) => ({ ...before, scope, loading: true, error: '' }));
        const result = await list(client, workspaceId, page);
        if (!live.current.mounted || live.current.scope !== scope) return;
        setView(result.ok ? { scope, loading: false, items: result.items, has_more: result.has_more, error: '' } :
            { scope, loading: false, items: [], has_more: false, error: result.error });
    }, [canAdmin, client, page, scope, workspaceId]);
    useEffect(() => { live.current.mounted = true; load(); return () => { live.current.mounted = false; }; }, [load]);
    if (!canAdmin) return null;
    const open = (item) => { setSelected(item); setNote(''); setNotice(''); setWrite({ saving: false, error: '', uncertain: false, reason: '' }); };
    const close = () => { if (!write.saving && !write.uncertain) setSelected(null); };
    const submit = async (event) => {
        event.preventDefault();
        setWrite((before) => ({ ...before, saving: true, error: '' }));
        const result = await withdraw(client, workspaceId, { kind: selected.kind, target: selected.target, revision: selected.target_revision, note },
            ...(keyFactory ? [keyFactory] : []));
        if (!live.current.mounted || live.current.scope !== scope) return;
        if (result.ok) {
            setWrite({ saving: false, error: '', uncertain: false, reason: '' }); setSelected(null);
            setNotice(`${KIND_NAMES[selected.kind]} withdrawn${result.replayed ? ' (recovered the saved result)' : ''}.`);
            load();
            return;
        }
        setWrite({ saving: false, error: result.error, uncertain: Boolean(result.uncertain), reason: result.reason });
    };
    const current = view.scope === scope ? view : { loading: true, items: [], has_more: false, error: '' };
    return <section className="space-y-4" aria-labelledby="guild-publications-heading">
        <h3 id="guild-publications-heading" className="font-display text-lg font-semibold">Guild publications</h3>
        <p className="text-sm text-muted-foreground">Guildmaster seats publish their own work directly. Each publication and each withdrawal is recorded here. Withdrawing keeps the record and asks for a note.</p>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {current.loading && <p role="status" className="text-sm text-muted-foreground">Loading guild publications…</p>}
        {!current.loading && current.error && <p role="alert" className="text-sm text-destructive">{current.error}</p>}
        {!current.loading && !current.error && !current.items.length && <p className="text-sm text-muted-foreground">No guild publications on this page.</p>}
        <ol className="space-y-3" aria-label="Guild publications">{current.items.map((item) => <li key={item.id} className="space-y-1 rounded-md border border-border p-4">
            <p className="break-words text-sm font-semibold">{item.title || 'Untitled'}</p>
            <p className="text-xs text-muted-foreground">{personaBySlug(item.persona)?.name || 'Unknown guildmaster'} · {KIND_NAMES[item.kind]} · {item.action === 'published' ? 'Published' : 'Withdrawn by an owner or administrator'} · {dateLabel(item.created)}</p>
            <p className="text-xs text-muted-foreground">Current state: {STATES[item.target_status] || item.target_status}</p>
            {item.note && <p className="break-words text-xs">Note: {item.note}</p>}
            {item.withdrawable && <Button size="sm" variant="secondary" onClick={() => open(item)}>Withdraw</Button>}
        </li>)}</ol>
        <PageControls label="Guild publications" page={page} hasMore={current.has_more} onPage={setPage} disabled={current.loading || write.saving} />
        <Dialog open={Boolean(selected)} onOpenChange={(value) => { if (!value) close(); }}>
            <DialogContent>
                <form className="space-y-4" onSubmit={submit}>
                    <DialogHeader><DialogTitle>Withdraw guild publication</DialogTitle>
                        <DialogDescription>{selected ? `${selected.title || 'This publication'} will be ${OUTCOMES[selected.kind]}. Both audit rows are kept.` : ''}</DialogDescription></DialogHeader>
                    <label htmlFor="guild-withdraw-note" className="block text-sm font-medium">Reason for withdrawal</label>
                    <textarea id="guild-withdraw-note" required rows={3} maxLength={800} className={controlInput} value={note}
                        disabled={write.saving || write.uncertain} onChange={(event) => setNote(event.target.value)} />
                    {write.error && <p role="alert" className="text-sm text-destructive">{write.uncertain ? `${write.error} The note is kept so the retry is the same request.` : write.error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="secondary" disabled={write.saving || write.uncertain} onClick={close}>Cancel</Button>
                        <Button type="submit" disabled={write.saving || !note.trim() || write.reason === 'forbidden'}>{write.uncertain ? 'Retry withdrawal' : 'Withdraw'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    </section>;
}
