// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/CareerPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/careerPassport.js, apps/web/src/lib/workspaceControl.js, apps/web/src/contexts/CareerProfileContext.jsx, apps/web/src/contexts/WorkspaceAccessContext.jsx, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/careerPassport.js; CONSUMES apps/web/src/lib/workspaceControl.js; CONSUMES apps/web/src/contexts/WorkspaceAccessContext.jsx; CONSUMES apps/web/src/components/workspace/ControlPrimitives.jsx
// Intent:      Make personal work attribution, job coverage and application exclusions reviewable inside the existing authenticated workspace.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { controlInput, dateLabel, PlainArticle } from '@/components/workspace/ControlPrimitives';
import { useAuth } from '@/contexts/AuthContext';
import { useCareerProfile } from '@/contexts/CareerProfileContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { CAREER_MAX_BYTES, careerJobUrl, createCareerClient } from '@/lib/careerPassport';
import { workspaceLifecycleKey } from '@/lib/workspaceControl';

const label = (value) => value.replaceAll('_', ' ').toLowerCase();

function CareerReview({ packet, stale }) {
    const claims = new Map(packet.passport.claims.map((claim) => [claim.id, claim]));
    return <section aria-label="Career review" className="space-y-5">
        <Card className="space-y-4 p-5">
            <h2 className="font-headline text-2xl">Your evidenced work</h2>
            <p className="text-sm">Imported review · {dateLabel(packet.as_of)}{stale ? ' · Refresh this review before using it.' : ''}</p>
            <p className="text-sm text-muted-foreground">Verification below is reported by this review file. Check its original evidence and independent reviewer before using a claim in an application.</p>
            <p className="text-sm">{packet.passport.verified_personal_claims} contributions marked verified in the review.</p>
            {!packet.passport.claims.length && <p>No personal contribution has been established in this capture.</p>}
            <ul className="space-y-4">{packet.passport.claims.map((claim) => <li key={claim.id} className="space-y-2 rounded-md border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wider">{label(claim.contribution.participation)} · {label(claim.state)}</p>
                <PlainArticle text={claim.statement} />
                <p className="text-xs text-muted-foreground">Scope: {claim.contribution.scope.join(', ')}</p>
                {claim.reasons.map((reason) => <p key={reason} className="text-sm">{reason}</p>)}
                <details><summary className="cursor-pointer text-sm underline">Inspect provenance</summary>
                    <p className="break-all text-xs">Participant: {claim.contribution.participant}</p>
                    <ul>{claim.contribution.artifact_ids.map((id) => <li key={id} className="break-all font-mono text-xs">{id}</li>)}</ul>
                    <p className="break-all text-xs">Review digest: {claim.review_sha256 || 'No authenticated review recorded'}</p>
                </details>
            </li>)}</ul>
            <ul className="space-y-2 text-sm">{packet.passport.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </Card>
        <Card className="space-y-4 p-5">
            <h2 className="font-headline text-2xl">Requirement coverage</h2>
            <p className="text-sm">{packet.job_count} captured postings · {packet.dossiers.length} shortlisted dossiers · {packet.packages.length} application drafts.</p>
            <p className="text-sm text-muted-foreground">Current live availability has not been verified by this import. Each requirement keeps its own evidence and gaps.</p>
            {!packet.dossiers.length && <p>No current job dossier is available. The first search target is 100 technical roles, ten dossiers and three reviewed drafts.</p>}
            {packet.dossiers.map((dossier) => <article key={dossier.job_id} className="space-y-4 rounded-md border border-border p-4">
                <h3 className="font-headline text-xl">{dossier.job.role}</h3>
                <p className="text-sm">{dossier.job.board.company} · {dossier.job.location} · {label(dossier.state)}</p>
                <a href={careerJobUrl(dossier.job)} target="_blank" rel="noopener noreferrer" className="text-sm underline">Review original job posting</a>
                <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                    <caption className="sr-only">Requirements for {dossier.job.role}</caption>
                    <thead><tr><th scope="col" className="p-2">Requirement</th><th scope="col" className="p-2">Evidence</th><th scope="col" className="p-2">Reason</th></tr></thead>
                    <tbody>{dossier.coverage.map((row) => <tr key={row.requirement_id} className="border-t border-border">
                        <th scope="row" className="min-w-48 p-2 font-normal">{row.quote}<span className="block text-xs text-muted-foreground">{row.importance}</span></th>
                        <td className="p-2 align-top">{label(row.state)}</td>
                        <td className="min-w-56 space-y-2 p-2 align-top">{row.reasons.map((reason) => <p key={reason}>{reason}</p>)}
                            {row.claim_ids.map((id) => <p key={id}>{claims.get(id)?.statement}</p>)}</td>
                    </tr>)}</tbody>
                </table></div>
                <h4 className="font-semibold">DO NOT CLAIM</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm">{dossier.do_not_claim.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
                <p className="text-xs text-muted-foreground">Employment years and personal attestations require their own evidence or human answer.</p>
            </article>)}
        </Card>
        <Card className="space-y-4 p-5">
            <h2 className="font-headline text-2xl">Application review</h2>
            <p className="text-sm">Drafts need your review of the exact documents, recipient and answers before a permitted browser session can fill or submit them.</p>
            {!packet.packages.length && <p>No application was generated from unsupported personal claims.</p>}
            {packet.packages.map((item) => <details key={item.package_sha256} className="rounded-md border border-border p-4">
                <summary className="cursor-pointer font-semibold">Draft package for {packet.dossiers.find((row) => row.job_id === item.job_id)?.job.role}</summary>
                <p className="my-3 text-sm">Inspect the six documents in this compiler export before approving an application.</p>
                <ul className="space-y-2">{Object.entries(item.files).map(([name, file]) => <li key={name} className="break-all text-xs">{name} · {file.bytes} bytes · SHA-256 {file.sha256}</li>)}</ul>
            </details>)}
            <h3 className="font-semibold">Outcomes</h3>
            <p className="text-sm">No real submission, response, interview or offer is established by this review. Outcome tracking requires the actual receipt.</p>
            <ul className="space-y-2 text-sm">{packet.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </Card>
    </section>;
}

function CareerDesk({ accountId, workspaceId, authorized, sessionEpoch, isSessionCurrent }) {
    const live = useRef(true); const sequence = useRef(0); const urls = useRef(new Set());
    const permission = useRef(authorized); const started = useRef(false); permission.current = authorized;
    const [state, setState] = useState({ loading: true, snapshot: null, error: '' });
    const [review, setReview] = useState(null); const [importing, setImporting] = useState(false);
    const [pendingImport, setPendingImport] = useState(null);
    const [error, setError] = useState('');
    const api = useMemo(() => createCareerClient({ client: pb, accountId, workspaceId,
        isCurrent: () => live.current && permission.current && isSessionCurrent(sessionEpoch), observe: observeMutation }), [accountId, workspaceId, isSessionCurrent, sessionEpoch]);
    const refresh = useCallback(async () => {
        if (!live.current || !permission.current || !isSessionCurrent(sessionEpoch)) return;
        started.current = true;
        const attempt = ++sequence.current;
        setReview(null); setImporting(false); setPendingImport(null); setError(''); setState({ loading: true, snapshot: null, error: '' });
        const result = await api.read();
        if (live.current && attempt === sequence.current) {
            if (result.reason === 'scope_changed') started.current = false;
            setState({ loading: false, snapshot: result.ok ? result.snapshot : null,
                error: result.error || (result.ok ? '' : 'Your account or workspace changed. Refresh access.') });
        }
    }, [api, isSessionCurrent, sessionEpoch]);
    useEffect(() => {
        live.current = true; started.current = false; api.activate();
        const downloads = urls.current;
        return () => { live.current = false; ++sequence.current; api.dispose(); downloads.forEach((url) => URL.revokeObjectURL(url)); downloads.clear(); };
    }, [api, refresh]);
    useEffect(() => { if (authorized && !started.current) void refresh(); }, [authorized, refresh]);
    // Keep selected bytes while polling, but validate and publish them only
    // under current authority. A lifecycle change disposes the whole import.
    useEffect(() => {
        if (!authorized || !pendingImport) return undefined;
        let cancelled = false;
        const current = () => !cancelled && live.current && permission.current && isSessionCurrent(sessionEpoch) && pendingImport.attempt === sequence.current;
        const finish = async () => {
            try {
                const result = await api.importReview(pendingImport.raw);
                if (!current()) return;
                if (result.ok) setReview(result);
                else setError(result.error || 'Current workspace access is required to load this review.');
            } catch { if (current()) setError('The career review could not be read. Check its format and file size.'); }
            finally { if (current()) { setPendingImport(null); setImporting(false); } }
        };
        void finish();
        return () => { cancelled = true; };
    }, [api, authorized, pendingImport, isSessionCurrent, sessionEpoch]);
    const upload = async (event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || !live.current || !permission.current || !isSessionCurrent(sessionEpoch)) return;
        const attempt = ++sequence.current; setReview(null); setPendingImport(null); setError(''); setImporting(true);
        try {
            if (file.size > CAREER_MAX_BYTES) throw new Error('The career review exceeds the supported file size.');
            const raw = await file.text();
            if (!live.current || !isSessionCurrent(sessionEpoch) || attempt !== sequence.current) return;
            setPendingImport({ raw, attempt });
        } catch {
            if (live.current && attempt === sequence.current) {
                setError('The career review could not be read. Check its format and file size.'); setImporting(false);
            }
        }
    };
    const download = () => {
        if (!live.current || !permission.current || !isSessionCurrent(sessionEpoch)) return;
        const capture = api.exportWork();
        if (!capture) { setError('Refresh current work history before exporting.'); return; }
        try {
            const url = URL.createObjectURL(new Blob([JSON.stringify(capture, null, 2) + '\n'], { type: 'application/json' }));
            urls.current.add(url);
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'career-workspace.json'; anchor.click();
            window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 0);
        } catch { setError('This browser could not prepare the private work export.'); }
    };
    const source = state.snapshot?.sources.missions;
    return <div className="space-y-5" hidden={!authorized}>
        <Card className="space-y-4 p-5">
            <h2 className="font-headline text-2xl">Start with work you can prove</h2>
            <p className="text-sm">BuildAndDo is the first test case. Your work history supplies evidence; an independent review establishes what you personally implemented, operated, designed, directed or verified.</p>
            <p className="text-sm text-muted-foreground">Team and agent work retain their own attribution. A course certificate or a completed mission alone does not establish employment history.</p>
            <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={refresh} disabled={!authorized || state.loading}>Refresh work history</Button>
                <Button variant="secondary" onClick={download} disabled={!authorized || state.loading || !state.snapshot}>Export private work capture</Button>
                <Link to="/app/missions" className="self-center text-sm underline">Inspect missions and reviews</Link></div>
            {state.loading && <p role="status">Reading current work history…</p>}
            {state.error && <p role="alert">{state.error}</p>}
            {source && <p className="text-sm">{source.state === 'available' ? `${source.items.length} readable missions in this sample${source.has_more ? '; more history remains at the source' : ''}.` : 'Mission history is unavailable; career coverage is incomplete.'}</p>}
            <p className="text-xs text-muted-foreground">Exports contain workspace information. Keep them private and review what you choose to share.</p>
        </Card>
        <Card className="space-y-4 p-5">
            <h2 className="font-headline text-2xl">Inspect your career review</h2>
            <p className="text-sm">Load the review generated from your work capture and job sources. Inspect contribution attribution, each job requirement and the proposed application documents.</p>
            <label className="block text-sm">Career review file<input type="file" accept=".json,application/json" className={'mt-2 ' + controlInput}
                onChange={upload} disabled={!authorized || state.loading || !state.snapshot || importing} /></label>
            {importing && <p role="status">Checking the career review…</p>}
            {error && <p role="alert">{error}</p>}
            <p className="text-xs text-muted-foreground">The review stays in this view and clears when your account or workspace changes. Importing does not approve or send an application.</p>
        </Card>
        {review && <CareerReview packet={review.packet} stale={review.stale} />}
    </div>;
}

const PROFILE_MESSAGES = {
    signed_out: 'Sign in to load your career profile.',
    demo: 'Demonstration mode does not load a personal career profile.',
    loading: 'Loading your career profile from Citadel Nexus…',
    not_configured: 'Your Citadel Nexus career profile is not connected on this server yet.',
    no_profile: 'Citadel Nexus holds no career profile for this account yet.',
    forbidden: 'Sign in again to load your career profile.',
    unavailable: 'Your career profile is unavailable right now. Retry in a moment.',
};

/** The profile Citadel Nexus holds for this account, loaded at sign-in and kept in memory only. */
function CitadelProfile() {
    const { status, profile, issuedAt, reload } = useCareerProfile();
    return <Card className="space-y-4 p-5" aria-label="Citadel career profile">
        <h2 className="font-headline text-2xl">Your career profile</h2>
        {status !== 'ready' || !profile ? <>
            <p role={status === 'loading' ? 'status' : undefined} className="text-sm">{PROFILE_MESSAGES[status] || PROFILE_MESSAGES.unavailable}</p>
            {['unavailable', 'forbidden'].includes(status) && <Button variant="secondary" onClick={reload}>Retry</Button>}
        </> : <>
            <p className="text-sm">{profile.person_id} · as of {dateLabel(profile.as_of)} · issued {dateLabel(issuedAt)}</p>
            <p className="text-xs text-muted-foreground">OBSERVED means a record shows the work. VERIFIED means someone other than you checked it. Nothing here states employment years.</p>
            {!profile.capabilities.length && <p className="text-sm">No capability is evidenced yet.</p>}
            <ul className="space-y-2">{profile.capabilities.map((row) => <li key={row.capability_id} className="rounded-md border border-border p-3">
                <p className="text-sm font-semibold">{row.label}</p>
                <p className="text-sm">{row.claim_verb.replace(/:$/, '')} · {label(row.state)} · {row.records} record{row.records === 1 ? '' : 's'}</p>
            </li>)}</ul>
            <p className="break-all text-xs text-muted-foreground">Passport {profile.digest}</p>
        </>}
    </Card>;
}

export default function CareerPage() {
    const { user, isAuthed, sessionEpoch, isSessionCurrent } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const access = useWorkspaceAccess();
    let content;
    if (!isAuthed || !user?.id || !active?.id) content = <Card className="p-5">Sign in and choose a workspace to inspect your work.</Card>;
    else if (demo) content = <Card className="p-5">Demonstration mode has no personal career evidence. Turn it off to inspect your current workspace.</Card>;
    else if (access.error) content = <Card className="space-y-3 p-5"><p role="alert">{access.error}</p><Button onClick={access.refresh}>Refresh workspace access</Button></Card>;
    else if (!access.data) content = <p role="status">Checking workspace access…</p>;
    else content = <>{access.loading && <p role="status">Checking workspace access…</p>}
        <CareerDesk key={workspaceLifecycleKey({ accountId: user.id, workspaceId: active.id, demo, sessionEpoch, access })}
            accountId={user.id} workspaceId={active.id} authorized={!access.loading}
            sessionEpoch={sessionEpoch} isSessionCurrent={isSessionCurrent} /></>;
    return <div className="space-y-6 ph-no-capture" data-dd-privacy="mask">
        <PageHeader title="Career Passport" description="Turn evidenced work into an honest account of what you can do, then compare it with real job requirements." />
        <CitadelProfile />
        {content}
        <footer className="border-t border-border pt-4 text-xs text-muted-foreground">Powered by Citadel Nexus Inc. ·{' '}
            <a href="https://citadel-nexus.com/status" target="_blank" rel="noopener noreferrer" className="underline">Public status</a></footer>
    </div>;
}
