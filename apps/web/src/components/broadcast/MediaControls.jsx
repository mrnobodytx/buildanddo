// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/MediaControls.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/utils.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/utils.js
// DAG Node:    none
// Intent:      Give a host real microphone and camera switches and every member a clear way to join or leave the broadcast.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Mic, MicOff, PhoneOff, Radio, Video, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

function Control({ icon: Icon, label, onClick, pressed, off, danger, disabled }) {
    return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed}
        className={cn('inline-flex h-12 items-center gap-2 border px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stage-live disabled:cursor-not-allowed disabled:opacity-60',
            danger ? 'border-stage-live bg-stage-live text-stage-live-foreground hover:brightness-110'
                : cn('border-stage-border text-stage-foreground hover:bg-stage', off && 'border-dashed text-stage-muted'))}>
        <Icon className="h-5 w-5" aria-hidden="true" /><span>{label}</span>
    </button>;
}

/**
 * @param {{publishing: boolean, connected: boolean, connecting?: boolean, mic?: boolean, camera?: boolean, canBroadcast?: boolean,
 *   onJoin: () => void, onLeave: () => void, onToggle?: (kind: 'mic'|'camera') => void, disabled?: boolean}} props
 */
export default function MediaControls({ publishing, connected, connecting = false, mic = true, camera = true, canBroadcast = false, onJoin, onLeave, onToggle, disabled = false }) {
    return <div role="toolbar" aria-label="Classroom media" className="flex flex-wrap items-center gap-3 border border-stage-border bg-stage-raised p-3 text-stage-foreground">
        {!connected && <Control icon={Radio} label={connecting ? 'Connecting…' : canBroadcast ? 'Start broadcasting' : 'Join broadcast'} onClick={onJoin} disabled={disabled || connecting} />}
        {connected && publishing && <>
            <Control icon={mic ? Mic : MicOff} label={mic ? 'Mute' : 'Unmute'} pressed={!mic} off={!mic} onClick={() => onToggle?.('mic')} disabled={disabled} />
            <Control icon={camera ? Video : VideoOff} label={camera ? 'Stop camera' : 'Start camera'} pressed={!camera} off={!camera} onClick={() => onToggle?.('camera')} disabled={disabled} />
        </>}
        {connected && !publishing && <span className="inline-flex items-center gap-2 text-sm text-stage-muted"><Radio className="h-4 w-4" aria-hidden="true" />Listening. The host broadcasts.</span>}
        <span className="flex-1" />
        {connected && <Control icon={PhoneOff} danger label={publishing ? 'Stop broadcasting' : 'Leave broadcast'} onClick={onLeave} disabled={disabled} />}
    </div>;
}
