// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workspaceJourney.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/lib/missionLearning.js, apps/web/src/lib/businessPlanning.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/missionLearning.js; CONSUMES apps/web/src/lib/businessPlanning.js
// Intent:      Derive useful next steps from observed workspace work without creating approvals or treating missing reads as completion.
// ───────────────────────────────────────────────────────────────

import { missionEvidence, planIssues } from './missionLearning.js';
import { overdue } from './businessPlanning.js';

/** Rank actual work requiring attention and retain uncertainty in failed reads.
 * @param {object} options Current scope and loaded records.
 * @returns {{state: string, actions: object[]}} Read-only navigation suggestions.
 */
export function workspaceJourney({ workspace, account, signals = [], missions = [], evidence = [], runs = [], tasks = [], unavailable = [], today, demo = false }) {
    if (demo) return { state: 'demo', actions: [] };
    if (!workspace || !account || unavailable.length) return { state: 'unavailable', actions: [] };
    const scoped = (records) => records.filter((record) => record.workspace === workspace);
    const actions = [];
    const add = (id, priority, title, reason, to) => actions.push({ id, priority, title, reason, to });
    for (const run of scoped(runs)) {
        if (run.status === 'awaiting_approval') add(`run:${run.id}`, 0, 'Review a waiting workflow step',
            'Inspect the frozen inputs and scope before deciding.', `/app/workflows?run=${encodeURIComponent(run.id)}`);
        else if (run.status === 'running') add(`run:${run.id}`, 3, 'Resume recorded work',
            'Read the latest receipt before recording another step.', `/app/workflows?run=${encodeURIComponent(run.id)}`);
    }
    for (const mission of scoped(missions)) {
        const to = `/app/missions?mission=${encodeURIComponent(mission.id)}`;
        if (mission.status === 'needs_attention') add(`mission:${mission.id}`, 1, `Resolve: ${mission.title}`, 'Inspect the recorded blocker before resuming work.', to);
        else if (['proposed', 'approved'].includes(mission.status)) {
            const issues = planIssues(mission.mission_plan);
            add(`mission:${mission.id}`, 2, `${issues.length ? 'Complete the plan' : mission.status === 'proposed' ? 'Review approval' : 'Start approved work'}: ${mission.title}`,
                issues.length ? `${issues.length} plan requirements remain.` : 'The saved plan must precede any effect.', to);
        } else if (mission.status === 'running') {
            const records = missionEvidence(mission, scoped(evidence));
            const independent = mission.mission_plan?.independent_review === true;
            const canReview = !independent || mission.owner !== account && records.some((record) => record.owner && record.owner !== account);
            add(`mission:${mission.id}`, 4, `${!records.length ? 'Record outcome evidence' : canReview ? 'Review recorded outcomes' : 'Arrange independent review'}: ${mission.title}`,
                !records.length ? 'No source-backed observation is linked yet.' : canReview ? 'Check all four TEVV outcomes against their evidence.' : 'The reviewer must differ from the proposer and selected evidence authors.', to);
        } else if (mission.status === 'verified') add(`mission:${mission.id}`, 7, `Inspect retained outcome: ${mission.title}`,
            'Export the observed chain for review; an export does not certify a submission.', `/app/replay?mission=${encodeURIComponent(mission.id)}`);
    }
    for (const task of scoped(tasks)) if (overdue(task, today)) add(`task:${task.id}`, 2, `Review overdue task: ${task.title}`,
        'Task completion and business-outcome verification are separate decisions.', `/app/erp?task=${encodeURIComponent(task.id)}`);
    const fresh = scoped(signals).filter((signal) => !signal.state || signal.state === 'new');
    if (fresh.length) add('signals', 5, `Triage ${fresh.length} new signal${fresh.length === 1 ? '' : 's'}`,
        'Review the source and propose bounded work.', '/app/signals');
    if (!scoped(missions).length && !fresh.length) add('begin', 6, 'Record the problem you want to solve',
        'Save one source-backed signal, then propose a mission.', '/app/signals');
    return { state: 'observed', actions: actions.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)).slice(0, 8) };
}
