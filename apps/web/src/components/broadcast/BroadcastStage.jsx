// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/BroadcastStage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/broadcast/SignalMeter.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/broadcast/SignalMeter.jsx
// DAG Node:    none
// Intent:      Show the host's broadcast on a stage that stays dark in both themes, or say plainly why there is no picture.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { Radio, VideoOff, WifiOff } from 'lucide-react';
import SignalMeter from '@/components/broadcast/SignalMeter';

const EMPTY = {
    idle: [Radio, 'Join the broadcast to see and hear the host.', 'Nothing connects until you choose to join.'],
    waiting: [Radio, 'Waiting for the host to broadcast.', 'The picture appears when the host starts their camera.'],
    silent: [WifiOff, 'Connected, but no frames are arriving.', 'The room is not shown as receiving until packets are measured.'],
    'camera-off': [VideoOff, 'The camera is off.', 'Audio and the shared lesson continue.'],
};

function hasVideo(stream) {
    return Boolean(stream && typeof stream.getVideoTracks === 'function' && stream.getVideoTracks().some((track) => track.readyState !== 'ended'));
}

/**
 * @param {{stream?: MediaStream|null, local?: boolean, cameraOn?: boolean, hostName?: string, signal?: string, packets?: number, state?: keyof EMPTY, section?: string}} props
 */
export default function BroadcastStage({ stream = null, local = false, cameraOn = true, hostName, signal, packets, state = 'idle', section }) {
    const video = useRef(null);
    const showVideo = hasVideo(stream) && cameraOn;
    useEffect(() => {
        if (video.current && showVideo && video.current.srcObject !== stream) video.current.srcObject = stream;
    }, [stream, showVideo]);
    const empty = EMPTY[!showVideo && stream && !cameraOn ? 'camera-off' : state] || EMPTY.idle;
    const Icon = empty[0];
    return <section aria-label="Broadcast stage" className="relative aspect-video w-full overflow-hidden border border-stage-border bg-stage text-stage-foreground">
        {showVideo
            // Audio plays through the room's separate audio element; the picture is always muted.
            ? <video ref={video} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" aria-label={local ? 'Your camera' : `${hostName || 'Host'} broadcast`} />
            : <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div className="max-w-sm space-y-2 text-stage-muted">
                    <Icon className="mx-auto h-7 w-7" aria-hidden="true" />
                    <p className="font-display text-xl font-semibold text-stage-foreground">{empty[1]}</p>
                    <p className="text-sm">{empty[2]}</p>
                </div>
            </div>}
        <div className="absolute inset-x-3 top-3 flex flex-wrap justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 bg-stage-live px-3 py-1 text-xs font-semibold uppercase tracking-wide text-stage-live-foreground">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-stage-live-foreground" />Live lesson
            </span>
            {signal && <SignalMeter state={signal} packets={packets} />}
        </div>
        {showVideo && hostName && <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-stage/70 px-2.5 py-1.5 text-sm">
            <span className="font-semibold">{local ? `${hostName} (you)` : hostName}</span>
            <span className="border border-stage-border px-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">Host</span>
            {section && <span className="text-xs text-stage-muted">{section}</span>}
        </div>}
    </section>;
}
