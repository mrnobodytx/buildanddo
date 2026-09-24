// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/GovernmentGate.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/contexts/WorkspaceAccessContext.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/contexts/WorkspaceAccessContext.jsx
// Intent:      Explain the paid approved government tier while withholding protected views until the server grants current access.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { Button, Card } from '@/components/site/ui';

/** Render government tools only while the observed server membership is current. */
export default function GovernmentGate({ children }) {
    const access = useWorkspaceAccess();
    if (access.loading && !access.data) return <p role="status" className="p-4">Checking government membership…</p>;
    const membership = access.data?.government;
    if (!access.error && membership?.allowed === true && membership.tier === 'government' &&
        membership.amount_cents === 10000 && membership.currency === 'USD' && membership.interval === 'month' &&
        Date.parse(membership.expires_at) > Date.now()) return children;
    return <Card className="mx-auto max-w-2xl space-y-5 p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold">Government research membership</h1>
        <p className="text-xl font-semibold">$100/month · approval required</p>
        <p className="leading-relaxed text-muted-foreground">Government research, submission preparation and the mission suite are reserved for approved government-tier members with a current paid membership.</p>
        <p className="text-sm text-muted-foreground">An operator confirms eligibility for this workspace tier and payment before activating access. Membership does not establish government-contract eligibility or authorize a submission.</p>
        {access.error && <p role="alert">Membership could not be checked. Retry to confirm access.</p>}
        {membership?.reason === 'membership_expired' && <p role="status">Your membership period has ended. Renew access with the membership operator.</p>}
        <div className="flex flex-wrap gap-3"><Button href="/contact?interest=government">Request membership</Button><Button variant="secondary" onClick={access.refresh}>Check access again</Button></div>
        <p className="text-sm text-muted-foreground">Activation is by confirmed invoice and approval. Online checkout is not available yet.</p>
    </Card>;
}
