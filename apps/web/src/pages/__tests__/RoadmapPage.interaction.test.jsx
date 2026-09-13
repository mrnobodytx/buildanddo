// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/RoadmapPage.interaction.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/pages/RoadmapPage.jsx,
//              apps/web/src/components/roadmap/*,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/RoadmapPage.jsx;
//              VALIDATES apps/web/src/components/roadmap/milestoneA11y.js
// Intent:      Prove a mouse, a touch and a keyboard user can each pin a
//              milestone, that the pin persists and releases on Escape, that
//              arrow keys walk the markers, that the legend filters the ledger
//              and that the ledger can pin a marker back on the chart.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), initTelemetry: vi.fn() }));

import RoadmapPage from '@/pages/RoadmapPage';
import { trackEvent } from '@/lib/telemetry';
import { dayForKey, milestoneLabel } from '@/components/roadmap/milestoneA11y';
import { publicUrlForSource } from '@/lib/publicLinks';
import { act, fireEvent, renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

const fixture = () => ({
    generated_at: new Date().toISOString(),
    state: 'MEASURED',
    campaign_id: 'BND-SPRINT-01',
    sprint_day: 3,
    sprint_days: 21,
    planned_pct: 12,
    actual_pct: 0,
    gate_state: 'PASS',
    milestone_state_source: 'fixture',
    milestones: [
        { day: 1, status: 'verified', evidence: 'receipt://deploy/2026-09-07', verified_at: '2026-09-07T00:00:00Z' },
        { day: 3, status: 'in_progress' },
        // verified without evidence must NOT render as verified
        { day: 5, status: 'verified', evidence: '' },
    ],
    recent_commits: [],
    signals_state: 'MEASURED',
    signals_reason: null,
    signals_generated_at: new Date().toISOString(),
    signals: {
        schema: 'buildanddo.roadmap-signals/v1',
        generated_at: new Date().toISOString(),
        state: 'MEASURED',
        sources: {
            github: { state: 'MEASURED', reason: null, repo: 'mrnobodytx/buildanddo', freshness: { data_at: null }, metrics: { commits_7d: 1 } },
            wiki: { state: 'UNMEASURED', reason: 'SECRET_NAMES_NOT_RESOLVED:WIKIJS_API_TOKEN', freshness: { data_at: null }, metrics: {} },
            datadog: { state: 'MEASURED', reason: null, freshness: { data_at: null }, metrics: { monitors: 1 } },
        },
        failures: [],
    },
});

const mockFetch = (body) => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
};

async function renderRoadmap() {
    mockFetch(fixture());
    const utils = renderWithProviders(<RoadmapPage />, { route: '/roadmap' });
    // wait for the projection to land so statuses reflect the fixture
    await waitFor(() => expect(screen.getByTestId('milestone-marker-1')).toHaveAttribute('aria-label', expect.stringMatching(/verified$/)));
    return utils;
}

describe('milestoneA11y helpers', () => {
    it('labels a marker with day, title and status wording', () => {
        expect(milestoneLabel({ day: 9, title: 'Missions', status: 'in_progress' })).toBe('Day 9: Missions — in progress');
    });

    it('walks days with arrows, Home and End and clamps at both ends', () => {
        const days = [1, 3, 5];
        expect(dayForKey('ArrowRight', days, 1)).toBe(3);
        expect(dayForKey('ArrowDown', days, 3)).toBe(5);
        expect(dayForKey('ArrowRight', days, 5)).toBe(5);
        expect(dayForKey('ArrowLeft', days, 1)).toBe(1);
        expect(dayForKey('Home', days, 5)).toBe(1);
        expect(dayForKey('End', days, 1)).toBe(5);
        expect(dayForKey('Tab', days, 1)).toBeNull();
    });

    it('resolves a public URL from the record before the fallback list, and none for private sources', () => {
        expect(publicUrlForSource('github', { repo: 'org/repo' })).toBe('https://github.com/org/repo');
        expect(publicUrlForSource('github', {})).toMatch(/^https:\/\/github\.com\//);
        expect(publicUrlForSource('wiki', { url: 'https://example.test/wiki' })).toBe('https://example.test/wiki');
        expect(publicUrlForSource('wiki', { url: 'javascript:alert(1)' })).toMatch(/^https:\/\//);
        expect(publicUrlForSource('datadog', {})).toBeNull();
        expect(publicUrlForSource('posthog', { url: 'https://x.test' })).toBe('https://x.test');
    });
});

describe('RoadmapPage interactions', () => {
    beforeEach(() => {
        vi.stubGlobal('scrollTo', vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        delete globalThis.fetch;
    });

    it('renders every marker as a focusable button with an accessible label', async () => {
        await renderRoadmap();
        const markers = screen.getAllByRole('button', { name: /^Day \d+: / });
        expect(markers).toHaveLength(11);
        for (const m of markers) {
            expect(m).toHaveAttribute('tabindex', '0');
            expect(m).toHaveAttribute('aria-pressed', 'false');
        }
        expect(screen.getByRole('button', { name: 'Day 1: Sprint kickoff — foundations — verified' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Day 3: Auth & onboarding hardening — in progress' })).toBeInTheDocument();
        // verified without evidence stays planned
        expect(screen.getByRole('button', { name: 'Day 5: Workspace collections live — planned' })).toBeInTheDocument();
    });

    it('click pins the milestone and the detail card shows it with provenance', async () => {
        await renderRoadmap();
        expect(screen.getByTestId('milestone-detail-empty')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('milestone-marker-9'));
        const detail = await screen.findByTestId('milestone-detail');
        expect(screen.getByTestId('milestone-marker-9')).toHaveAttribute('aria-pressed', 'true');
        expect(within(detail).getByText('Missions — bounded-action engine')).toBeInTheDocument();
        expect(within(detail).getByText(/planned completion 40%/)).toBeInTheDocument();
        expect(within(detail).getByText(/Day 9 · pinned/)).toBeInTheDocument();
        expect(within(detail).getByText('Unknown', { selector: 'dd[title]' })).toBeInTheDocument();
        expect(within(detail).getByText('fixture')).toBeInTheDocument();
        expect(within(detail).getByRole('link', { name: /Jump to ledger entry/ })).toHaveAttribute('href', '#milestone-day-9');
        expect(trackEvent).toHaveBeenCalledWith('roadmap_milestone_pin', expect.objectContaining({ day: 9, via: 'chart' }));
    });

    it('shows the evidence reference for a verified milestone', async () => {
        await renderRoadmap();
        fireEvent.click(screen.getByTestId('milestone-marker-1'));
        const detail = await screen.findByTestId('milestone-detail');
        expect(within(detail).getByText('receipt://deploy/2026-09-07')).toBeInTheDocument();
        expect(within(detail).getByText('2026-09-07T00:00:00Z')).toBeInTheDocument();
    });

    it('the pin persists after the pointer leaves, and Escape unpins', async () => {
        await renderRoadmap();
        const marker = screen.getByTestId('milestone-marker-7');
        fireEvent.pointerEnter(marker, { pointerType: 'mouse' });
        fireEvent.click(marker);
        fireEvent.pointerLeave(marker);
        expect(screen.getByTestId('milestone-detail')).toBeInTheDocument();
        expect(marker).toHaveAttribute('aria-pressed', 'true');
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.getByTestId('milestone-detail-empty')).toBeInTheDocument());
        expect(marker).toHaveAttribute('aria-pressed', 'false');
    });

    it('Enter and Space pin from the keyboard; the Unpin button releases', async () => {
        await renderRoadmap();
        const marker = screen.getByTestId('milestone-marker-3');
        act(() => marker.focus());
        fireEvent.keyDown(marker, { key: 'Enter' });
        expect(marker).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Unpin milestone' }));
        expect(marker).toHaveAttribute('aria-pressed', 'false');
        fireEvent.keyDown(marker, { key: ' ' });
        expect(marker).toHaveAttribute('aria-pressed', 'true');
        expect(trackEvent).toHaveBeenCalledWith('roadmap_milestone_pin', expect.objectContaining({ day: 3, via: 'keyboard' }));
    });

    it('arrow keys move focus and the pin to the neighbouring milestone', async () => {
        await renderRoadmap();
        const d5 = screen.getByTestId('milestone-marker-5');
        act(() => d5.focus());
        fireEvent.keyDown(d5, { key: 'ArrowRight' });
        const d7 = screen.getByTestId('milestone-marker-7');
        expect(document.activeElement).toBe(d7);
        expect(d7).toHaveAttribute('aria-pressed', 'true');
        expect(d5).toHaveAttribute('aria-pressed', 'false');
        fireEvent.keyDown(d7, { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(d5);
        expect(d5).toHaveAttribute('aria-pressed', 'true');
        fireEvent.keyDown(d5, { key: 'End' });
        expect(document.activeElement).toBe(screen.getByTestId('milestone-marker-21'));
    });

    it('legend chips filter the ledger (multi-select) and Clear restores it', async () => {
        await renderRoadmap();
        const ledger = screen.getByTestId('milestone-ledger');
        expect(within(ledger).getAllByRole('article')).toHaveLength(11);

        const verified = screen.getByTestId('status-filter-verified');
        fireEvent.click(verified);
        expect(verified).toHaveAttribute('aria-pressed', 'true');
        expect(within(ledger).getAllByRole('article')).toHaveLength(1);
        expect(within(ledger).getByTestId('ledger-entry-1')).toBeInTheDocument();
        expect(screen.getByTestId('ledger-filter-note')).toHaveTextContent('Showing 1 of 11');

        fireEvent.click(screen.getByTestId('status-filter-in_progress'));
        expect(within(ledger).getAllByRole('article')).toHaveLength(2);
        expect(trackEvent).toHaveBeenLastCalledWith('roadmap_status_filter', { statuses: ['in_progress', 'verified'] });

        fireEvent.click(screen.getByTestId('status-filter-blocked'));
        expect(within(ledger).getAllByRole('article')).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(within(ledger).getAllByRole('article')).toHaveLength(11);
        expect(verified).toHaveAttribute('aria-pressed', 'false');
    });

    it('ledger "Show on chart" pins the marker and reports the pin', async () => {
        await renderRoadmap();
        const entry = screen.getByTestId('ledger-entry-13');
        expect(entry).toHaveAttribute('id', 'milestone-day-13');
        fireEvent.click(within(entry).getByRole('button', { name: 'Show day 13 on chart' }));
        expect(screen.getByTestId('milestone-marker-13')).toHaveAttribute('aria-pressed', 'true');
        expect(entry).toHaveAttribute('data-pinned', 'true');
        expect(within(entry).getByRole('button', { name: 'Show day 13 on chart' })).toHaveTextContent('On chart');
        expect(trackEvent).toHaveBeenCalledWith('roadmap_milestone_pin', expect.objectContaining({ day: 13, via: 'ledger' }));
    });

    it('"Jump to ledger entry" highlights the entry and reports the jump', async () => {
        await renderRoadmap();
        fireEvent.click(screen.getByTestId('milestone-marker-17'));
        const user = setupUser();
        await user.click(screen.getByRole('link', { name: /Jump to ledger entry/ }));
        expect(screen.getByTestId('ledger-entry-17').className).toMatch(/bg-primary\/10/);
        expect(trackEvent).toHaveBeenCalledWith('roadmap_ledger_jump', { day: 17 });
    });

    it('ticker chips link to their sections', async () => {
        await renderRoadmap();
        const nav = screen.getByRole('navigation', { name: 'Roadmap sections' });
        expect(within(nav).getByRole('link', { name: /SPRINT 01/ })).toHaveAttribute('href', '#sprint-chart');
        expect(within(nav).getByTestId('ticker-verified')).toHaveAttribute('href', '#milestone-ledger');
        expect(within(nav).getByTestId('ticker-verified')).toHaveTextContent('1 VERIFIED');
        expect(within(nav).getByRole('link', { name: /LAST GATE: PASS/ })).toHaveAttribute('href', '#build-activity');
    });

    it('live-source tiles link to public surfaces only, and UNMEASURED reasons are disclosed', async () => {
        await renderRoadmap();
        const panel = screen.getByTestId('live-sources');
        const github = within(panel).getByTestId('signal-link-github');
        expect(github).toHaveAttribute('href', 'https://github.com/mrnobodytx/buildanddo');
        expect(github).toHaveAttribute('rel', 'noreferrer');
        fireEvent.click(github);
        expect(trackEvent).toHaveBeenCalledWith('roadmap_source_click', { source: 'github' });
        expect(within(panel).queryByTestId('signal-link-datadog')).not.toBeInTheDocument();
        expect(within(panel).queryByTestId('signal-link-posthog')).not.toBeInTheDocument();
        const reason = within(panel).getByTestId('signal-reason-wiki');
        expect(reason.tagName).toBe('DETAILS');
        expect(within(reason).getByText(/SECRET_NAMES_NOT_RESOLVED/)).toBeInTheDocument();
    });

    it('keeps the honesty copy and describes the real interactions', async () => {
        await renderRoadmap();
        expect(screen.getByText(/CURVE = PLAN, NOT RESULTS/)).toBeInTheDocument();
        expect(screen.getByText(/press Enter on a marker to pin it/)).toBeInTheDocument();
        expect(screen.queryByText(/Hover or tap a milestone marker on the chart/)).not.toBeInTheDocument();
    });
});
