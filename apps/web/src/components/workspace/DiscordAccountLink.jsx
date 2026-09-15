// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/DiscordAccountLink.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/discordAccount.js, apps/web/src/contexts/AuthContext.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/discordAccount.js; CONSUMES apps/web/src/contexts/AuthContext.jsx
// DAG Node:    none
// Intent:      Give signed-in members an explicit native account-linking flow before Discord can access their mission scope.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PocketBase, { BaseAuthStore } from 'pocketbase';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createDiscordAccountLink } from '@/lib/discordAccount';
import { Button, Card } from '@/components/site/ui';

export default function DiscordAccountLink() {
    const { user, isAuthed } = useAuth(); const { demo } = useDemoMode();
    const scope = `${isAuthed ? user?.id : ''}:${demo}`; const live = useRef({ scope, mounted: true }); live.current.scope = scope;
    const [state, setState] = useState({ scope: '', loading: true, linked: false, error: '' });
    const api = useMemo(() => createDiscordAccountLink({ client: pb, accountId: isAuthed ? user?.id : '',
        createIsolated: () => new PocketBase(pb.baseURL, new BaseAuthStore()),
        isCurrent: () => !demo && live.current.mounted && live.current.scope === scope }), [scope, demo, isAuthed, user?.id]);
    const run = useCallback(async (operation) => {
        setState({ scope, loading: true, linked: false, error: '' });
        const result = await operation();
        if (live.current.mounted && live.current.scope === scope) setState({ scope, loading: false, linked: Boolean(result.linked), error: result.error || '' });
    }, [scope]);
    useEffect(() => { live.current.mounted = true; run(api.status); return () => { live.current.mounted = false; api.dispose(); }; }, [api, run]);
    const current = state.scope === scope ? state : { loading: true, linked: false, error: '' };
    return <Card id="discord-account" className="space-y-3 p-5" data-dd-privacy="mask">
        <h2 className="font-display text-lg">Discord account</h2>
        <p className="text-sm text-muted-foreground">Link your Discord identity to submit mission research from the configured server and channel. The bot checks your current workspace role on every request.</p>
        <p role="status" className="text-sm">{demo ? 'Account linking is disabled in demonstration mode.' : current.loading ? 'Checking account link…' : current.error ? 'Link status unavailable.' : current.linked ? 'Discord is linked to this account.' : 'Discord is not linked.'}</p>
        {current.error && <p role="alert" className="text-sm text-destructive">{current.error}</p>}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" disabled={demo || !isAuthed || current.loading} onClick={() => run(current.linked ? api.unlink : api.link)}>{current.linked ? 'Unlink Discord' : 'Link Discord'}</Button>
            <Button type="button" variant="secondary" disabled={demo || !isAuthed || current.loading} onClick={() => run(api.status)}>Refresh link status</Button></div>
        <p className="text-xs text-muted-foreground">Unlinking removes the bot’s access through this identity. It preserves existing mission and evidence records.</p>
    </Card>;
}
