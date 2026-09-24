// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/LiveBroadcast.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN, C-ONE (broadcasters named without logins or machine names; known guildmasters link to their profiles)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/hooks/useClassroomMedia.js, apps/web/src/components/broadcast/BroadcastStage.jsx, apps/web/src/components/broadcast/MediaControls.jsx, apps/web/src/lib/seatDisplay.js, apps/web/src/data/personas.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useClassroomMedia.js; CONSUMES apps/web/src/components/broadcast/BroadcastStage.jsx; CONSUMES apps/web/src/components/broadcast/MediaControls.jsx; CONSUMES apps/web/src/lib/seatDisplay.js; CONSUMES apps/web/src/data/personas.js
// DAG Node:    none
// Intent:      Put the host's live broadcast inside the routed classroom, with every unavailable or failed state said in words.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Bot, Headphones, Radio } from 'lucide-react';
import BroadcastStage from '@/components/broadcast/BroadcastStage';
import MediaControls from '@/components/broadcast/MediaControls';
import { personaForPresence, personaPath } from '@/data/personas';
import { useClassroomMedia } from '@/hooks/useClassroomMedia';
import { seatName, withoutMachineNames } from '@/lib/seatDisplay';

function Notice({ tone = 'muted', children, role }) {
    const color = tone === 'alert' ? 'text-destructive' : tone === 'caution' ? 'text-amber-text' : 'text-muted-foreground';
    return <p role={role} className={`text-sm leading-6 ${color}`}>{children}</p>;
}

// A guildmaster the canon knows links to its public profile. The profile opens in a new tab, because leaving the
// room would end the listener's place in the live class. An id the canon does not know is still named, unlinked,
// so an unexpected broadcaster is never hidden.
function BroadcasterName({ id }) {
    const persona = personaForPresence(id);
    if (!persona) return seatName(id, 'Guildmaster');
    return <a href={personaPath(persona)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
        {persona.name}<span className="sr-only"> (opens in a new tab)</span></a>;
}

function Publishers({ media }) {
    const others = media.presence.filter((row) => row.session_id !== media.handle?.sessionId);
    if (!others.length) return <Notice>Nobody else is broadcasting in this room. A broadcaster who stops refreshing drops off this list within two minutes.</Notice>;
    return <ul aria-label="Broadcasting now" className="grid gap-3 sm:grid-cols-2">{others.map((row) => {
        const agent = Boolean(row.persona_id);
        const pulled = media.pulled.includes(row.id);
        return <li key={row.id} className="flex min-w-0 items-center justify-between gap-3 border border-border bg-card p-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
                {agent ? <Bot className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span className="min-w-0"><span className="block truncate font-semibold">{agent ? <BroadcasterName id={row.persona_id} /> : withoutMachineNames(row.display_name) || 'Workspace member'}</span>
                    <span className="block text-xs text-muted-foreground">{agent ? 'Guildmaster agent' : 'Member'}{row.state !== 'LIVE' ? ` · ${String(row.state).toLowerCase()}` : ''}</span></span>
            </span>
            {pulled
                ? <span className="shrink-0 text-xs text-muted-foreground">{media.receive === 'receiving' ? 'Audio arriving' : 'Pulled · no frames yet'}</span>
                : <button type="button" onClick={() => media.listen(row)} className="inline-flex h-9 shrink-0 items-center gap-1.5 border border-foreground/70 px-3 text-xs font-semibold hover:bg-secondary/70">
                    <Headphones className="h-4 w-4" aria-hidden="true" />Listen</button>}
        </li>;
    })}</ul>;
}

/**
 * @param {{room: object, membership: object, media?: {available?: boolean, reason?: string}, disabled?: boolean}} props
 */
export default function LiveBroadcast({ room, membership, media: availability, disabled = false }) {
    const live = room.status === 'live';
    const enabled = live && Boolean(membership?.active) && Boolean(availability?.available);
    const media = useClassroomMedia(room.id, { enabled });
    if (!live) return null;
    if (!availability?.available) {
        return <Notice>Voice and video are not set up for this workspace{availability?.reason ? ` (${availability.reason})` : ''}. This session uses the shared lesson and text discussion.</Notice>;
    }
    if (!membership?.active) return <Notice>Join the class to see and hear the broadcast.</Notice>;

    const host = Boolean(room.can_manage);
    const connected = media.status === 'connected' && Boolean(media.handle);
    const publishing = connected && media.handle.role === 'teach' && media.handle.mayPublish;
    const stream = connected ? (media.handle.role === 'teach' ? media.handle.stream : media.handle.remoteStream) : null;
    const state = !connected ? 'idle' : media.receive === 'silent' ? 'silent' : 'waiting';
    const signal = !connected ? undefined : publishing ? 'broadcasting' : media.receive;

    return <section aria-labelledby="broadcast-title" className="space-y-3">
        <h2 id="broadcast-title" className="sr-only">Live broadcast</h2>
        <BroadcastStage stream={stream} local={publishing} cameraOn={publishing ? media.local.camera : true}
            hostName={room.host_name} signal={signal} packets={!publishing && media.audio.supported ? media.audio.packets : undefined} state={state} />
        <MediaControls publishing={publishing} connected={connected} connecting={media.status === 'connecting'} canBroadcast={host}
            mic={media.local.mic} camera={media.local.camera} disabled={disabled}
            onJoin={() => media.join(host ? 'teach' : 'watch')} onLeave={media.leave} onToggle={media.toggle} />
        {media.status === 'connecting' && <button type="button" onClick={media.leave} className="text-sm underline underline-offset-4">Cancel connection</button>}
        <div aria-live="polite" className="space-y-1">
            {media.health && !media.configured && <Notice tone="caution">The broadcast service is not ready{media.health.reason ? `: ${media.health.reason}` : ''}.</Notice>}
            {host && media.configured && media.publishersConfigured === 0 && <Notice tone="caution">No one in this workspace is allowed to broadcast yet. Members can still join and listen.</Notice>}
            {host && connected && !publishing && <Notice tone="caution">You are connected, but your seat is not on this workspace&apos;s broadcaster list, so nothing is being sent.</Notice>}
            {media.error && <Notice tone="alert" role="alert">Could not join the broadcast: {media.error}</Notice>}
            {media.detail && media.status === 'connecting' && <Notice>{media.detail}</Notice>}
            {connected && media.handle.iceComplete === false && <Notice tone="caution">The connection set up with incomplete network information, so media may not flow. Leaving and joining again usually fixes it.</Notice>}
            {media.presenceError && <Notice tone="alert" role="alert">{media.presenceError}</Notice>}
            {media.unreadable.length > 0 && <Notice tone="caution">{media.unreadable.length} broadcast advertisement(s) in this room could not be read and cannot be played.</Notice>}
            {media.audioBlocked && <p className="text-sm text-amber-text">Your browser needs a click before it plays sound.{' '}
                <button type="button" onClick={media.playAudio} className="underline underline-offset-4">Play audio</button></p>}
        </div>
        {connected && !publishing && <Publishers media={media} />}
        {/* One element carries every pulled track. It is not muted, so a refused autoplay is surfaced above. */}
        <audio ref={media.audioRef} autoPlay className="hidden" />
    </section>;
}
