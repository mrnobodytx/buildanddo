// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/RoadmapPage.signals.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-SIGNALS-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/pages/RoadmapPage.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/RoadmapPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Keep the live sources panel honest: one tile per source, an
//              UNMEASURED tile says so with its reason, and the PostHog tile
//              never reads as verification or completion.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), initTelemetry: vi.fn() }));

import RoadmapPage from '@/pages/RoadmapPage';
import { renderWithProviders, screen, waitFor, within } from '@/test/utils';

const SOURCES = ['github', 'datadog', 'posthog', 'wiki', 'discord', 'reddit', 'forum', 'citadel'];

const fixture = () => ({
    generated_at: new Date().toISOString(),
    state: 'MEASURED',
    campaign_id: 'BND-SPRINT-01',
    sprint_day: 9,
    sprint_days: 21,
    planned_pct: 40,
    actual_pct: 0,
    milestone_state_source: 'fixture',
    milestones: [],
    recent_commits: [],
    signals_state: 'MEASURED',
    signals_reason: null,
    signals_generated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    signals: {
        schema: 'buildanddo.roadmap-signals/v1',
        generated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        state: 'MEASURED',
        sources: {
            github: { state: 'MEASURED', reason: null, freshness: { data_at: '2026-09-10T16:39:02Z' }, metrics: { commits_7d: 60, open_prs: 0, merged_prs: 15, bits_branches: 14 } },
            datadog: { state: 'DEGRADED', reason: 'CENSUS_DEGRADED', freshness: { data_at: null }, metrics: { monitors: 72, alerting: 13, synthetics: 2, slos: 3 } },
            posthog: { state: 'MEASURED', reason: null, presentation_only: true, freshness: { data_at: null }, metrics: { events_7d: 42, top_events: [{ event: '$pageview', count: 40 }, { event: 'signup', count: 2 }], window: '7d' } },
            wiki: { state: 'UNMEASURED', reason: 'SECRET_NAMES_NOT_RESOLVED:BAD_WIKI_API,WIKIJS_API_TOKEN', freshness: { data_at: null }, metrics: {} },
            discord: { state: 'MEASURED', reason: null, freshness: { data_at: null }, metrics: { last_message_id: '1546573233879384095', quality_score: 33.76, bot_runtime: 'REVOKED' } },
            reddit: { state: 'DEGRADED', reason: 'DEVVIT_PROJECT_UNMEASURED', freshness: { data_at: null }, metrics: { checks_pass: 1, checks_total: 4, result_code: 'RES-REDDIT-VERIFY-DEGRADED' } },
            forum: { state: 'UNMEASURED', reason: 'FORUM_SURFACE_INCOMPLETE', freshness: { data_at: null }, metrics: { checks_pass: 0, checks_total: 3, result_code: 'RES-FORUM-VERIFY-UNMEASURED' } },
            citadel: { state: 'MEASURED', reason: null, freshness: { data_at: null }, metrics: { rail_state: 'HOLD', github_actions: 'LOCKED_BILLING', incidents_open: 3, publications_queued: 6 } },
        },
        failures: [
            { source: 'wiki', state: 'UNMEASURED', reason: 'SECRET_NAMES_NOT_RESOLVED:BAD_WIKI_API,WIKIJS_API_TOKEN', observed_at: '2026-09-11T14:51:12Z' },
            { source: 'forum', state: 'UNMEASURED', reason: 'FORUM_SURFACE_INCOMPLETE', observed_at: '2026-09-11T14:51:12Z' },
        ],
        truth_boundary: { presentation_only: true, authority_effect: 'NONE', remote_writes: 0 },
    },
});

const mockFetch = (body) => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
};

describe('RoadmapPage live sources panel', () => {
    beforeEach(() => {
        vi.stubGlobal('scrollTo', vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        delete globalThis.fetch;
    });

    it('renders one tile per source with its state badge and metrics', async () => {
        mockFetch(fixture());
        renderWithProviders(<RoadmapPage />);
        const panel = await screen.findByTestId('live-sources');
        for (const id of SOURCES) {
            expect(within(panel).getByTestId(`signal-tile-${id}`)).toBeInTheDocument();
        }
        const github = within(panel).getByTestId('signal-tile-github');
        expect(within(github).getByText('MEASURED')).toBeInTheDocument();
        expect(within(github).getByText('60')).toBeInTheDocument();
        expect(within(github).getByText('15')).toBeInTheDocument();
        const datadog = within(panel).getByTestId('signal-tile-datadog');
        expect(within(datadog).getByText('DEGRADED')).toBeInTheDocument();
        expect(within(datadog).getByText('72')).toBeInTheDocument();
        // copy names the boundary: signals, not results
        expect(within(panel).getByText(/signals, not results/i)).toBeInTheDocument();
    });

    it('shows UNMEASURED tiles with their reason and lists failures', async () => {
        mockFetch(fixture());
        renderWithProviders(<RoadmapPage />);
        const panel = await screen.findByTestId('live-sources');
        const wiki = within(panel).getByTestId('signal-tile-wiki');
        expect(within(wiki).getByText('UNMEASURED')).toBeInTheDocument();
        expect(within(wiki).getByText(/SECRET_NAMES_NOT_RESOLVED/)).toBeInTheDocument();
        expect(within(wiki).getAllByText('Unknown').length).toBeGreaterThan(0);
        const failures = within(panel).getByTestId('live-sources-failures');
        expect(within(failures).getByText(/FORUM_SURFACE_INCOMPLETE/)).toBeInTheDocument();
        expect(within(failures).getByText(/SECRET_NAMES_NOT_RESOLVED/)).toBeInTheDocument();
    });

    it('labels PostHog presentation only and never as verified or complete', async () => {
        mockFetch(fixture());
        renderWithProviders(<RoadmapPage />);
        const panel = await screen.findByTestId('live-sources');
        const posthog = within(panel).getByTestId('signal-tile-posthog');
        expect(within(posthog).getByText(/presentation only/i)).toBeInTheDocument();
        expect(within(posthog).getByText('42')).toBeInTheDocument();
        expect(within(posthog).getByText(/\$pageview × 40/)).toBeInTheDocument();
        const text = posthog.textContent.toLowerCase();
        expect(text).not.toMatch(/verif/);
        expect(text).not.toMatch(/complet/);
        expect(text).not.toMatch(/evidence/);
    });

    it('says the panel is unmeasured when the build embedded no signals', async () => {
        const body = fixture();
        body.signals_state = 'UNMEASURED';
        body.signals_reason = 'SIGNALS_FILE_ABSENT';
        body.signals_generated_at = null;
        body.signals = null;
        mockFetch(body);
        renderWithProviders(<RoadmapPage />);
        const panel = await screen.findByTestId('live-sources');
        await waitFor(() => expect(within(panel).getByTestId('live-sources-unmeasured')).toBeInTheDocument());
        for (const id of SOURCES) {
            const tile = within(panel).getByTestId(`signal-tile-${id}`);
            expect(within(tile).getByText('UNMEASURED')).toBeInTheDocument();
        }
        expect(within(panel).queryByTestId('live-sources-failures')).not.toBeInTheDocument();
    });
});
