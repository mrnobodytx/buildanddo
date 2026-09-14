// CGRF: SRS=SRS-BUILDANDDO-MISSION-CHAIN-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/MissionLoopSummary.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-MISSION-CHAIN-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/lib/missionChain.js (STAGES, STAGE_LABELS, CHAIN_STATE,
//              buildMissionChains output)
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/missionChain.js;
//              CONSUMED_BY apps/web/src/pages/workspace/MissionsPage.jsx
// Intent:      Orient a learner across their whole workspace: how far the
//              missions have progressed through the six-stage build loop
//              (challenge -> ... -> replay). Each stage counts ONLY missions
//              with a stored receipt for that stage, straight from the chain's
//              receipt-gated stageState — an empty stage is unmeasured, never
//              rounded up, and never borrows proof from a later one. The stages
//              are numbered because their order is load-bearing.
// ───────────────────────────────────────────────────────────────

import React from 'react';

import { CHAIN_STATE, STAGES, STAGE_LABELS } from '@/lib/missionChain';

/**
 * @param {object} props
 * @param {Record<string, {stageState?: Record<string, string>, complete?: boolean}>} [props.chains]
 *   Output of buildMissionChains(): mission id -> derived chain.
 * @param {Array<{id?: string}>} [props.missions] The workspace missions.
 */
export default function MissionLoopSummary({ chains = {}, missions = [] }) {
    const total = missions.length;
    if (!total) return null;

    const isComplete = (missionId, stageId) => {
        const chain = missionId ? chains[missionId] : null;
        return Boolean(chain && chain.stageState && chain.stageState[stageId] === CHAIN_STATE.COMPLETE);
    };

    const perStage = STAGES.map((id) => ({
        id,
        label: STAGE_LABELS[id],
        complete: missions.reduce((n, m) => n + (isComplete(m && m.id, id) ? 1 : 0), 0),
    }));

    // The furthest stage any mission has a receipt for. -1 when nothing has
    // even a challenge receipt yet — an honest "not started", not a zero.
    const furthestIdx = perStage.reduce((idx, stage, i) => (stage.complete > 0 ? i : idx), -1);
    const verificationIdx = STAGES.indexOf('verification');
    const anyVerified = verificationIdx >= 0 && perStage[verificationIdx].complete > 0;
    const loopComplete = missions.reduce((n, m) => n + (m && m.id && chains[m.id] && chains[m.id].complete ? 1 : 0), 0);

    const plural = (n) => (n === 1 ? '' : 's');

    return (
        <section
            data-testid="mission-loop-summary"
            aria-labelledby="mission-loop-heading"
            className="rounded-md border border-border bg-card p-5"
        >
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <h2 id="mission-loop-heading" className="font-display text-lg font-semibold tracking-tight">
                    Build loop
                </h2>
                <span className="text-xs text-muted-foreground">
                    across your {total} mission{plural(total)} · counted from stored receipts
                </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Build loop stages">
                {perStage.map((stage, i) => {
                    const reached = stage.complete > 0;
                    const isFurthest = i === furthestIdx;
                    return (
                        <div
                            key={stage.id}
                            data-testid={`mission-loop-stage-${stage.id}`}
                            data-reached={reached}
                            className={[
                                'flex flex-col gap-1 rounded-sm border p-3',
                                reached ? 'border-border bg-secondary/40' : 'border-dashed border-border/70',
                                isFurthest ? 'ring-1 ring-primary/40' : '',
                            ].join(' ')}
                        >
                            <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                {String(i + 1).padStart(2, '0')} · {stage.label}
                            </span>
                            <span
                                className={reached ? 'font-display text-base font-semibold text-foreground' : 'font-display text-base font-semibold text-muted-foreground/60'}
                                data-testid={`mission-loop-count-${stage.id}`}
                            >
                                {reached ? `${stage.complete} of ${total}` : 'none yet'}
                            </span>
                        </div>
                    );
                })}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground" data-testid="mission-loop-note">
                {loopComplete > 0
                    ? `${loopComplete} of ${total} mission${plural(loopComplete)} completed the full loop through to replay. Each stage above counts only missions with a stored receipt for it.`
                    : anyVerified
                        ? 'Missions have reached verification — evidence checked against a source — but none have completed replay yet. Each stage counts only a stored receipt.'
                        : 'No mission has reached verification yet — that is the stage that turns work into verified evidence. Each stage counts only a stored receipt; an empty stage is unmeasured, not zero.'}
            </p>
        </section>
    );
}
