// CGRF: SRS=SRS-BUILDANDDO-MISSION-CHAIN-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/MissionLoopSummary.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-MISSION-CHAIN-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/workspace/MissionLoopSummary.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/MissionLoopSummary.jsx
// Intent:      The loop strip counts only receipt-complete stages per mission,
//              never borrows a later stage's proof forward, renders nothing
//              with no missions, and states honestly when nothing is verified.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MissionLoopSummary from '@/components/workspace/MissionLoopSummary';
import { CHAIN_STATE, STAGES } from '@/lib/missionChain';

// A chain whose stages are COMPLETE up to and including `upto` (by STAGES index).
const chainUpTo = (upto) => {
    const stageState = {};
    STAGES.forEach((id, i) => { stageState[id] = i <= upto ? CHAIN_STATE.COMPLETE : CHAIN_STATE.UNMEASURED; });
    return { stageState, complete: upto >= STAGES.length - 1 };
};

describe('MissionLoopSummary', () => {
    it('renders nothing when there are no missions', () => {
        const { container } = render(<MissionLoopSummary chains={{}} missions={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('counts only receipt-complete stages per mission and never borrows forward', () => {
        // m1 reached verification (idx 4); m2 reached mission (idx 2); m3 has no chain at all.
        const chains = { m1: chainUpTo(4), m2: chainUpTo(2) };
        const missions = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
        render(<MissionLoopSummary chains={chains} missions={missions} />);
        expect(screen.getByTestId('mission-loop-count-challenge')).toHaveTextContent('2 of 3');
        expect(screen.getByTestId('mission-loop-count-mission')).toHaveTextContent('2 of 3');
        expect(screen.getByTestId('mission-loop-count-bounded_action')).toHaveTextContent('1 of 3');
        expect(screen.getByTestId('mission-loop-count-verification')).toHaveTextContent('1 of 3');
        expect(screen.getByTestId('mission-loop-count-replay')).toHaveTextContent('none yet');
        expect(screen.getByTestId('mission-loop-note')).toHaveTextContent(/reached verification/i);
    });

    it('is honest when nothing has been verified yet — unmeasured, not zero', () => {
        const chains = { m1: chainUpTo(1) }; // only challenge + event have receipts
        render(<MissionLoopSummary chains={chains} missions={[{ id: 'm1' }]} />);
        expect(screen.getByTestId('mission-loop-count-verification')).toHaveTextContent('none yet');
        expect(screen.getByTestId('mission-loop-note')).toHaveTextContent(/No mission has reached verification/i);
    });
});
