// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/AgentActivity.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN, C-ONE (seats named without logins or machine names)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/hooks/useSeatFeed.js, apps/web/src/lib/seatDisplay.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useSeatFeed.js; CONSUMES apps/web/src/lib/seatDisplay.js; CONSUMES seat_events
// DAG Node:    none
// Intent:      Show account-attributed reports of agent activity without treating claimed seat labels as authenticated agents or verified work.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Bot, Eye } from 'lucide-react';
import { Card, StatePill } from '@/components/site/ui';
import { useSeatFeed } from '@/hooks/useSeatFeed';
import { seatName, withoutMachineNames } from '@/lib/seatDisplay';

const EVENT = {
    'seat.joined': 'Joined',
    'seat.progress': 'Progress',
    'seat.completed': 'Completed',
    'seat.blocked': 'Blocked',
    'seat.handoff': 'Handed off',
};
const when = (value) => (value && Number.isFinite(Date.parse(value.replace(' ', 'T'))) ? new Date(value.replace(' ', 'T')).toLocaleString() : 'Time not recorded');

function detailText(detail) {
    if (detail == null) return '';
    const clip = (text, limit) => text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
    // Project only a small JSON-shaped copy. Never stringify the original graph,
    // invoke its getters/toJSON or walk beyond two container levels.
    const project = (value, depth = 0) => {
        if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'string') return clip(value, 240);
        if (typeof value !== 'object') return '[unsupported]';
        if (depth >= 2) return '...';
        const array = Array.isArray(value), result = array ? [] : Object.create(null);
        const read = (key) => {
            const property = Object.getOwnPropertyDescriptor(value, key);
            return property && 'value' in property ? project(property.value, depth + 1) : '[unreadable]';
        };
        if (array) {
            for (let index = 0; index < Math.min(value.length, 6); index++) result.push(read(String(index)));
            if (value.length > 6) result.push('...');
        } else {
            let count = 0;
            for (const key in value) {
                if (count++ === 6) { result['...'] = 'More fields omitted'; break; }
                if (Object.prototype.hasOwnProperty.call(value, key)) result[clip(key, 80)] = read(key);
            }
        }
        return result;
    };
    try { return clip(typeof detail === 'string' ? detail : JSON.stringify(project(detail), null, 2), 1200); }
    catch { return '[Detail unavailable]'; }
}

/**
 * @param {{unattended?: boolean, limit?: number}} props unattended: nobody is in the class right now.
 */
export default function AgentActivity({ unattended = false, limit = 12 }) {
    const { events, loading, live } = useSeatFeed({ limit });
    const agents = events.filter((item) => item.actorType === 'agent' || item.actorType === 'mixed');
    return <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary"><Bot className="h-3.5 w-3.5" aria-hidden="true" />Agents</p>
                <h2 className="font-display text-xl font-semibold">Reported agent activity in this workspace</h2>
            </div>
            <p className="font-evidence text-xs text-muted-foreground">{live ? 'Live' : 'History only · live updates not connected'}</p>
        </div>
        {unattended && <p role="status" className="flex items-start gap-2 border border-chart-agent/50 bg-chart-agent/10 px-3 py-2 text-sm leading-6">
            <Eye className="mt-1 h-4 w-4 shrink-0 text-amber-text" aria-hidden="true" />
            No one is in this class right now. This is the latest reported agent work in the workspace. Agents propose; people review and publish.
        </p>}
        {loading && !events.length && <p role="status" className="text-sm text-muted-foreground">Loading agent activity…</p>}
        {!loading && !agents.length && <p className="text-sm text-muted-foreground">No agent activity to show. Either none has been recorded in this workspace, or your seat cannot read the agent record.</p>}
        {agents.length > 0 && <ol aria-label="Recent agent activity" className="space-y-0">{agents.map((item) => {
            const label = EVENT[item.name] || 'Update';
            const detail = detailText(item.detail);
            return <li key={item.id} className="grid gap-1.5 border-t border-border py-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                    <StatePill state="reported" />
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="inline-flex items-center gap-1 font-evidence text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" aria-hidden="true" />{item.seat}</span>
                    {item.handoffTo && <span className="text-xs text-muted-foreground">to {item.handoffTo}</span>}
                    <time className="ml-auto font-evidence text-[11px] text-muted-foreground" dateTime={item.createdAt}>{when(item.createdAt)}</time>
                </div>
                <p className="break-words text-sm font-semibold leading-6">{item.summary}</p>
                <p className="text-xs text-muted-foreground">Submitting account: {item.owner || 'Not recorded (legacy report)'}. Claimed actor: {item.actorType}.</p>
                {detail && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{detail}</p>}
                {(item.subject || item.prUrl) && <p className="flex flex-wrap gap-3 font-evidence text-[11px] text-muted-foreground">
                    {item.subject && <span>{item.subjectType ? `${item.subjectType}: ` : ''}{withoutMachineNames(item.subject)}</span>}
                    {/^https:\/\//.test(item.prUrl || '') && <a href={item.prUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">Evidence link</a>}
                </p>}
            </li>;
        })}</ol>}
        <p className="text-xs text-muted-foreground">From the workspace&apos;s append-only seat reports. Seat labels and actor types do not authenticate an agent; &quot;completed&quot; is reported, not independently verified.</p>
    </Card>;
}
