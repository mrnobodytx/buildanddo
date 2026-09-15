// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/ForumsPage.jsx
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
// Intent:      Connect workspace discussion, replies and explicit moderation to persisted records and current member permissions.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { ControlState, ControlFeedback, PageControls, FeatureDisabled, PlainArticle, controlInput, dateLabel, focusPendingRetry } from '@/components/workspace/ControlPrimitives';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';

function Moderation({ record, kind, control }) {
    const [status, setStatus] = useState(kind === 'reply' ? 'visible' : record.status === 'open' ? 'locked' : 'open');
    const [note, setNote] = useState(''); const disabled = control.saving || control.uncertain;
    return <details className="rounded-md border border-border p-3"><summary className="cursor-pointer py-2 text-sm font-medium">Moderate {kind}</summary>
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); control.mutate('forum.moderate', { kind, id: record.id, status, note }, record.revision); }}>
            <label className="block text-sm" htmlFor={`moderation-state-${record.id}`}>Moderation outcome</label>
            <select id={`moderation-state-${record.id}`} className={controlInput} value={status} disabled={disabled} onChange={(e) => setStatus(e.target.value)}>
                {(kind === 'reply' ? ['visible', 'hidden'] : ['open', 'locked', 'hidden']).map((value) => <option key={value} value={value}>{value === 'open' ? 'Approve / open discussion' : value === 'visible' ? 'Approve reply' : value === 'locked' ? 'Lock replies' : 'Hide from members'}</option>)}
            </select>
            <label htmlFor={`moderation-note-${record.id}`} className="block text-sm">Reason for moderation</label>
            <textarea id={`moderation-note-${record.id}`} required maxLength={800} rows={2} className={controlInput} value={note} disabled={disabled} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit" size="sm" disabled={disabled}>Save moderation decision</Button>
        </form>
    </details>;
}

function TopicForm({ control, onClose }) {
    const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const disabled = control.saving || control.uncertain;
    return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); control.mutate('forum.create', { title, body }, 0); }}>
        <div><label htmlFor="topic-title" className="mb-1 block text-sm">Topic title</label><input id="topic-title" required maxLength={160} className={controlInput} value={title} disabled={disabled} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label htmlFor="topic-body" className="mb-1 block text-sm">Discussion</label><textarea id="topic-body" required maxLength={8000} rows={8} className={controlInput} value={body} disabled={disabled} onChange={(e) => setBody(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">{control.data.settings.forum_moderation ? 'Editor submissions wait for an administrator to approve them.' : 'Editor submissions are visible to workspace members immediately.'}</p>
        <ControlFeedback control={control} />
        <DialogFooter><Button type="button" variant="secondary" disabled={control.saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={disabled}>Submit topic</Button></DialogFooter>
    </form>;
}

function Replies({ control, onPage }) {
    const [body, setBody] = useState(''); const { data } = control; const disabled = control.saving || control.uncertain;
    const submit = async (e) => { e.preventDefault(); const result = await control.mutate('forum.reply', { topic: data.topic.id, body }, data.topic.revision); if (result.ok) onPage(1); };
    return <div className="space-y-5">
        <ControlFeedback control={control} />
        <Card className="space-y-4 p-5"><div><h2 className="break-words font-display text-2xl font-semibold">{data.topic.title}</h2>
            <p className="mt-1 break-all text-xs capitalize text-muted-foreground">{data.topic.status} · {data.topic.owner} · {dateLabel(data.topic.created)}</p></div>
            <PlainArticle text={data.topic.body} />
            {data.topic.moderation_note && <p className="text-sm text-muted-foreground">Moderator note: {data.topic.moderation_note}</p>}
            {data.can_admin && <Moderation record={data.topic} kind="topic" control={control} />}
        </Card>
        <h3 className="font-display text-xl font-semibold">Replies</h3>
        <ol className="space-y-4" aria-label="Discussion replies">{data.items.map((reply) => <li key={reply.id}><Card className="space-y-3 p-5">
            <p className="break-all text-xs capitalize text-muted-foreground">{reply.status} · {reply.owner} · {dateLabel(reply.created)}</p>
            <PlainArticle text={reply.body} />
            {reply.moderation_note && <p className="text-sm text-muted-foreground">Moderator note: {reply.moderation_note}</p>}
            {data.can_admin && <Moderation record={reply} kind="reply" control={control} />}
        </Card></li>)}</ol>
        {!data.items.length && <p className="text-sm text-muted-foreground">No replies visible on this page.</p>}
        <PageControls label="Replies" page={data.page} hasMore={data.has_more} onPage={onPage} disabled={disabled} />
        {data.can_write && data.topic.status === 'open' ? <form className="space-y-3" onSubmit={submit}>
            <label htmlFor="forum-reply" className="block text-sm font-medium">Your reply</label>
            <textarea id="forum-reply" required maxLength={8000} rows={4} className={controlInput} disabled={disabled} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">{data.settings.forum_moderation ? 'Editor replies wait for moderation.' : 'Replies are shared with workspace members.'}</p>
            <Button type="submit" disabled={disabled}>Submit reply</Button>
        </form> : <p className="text-sm text-muted-foreground">{data.can_write ? 'Replies are closed while this topic is pending, locked or hidden.' : 'Your current role has read access to discussions.'}</p>}
    </div>;
}

function Thread({ id, onBack }) {
    const [page, setPage] = useState(1); const control = useWorkspaceControl(`forums/${id}`, { page });
    return <div className="space-y-5"><Button variant="secondary" size="sm" disabled={control.saving || control.uncertain} onClick={onBack}>Back to discussions</Button>
        <ControlState control={control}>{control.data && <Replies key={`${control.scope}:${id}`} control={control} onPage={setPage} />}</ControlState>
    </div>;
}

function ForumDesk({ control, onPage }) {
    const [creating, setCreating] = useState(false); const [thread, setThread] = useState(''); const { data } = control; const disabled = control.saving || control.uncertain;
    if (!data.enabled) return <FeatureDisabled feature="forum" admin={data.can_admin} />;
    if (thread) return <Thread key={thread} id={thread} onBack={() => { setThread(''); control.refresh(); }} />;
    return <div className="space-y-5">
        <p className="text-sm text-muted-foreground">Discuss the work with your team. Pending contributions are visible to their author and moderators.</p>
        {data.can_write && <Button disabled={disabled} onClick={() => setCreating(true)}>New discussion</Button>}
        <ControlFeedback control={control} />
        <ol className="space-y-4" aria-label="Discussions">{data.items.map((record) => <li key={record.id}><Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-display text-xl font-semibold">{record.title}</h2>
                <span className="rounded border border-border px-2 py-1 text-xs capitalize">{record.status}</span></div>
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{record.body}</p>
            <p className="break-all text-xs text-muted-foreground">{record.owner} · {dateLabel(record.created)}</p>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setThread(record.id)}>Open discussion</Button>
        </Card></li>)}</ol>
        {!data.items.length && <p className="text-sm text-muted-foreground">No discussions visible on this page.</p>}
        <PageControls label="Discussions" page={data.page} hasMore={data.has_more} onPage={onPage} disabled={disabled} />
        <Dialog open={creating} onOpenChange={(open) => { if (!control.saving) setCreating(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={(event) => { if (control.uncertain) focusPendingRetry(event); }}>
            <DialogHeader><DialogTitle>New discussion</DialogTitle></DialogHeader><TopicForm control={control} onClose={() => setCreating(false)} />
        </DialogContent></Dialog>
    </div>;
}

export default function ForumsPage() {
    const [page, setPage] = useState(1); const control = useWorkspaceControl('forums', { page });
    return <div className="ph-no-capture space-y-6" data-dd-privacy="mask"><PageHeader title="Workspace forum" description="Team discussion with explicit review, replies and moderation." />
        <ControlState control={control}>{control.data && <ForumDesk key={control.scope} control={control} onPage={setPage} />}</ControlState>
    </div>;
}
