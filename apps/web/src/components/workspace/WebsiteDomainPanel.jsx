// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/WebsiteDomainPanel.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-SITE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-SITE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/websiteDomain.js, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/websiteDomain.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx
// DAG Node:    none
// Intent:      Let owners and admins set the workspace domain and prove ownership with a DNS TXT record, and show everyone the server's answer.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Globe } from 'lucide-react';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, DOMAIN_STATUS } from '@/components/workspace/workspaceHelpers';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createWebsiteDomainClient } from '@/lib/websiteDomain';

export const CHECK_RESULT = {
    verified: 'The TXT record matched. Ownership is verified by DNS.',
    not_found: 'No TXT record was found at that name yet. New DNS records can take a while to appear.',
    mismatch: 'A TXT record was found, but its value does not match. Replace it with the value shown here.',
    lookup_failed: 'The DNS lookup did not complete, so nothing changed. Try again shortly.',
};
const STATUS_TEXT = {
    verified: 'Ownership verified by DNS.',
    needs_attention: 'The verification record was not found on the last check. Ownership is not currently verified.',
};

export default function WebsiteDomainPanel() {
    const { user, isAuthed } = useAuth(); const { active, refresh } = useWorkspace(); const { demo } = useDemoMode();
    const scope = `${isAuthed ? user?.id : ''}:${active?.id || ''}:${demo}`;
    const live = useRef({ scope, mounted: true }); live.current.scope = scope;
    const api = useMemo(() => createWebsiteDomainClient({ client: pb, workspaceId: active?.id, accountId: isAuthed ? user?.id : '',
        isCurrent: () => !demo && live.current.mounted && live.current.scope === scope }), [scope, demo, isAuthed, user?.id, active?.id]);
    const [view, setView] = useState({ scope: '', loading: true, data: null, error: '' });
    const [draft, setDraft] = useState('');
    const [working, setWorking] = useState('');
    const [notice, setNotice] = useState({ text: '', error: false });
    const load = useCallback(async () => {
        const result = await api.read();
        if (!live.current.mounted || live.current.scope !== scope || result.reason === 'scope_changed') return;
        setView({ scope, loading: false, data: result.ok ? result.data : null, error: result.ok ? '' : result.error });
    }, [api, scope]);
    useEffect(() => {
        live.current.mounted = true; setNotice({ text: '', error: false }); setDraft('');
        if (!demo) load();
        return () => { live.current.mounted = false; };
    }, [load, demo]);
    const run = async (name, operation, done) => {
        setWorking(name); setNotice({ text: '', error: false });
        const result = await operation();
        if (live.current.mounted) setWorking('');
        if (!live.current.mounted || live.current.scope !== scope || result.reason === 'scope_changed') return;
        if (!result.ok) { if (result.reason !== 'busy') setNotice({ text: result.error, error: result.reason !== 'rate_limited' }); return; }
        setNotice({ text: done(result.data), error: false });
        await load();
        if (name !== 'challenge') await refresh?.();
    };
    const copy = async (value, label) => {
        try { await navigator.clipboard.writeText(value); setNotice({ text: `Copied the ${label}.`, error: false }); }
        catch { setNotice({ text: `Could not copy the ${label}. Select it and copy it manually.`, error: true }); }
    };

    const current = view.scope === scope ? view : { loading: true, data: null, error: '' };
    const data = current.data;
    const record = data?.challenge;
    return <Card id="website-domain" className="space-y-4 p-5" data-dd-privacy="mask">
        <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                <Globe className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all font-medium">{demo ? 'Unavailable in demonstration mode' : current.loading ? 'Checking the website domain…' : data?.domain || 'No website domain yet'}</p>
                    {data?.domain && <StatusBadge map={DOMAIN_STATUS} value={data.status} />}
                </div>
                {data?.domain && <p role="status" className="text-sm">{STATUS_TEXT[data.status] || 'Ownership is not verified. The domain is context only and unlocks nothing.'}</p>}
                <p className="text-sm leading-relaxed text-muted-foreground">
                    BuildAndDo verifies ownership only by looking up a DNS TXT record through a public DNS resolver. It never visits your website for this check.
                </p>
                {current.error && <p role="alert" className="text-sm text-destructive">{current.error}</p>}
                {current.error && <Button variant="secondary" onClick={load}>Retry</Button>}
                {data && !data.can_manage && <p className="text-sm text-muted-foreground">Only workspace owners and admins can change the domain or verify it.</p>}
            </div>
        </div>
        {data?.can_manage && <>
            <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); run('save', () => api.save(draft), (saved) => { setDraft(''); return saved.changed ? `Saved ${saved.domain}. Verify ownership next.` : `${saved.domain} is already this workspace's domain.`; }); }}>
                <Label htmlFor="website-domain-input">{data.domain ? 'Change website domain' : 'Website domain'}</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input id="website-domain-input" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={253} placeholder="example.com"
                        aria-describedby="website-domain-help" autoComplete="off" spellCheck={false} className="h-11 sm:max-w-sm" />
                    <Button type="submit" disabled={Boolean(working) || !draft.trim()}>{working === 'save' ? 'Saving…' : 'Save domain'}</Button>
                </div>
                <p id="website-domain-help" className="text-xs text-muted-foreground">Enter the name only, without https:// or a path. Changing the domain starts verification over.</p>
            </form>
            {data.domain && <div className="space-y-3 border-t border-border pt-4">
                <h3 className="font-display text-base font-semibold">Verify ownership</h3>
                {record ? <>
                    <p className="text-sm text-muted-foreground">Add this TXT record at your DNS provider, then choose Check now.</p>
                    <dl className="grid gap-3 text-sm">
                        {[['Name', record.record_name, 'record name'], ['Type', record.record_type, ''], ['Value', record.record_value, 'record value']].map(([term, value, label]) =>
                            <div key={term} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                <dt className="w-14 shrink-0 font-medium">{term}</dt>
                                <dd className="min-w-0 flex-1 break-all font-evidence">{value}</dd>
                                {label && <Button variant="secondary" aria-label={`Copy ${label}`} onClick={() => copy(value, label)}><Copy className="h-4 w-4" />Copy</Button>}
                            </div>)}
                    </dl>
                </> : <p className="text-sm text-muted-foreground">Create a verification record, add it at your DNS provider, then check it here.</p>}
                <div className="flex flex-wrap gap-3">
                    <Button variant={record ? 'secondary' : 'primary'} disabled={Boolean(working)}
                        onClick={() => run('challenge', () => api.challenge(data.domain), () => 'A new verification record is ready. Any earlier record no longer counts.')}>
                        {working === 'challenge' ? 'Creating…' : record ? 'Create a new record' : 'Create verification record'}
                    </Button>
                    {record && <Button disabled={Boolean(working)} onClick={() => run('check', api.check, (checked) => CHECK_RESULT[checked.result])}>
                        {working === 'check' ? 'Checking…' : 'Check now'}
                    </Button>}
                </div>
                {data.result && !notice.text && <p className="text-sm">Last check: {CHECK_RESULT[data.result]}</p>}
            </div>}
        </>}
        {notice.text && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'text-sm text-destructive' : 'text-sm'}>{notice.text}</p>}
    </Card>;
}
