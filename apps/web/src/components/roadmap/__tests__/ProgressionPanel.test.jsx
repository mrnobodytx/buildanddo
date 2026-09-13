// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/__tests__/ProgressionPanel.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/components/roadmap/ProgressionPanel.jsx,
//              apps/web/src/components/roadmap/RoadmapPulse.jsx,
//              apps/web/src/lib/roadmapStatus.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/roadmap/ProgressionPanel.jsx;
//              VALIDATES apps/web/src/components/roadmap/RoadmapPulse.jsx
// Intent:      The panel renders one row per axis with the estate's numbers
//              and flags day disagreement, staleness and contract change;
//              the pulse quotes the same block and both say UNMEASURED
//              (never zero) when there is nothing.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

import ProgressionPanel from '@/components/roadmap/ProgressionPanel';
import RoadmapPulse, { RoadmapPulseView } from '@/components/roadmap/RoadmapPulse';
import { progressionOf } from '@/lib/roadmapStatus';
import { progressionFixture, statusFixture } from '@/test/roadmapFixtures';

const NOW = Date.parse('2026-09-11T12:00:00Z');
const row = (id) => within(screen.getByTestId(id));

describe('ProgressionPanel', () => {
    it('renders every axis as its own row from a fresh projection', () => {
        render(<ProgressionPanel progression={progressionOf(statusFixture(), { now: NOW })} />);
        const panel = screen.getByTestId('progression-panel');
        expect(panel).toHaveAttribute('data-state', 'MEASURED');
        expect(screen.getByTestId('progression-day-label')).toHaveTextContent('D11 / 21');
        expect(screen.queryByTestId('progression-day-disagreement')).toBeNull();
        expect(screen.queryByTestId('progression-day-behind')).toBeNull();
        expect(row('progression-day').getByText(/Counted live from the operator anchor rule/)).toBeInTheDocument();
        expect(row('progression-day').getByText(/Rule: Operator-declared sprint index/)).toBeInTheDocument();
        expect(row('progression-calendar').getByText('42.9%')).toBeInTheDocument();
        expect(row('progression-plan').getByText('50%')).toBeInTheDocument();
        expect(row('progression-measured').getByText('56.8%')).toBeInTheDocument();
        expect(row('progression-verified').getByText('20%')).toBeInTheDocument();
        expect(row('progression-full').getByText('32.1%')).toBeInTheDocument();
        expect(row('progression-pace').getByText('AT RISK')).toBeInTheDocument();
        expect(row('progression-counts').getByText(/Criteria to date 37 of 78 · verified to date 21 of 25 · due holds 0/)).toBeInTheDocument();
        expect(row('progression-next-hard').getByText(/AI Tinkerers - Contextual Guildmaster · 2026-09-12 · in 1 day/)).toBeInTheDocument();
        expect(row('progression-source').getByText('Citadel Development Continuity + repository bridge')).toBeInTheDocument();
        expect(row('progression-observed').getByText(/2026-09-11 06:00 UTC · projection for 2026-09-11/)).toBeInTheDocument();
        expect(row('progression-freshness').getByText('FRESH')).toBeInTheDocument();
        expect(row('progression-contract').getByText('f569b6e3f259')).toBeInTheDocument();
        expect(screen.queryByTestId('progression-contract-changed')).toBeNull();
        // no averaged figure anywhere: the mean of the five axes never appears
        const mean = ((42.9 + 50 + 56.8 + 20 + 32.1) / 5).toFixed(1);
        expect(panel.textContent).not.toContain(`${mean}%`);
    });

    it('flags a plan-clock disagreement and a projection computed for an older day', () => {
        render(<ProgressionPanel progression={progressionOf(statusFixture(progressionFixture({ plan_day: 9, projection_day: 9, current_date: '2026-09-09', freshness: 'STALE', stale_days: 2 })), { now: NOW })} />);
        expect(screen.getByTestId('progression-day-label')).toHaveTextContent('D11 / 21');
        expect(screen.getByTestId('progression-day-disagreement')).toHaveTextContent('plan day 9 ≠ anchor day 11');
        expect(screen.getByTestId('progression-day-behind')).toHaveTextContent('projection computed for day 9');
        expect(row('progression-day').getByText(/2 days behind today/)).toBeInTheDocument();
    });

    it('renders UNMEASURED with Unknown rows, never zero, when the block is absent', () => {
        render(<ProgressionPanel progression={progressionOf(null, { now: NOW })} />);
        expect(screen.getByTestId('progression-panel')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(screen.getByTestId('progression-day-label')).toHaveTextContent('D-- / 21');
        expect(row('progression-measured').getByText('Unknown')).toBeInTheDocument();
        expect(row('progression-calendar').getByText('Unknown')).toBeInTheDocument();
        expect(row('progression-full').getByText('Unknown')).toBeInTheDocument();
        expect(row('progression-contract').getByText('Unknown')).toBeInTheDocument();
        expect(screen.getByTestId('progression-panel').textContent).not.toMatch(/\b0%/);
    });

    it('labels a stale projection and still quotes its numbers', () => {
        const stale = progressionOf(statusFixture(progressionFixture({ freshness: 'STALE', stale_days: 2, current_date: '2026-09-09' })), { now: NOW });
        render(<ProgressionPanel progression={stale} />);
        expect(screen.getByTestId('progression-panel')).toHaveAttribute('data-state', 'STALE');
        expect(row('progression-freshness').getByText(/STALE · 2 days behind the build/)).toBeInTheDocument();
        expect(row('progression-measured').getByText('56.8%')).toBeInTheDocument();
    });

    it('flags a measurement-contract change', () => {
        const changed = progressionOf(statusFixture(), { now: NOW, knownContract: 'b'.repeat(64) });
        render(<ProgressionPanel progression={changed} />);
        expect(screen.getByTestId('progression-contract-changed')).toHaveTextContent('contract changed');
    });

    it('is a labelled region with a definition list', () => {
        render(<ProgressionPanel progression={progressionOf(statusFixture(), { now: NOW })} />);
        const region = screen.getByRole('region', { name: /Where the campaign actually is/ });
        expect(region).toBeInTheDocument();
        expect(region.querySelector('dl')).not.toBeNull();
        expect(region.querySelectorAll('dt').length).toBeGreaterThanOrEqual(12);
    });
});

describe('RoadmapPulse', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-11T12:00:00Z')); });
    afterEach(() => { vi.useRealTimers(); });
    afterEach(() => {
        delete globalThis.fetch;
    });

    const renderPulse = (props) => render(
        <MemoryRouter>
            {props ? <RoadmapPulseView {...props} /> : <RoadmapPulse />}
        </MemoryRouter>,
    );

    it('quotes day, measured progression, pace and next hard milestone from a given status', () => {
        renderPulse({ status: statusFixture() });
        expect(screen.getByTestId('pulse-day')).toHaveTextContent('D11 / 21');
        expect(screen.getByTestId('pulse-measured')).toHaveTextContent('56.8%');
        expect(screen.getByTestId('pulse-pace')).toHaveTextContent('AT RISK');
        expect(screen.getByTestId('pulse-next')).toHaveTextContent('AI Tinkerers - Contextual Guildmaster · 1d');
        expect(screen.getByRole('link', { name: /Full roadmap/ })).toHaveAttribute('href', '/roadmap#progression');
    });

    it('is UNMEASURED-safe with an absent block', () => {
        renderPulse({ status: { state: 'MEASURED', sprint_day: 9 } });
        expect(screen.getByTestId('roadmap-pulse')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(screen.getByTestId('pulse-day')).toHaveTextContent('D-- / 21');
        expect(screen.getByTestId('pulse-measured')).toHaveTextContent('Unknown');
        expect(screen.getByTestId('pulse-note')).toHaveTextContent('Unknown is not zero');
    });

    it('reads the same status file through the shared hook', async () => {
        globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(statusFixture()) }));
        renderPulse(null);
        await waitFor(() => expect(screen.getByTestId('pulse-measured')).toHaveTextContent('56.8%'));
        expect(globalThis.fetch).toHaveBeenCalledWith('/roadmap-status.json', { cache: 'no-store' });
    });

    it('says the status is unavailable when the fetch fails', async () => {
        globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
        renderPulse(null);
        await waitFor(() => expect(screen.getByTestId('pulse-note')).toHaveTextContent('Live status unavailable'));
        expect(screen.getByTestId('pulse-measured')).toHaveTextContent('Unknown');
    });
});
