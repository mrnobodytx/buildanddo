// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/PlatformHealthPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/workspace/PlatformHealthPage.jsx,
//              apps/pocketbase/pb_hooks/estate.pb.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/PlatformHealthPage.jsx
// Intent:      Hold the page to the things it cannot be trusted on: saying whose
//              vendor accounts these readings are, saying how old they are and
//              that they are not live, keeping Unknown out of the score, and
//              saying something rather than nothing when the report arrives with
//              no measurement.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import pb from '@/lib/pocketbaseClient';
import PlatformHealthPage from '@/pages/workspace/PlatformHealthPage';
import { renderWithProviders, screen } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const { vi: vitest } = await import('vitest');
    const client = createMockPocketBase();
    // The estate report comes back through `send`, which the collection mock does not model.
    client.send = vitest.fn();
    return { default: client, pocketbaseClient: client };
});

// THE FIXTURE IS WRITTEN OUT HERE, AND THAT IS A STEP DOWN. It used to be read from
// apps/web/public/platform-health.json, so a published shape that drifted away from the page
// broke this file. The page now reads the master-seat route instead, and the full report that
// route serves is written to state/, which this repository does not track - there is no committed
// artifact left to pin to. So this is the contract by hand: keep it in step with the payload
// scripts/ci/fleet_report.py builds, because nothing else will now.
const REPORT = {
    schema_version: 1,
    generated_at: '2026-09-24T03:55:43.507944+00:00',
    observed_at: '2026-09-11T00:00:00+00:00',
    observed_via: 'platform-assessment:read-only-discovery',
    state: 'MEASURED',
    totals: { platforms: 2, connected: 1, unverified: 1, features_assessed: 3 },
    platforms: [
        {
            id: 'datadog',
            label: 'Datadog',
            state: 'connected',
            verified: true,
            detail: 'Agents reporting; application layer partially dark.',
            first_detected: '2026-08-14',
            features: [
                { name: 'Infrastructure metrics', status: 'configured', recommendation: 'None.' },
                { name: 'APM tracing', status: 'unused', recommendation: 'Add tracing per seat.' },
            ],
            utilization: {
                counts: { configured: 1, underused: 0, unused: 1, unknown: 0 },
                assessed: 2,
                scored: 2,
                pct: 50,
            },
        },
        {
            id: 'hostinger',
            label: 'Hostinger',
            state: 'hold',
            verified: false,
            detail: 'Entitlements could not be read.',
            first_detected: '2026-09-02',
            features: [
                { name: 'Object storage', status: 'unknown', recommendation: 'Read the plan first.' },
            ],
            utilization: {
                counts: { configured: 0, underused: 0, unused: 0, unknown: 1 },
                assessed: 1,
                scored: 0,
                pct: null,
            },
        },
    ],
    recommendations: [
        {
            rank: 1,
            platform: 'datadog',
            action: 'Add tracing to the agent image',
            effort: 'code',
            impact: 'Agent seats stop being dark in APM.',
        },
    ],
    integration_timeline: [{ date: '2026-07-02', platforms: 1, event: 'First platform verified' }],
};

const observedLabel = new Date(REPORT.observed_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
});

function serve(body) {
    pb.send.mockResolvedValue(body);
}

beforeEach(() => {
    pb.send.mockReset();
    pb.send.mockRejectedValue(new Error('no report stubbed'));
});

afterEach(() => vi.restoreAllMocks());

/** The header block: title, description and provenance tag. */
const pageHeader = () =>
    screen.getByRole('heading', { level: 1, name: /platform health/i }).closest('div');

describe('whose platforms these are', () => {
    it('names the operating company as the subject, in the first thing read', async () => {
        serve(REPORT);
        renderWithProviders(<PlatformHealthPage />);

        await screen.findByTestId('platform-health-scope');
        expect(pageHeader().textContent).toMatch(/Citadel Nexus Inc/);
    });

    it('says it once: the provenance line does not repeat whose accounts these are', async () => {
        // The page is a master seat's only, so the reader owns these accounts. Saying so twice -
        // once in the description and again in a warning card - read as a notice bolted to a leak.
        serve(REPORT);
        renderWithProviders(<PlatformHealthPage />);

        const scope = await screen.findByTestId('platform-health-scope');
        expect(scope.textContent).not.toMatch(/Citadel Nexus Inc/);
    });

    it('keeps an unreadable entitlement out of the score, in its own words', async () => {
        serve(REPORT);
        renderWithProviders(<PlatformHealthPage />);

        await screen.findByTestId('platform-health-scope');
        expect(pageHeader().textContent).toMatch(/Unknown/);
        expect(pageHeader().textContent).toMatch(/left out of the score/i);
    });
});

describe('how old the reading is', () => {
    it('dates it as transcribed rather than live', async () => {
        serve(REPORT);
        renderWithProviders(<PlatformHealthPage />);

        const scope = await screen.findByTestId('platform-health-scope');
        expect(scope).toHaveTextContent(observedLabel);
        expect(scope.textContent).toMatch(/nothing on this page is measured when you open it/i);
    });

    it('claims no observation date when the report carries none', async () => {
        serve({ ...REPORT, observed_at: null });
        renderWithProviders(<PlatformHealthPage />);

        const scope = await screen.findByTestId('platform-health-scope');
        expect(scope.textContent).not.toMatch(/transcribed on/i);
        expect(scope.textContent).toMatch(/unknown/i);
    });
});

describe('a report that answers but carries no measurement', () => {
    const REASON = 'The platform assessment has not run since the vendor keys were rotated.';

    it('shows the report own reason and a retry instead of an empty page', async () => {
        serve({ state: 'UNMEASURED', reason: REASON, served_to: 'master seat' });
        renderWithProviders(<PlatformHealthPage />);

        expect(await screen.findByText(REASON)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        expect(screen.queryByText('Platforms connected')).not.toBeInTheDocument();
    });

    it('still says something when the server supplies no reason', async () => {
        serve({ state: 'UNMEASURED' });
        renderWithProviders(<PlatformHealthPage />);

        expect(await screen.findByText(/carried no measurement/i)).toBeInTheDocument();
    });
});
