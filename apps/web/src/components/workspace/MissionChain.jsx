// CGRF: SRS=SRS-BUILDANDDO-MISSION-CHAIN-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/MissionChain.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-MISSION-CHAIN-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-12
// Depends:     apps/web/src/lib/missionChain.js,
//              apps/web/src/components/workspace/workspaceHelpers.jsx,
//              apps/web/src/lib/format.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/missionChain.js (deriveMissionChain);
//              CONSUMED_BY apps/web/src/pages/workspace/MissionsPage.jsx
// Intent:      Draw the six chain stages and the replay trace from receipts
//              only — an empty stage says UNMEASURED on the page, and an
//              unreadable source says so instead of passing for an empty one.
// ───────────────────────────────────────────────────────────────

import { History, Radio } from 'lucide-react';
import React from 'react';

import { StatusBadge } from '@/components/workspace/workspaceHelpers';
import { timeAgo, truncate } from '@/lib/format';
import {
    CHAIN_STATE,
    deriveMissionChain,
    ORIGIN_CHANNELS,
    STAGE_LABELS,
} from '@/lib/missionChain';
import { cn } from '@/lib/utils';

/**
 * Badge metadata for the two chain states. The labels are the tokens
 * themselves: what the page says and what a test reads are then the same
 * string, and "UNMEASURED" is not softened into "pending" on the way out.
 */
export const CHAIN_STATE_META = {
    [CHAIN_STATE.COMPLETE]: { label: 'COMPLETE', tone: 'teal' },
    [CHAIN_STATE.UNMEASURED]: { label: 'UNMEASURED', tone: 'neutral' },
};

const CHANNEL_LABELS = {
    wiki: 'Wiki',
    forum: 'Forum',
    reddit: 'Reddit',
    discord: 'Discord',
    sprint: 'Sprint obligation',
};

/**
 * Badge metadata per origin channel, built from the channel list so a channel
 * added there cannot be missed here. A channel the list does not know still
 * renders, under its stored name, via `statusMeta`'s fallback.
 */
export const ORIGIN_CHANNEL_META = Object.fromEntries([
    ...ORIGIN_CHANNELS.map((channel) => [
        channel,
        { label: CHANNEL_LABELS[channel] || channel, tone: channel === 'sprint' ? 'amber' : 'violet' },
    ]),
    ['unmeasured', { label: 'Origin unmeasured', tone: 'neutral' }],
]);

/**
 * One line of receipt accounting under a stage.
 *
 * @param {object} stage Stage entry from the derived chain.
 * @param {object} counts Record counts from the derived chain.
 * @returns {string} What the stage holds.
 */
function receiptLine(stage, counts) {
    if (stage.receipts > 0) {
        if (stage.id === 'replay') return `${stage.receipts} receipts in order`;
        // The missions row is the one receipt that proves only that somebody
        // declared the work. Saying so on the cell keeps a COMPLETE badge here
        // from reading as "the mission is done" while every later stage is
        // still unmeasured.
        if (stage.id === 'mission') return `${stage.receipts} receipt — declared intent, not proof`;
        return `${stage.receipts} receipt${stage.receipts === 1 ? '' : 's'}`;
    }
    // A runbook nobody ran is the one gap worth naming: it looks like progress
    // in the operations list and is still no evidence anything happened.
    if (stage.id === 'bounded_action' && counts.operations > 0) {
        return `${counts.operations} runbook${counts.operations === 1 ? '' : 's'} declared, 0 runs`;
    }
    if (stage.id === 'verification' && counts.evidence > 0) {
        return `${counts.evidence} evidence, none verified`;
    }
    return 'No receipt';
}

/**
 * Renders the challenge → replay chain for one mission.
 *
 * @param {object} props Component props.
 * @param {object} [props.chain] Output of `deriveMissionChain`.
 * @param {string[]} [props.unreadableSources] Collections whose read failed.
 * @param {string} [props.className] Extra classes.
 */
export default function MissionChain({ chain, unreadableSources = [], className }) {
    const view = chain || deriveMissionChain({});
    const { origin, counts } = view;
    const channelKey = origin.channel || 'unmeasured';
    const currentStage = view.stages.find((stage) => stage.id === view.current);

    return (
        <div
            data-testid="mission-chain"
            data-current-stage={view.current}
            data-complete={String(view.complete)}
            className={cn('rounded-[var(--radius)] border border-border bg-secondary/20 p-4', className)}
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Radio className="h-3.5 w-3.5" strokeWidth={2} />
                    Origin
                </span>
                <span
                    data-testid="mission-chain-origin"
                    data-channel={channelKey}
                    className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"
                >
                    <StatusBadge map={ORIGIN_CHANNEL_META} value={channelKey} />
                    {origin.ref ? (
                        <span className="break-all text-xs text-foreground/80">{origin.ref}</span>
                    ) : (
                        <span className="text-xs text-muted-foreground">no reference stored</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                        {origin.at ? timeAgo(origin.at) : 'arrival time unmeasured'}
                    </span>
                </span>
                {origin.source === 'event' && (
                    <span className="text-xs text-muted-foreground">
                        read from the recorded arrival — the mission itself stores no origin
                    </span>
                )}
            </div>

            {unreadableSources.length > 0 && (
                <p
                    data-testid="mission-chain-unreadable"
                    role="status"
                    className="mt-3 text-xs leading-relaxed text-amber-warm"
                >
                    Could not read {unreadableSources.join(', ')}. Stages below may read UNMEASURED
                    because the source is unreachable, not because nothing happened.
                </p>
            )}

            <ol
                data-testid="mission-chain-stages"
                className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6"
            >
                {view.stages.map((stage, index) => {
                    const complete = stage.state === CHAIN_STATE.COMPLETE;
                    return (
                        <li
                            key={stage.id}
                            data-testid={`mission-chain-stage-${stage.id}`}
                            data-state={stage.state}
                            title={stage.rule}
                            className={cn(
                                'rounded-[var(--radius)] border p-3',
                                complete
                                    ? 'border-[hsl(var(--teal))]/30 bg-[hsl(var(--teal))]/5'
                                    : 'border-dashed border-border bg-card/40',
                                stage.id === view.current && !complete && 'ring-1 ring-primary/40',
                            )}
                        >
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {index + 1}. {stage.label}
                            </p>
                            <StatusBadge
                                map={CHAIN_STATE_META}
                                value={stage.state}
                                className="mt-2"
                            />
                            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                {receiptLine(stage, counts)}
                            </p>
                        </li>
                    );
                })}
            </ol>

            {currentStage && currentStage.state === CHAIN_STATE.UNMEASURED && (
                <p
                    data-testid="mission-chain-next-receipt"
                    className="mt-3 text-xs leading-relaxed text-muted-foreground"
                >
                    <span className="font-semibold text-foreground/80">
                        Next receipt needed — {currentStage.label}:
                    </span>{' '}
                    {currentStage.rule}
                </p>
            )}

            <div className="mt-5 border-t border-border/60 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <History className="h-3.5 w-3.5" strokeWidth={2} />
                        Replay trace
                    </span>
                    <span data-testid="mission-chain-replay-state">
                        <StatusBadge map={CHAIN_STATE_META} value={view.stageState.replay} />
                    </span>
                </div>

                {view.trace.length === 0 ? (
                    <p
                        data-testid="mission-chain-trace-empty"
                        className="mt-3 text-sm leading-relaxed text-muted-foreground"
                    >
                        No receipt is stored against this mission, so there is nothing to replay.
                    </p>
                ) : (
                    <ol data-testid="mission-chain-trace" className="mt-3 space-y-3">
                        {view.trace.map((row, index) => (
                            <li
                                key={`${row.stage}-${row.at || 'undated'}-${index}`}
                                data-testid="mission-chain-trace-row"
                                data-stage={row.stage}
                                className="border-l-2 border-border pl-3"
                            >
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                                        {STAGE_LABELS[row.stage]}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {row.at ? timeAgo(row.at) : 'time unmeasured'}
                                    </span>
                                    {row.actor && (
                                        <span className="text-xs text-muted-foreground">
                                            by {row.actor}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-sm leading-relaxed">
                                    {truncate(row.summary, 180) || STAGE_LABELS[row.stage]}
                                </p>
                                {row.ref && (
                                    <p className="mt-0.5 break-all text-xs text-muted-foreground">
                                        {row.ref}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
}
