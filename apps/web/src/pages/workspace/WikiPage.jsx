// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/WikiPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceControl.js, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceControl.js; CONSUMES apps/web/src/components/workspace/ControlPrimitives.jsx
// DAG Node:    none
// Intent:      Make persisted wiki drafting, safe reading and administrator publication available inside the workspace.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { ControlState, ControlFeedback, PageControls, FeatureDisabled, PlainArticle, controlInput, dateLabel, focusPendingRetry } from '@/components/workspace/ControlPrimitives';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';
import { useAuth } from '@/contexts/AuthContext';

const EMPTY = { id: '', title: '', slug: '', body: '', revision: 0 };

function WikiEditor({ record, control, onClose }) {
    const [form, setForm] = useState({ title: record.title, slug: record.slug, body: record.body });
    const [preview, setPreview] = useState(false);
    const disabled = control.saving || control.uncertain;
    return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); control.mutate('wiki.save', { id: record.id, ...form }, record.revision); }}>
        <fieldset disabled={disabled} className="space-y-4"><legend className="sr-only">Wiki draft</legend>
            <div><label htmlFor="wiki-title" className="mb-1 block text-sm">Page title</label><input id="wiki-title" required maxLength={160} className={controlInput}
                value={form.title} onChange={(e) => setForm((old) => ({ ...old, title: e.target.value }))} /></div>
            <div><label htmlFor="wiki-slug" className="mb-1 block text-sm">Page name</label><input id="wiki-slug" required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={controlInput}
                value={form.slug} onChange={(e) => setForm((old) => ({ ...old, slug: e.target.value }))} aria-describedby="wiki-slug-help" />
                <p id="wiki-slug-help" className="mt-1 text-xs text-muted-foreground">A unique name such as onboarding-guide.</p></div>
            <div><label htmlFor="wiki-body" className="mb-1 block text-sm">Page content</label><textarea id="wiki-body" required maxLength={16000} rows={10} className={controlInput}
                value={form.body} onChange={(e) => setForm((old) => ({ ...old, body: e.target.value }))} aria-describedby="wiki-body-help" />
                <p id="wiki-body-help" className="mt-1 text-xs text-muted-foreground">Use blank lines between paragraphs. Content is displayed as text; HTML is not executed.</p></div>
        </fieldset>
        <Button type="button" variant="secondary" size="sm" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Preview page'}</Button>
        {preview && <Card className="space-y-3 p-4"><h3 className="font-display text-xl font-semibold">{form.title || 'Untitled draft'}</h3><PlainArticle text={form.body} /></Card>}
        <ControlFeedback control={control} />
        <DialogFooter><Button type="button" variant="secondary" disabled={control.saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={disabled}>Save wiki draft</Button></DialogFooter>
    </form>;
}

function WikiDesk({ control, onPage }) {
    const { user } = useAuth(); const [editing, setEditing] = useState(null); const [reading, setReading] = useState(null);
    const { data } = control; const disabled = control.saving || control.uncertain;
    if (!data.enabled) return <FeatureDisabled feature="wiki" admin={data.can_admin} />;
    const transition = (record, status) => control.mutate('wiki.transition', { id: record.id, status }, record.revision);
    return <div className="space-y-5">
        <p className="text-sm text-muted-foreground">Published pages are visible to workspace members. Drafts stay with their author and moderators until an administrator publishes them.</p>
        {data.can_write && <Button disabled={disabled} onClick={() => setEditing(EMPTY)}>New wiki page</Button>}
        <ControlFeedback control={control} />
        <div className="grid gap-4 md:grid-cols-2">{data.items.map((record) => <Card key={record.id} className="min-w-0 space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-display text-xl font-semibold">{record.title}</h2>
                <span className="rounded border border-border px-2 py-1 text-xs capitalize">{record.status}</span></div>
            <p className="break-all font-evidence text-xs text-muted-foreground">{record.slug} · revision {record.revision}</p>
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{record.body}</p>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={disabled} onClick={() => setReading(record)}>Read page</Button>
                {data.can_write && record.status === 'draft' && (data.can_admin || record.owner === user?.id) && <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setEditing(record)}>Edit draft</Button>}
                {data.can_admin && record.status === 'draft' && <Button size="sm" disabled={disabled} onClick={() => transition(record, 'published')}>Publish to workspace</Button>}
                {data.can_admin && record.status !== 'draft' && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => transition(record, 'draft')}>Return to draft</Button>}
                {data.can_admin && record.status !== 'archived' && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => transition(record, 'archived')}>Archive page</Button>}
            </div>
        </Card>)}</div>
        {!data.items.length && <p className="text-sm text-muted-foreground">No wiki pages visible on this page.</p>}
        <PageControls label="Wiki" page={data.page} hasMore={data.has_more} onPage={onPage} disabled={disabled} />
        <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !control.saving) setEditing(null); }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={(event) => { if (control.uncertain) focusPendingRetry(event); }}><DialogHeader><DialogTitle>{editing?.id ? 'Edit wiki draft' : 'New wiki page'}</DialogTitle></DialogHeader>
                {editing && <WikiEditor record={editing} control={control} onClose={() => setEditing(null)} />}
            </DialogContent>
        </Dialog>
        <Dialog open={Boolean(reading)} onOpenChange={(open) => { if (!open) setReading(null); }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{reading?.title}</DialogTitle></DialogHeader>
                {reading && <article className="space-y-4"><p className="text-xs capitalize text-muted-foreground">{reading.status} · Updated {dateLabel(reading.updated)}</p>
                    <PlainArticle text={reading.body} />{reading.published_by && <p className="break-all text-xs text-muted-foreground">Last publication: {dateLabel(reading.published_at)} by {reading.published_by}</p>}</article>}
            </DialogContent>
        </Dialog>
    </div>;
}

export default function WikiPage() {
    const [page, setPage] = useState(1); const control = useWorkspaceControl('wiki', { page });
    return <div className="ph-no-capture space-y-6" data-dd-privacy="mask"><PageHeader title="Workspace wiki" description="Write, review and share the team's working knowledge." />
        <ControlState control={control}>{control.data && <WikiDesk key={control.scope} control={control} onPage={setPage} />}</ControlState>
    </div>;
}
