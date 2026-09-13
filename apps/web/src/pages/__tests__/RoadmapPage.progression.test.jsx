// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/RoadmapPage.progression.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/pages/RoadmapPage.jsx,
//              apps/web/src/pages/HomePage.jsx,
//              apps/web/src/components/roadmap/ProgressionPanel.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/RoadmapPage.jsx;
//              VALIDATES apps/web/src/pages/HomePage.jsx
// Intent:      The roadmap page mounts the Progression panel above the plot,
//              draws the ACTUAL marker from milestone evidence (not measured
//              progression), and the front page carries the pulse; both say
//              UNMEASURED when the projection carries nothing.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/utils';
import RoadmapPage from '@/pages/RoadmapPage';
import HomePage from '@/pages/HomePage';
import { progressionFixture, statusFixture } from '@/test/roadmapFixtures';

const fresh = () => progressionFixture({ generated_at: new Date().toISOString(), current_date: new Date().toISOString().slice(0, 10) });

const mockFetch = (body) => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
};

describe('RoadmapPage progression panel', () => {
    beforeEach(() => {
        vi.stubGlobal('scrollTo', vi.fn());
        vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        delete globalThis.fetch;
    });

    it('renders the panel above the plot with measured progression separate from milestone evidence', async () => {
        mockFetch(statusFixture(fresh(), { generated_at: new Date().toISOString(), recent_commits: [] }));
        renderWithProviders(<RoadmapPage />, { route: '/roadmap' });
        await waitFor(() => expect(screen.getByTestId('progression-panel')).toHaveAttribute('data-state', 'MEASURED'));

        const panel = screen.getByTestId('progression-panel');
        const chart = document.getElementById('sprint-chart');
        expect(panel.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        expect(within(screen.getByTestId('progression-measured')).getByText('56.8%')).toBeInTheDocument();
        expect(within(screen.getByTestId('progression-verified')).getByText('20%')).toBeInTheDocument();
        expect(screen.getByTestId('ticker-progression')).toHaveTextContent('MEASURED PROGRESSION: 56.8%');
        // the ACTUAL marker is milestone evidence at the plan day, never the measured figure
        expect(screen.getByTestId('ticker-actual')).toHaveTextContent('ACTUAL = MILESTONE EVIDENCE: 20% (plan day 11)');
        expect(screen.getByRole('img', { name: /Milestone evidence 20% of the plan on plan day 11/ })).toBeInTheDocument();
        expect(screen.getByText(/ACTUAL \(EVIDENCE\) 20%/)).toBeInTheDocument();
    });

    it('renders UNMEASURED, not zero, when the projection carries no progression block', async () => {
        mockFetch(statusFixture(undefined, { progression: undefined, generated_at: new Date().toISOString(), recent_commits: [] }));
        renderWithProviders(<RoadmapPage />, { route: '/roadmap' });
        await waitFor(() => expect(screen.getByTestId('ticker-progression')).toHaveTextContent('MEASURED PROGRESSION: UNMEASURED'));
        expect(screen.getByTestId('progression-panel')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(within(screen.getByTestId('progression-measured')).getByText('Unknown')).toBeInTheDocument();
    });
});

describe('HomePage roadmap pulse', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
        delete globalThis.fetch;
    });

    it('mounts the pulse near the top and quotes the projection', async () => {
        mockFetch(statusFixture(fresh()));
        renderWithProviders(<HomePage />, { auth: { isAuthed: false, user: null }, workspace: { active: null } });
        await waitFor(() => expect(screen.getByTestId('pulse-measured')).toHaveTextContent('56.8%'));
        const pulse = screen.getByTestId('roadmap-pulse');
        const glance = document.getElementById('glance');
        expect(pulse.compareDocumentPosition(glance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
