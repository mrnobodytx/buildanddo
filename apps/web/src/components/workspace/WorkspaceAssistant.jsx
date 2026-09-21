// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/WorkspaceAssistant.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/lib/workspaceAssistant.js, apps/web/src/contexts/WorkspaceAccessContext.jsx
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/workspaceAssistant.js; DEPENDS_ON apps/web/src/contexts/WorkspaceAccessContext.jsx
// DAG Node:     none
// Intent:       Offer a persistent account-scoped assistant with visible plans, form assistance, retryable outcomes and personal session history.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import { Button, Card } from '@/components/site/ui';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import pb from '@/lib/pocketbaseClient';
import { createAssistantClient, captureAssistantSurface, applyAssistantPlan } from '@/lib/workspaceAssistant';

function AssistantDesk({ accountId, workspaceId, demo }) {
    const location = useLocation(), navigate = useNavigate(), access = useWorkspaceAccess();
    const [open, setOpen] = useState(false), [session, setSession] = useState(''), [snapshot, setSnapshot] = useState(null);
    const [message, setMessage] = useState(''), [turn, setTurn] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [recordPending, setRecordPending] = useState(null), [notice, setNotice] = useState(''), [forgetting, setForgetting] = useState(false);
    const alive = useRef(true), lock = useRef(false), captured = useRef(null), pending = useRef(null), route = useRef(location.pathname);
    const startKey = useRef(globalThis.crypto.randomUUID()), startPayload = useRef(null), composer = useRef(null);
    const selectedSession = useRef(session), historyRequest = useRef(0);
    selectedSession.current = session;
    route.current = location.pathname;
    const current = () => alive.current && !demo && pb.authStore.record?.id === accountId;
    const api = useMemo(() => createAssistantClient({ client: pb, workspaceId, accountId, isCurrent: () => alive.current && !demo }), [workspaceId, accountId, demo]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { if (turn?.plan?.route !== location.pathname) captured.current = null; }, [location.pathname, turn]);
    const load = async (selected = selectedSession.current, paging = {}) => {
        const ticket = ++historyRequest.current;
        const result = await api.snapshot(selected, paging.sessionPage || 1, paging.turnPage || 1);
        if (!current() || ticket !== historyRequest.current || selected !== selectedSession.current) return;
        if (result.ok) { setSnapshot((before) => {
            const retained = paging.append === 'sessions' ? before?.sessions.items || [] : (before?.sessions.items || []).filter((item) => item.id === selected);
            const sessions = [...new Map([...retained, ...result.data.sessions.items].map((item) => [item.id, item])).values()];
            return { ...result.data, sessions: { ...result.data.sessions, items: sessions },
                turns: paging.append === 'turns' ? { ...result.data.turns, items: [...(before?.turns.items || []), ...result.data.turns.items] } :
                    paging.append === 'sessions' && before ? before.turns : result.data.turns };
        }); setError(''); }
        else if (result.error) setError(result.error);
    };
    useEffect(() => { if (open && !demo) { void load(); composer.current?.focus(); } }, [open, session]);
    const send = async (event) => {
        event.preventDefault();
        if (lock.current || !current() || !message.trim() || recordPending || closed) return;
        lock.current = true; setBusy(true); setError(''); setNotice('');
        try {
            let activeSession = session;
            if (!activeSession) {
                startPayload.current ||= { title: message.trim().slice(0, 160) };
                const created = await api.command('session.start', startPayload.current, startKey.current);
                if (!current()) return;
                if (!created.ok) { setError(created.error || 'Could not start this session.'); return; }
                activeSession = created.data.id; selectedSession.current = activeSession; setSession(activeSession);
            }
            if (!pending.current || pending.current.message !== message.trim() || pending.current.session !== activeSession) {
                captured.current = captureAssistantSurface(document, route.current);
                pending.current = { session: activeSession, request_key: globalThis.crypto.randomUUID(), message: message.trim(), surface: captured.current.public };
            }
            const result = await api.chat(pending.current);
            if (!current()) return;
            if (result.ok) {
                setTurn(result.data);
                if (result.data.status === 'ready') { pending.current = null; setMessage(''); }
                else setError(result.data.reply);
                await load(activeSession);
            } else setError(result.error || 'The assistant response is unavailable.');
        } finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    const retain = async (record) => {
        const response = await api.command('plan.record', { turn: record.turn, ...record.outcome }, record.key);
        if (!current()) return;
        if (response.ok) { setRecordPending(null); setTurn(null); captured.current = null; setNotice('Interaction recorded in your personal knowledge. Check the native desk for the saved business result.'); await load(); }
        else { setRecordPending(record); setError(response.error || 'The interaction happened, but its session record needs retry.'); }
    };
    const apply = async (decline = false) => {
        if (lock.current || !current() || !turn?.plan || recordPending || !decline && !captured.current) return;
        lock.current = true; setBusy(true); setError('');
        try {
            const outcome = decline ? { outcome: 'declined', completed_steps: 0, observation: 'The user declined this inferred plan.' } :
                await applyAssistantPlan({ plan: turn.plan, surface: captured.current, document, currentRoute: () => route.current,
                    isCurrent: () => current() && (access.data?.can_write === true || turn.plan.steps.every((step) => step.kind === 'navigate')), navigate });
            if (current()) await retain({ turn: turn.id, outcome, key: globalThis.crypto.randomUUID() });
        } finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    const newSession = async () => {
        if (lock.current || recordPending) return;
        lock.current = true; setBusy(true);
        try {
            if (session) {
                const closed = await api.command('session.close', { session }, globalThis.crypto.randomUUID());
                if (!current()) return;
                if (!closed.ok) { setError(closed.error); return; }
            }
            selectedSession.current = ''; historyRequest.current++; setSession(''); setTurn(null); setMessage(''); pending.current = null; captured.current = null;
            setSnapshot((before) => before ? { ...before, turns: { items: [], page: 1, has_more: false } } : null);
            startKey.current = globalThis.crypto.randomUUID(); startPayload.current = null; setForgetting(false); setNotice('A new session will begin with your next message.');
        } finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    const forget = async () => {
        if (lock.current || !session || recordPending) return;
        lock.current = true; setBusy(true);
        try {
            const result = await api.command('session.forget', { session }, globalThis.crypto.randomUUID());
            if (!current()) return;
            if (!result.ok) { setError(result.error); return; }
            selectedSession.current = ''; historyRequest.current++; setSession(''); setTurn(null); setMessage(''); setSnapshot(null); pending.current = null; captured.current = null;
            startKey.current = globalThis.crypto.randomUUID(); startPayload.current = null; setForgetting(false);
            setNotice('This session and its personal patterns were removed. Business records remain in their native desks.');
            await load('');
        } finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    const history = [...(snapshot?.turns?.items || [])].reverse();
    const closed = snapshot?.sessions?.items.find((item) => item.id === session)?.status === 'closed';
    return <div data-assistant-panel className="ph-no-capture" data-dd-privacy="mask">
        <Button type="button" size="sm" aria-expanded={open} aria-controls="workspace-assistant-panel"
            className="fixed bottom-4 right-4 z-40 shadow-md" onClick={() => setOpen(!open)}><MessageCircle className="h-4 w-4" />Assistant</Button>
        {open && <Card id="workspace-assistant-panel" role="region" aria-label="BuildAndDo assistant"
            className="fixed bottom-16 right-2 z-40 flex max-h-[calc(100dvh-6rem)] w-[min(28rem,calc(100vw-1rem))] flex-col border border-border bg-background shadow-xl sm:right-4">
            <div className="flex items-center justify-between border-b border-border p-3"><div><h2 className="font-display font-semibold">BuildAndDo assistant</h2><p className="text-xs text-muted-foreground">Your account · Current workspace</p></div>
                <button type="button" aria-label="Close assistant" onClick={() => setOpen(false)} className="p-2"><X className="h-4 w-4" /></button></div>
            <div className="space-y-3 overflow-y-auto p-3 text-sm">
                {demo ? <p>Sign in to use saved assistant sessions. Demo mode does not send workspace data or perform actions.</p> : <>
                    <p className="text-xs text-muted-foreground">Ask for help on any desk. Review the proposed steps before applying them. Approval, verification and destructive actions stay with you. Never enter passwords or keys.</p>
                    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" disabled={busy || Boolean(recordPending)} onClick={newSession}>New session</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => load()}>Reload history</Button><Link className="self-center text-xs underline" to="/app/knowledge">My knowledge</Link>
                        {session && <Button type="button" size="sm" variant="ghost" disabled={busy || Boolean(recordPending)} onClick={() => setForgetting(!forgetting)}>Forget session</Button>}</div>
                    {forgetting && <div className="space-y-2 border border-border p-2"><p>Remove this conversation and its personal patterns? Saved business records are separate.</p>
                        <Button size="sm" disabled={busy} onClick={forget}>Confirm forget</Button><Button size="sm" variant="ghost" onClick={() => setForgetting(false)}>Keep session</Button></div>}
                    <label className="block text-xs">Resume a session<select className="mt-1 w-full border border-border bg-background p-2" value={session} disabled={busy || Boolean(recordPending)}
                        onChange={(event) => { selectedSession.current = event.target.value; historyRequest.current++; setSession(event.target.value); setTurn(null); setMessage(''); setForgetting(false); pending.current = null; captured.current = null;
                            setSnapshot((before) => before ? { ...before, turns: { items: [], page: 1, has_more: false } } : null);
                            startKey.current = globalThis.crypto.randomUUID(); startPayload.current = null; }}>
                        <option value="">New conversation</option>{snapshot?.sessions?.items.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}
                    </select></label>
                    {snapshot?.sessions?.has_more && <Button type="button" size="sm" variant="ghost" onClick={() => load(session, { sessionPage: snapshot.sessions.page + 1, append: 'sessions' })}>Load earlier sessions</Button>}
                    {snapshot?.inference_configured === false && <p role="status" className="border border-border p-2">The assistant provider is not connected yet. Your workspace operator must bind the existing agent endpoint.</p>}
                    <ol className="space-y-3" aria-label="Conversation">{history.map((item) => <li key={item.id} className="space-y-2 border-b border-border pb-3">
                        <p className="whitespace-pre-wrap"><strong>You:</strong> {item.message}</p><p className="whitespace-pre-wrap"><strong>Assistant:</strong> {item.reply || 'Response pending…'}</p>
                        <p className="text-xs text-muted-foreground">{item.status}</p>
                        {item.plan?.context && <details className="text-xs"><summary>Workspace sources used</summary>
                            <p>{item.plan.context.complete ? 'Readable source context was included.' : 'Source coverage is partial; inspect the original records.'}</p>
                            <ul>{item.plan.context.citations.map((source) => <li key={source.citation}>{source.title} · {source.updated_at || 'Date unavailable'}</li>)}</ul>
                            {!item.plan.context.citations.length && <p>No matching workspace sources were included.</p>}
                        </details>}</li>)}</ol>
                    {snapshot?.turns?.has_more && <Button type="button" size="sm" variant="ghost" onClick={() => load(session, { turnPage: snapshot.turns.page + 1, append: 'turns' })}>Load earlier messages</Button>}
                    {turn?.status === 'ready' && turn.plan?.steps.length > 0 && <section className="space-y-2 border border-border p-3" aria-label="Proposed actions">
                        <h3 className="font-semibold">Review proposed steps</h3><ol className="list-inside list-decimal space-y-1">{turn.plan.steps.map((step, i) => <li key={i}>
                            {step.kind === 'navigate' ? `Open ${step.path}` : step.kind === 'fill' ? `Fill ${step.label}: ${String(step.value)}` : `Activate ${step.label}`}</li>)}</ol>
                        {!captured.current && <p>This page changed. Send another message to inspect its current controls.</p>}
                        <div className="flex gap-2"><Button size="sm" disabled={busy || !captured.current || Boolean(recordPending)} onClick={() => apply()}>Apply reviewed steps</Button>
                            <Button size="sm" variant="ghost" disabled={busy || Boolean(recordPending)} onClick={() => apply(true)}>Decline</Button></div>
                    </section>}
                    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
                    {recordPending && <Button size="sm" disabled={busy} onClick={async () => {
                        if (lock.current) return; lock.current = true; setBusy(true);
                        try { await retain(recordPending); } finally { lock.current = false; if (alive.current) setBusy(false); }
                    }}>Retry saving interaction record</Button>}
                    {closed && <p>This session is retained for reading. Start a new session to continue.</p>}
                    <form onSubmit={send} className="space-y-2"><label htmlFor="assistant-message" className="font-medium">What would you like to do?</label>
                        <Textarea ref={composer} id="assistant-message" value={message} onChange={(event) => { setMessage(event.target.value); }} maxLength={4000} rows={3} disabled={busy || closed || Boolean(recordPending)} />
                        <Button type="submit" size="sm" disabled={busy || closed || !message.trim() || Boolean(recordPending)}>{busy ? 'Working…' : pending.current ? 'Retry message' : 'Ask assistant'}</Button></form>
                </>}
            </div>
        </Card>}
    </div>;
}
export default function WorkspaceAssistant() {
    const { user } = useAuth(), { active } = useWorkspace(), { demo } = useDemoMode();
    if (!user?.id || !active?.id) return null;
    return <AssistantDesk key={`${user.id}:${active.id}:${demo}`} accountId={user.id} workspaceId={active.id} demo={demo} />;
}
