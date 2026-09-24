// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/ClassroomsPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        BITS-CODEGEN, C-ONE (status link kept on the domain)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/hooks/useClassrooms.js, apps/web/src/lib/classrooms.js, apps/web/src/components/broadcast/LiveBroadcast.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useClassrooms.js; CONSUMES apps/web/src/lib/classrooms.js; CONSUMES apps/web/src/components/broadcast/LiveBroadcast.jsx
// DAG Node:    none
// Intent:      Let workspace members schedule, join and follow real shared lesson sessions with recoverable discussion and explicit media availability.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, Users } from 'lucide-react';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import LiveBroadcast from '@/components/broadcast/LiveBroadcast';
import ClassRecord from '@/components/broadcast/ClassRecord';
import AgentActivity from '@/components/broadcast/AgentActivity';
import { PageControls, controlInput, dateLabel } from '@/components/workspace/ControlPrimitives';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useClassrooms } from '@/hooks/useClassrooms';
import { classroomHref } from '@/lib/classrooms';
import { STATUS_PATH } from '@/lib/communityLinks';

const statusLabel = { scheduled: 'Scheduled', live: 'Live lesson', ended: 'Ended' };
const frozen = (control) => control.saving || control.uncertain || !control.connected;
const localTime = (value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    const time = new Date(value);
    return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function Feedback({ control }) {
    return <div className="space-y-2" aria-live="polite">
        {control.writeError && <p role="alert" className="text-sm text-destructive">{control.writeError}</p>}
        {control.uncertain && <Button type="button" variant="secondary" disabled={control.saving} onClick={control.retry}>Retry previous save</Button>}
        {control.saved && <p role="status" className="text-sm text-success">Classroom update saved.</p>}
    </div>;
}

function RoomEditor({ control, room, onClose }) {
    const [form, setForm] = useState({ title: room?.title || '', description: room?.description || '',
        tutorial: room?.tutorial || control.data.lessons.items[0]?.id || '', starts_at: localTime(room?.starts_at) });
    // A poll must not silently advance the revision under an open draft.
    const revision = useRef(room?.revision || 0);
    const previousSave = useRef(control.saved);
    const disabled = frozen(control);
    const change = (event) => setForm((old) => ({ ...old, [event.target.name]: event.target.value }));
    useEffect(() => {
        if (control.saved !== previousSave.current && control.saved?.action === 'room.update' && control.saved.id === room?.id) onClose();
        previousSave.current = control.saved;
    }, [control.saved, room?.id, onClose]);
    const save = async (event) => {
        event.preventDefault();
        const payload = { ...form, starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : '' };
        if (room) payload.id = room.id;
        await control.mutate(room ? 'room.update' : 'room.create', payload, revision.current);
    };
    return <form onSubmit={save} className="space-y-4">
        <fieldset disabled={disabled} className="space-y-4"><legend className="sr-only">Classroom details</legend>
            <div><label htmlFor="class-title" className="mb-1 block text-sm">Class title</label><input id="class-title" name="title" required maxLength={160} value={form.title} onChange={change} className={controlInput} /></div>
            <div><label htmlFor="class-description" className="mb-1 block text-sm">What will you work on?</label><textarea id="class-description" name="description" maxLength={2000} rows={3} value={form.description} onChange={change} className={controlInput} /></div>
            <div><label htmlFor="class-lesson" className="mb-1 block text-sm">Lesson</label><select id="class-lesson" name="tutorial" required value={form.tutorial} onChange={change} className={controlInput}>
                <option value="">Choose a lesson</option>{control.data.lessons.items.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select>
                {!control.data.lessons.items.length && <p className="mt-2 text-sm">No lessons are available for a class. Ask your workspace administrator to install the Field Manual catalogue.</p>}
                {control.data.lessons.has_more && <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 available lessons.</p>}
            </div>
            <div><label htmlFor="class-start" className="mb-1 block text-sm">Planned start (optional, your local time)</label><input id="class-start" name="starts_at" type="datetime-local" value={form.starts_at} onChange={change} className={controlInput} />
                <p className="mt-1 text-xs text-muted-foreground">The host starts the session. Setting a time does not automatically open the room.</p></div>
        </fieldset>
        <Feedback control={control} />
        {room && control.writeError && !control.uncertain && <Button type="button" variant="secondary" disabled={disabled} onClick={() => {
            revision.current = room.revision;
            setForm({ title: room.title, description: room.description, tutorial: room.tutorial, starts_at: localTime(room.starts_at) });
        }}>Use latest saved class details</Button>}
        <DialogFooter><Button type="button" variant="secondary" disabled={control.saving} onClick={onClose}>Close</Button><Button type="submit" disabled={disabled || !form.tutorial}>{room ? 'Save class details' : 'Schedule class'}</Button></DialogFooter>
    </form>;
}

function ClassroomList({ control, onPage, status, onStatus }) {
    const [creating, setCreating] = useState(false);
    const navigate = useNavigate(); const { data } = control;
    useEffect(() => {
        if (control.saved?.action === 'room.create') navigate(classroomHref(control.saved.id, data.workspace));
    }, [control.saved, navigate, data.workspace]);
    return <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div><label htmlFor="class-filter" className="mb-1 block text-sm">Show classes</label><select id="class-filter" className={controlInput} value={status} disabled={frozen(control)} onChange={(event) => onStatus(event.target.value)}>
                <option value="all">All classes</option><option value="scheduled">Scheduled</option><option value="live">Live now</option><option value="ended">Ended</option></select></div>
            {data.can_host && <Button disabled={frozen(control)} onClick={() => setCreating(true)}>Schedule a class</Button>}
        </div>
        {!data.can_host && <p className="text-sm text-muted-foreground">Your viewer seat can join and follow lessons. An editor or administrator can host a class.</p>}
        <Feedback control={control} />
        {!data.items.length && <Card className="space-y-3 p-6"><h2 className="font-display text-xl font-semibold">No classes here yet</h2><p className="text-sm text-muted-foreground">{status === 'all' ? 'Schedule the first class, or ask an editor in your workspace to host one.' : 'There are no classes matching this filter on this page.'}</p><Link className="text-sm underline underline-offset-4" to="/app/tutorials">Read the Field Manual while you wait</Link></Card>}
        <ul className="grid gap-4 md:grid-cols-2">{data.items.map((room) => <li key={room.id} className="min-w-0"><Card className="flex h-full flex-col gap-3 p-5">
            <div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-primary">{statusLabel[room.status]}</span><span className="text-xs text-muted-foreground">Hosted by {room.host_name}</span></div>
            <h2 className="break-words font-display text-xl font-semibold">{room.title}</h2><p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{room.description}</p>
            <p className="text-xs text-muted-foreground">{room.status === 'scheduled' ? room.starts_at ? `Planned for ${dateLabel(room.starts_at)}` : 'The host will choose when to start.' : room.status === 'live' ? `Started ${dateLabel(room.started_at)}` : `Ended ${dateLabel(room.ended_at)}`}</p>
            <Button href={classroomHref(room.id, data.workspace)} variant="secondary" className="mt-auto self-start" aria-label={`${room.status === 'ended' ? 'Review' : 'Open'} ${room.title}`}>{room.status === 'ended' ? 'Review class' : 'Open classroom'}</Button>
        </Card></li>)}</ul>
        <PageControls label="Classrooms" page={data.page} hasMore={data.has_more} onPage={onPage} disabled={frozen(control)} />
        <Dialog open={creating} onOpenChange={(open) => { if (!control.saving) setCreating(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Schedule a classroom</DialogTitle></DialogHeader>
            {creating && <RoomEditor control={control} onClose={() => setCreating(false)} />}</DialogContent></Dialog>
    </div>;
}

function SharedLesson({ control }) {
    const { room, lesson, lessons } = control.data;
    const section = lesson?.lesson.sections[room.section];
    const change = (tutorial, index) => control.mutate('room.lesson', { id: room.id, tutorial, section: index }, room.revision);
    return <Card className="min-w-0 space-y-5 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><BookOpen className="h-5 w-5" aria-hidden="true" />Shared lesson</h2>
        {room.can_manage && room.status === 'live' && <div><label htmlFor="room-lesson" className="mb-1 block text-sm">Class lesson</label><select id="room-lesson" value={room.tutorial} disabled={frozen(control)} onChange={(event) => change(event.target.value, 0)} className={controlInput}>
            {lessons.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>}
        {!section ? <p role="status" className="text-sm text-muted-foreground">{room.status === 'ended' ? 'The lesson is no longer available in the catalogue. The saved class discussion is still readable.' : 'The selected lesson is unavailable. Ask the host to select an installed lesson.'}</p> : <>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">{lesson.category}</p><h3 className="mt-2 break-words font-display text-xl font-semibold">{lesson.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{lesson.summary}</p></div>
            <p role="status" className="text-xs text-muted-foreground">{room.status === 'live' ? 'Following the host' : 'Saved lesson position'} · Section {room.section + 1} of {lesson.lesson.sections.length}</p>
            <article className="space-y-4 break-words text-sm leading-7 [overflow-wrap:anywhere]" aria-labelledby="shared-section-title"><h4 id="shared-section-title" className="font-display text-xl font-semibold">{section.heading}</h4>
                {section.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                {section.steps && <ol className="list-decimal space-y-2 pl-5">{section.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}
            </article>
            {room.can_manage && room.status === 'live' && <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={frozen(control) || room.section === 0} onClick={() => change(room.tutorial, room.section - 1)}>Previous section</Button><Button disabled={frozen(control) || room.section + 1 >= lesson.lesson.sections.length} onClick={() => change(room.tutorial, room.section + 1)}>Next section</Button></div>}
            <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold">Practice exercise</summary><div className="mt-3 space-y-3 text-sm leading-6"><p>{lesson.lesson.exercise.prompt}</p><ul className="list-disc space-y-1 pl-5">{lesson.lesson.exercise.checklist.map((item, index) => <li key={index}>{item}</li>)}</ul></div></details>
            <Link className="inline-block text-sm underline underline-offset-4" to={`/app/tutorials?lesson=${encodeURIComponent(lesson.id)}`}>Read the full lesson and save your own progress</Link>
        </>}
    </Card>;
}

function RoomDiscussion({ control, onPage }) {
    const [draft, setDraft] = useState(''); const { room, membership, messages, role } = control.data;
    const canPost = room.status === 'live' && membership.active && role !== 'viewer';
    useEffect(() => { if (control.saved?.action === 'room.message') setDraft(''); }, [control.saved]);
    return <Card className="min-w-0 space-y-4 p-5">
        <h2 className="font-display text-xl font-semibold">Class discussion</h2>
        {canPost ? <form className="space-y-3" onSubmit={async (event) => { event.preventDefault(); await control.mutate('room.message', { id: room.id, body: draft }, room.revision); }}>
            <label htmlFor="class-message" className="block text-sm">Question or note</label><textarea id="class-message" required maxLength={2000} rows={3} value={draft} disabled={frozen(control) || Boolean(control.presenceError)} onChange={(event) => setDraft(event.target.value)} className={controlInput} />
            <p className="text-xs text-muted-foreground">Saved for members of this workspace to read after class.</p><Button type="submit" disabled={frozen(control) || Boolean(control.presenceError) || !draft.trim()}>Post to class</Button>
        </form> : <p className="text-sm text-muted-foreground">{room.status === 'ended' ? 'This class has ended. Its discussion stays available.' : role === 'viewer' ? 'Viewer seats can read the discussion. An editor seat is required to post.' : room.status === 'scheduled' ? 'Discussion opens when the host starts the session.' : 'Join this class to post a question or note.'}</p>}
        <p className="text-xs text-muted-foreground">Newest messages first. Updates appear while this room is open.</p>
        <ol aria-label="Class messages" className="space-y-4">{messages.items.map((item) => <li key={item.id} className="min-w-0 border-t border-border pt-3"><p className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{item.name}{item.own ? ' (you)' : ''}</span><time>{dateLabel(item.created)}</time></p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{item.body}</p></li>)}</ol>
        {!messages.items.length && <p className="text-sm text-muted-foreground">No messages on this page.</p>}
        <PageControls label="Discussion" page={messages.page} hasMore={messages.has_more} onPage={onPage} disabled={frozen(control)} />
    </Card>;
}

function Room({ control, onPage }) {
    const [editing, setEditing] = useState(false); const [ending, setEnding] = useState(false); const [copied, setCopied] = useState('');
    const { data } = control; const { room, membership } = data;
    const link = `${window.location.origin}${classroomHref(room.id, data.workspace)}`;
    const mutate = (action, extra = {}) => control.mutate(action, { id: room.id, ...extra }, room.revision);
    useEffect(() => { if (room.status === 'ended') setEnding(false); if (room.status !== 'scheduled') setEditing(false); }, [room.status]);
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3"><span className="border border-border px-3 py-1 text-xs font-semibold">{statusLabel[room.status]}</span><span className="text-sm text-muted-foreground">Hosted by {room.host_name}</span>
            {room.status === 'live' && <span role="status" className="text-sm">{!control.connected ? 'Connection interrupted' : membership.active ? 'You are attending' : 'You have not joined'}</span>}</div>
        <h2 className="break-words font-display text-3xl font-semibold">{room.title}</h2><p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{room.description}</p>
        {room.status === 'scheduled' && <p className="text-sm text-muted-foreground">{room.starts_at ? `Planned for ${dateLabel(room.starts_at)}. ` : ''}Waiting for the host to start.</p>}
        {room.status === 'ended' && <p className="text-sm text-muted-foreground">Ended {dateLabel(room.ended_at)}.</p>}
        <div className="flex flex-wrap gap-3">
            {room.can_manage && room.status === 'scheduled' && <><Button disabled={frozen(control)} onClick={() => mutate('room.start')}>Start lesson session</Button><Button variant="secondary" disabled={frozen(control)} onClick={() => setEditing(true)}>Edit class details</Button></>}
            {room.status === 'live' && (membership.active ? <Button variant="secondary" disabled={frozen(control)} onClick={() => mutate('room.leave', { membership_revision: membership.revision })}>Leave class</Button> : <Button disabled={frozen(control)} onClick={() => mutate('room.join')}>Join class</Button>)}
            {room.can_manage && room.status !== 'ended' && <Button variant="secondary" disabled={frozen(control)} onClick={() => setEnding(true)}>{room.status === 'scheduled' ? 'Cancel class' : 'End class'}</Button>}
        </div>
        <Feedback control={control} />
        {control.presenceError && <p role="alert" className="text-sm text-destructive">{control.presenceError}</p>}
        <details className="border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Share with workspace members</summary><div className="mt-3 flex min-w-0 flex-wrap gap-3"><label htmlFor="class-link" className="sr-only">Classroom link</label><input id="class-link" readOnly className={`${controlInput} flex-1`} value={link} onFocus={(event) => event.target.select()} /><Button type="button" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied('Classroom link copied.'); } catch { setCopied('Select and copy the classroom link above.'); } }}>Copy link</Button></div><p role="status" className="mt-2 text-xs text-muted-foreground">{copied || 'Only existing members of this workspace can open this room.'}</p></details>
        <LiveBroadcast room={room} membership={membership} media={data.media} disabled={frozen(control)} />
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"><SharedLesson control={control} /><div className="min-w-0 space-y-5">
            <Card className="space-y-3 p-5"><h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Users className="h-5 w-5" aria-hidden="true" />{room.status === 'live' && control.connected ? `Attending (${data.participants.length})` : 'Attendance'}</h2>
                {room.status === 'live' && control.connected ? <><ul className="space-y-2 text-sm">{data.participants.map((item) => <li key={item.id} className="break-words">{item.name}{item.is_host ? ' · Host' : ''}</li>)}</ul><p className="text-xs leading-5 text-muted-foreground">{data.participants.length ? 'Attendance expires when a member disconnects or closes this room.' : 'No members are currently attending.'}</p></> : <p className="text-sm text-muted-foreground">Attendance is shown while the session and your connection are live.</p>}
            </Card>{room.can_manage && room.status !== 'scheduled' && <ClassRecord room={room} readRecord={control.readRecord} />}<RoomDiscussion control={control} onPage={onPage} /><AgentActivity unattended={room.status !== 'live' || !data.participants.length} /></div></div>
        <Dialog open={editing} onOpenChange={(open) => { if (!control.saving) setEditing(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Edit class details</DialogTitle></DialogHeader>{editing && <RoomEditor control={control} room={room} onClose={() => setEditing(false)} />}</DialogContent></Dialog>
        <Dialog open={ending} onOpenChange={(open) => { if (!control.saving) setEnding(open); }}><DialogContent><DialogHeader><DialogTitle>{room.status === 'scheduled' ? 'Cancel this class?' : 'End this class?'}</DialogTitle></DialogHeader><p className="text-sm leading-6">Members will no longer be able to join or post. The lesson and discussion remain available. Start another class for a new session.</p><Feedback control={control} /><DialogFooter><Button variant="secondary" disabled={control.saving} onClick={() => setEnding(false)}>Keep class open</Button><Button disabled={frozen(control)} onClick={() => mutate('room.end')}>Confirm end</Button></DialogFooter></DialogContent></Dialog>
    </div>;
}

function ClassroomDesk({ roomId }) {
    const [page, setPage] = useState(1); const [status, setStatus] = useState('all'); const control = useClassrooms(roomId, page, status);
    return <div className="ph-no-capture space-y-6" data-dd-privacy="mask"><PageHeader title={roomId ? 'Classroom' : 'Classrooms'} description="Learn together through a shared lesson, questions and a record you can revisit." />
        <div className="flex flex-wrap gap-4 text-sm">{roomId && <Link className="underline underline-offset-4" to="/app/classrooms">All classrooms</Link>}<Link className="underline underline-offset-4" to="/app/tutorials">Field Manual</Link><Button variant="secondary" size="sm" disabled={control.loading || control.saving} onClick={control.refresh}>Refresh classrooms</Button></div>
        {control.loading && !control.data && <p role="status" className="text-sm text-muted-foreground">Loading classrooms…</p>}
        {control.error && <Card className="space-y-3 p-5"><p role="alert" className="text-sm">{control.error}</p>{!control.demo && <Button variant="secondary" onClick={control.refresh}>Retry connection</Button>}</Card>}
        {control.data && (roomId ? <Room control={control} onPage={setPage} /> : <ClassroomList control={control} onPage={setPage} status={status} onStatus={(value) => { setPage(1); setStatus(value); }} />)}
        <p className="text-xs text-muted-foreground">Powered by Citadel Nexus Inc. · <a href={STATUS_PATH} className="underline underline-offset-4">Service status</a></p>
    </div>;
}

export default function ClassroomsPage() {
    const { roomId = '' } = useParams(); const [search, setSearch] = useSearchParams();
    const { active, workspaces, setActive } = useWorkspace(); const requested = search.get('workspace');
    const target = requested && workspaces.find((workspace) => workspace.id === requested);
    useEffect(() => {
        if (!target) return;
        if (active?.id !== requested) setActive(requested);
        else setSearch((old) => { const next = new URLSearchParams(old); next.delete('workspace'); return next; }, { replace: true });
    }, [target, requested, active?.id, setActive, setSearch]);
    if (requested && !target) return <div className="space-y-4"><PageHeader title="Classroom unavailable" description="This link belongs to a workspace you cannot currently access." /><Link to="/app/classrooms" className="underline underline-offset-4">Open your own classrooms</Link></div>;
    if (target && active?.id !== requested) return <p role="status">Opening the classroom's workspace…</p>;
    return <ClassroomDesk key={`${active?.id || ''}:${roomId}`} roomId={roomId} />;
}
