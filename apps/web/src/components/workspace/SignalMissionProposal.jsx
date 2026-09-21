// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/SignalMissionProposal.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/lib/missionResearch.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/missionResearch.js
// Intent:      Turn an explicit signal review into a recoverable proposal without approving work or leaking another workspace's result.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/site/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createResearchClient, signalProposalKey } from '@/lib/missionResearch';
import { observeMutation } from '@/lib/observability/mutations';

function Proposal({ signal, accountId, workspaceId, disabled, onClose }) {
    const live = useRef(false);
    const saving = useRef(false);
    const [state, setState] = useState({ saving: false, uncertain: false, error: '', mission: '' });
    const signalId = signal.id; const signalUpdated = signal.updated;
    const api = useMemo(() => createResearchClient({ client: pb, accountId, workspaceId,
        isCurrent: () => live.current, keyFactory: () => signalProposalKey({ id: signalId, updated: signalUpdated }), observe: observeMutation }),
    [accountId, workspaceId, signalId, signalUpdated]);
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    const submit = async () => {
        if (disabled || saving.current || state.mission) return;
        saving.current = true;
        setState((prior) => ({ ...prior, saving: true, error: '' }));
        let result;
        try {
            result = state.uncertain ? await api.retry() : await api.command('signal.propose',
                { signal: signalId, signal_updated: signalUpdated });
        } catch {
            result = { ok: false, error: 'Reload the saved signal before preparing a proposal.' };
        } finally { saving.current = false; }
        if (!live.current || result.reason === 'scope_changed') return;
        setState({ saving: false, uncertain: result.reason === 'uncertain', error: result.error || '',
            mission: result.ok ? result.result.id : '' });
    };
    return <Dialog open onOpenChange={(open) => { if (!open && !state.saving) onClose(); }}>
        <DialogContent className="ph-no-capture" data-dd-privacy="mask">
            <DialogHeader><DialogTitle>Propose a mission from this signal</DialogTitle>
                <DialogDescription>Save the observation for review, then complete the plan and ask for approval in the Mission Desk.</DialogDescription>
            </DialogHeader>
            <p className="break-words font-medium">{signal.title}</p>
            <p className="text-sm text-muted-foreground">The proposal will require a different member to review the mission and evidence they did not author.</p>
            {disabled && <p role="status">Select this workspace with write access and turn off demonstration mode to propose a mission.</p>}
            {state.error && <p role="alert" className="text-sm">{state.error}</p>}
            {state.mission && <p role="status">Proposal saved. <Link className="underline" to={`/app/missions?mission=${encodeURIComponent(state.mission)}`}>Open mission</Link></p>}
            <DialogFooter>
                <Button type="button" variant="ghost" disabled={state.saving} onClick={onClose}>Close</Button>
                {!state.mission && <Button type="button" disabled={disabled || state.saving} onClick={submit}>
                    {state.saving ? 'Saving…' : state.uncertain ? 'Recover proposal' : 'Save proposal'}
                </Button>}
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}

/** Bind proposal and recovery state to the current account, workspace and signal.
 * @param {{signal: {id: string, updated: string, title: string, workspace: string}, onClose: () => void}} props Saved observation and dismissal callback.
 * @returns {React.ReactElement|null} The current scoped proposal dialog.
 */
export default function SignalMissionProposal({ signal, onClose }) {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const access = useWorkspaceAccess();
    if (!isAuthed || !user?.id || !active?.id || signal.workspace !== active.id) return null;
    return <Proposal key={`${user.id}:${active.id}:${demo}:${signal.id}:${signal.updated}`} signal={signal}
        accountId={user.id} workspaceId={active.id} disabled={demo || access.loading || !access.data?.can_write} onClose={onClose} />;
}
