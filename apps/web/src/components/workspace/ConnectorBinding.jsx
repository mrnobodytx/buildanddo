// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/ConnectorBinding.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/lib/connectorReadiness.js, apps/web/src/hooks/useWorkspaceControl.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/connectorReadiness.js; CONSUMES apps/web/src/hooks/useWorkspaceControl.js
// Intent:      Offer the workspace's configured connection and its actual health in action forms.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/site/ui';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';
import { connectorReadiness } from '@/lib/connectorReadiness';

export default function ConnectorBinding({ provider, value, onChange, disabled = false, onReady }) {
    const control = useWorkspaceControl('integrations'), id = useId();
    const [now, setNow] = useState(Date.now);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
    const item = control.data?.items?.find((row) => row.provider === provider);
    const readiness = connectorReadiness(item, now);
    const matches = value && value === item?.configuration?.binding;
    const ready = Boolean(matches && readiness.ready && !control.loading && !control.error);
    useEffect(() => { onReady?.(ready); return () => onReady?.(false); }, [ready, onReady]);
    return <div className="space-y-2 text-sm"><label htmlFor={id}>Registered {provider} connection</label>
        <select id={id} className="w-full border border-border bg-background p-2" value={value}
            disabled={disabled || control.loading || !item?.configuration?.binding} onChange={(event) => onChange(event.target.value)}>
            <option value="">Select a connection</option>
            {item?.configuration?.binding && <option value={item.configuration.binding}>{item.configuration.binding}</option>}
            {value && !matches && <option value={value}>{value} (no longer configured)</option>}
        </select>
        <p role={control.error ? 'alert' : 'status'}>{control.loading ? 'Checking connection…' : control.error || (value && !matches ? 'This saved binding no longer matches the workspace configuration.' : readiness.reason)}</p>
        <div className="flex gap-3"><Button size="sm" variant="ghost" disabled={control.loading || disabled} onClick={control.refresh} type="button">Refresh connection</Button>
            <Link className="self-center underline" to="/app/integrations">Manage connections</Link></div>
    </div>;
}
