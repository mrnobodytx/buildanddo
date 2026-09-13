// CGRF: SRS=SRS-BUILDANDDO-MISSION-CHAIN-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/missionChain.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-MISSION-CHAIN-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-12
// Depends:     apps/web/src/lib/missionChain.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/missionChain.js
// Intent:      Hold the derivation to the truth ladder: no receipt means
//              UNMEASURED, a later receipt never completes an earlier stage,
//              the trace is ordered by when things were observed, and no raw
//              record field escapes into the projection.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';

import {
    buildMissionChains,
    CHAIN_STATE,
    deriveMissionChain,
    ORIGIN_CHANNELS,
    STAGES,
} from '@/lib/missionChain';

const { COMPLETE, UNMEASURED } = CHAIN_STATE;

const mission = (overrides = {}) => ({
    id: 'mission_1',
    collectionName: 'missions',
    title: 'Replay a stranger-facing challenge end to end',
    description: 'Take one public request all the way to a verified outcome.',
    status: 'proposed',
    workspace: 'ws_test',
    owner: 'user_test',
    created: '2026-09-10T09:00:00Z',
    ...overrides,
});

const redditOrigin = {
    origin_channel: 'reddit',
    origin_ref: 'https://reddit.example/r/buildanddo/comments/abc',
    origin_observed_at: '2026-09-10T08:00:00Z',
    origin_summary: 'A stranger asked whether the replay is real.',
};

const event = (overrides = {}) => ({
    id: 'mission_events_1',
    collectionName: 'mission_events',
    mission: 'mission_1',
    channel: 'reddit',
    reference: 'https://reddit.example/r/buildanddo/comments/abc',
    observed_at: '2026-09-10T08:30:00Z',
    summary: 'Arrival recorded from the public record.',
    ...overrides,
});

const operation = (overrides = {}) => ({
    id: 'operations_1',
    collectionName: 'operations',
    mission: 'mission_1',
    name: 'Answer the thread',
    runbook: '1. Draft the reply. 2. Post it. 3. Record the permalink.',
    ...overrides,
});

const run = (overrides = {}) => ({
    id: 'operation_runs_1',
    collectionName: 'operation_runs',
    operation: 'operations_1',
    result: 'succeeded',
    notes: 'Reply posted and permalink recorded.',
    created: '2026-09-10T10:00:00Z',
    ...overrides,
});

const evidence = (overrides = {}) => ({
    id: 'evidence_1',
    collectionName: 'evidence',
    mission: 'mission_1',
    type: 'verified',
    content: 'Permalink fetched and the reply is live.',
    source: 'reddit permalink',
    created: '2026-09-10T11:00:00Z',
    ...overrides,
});

const fullChainInput = () => ({
    mission: mission({ ...redditOrigin, status: 'verified' }),
    events: [event()],
    operations: [operation()],
    runs: [run()],
    evidence: [evidence()],
});

describe('deriveMissionChain', () => {
    it('exposes the six stages in chain order', () => {
        expect(STAGES).toEqual([
            'challenge',
            'event',
            'mission',
            'bounded_action',
            'verification',
            'replay',
        ]);
        expect(deriveMissionChain(fullChainInput()).stages.map((s) => s.id)).toEqual([...STAGES]);
    });

    it('reads every stage as UNMEASURED when there is no record at all', () => {
        const chain = deriveMissionChain({});

        expect(chain.stages.map((stage) => stage.state)).toEqual(Array(6).fill(UNMEASURED));
        expect(chain.current).toBe('challenge');
        expect(chain.complete).toBe(false);
        expect(chain.trace).toEqual([]);
        expect(chain.origin).toMatchObject({ channel: null, ref: null, at: null, measured: false });
    });

    it('completes only the mission stage for a stored mission with nothing recorded against it', () => {
        const chain = deriveMissionChain({ mission: mission() });

        expect(chain.stageState).toEqual({
            challenge: UNMEASURED,
            event: UNMEASURED,
            mission: COMPLETE,
            bounded_action: UNMEASURED,
            verification: UNMEASURED,
            replay: UNMEASURED,
        });
        expect(chain.current).toBe('challenge');
        expect(chain.trace.map((row) => row.stage)).toEqual(['mission']);
    });

    it('never lets the mission status stand in for a receipt', () => {
        const chain = deriveMissionChain({ mission: mission({ status: 'verified' }) });

        expect(chain.stageState.verification).toBe(UNMEASURED);
        expect(chain.stageState.bounded_action).toBe(UNMEASURED);
        expect(chain.complete).toBe(false);
    });

    it('does not let a later receipt complete an earlier stage', () => {
        const chain = deriveMissionChain({
            mission: mission({ status: 'verified' }),
            evidence: [evidence()],
        });

        expect(chain.stageState.verification).toBe(COMPLETE);
        expect(chain.stageState.challenge).toBe(UNMEASURED);
        expect(chain.stageState.event).toBe(UNMEASURED);
        expect(chain.stageState.bounded_action).toBe(UNMEASURED);
        expect(chain.stageState.replay).toBe(UNMEASURED);
        // The first gap is still the first stage, not the last one filled.
        expect(chain.current).toBe('challenge');
    });

    it('counts a runbook with no run as no receipt for the bounded action', () => {
        const chain = deriveMissionChain({
            mission: mission(),
            operations: [operation()],
            runs: [],
        });

        expect(chain.stageState.bounded_action).toBe(UNMEASURED);
        expect(chain.counts.operations).toBe(1);
        expect(chain.counts.runs).toBe(0);
    });

    it('accepts only verified evidence as the verification receipt', () => {
        const chain = deriveMissionChain({
            mission: mission(),
            evidence: [
                evidence({ id: 'evidence_2', type: 'attempted' }),
                evidence({ id: 'evidence_3', type: 'observed' }),
            ],
        });

        expect(chain.stageState.verification).toBe(UNMEASURED);
        expect(chain.counts.evidence).toBe(2);
        expect(chain.counts.verified).toBe(0);
    });

    it('ignores records belonging to another mission or another operation', () => {
        const chain = deriveMissionChain({
            mission: mission(),
            events: [event({ id: 'mission_events_9', mission: 'mission_other' })],
            operations: [operation()],
            runs: [run({ id: 'operation_runs_9', operation: 'operations_other' })],
            evidence: [evidence({ id: 'evidence_9', mission: 'mission_other' })],
        });

        expect(chain.counts).toMatchObject({ events: 0, runs: 0, evidence: 0, operations: 1 });
        expect(chain.stageState.event).toBe(UNMEASURED);
        expect(chain.stageState.bounded_action).toBe(UNMEASURED);
        expect(chain.stageState.verification).toBe(UNMEASURED);
    });

    it('orders the replay trace by when each receipt was observed', () => {
        const chain = deriveMissionChain({
            // Deliberately passed newest-first, the order PocketBase returns.
            mission: mission({ ...redditOrigin }),
            evidence: [evidence()],
            runs: [run()],
            operations: [operation()],
            events: [
                event({ id: 'mission_events_2', observed_at: '2026-09-10T09:30:00Z', summary: 'Second arrival.' }),
                event(),
            ],
        });

        expect(chain.trace.map((row) => row.at)).toEqual([
            '2026-09-10T08:00:00Z',
            '2026-09-10T08:30:00Z',
            '2026-09-10T09:00:00Z',
            '2026-09-10T09:30:00Z',
            '2026-09-10T10:00:00Z',
            '2026-09-10T11:00:00Z',
        ]);
        expect(chain.trace.map((row) => row.stage)).toEqual([
            'challenge',
            'event',
            'mission',
            'event',
            'bounded_action',
            'verification',
        ]);
    });

    it('falls back to the row creation time when an arrival was never timed', () => {
        const chain = deriveMissionChain({
            mission: mission(),
            events: [event({ observed_at: '', created: '2026-09-10T07:00:00Z' })],
        });

        expect(chain.stageState.event).toBe(COMPLETE);
        expect(chain.trace[0]).toMatchObject({ stage: 'event', at: '2026-09-10T07:00:00Z' });
    });

    it('accepts the stored stage-transition shape as the arrival receipt', () => {
        // The shipped mission_events collection (migration 1789200000) has no
        // `channel` column at all: an arrival is the row whose stage is
        // 'event'. Read strictly for a channel, every stored arrival reads
        // UNMEASURED and the chain can never be replayed.
        const stored = {
            id: 'mission_events_s',
            collectionName: 'mission_events',
            mission: 'mission_1',
            stage: 'event',
            actor: 'public record',
            summary: 'Arrival recorded from the public record.',
            ref: 'https://reddit.example/r/buildanddo/comments/abc',
            observed_at: '2026-09-10T08:30:00Z',
            created: '2026-09-10T08:31:00Z',
        };
        const chain = deriveMissionChain({
            mission: mission({ ...redditOrigin, status: 'verified' }),
            events: [stored],
            operations: [operation()],
            runs: [run()],
            evidence: [evidence()],
        });

        expect(chain.stageState.event).toBe(COMPLETE);
        expect(chain.stageState.replay).toBe(COMPLETE);
        expect(chain.trace.map((row) => row.stage)).toContain('event');
        expect(chain.trace.find((row) => row.stage === 'event')).toMatchObject({
            at: '2026-09-10T08:30:00Z',
            actor: 'public record',
            ref: 'https://reddit.example/r/buildanddo/comments/abc',
        });
    });

    it('does not let a later stage-transition row complete the arrival', () => {
        const chain = deriveMissionChain({
            mission: mission({ ...redditOrigin }),
            events: [
                {
                    id: 'mission_events_v',
                    mission: 'mission_1',
                    stage: 'verification',
                    summary: 'Verification step logged.',
                    observed_at: '2026-09-10T11:30:00Z',
                },
            ],
        });

        expect(chain.counts.events).toBe(1);
        expect(chain.stageState.event).toBe(UNMEASURED);
        expect(chain.stageState.replay).toBe(UNMEASURED);
        expect(chain.current).toBe('event');
    });

    it('reads a reddit origin off the mission and completes the challenge stage', () => {
        const chain = deriveMissionChain({ mission: mission(redditOrigin) });

        expect(ORIGIN_CHANNELS).toContain('reddit');
        expect(chain.origin).toEqual({
            channel: 'reddit',
            ref: 'https://reddit.example/r/buildanddo/comments/abc',
            at: '2026-09-10T08:00:00Z',
            source: 'mission',
            measured: true,
        });
        expect(chain.stageState.challenge).toBe(COMPLETE);
    });

    it('leaves the challenge unmeasured when the mission names a channel but no request', () => {
        const chain = deriveMissionChain({ mission: mission({ origin_channel: 'wiki' }) });

        expect(chain.origin.channel).toBe('wiki');
        expect(chain.stageState.challenge).toBe(UNMEASURED);
    });

    it('reports an origin read from the recorded arrival as such, and still no challenge receipt', () => {
        const chain = deriveMissionChain({ mission: mission(), events: [event()] });

        expect(chain.origin).toMatchObject({ channel: 'reddit', source: 'event', measured: true });
        expect(chain.stageState.challenge).toBe(UNMEASURED);
        expect(chain.stageState.event).toBe(COMPLETE);
    });

    it('completes the replay only when every earlier receipt is present and timed', () => {
        const chain = deriveMissionChain(fullChainInput());

        expect(chain.stages.map((stage) => stage.state)).toEqual(Array(6).fill(COMPLETE));
        expect(chain.complete).toBe(true);
        expect(chain.current).toBe('replay');
        expect(chain.stages.at(-1).receipts).toBe(chain.trace.length);
    });

    it('refuses to call the chain replayable when a receipt has no time on it', () => {
        const input = fullChainInput();
        input.mission = mission({ ...redditOrigin, origin_observed_at: '', status: 'verified' });
        const chain = deriveMissionChain(input);

        expect(chain.stageState.challenge).toBe(COMPLETE);
        expect(chain.stageState.replay).toBe(UNMEASURED);
        expect(chain.complete).toBe(false);
        expect(chain.trace.at(-1).stage).toBe('challenge');
    });

    it('projects trace rows field by field, so an unrendered column cannot leak', () => {
        const chain = deriveMissionChain({
            mission: mission({ ...redditOrigin, api_key: 'sk-' + 'live-NEVER-RENDER-ME' }),
            events: [event({ webhook_secret: 'whsec-NEVER-RENDER-ME' })],
            operations: [operation()],
            runs: [run({ bearer_token: 'tok-NEVER-RENDER-ME' })],
            evidence: [evidence({ password: 'pw-NEVER-RENDER-ME' })],
        });

        for (const row of chain.trace) {
            expect(Object.keys(row).sort()).toEqual(['actor', 'at', 'ref', 'stage', 'summary']);
        }
        expect(JSON.stringify(chain)).not.toContain('NEVER-RENDER-ME');
    });
});

describe('buildMissionChains', () => {
    it('derives one chain per mission from shared record lists', () => {
        const first = mission({ ...redditOrigin });
        const second = mission({ id: 'mission_2', title: 'Unlinked mission', created: '2026-09-11T09:00:00Z' });

        const chains = buildMissionChains([first, second], {
            events: [event()],
            operations: [operation()],
            runs: [run()],
            evidence: [evidence()],
        });

        expect(Object.keys(chains).sort()).toEqual(['mission_1', 'mission_2']);
        expect(chains.mission_1.complete).toBe(true);
        expect(chains.mission_2.stageState).toMatchObject({
            challenge: UNMEASURED,
            event: UNMEASURED,
            mission: COMPLETE,
            bounded_action: UNMEASURED,
            verification: UNMEASURED,
            replay: UNMEASURED,
        });
    });

    it('returns nothing for an empty mission list rather than inventing a row', () => {
        expect(buildMissionChains([], { events: [event()] })).toEqual({});
    });
});
