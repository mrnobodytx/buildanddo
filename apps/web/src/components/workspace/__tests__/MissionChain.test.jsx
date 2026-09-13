// CGRF: SRS=SRS-BUILDANDDO-MISSION-CHAIN-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/MissionChain.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-MISSION-CHAIN-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-12
// Depends:     apps/web/src/components/workspace/MissionChain.jsx,
//              apps/web/src/lib/missionChain.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/MissionChain.jsx
// Intent:      The drawn chain says on the page what the derivation says in
//              memory: empty stages read UNMEASURED rather than blank, the
//              trace is drawn in observed order, the origin channel is named,
//              and nothing outside the projected fields reaches the DOM.
// ───────────────────────────────────────────────────────────────

import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import MissionChain from '@/components/workspace/MissionChain';
import { deriveMissionChain, STAGES } from '@/lib/missionChain';

const mission = (overrides = {}) => ({
    id: 'mission_1',
    title: 'Replay a stranger-facing challenge end to end',
    status: 'proposed',
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
    mission: 'mission_1',
    channel: 'reddit',
    reference: 'https://reddit.example/r/buildanddo/comments/abc',
    observed_at: '2026-09-10T08:30:00Z',
    summary: 'Arrival recorded from the public record.',
    ...overrides,
});

const operation = (overrides = {}) => ({
    id: 'operations_1',
    mission: 'mission_1',
    name: 'Answer the thread',
    runbook: '1. Draft the reply. 2. Post it.',
    ...overrides,
});

const run = (overrides = {}) => ({
    id: 'operation_runs_1',
    operation: 'operations_1',
    result: 'succeeded',
    notes: 'Reply posted and permalink recorded.',
    created: '2026-09-10T10:00:00Z',
    ...overrides,
});

const evidence = (overrides = {}) => ({
    id: 'evidence_1',
    mission: 'mission_1',
    type: 'verified',
    content: 'Permalink fetched and the reply is live.',
    source: 'reddit permalink',
    created: '2026-09-10T11:00:00Z',
    ...overrides,
});

const stage = (id) => screen.getByTestId(`mission-chain-stage-${id}`);
const traceRows = () => screen.getAllByTestId('mission-chain-trace-row');

describe('MissionChain', () => {
    it('draws all six stages as UNMEASURED when there is nothing to draw', () => {
        render(<MissionChain />);

        expect(screen.getByTestId('mission-chain')).toHaveAttribute('data-current-stage', 'challenge');
        expect(screen.getByTestId('mission-chain')).toHaveAttribute('data-complete', 'false');
        for (const id of STAGES) {
            expect(stage(id)).toHaveAttribute('data-state', 'UNMEASURED');
            // Visibly unmeasured, not blank: the token itself is on the page.
            expect(within(stage(id)).getByText('UNMEASURED')).toBeInTheDocument();
            expect(within(stage(id)).getByText('No receipt')).toBeInTheDocument();
        }
        expect(screen.getByTestId('mission-chain-origin')).toHaveAttribute('data-channel', 'unmeasured');
        expect(screen.getByText('Origin unmeasured')).toBeInTheDocument();
        expect(screen.getByTestId('mission-chain-trace-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('mission-chain-trace')).toBeNull();
    });

    it('names the channel a reddit-origin mission arrived on', () => {
        render(<MissionChain chain={deriveMissionChain({ mission: mission(redditOrigin) })} />);

        const origin = screen.getByTestId('mission-chain-origin');
        expect(origin).toHaveAttribute('data-channel', 'reddit');
        expect(within(origin).getByText('Reddit')).toBeInTheDocument();
        expect(
            within(origin).getByText('https://reddit.example/r/buildanddo/comments/abc'),
        ).toBeInTheDocument();
        expect(stage('challenge')).toHaveAttribute('data-state', 'COMPLETE');
    });

    it('says the arrival time is unmeasured rather than showing a made-up one', () => {
        render(
            <MissionChain
                chain={deriveMissionChain({
                    mission: mission({ ...redditOrigin, origin_observed_at: '' }),
                })}
            />,
        );

        expect(screen.getByText('arrival time unmeasured')).toBeInTheDocument();
        expect(screen.getByTestId('mission-chain-stage-replay')).toHaveAttribute(
            'data-state',
            'UNMEASURED',
        );
    });

    it('leaves earlier stages unmeasured when only a later receipt exists', () => {
        render(
            <MissionChain
                chain={deriveMissionChain({
                    mission: mission({ status: 'verified' }),
                    evidence: [evidence()],
                })}
            />,
        );

        expect(stage('verification')).toHaveAttribute('data-state', 'COMPLETE');
        expect(stage('challenge')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(stage('event')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(stage('bounded_action')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(stage('replay')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(screen.getByTestId('mission-chain-next-receipt')).toHaveTextContent(
            'Next receipt needed — Challenge:',
        );
    });

    it('says on the page that the mission receipt is a declaration, not proof', () => {
        render(<MissionChain chain={deriveMissionChain({ mission: mission({ status: 'verified' }) })} />);

        expect(stage('mission')).toHaveAttribute('data-state', 'COMPLETE');
        expect(
            within(stage('mission')).getByText('1 receipt — declared intent, not proof'),
        ).toBeInTheDocument();
    });

    it('names a runbook that has never run instead of counting it as an action', () => {
        render(
            <MissionChain
                chain={deriveMissionChain({
                    mission: mission(),
                    operations: [operation()],
                    runs: [],
                })}
            />,
        );

        expect(stage('bounded_action')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(
            within(stage('bounded_action')).getByText('1 runbook declared, 0 runs'),
        ).toBeInTheDocument();
    });

    it('draws the replay trace in observed order', () => {
        render(
            <MissionChain
                chain={deriveMissionChain({
                    mission: mission({ ...redditOrigin, status: 'verified' }),
                    evidence: [evidence()],
                    runs: [run()],
                    operations: [operation()],
                    events: [
                        event({ id: 'mission_events_2', observed_at: '2026-09-10T09:30:00Z', summary: 'Second arrival.' }),
                        event(),
                    ],
                })}
            />,
        );

        expect(traceRows().map((row) => row.getAttribute('data-stage'))).toEqual([
            'challenge',
            'event',
            'mission',
            'event',
            'bounded_action',
            'verification',
        ]);
        expect(traceRows()[0]).toHaveTextContent('A stranger asked whether the replay is real.');
        expect(traceRows()[1]).toHaveTextContent('Arrival recorded from the public record.');
        expect(traceRows()[3]).toHaveTextContent('Second arrival.');
        expect(traceRows()[4]).toHaveTextContent('Reply posted and permalink recorded.');
        expect(traceRows()[5]).toHaveTextContent('Permalink fetched and the reply is live.');
        expect(screen.getByTestId('mission-chain')).toHaveAttribute('data-complete', 'true');
        expect(within(screen.getByTestId('mission-chain-replay-state')).getByText('COMPLETE'))
            .toBeInTheDocument();
        expect(screen.queryByTestId('mission-chain-next-receipt')).toBeNull();
    });

    it('says a source was unreadable rather than letting it pass for an empty one', () => {
        render(
            <MissionChain
                chain={deriveMissionChain({ mission: mission(redditOrigin) })}
                unreadableSources={['mission_events', 'evidence']}
            />,
        );

        const notice = screen.getByTestId('mission-chain-unreadable');
        expect(notice).toHaveTextContent('Could not read mission_events, evidence.');
        expect(notice).toHaveTextContent('because the source is unreachable, not because nothing happened');
    });

    it('renders no field the projection does not carry', () => {
        const { container } = render(
            <MissionChain
                chain={deriveMissionChain({
                    mission: mission({ ...redditOrigin, api_key: 'sk-' + 'live-NEVER-RENDER-ME' }),
                    events: [event({ webhook_secret: 'whsec-' + 'NEVER-RENDER-ME' })],
                    operations: [operation({ deploy_token: 'tok-NEVER-RENDER-ME' })],
                    runs: [run({ bearer_token: 'tok-NEVER-RENDER-ME' })],
                    evidence: [evidence({ password: 'pw-NEVER-RENDER-ME' })],
                })}
            />,
        );

        expect(container.textContent).not.toContain('NEVER-RENDER-ME');
        expect(container.innerHTML).not.toContain('NEVER-RENDER-ME');
        // The receipts it is meant to show are still on the page.
        expect(screen.getByText('Permalink fetched and the reply is live.')).toBeInTheDocument();
    });
});
