// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/IntegrationControls.jsx
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
// Intent:      Present one scoped control surface for sinks, extensions, Discord and Reddit with explicit requested versus observed states.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ControlState, ControlFeedback, controlInput, dateLabel, focusPendingRetry } from '@/components/workspace/ControlPrimitives';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';

const fieldNames = { guild_id: 'Discord server ID', channel_id: 'Discord channel ID', subreddit: 'Subreddit name', binding: 'Registered connection name' };
const modeNames = { read: 'Read only', reviewed_publish: 'Publish reviewed content', telemetry: 'Receive telemetry', reviewed_run: 'Run approved workflows' };
const stateNames = { unknown: 'Not measured', disabled: 'Disabled', healthy: 'Healthy', degraded: 'Degraded', failed: 'Failed' };

function IntegrationForm({ item, control, onClose }) {
    const [enabled, setEnabled] = useState(item.desired_enabled); const [configuration, setConfiguration] = useState(item.configuration);
    const disabled = control.saving || control.uncertain;
    return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); control.mutate('integration.save', { provider: item.provider, enabled, configuration }, control.data.settings.revision); }}>
        <fieldset disabled={disabled} className="space-y-4"><legend className="sr-only">Integration settings</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Request enabled</label>
            {item.fields.map((field) => <div key={field}><label htmlFor={`integration-${field}`} className="mb-1 block text-sm">{fieldNames[field]}</label>
                <input id={`integration-${field}`} className={controlInput} required={enabled} maxLength={64} autoComplete="off" value={configuration[field] || ''}
                    onChange={(e) => setConfiguration((before) => ({ ...before, [field]: e.target.value }))} /></div>)}
            <label htmlFor="integration-mode" className="block text-sm">Allowed operation</label>
            <select id="integration-mode" className={controlInput} value={configuration.mode} onChange={(e) => setConfiguration((before) => ({ ...before, mode: e.target.value }))}>
                {item.modes.map((mode) => <option key={mode} value={mode}>{modeNames[mode]}</option>)}
            </select>
        </fieldset>
        <p className="text-sm text-muted-foreground">Use IDs or a connection name supplied by your service operator. Credentials stay with that service. Publishing and workflow actions still require their own review.</p>
        <ControlFeedback control={control} />
        <DialogFooter><Button type="button" variant="secondary" disabled={control.saving} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={disabled}>Save integration request</Button></DialogFooter>
    </form>;
}

function IntegrationDesk({ control, kinds }) {
    const [editing, setEditing] = useState(null);
    const disabled = control.saving || control.uncertain;
    const items = control.data.items.filter((item) => !kinds || kinds.includes(item.kind));
    return <div className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">Configure connections, request changes and check their latest reported state. Saving a request waits for the service operator to apply it.</p>
        {!control.data.can_admin && <p className="text-sm">Your workspace role can view integrations. An owner or administrator must change them.</p>}
        <ControlFeedback control={control} />
        <div className="grid gap-4 md:grid-cols-2">{items.map((item) => <Card key={item.provider} className="min-w-0 space-y-4 p-5">
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{item.kind === 'sink' ? 'Telemetry sink' : item.kind === 'extension' ? 'Extension' : 'Community'}</p>
                <h2 className="mt-1 font-display text-xl font-semibold">{item.label}</h2></div>
            <dl className="space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt>Requested state</dt><dd>{item.revision ? (item.desired_enabled ? 'Enabled' : 'Disabled') : 'Not configured'}</dd></div>
                <div className="flex flex-wrap justify-between gap-2"><dt>Last observation</dt><dd>{stateNames[item.observation.state] || 'Not measured'}{item.observation.state !== 'unknown' && !item.observation.current ? ' — out of date' : ''}</dd></div>
                <div className="flex flex-wrap justify-between gap-2"><dt>Observed at</dt><dd>{dateLabel(item.observation.at)}</dd></div></dl>
            {item.observation.check_pending && <p className="text-xs text-muted-foreground">Health check requested; awaiting a new result.</p>}
            {item.revision > 0 && !item.observation.current && <p className="text-xs text-muted-foreground">The current request has no fresh matching receipt. Live activation is unconfirmed.</p>}
            {item.observation.receipt_ref && <p className="break-all font-evidence text-xs text-muted-foreground">Receipt {item.observation.receipt_ref}</p>}
            {control.data.can_admin && <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setEditing(item)}>Configure {item.label}</Button>
                <Button variant="ghost" size="sm" disabled={disabled || !item.id} onClick={() => control.mutate('integration.check', { provider: item.provider }, control.data.settings.revision)}>Request health check</Button>
                {item.desired_enabled && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => control.mutate('integration.save', { provider: item.provider, enabled: false, configuration: item.configuration }, control.data.settings.revision)}>Request disable</Button>}
            </div>}
        </Card>)}</div>
        <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !control.saving) setEditing(null); }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={(event) => { if (control.uncertain) focusPendingRetry(event); }}><DialogHeader><DialogTitle>Configure {editing?.label}</DialogTitle></DialogHeader>
                {editing && <IntegrationForm item={editing} control={control} onClose={() => setEditing(null)} />}
            </DialogContent>
        </Dialog>
    </div>;
}

export default function IntegrationControls({ kinds }) {
    const control = useWorkspaceControl('integrations');
    return <section className="ph-no-capture space-y-4" data-dd-privacy="mask" aria-label="Integration controls">
        <ControlState control={control}>{control.data && <IntegrationDesk key={control.scope} control={control} kinds={kinds} />}</ControlState>
    </section>;
}
