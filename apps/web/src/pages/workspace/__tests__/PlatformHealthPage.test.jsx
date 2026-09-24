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
//              apps/web/public/platform-health.json
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/PlatformHealthPage.jsx;
//              CONSUMES apps/web/public/platform-health.json
// Intent:      Hold the page to the two things it cannot be trusted on: saying
//              whose vendor accounts these readings are, and saying something
//              rather than nothing when the report arrives with no measurement.
// ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PlatformHealthPage from '@/pages/workspace/PlatformHealthPage';
import { renderWithProviders, screen } from '@/test/utils';

// The fixture is the file the build actually publishes. A hand-written copy
// would keep passing after the published shape drifted away from it.
const REPORT = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/platform-health.json'), 'utf8'),
);

const observedLabel = new Date(REPORT.observed_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
});

function serve(body, { ok = true, status = 200 } = {}) {
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok, status, json: () => Promise.resolve(body) })),
    );
}

afterEach(() => vi.unstubAllGlobals());

describe('whose platforms these are', () => {
    it('states the operating company as the subject, above the dashboard', async () => {
        serve(REPORT);
        renderWithProviders(<PlatformHealthPage />);

        const scope = await screen.findByTestId('platform-health-scope');
        expect(scope).toHaveTextContent(/Citadel Nexus Inc/);
        expect(scope.textContent).toMatch(/not (this|your) workspace/i);
    });

    it('puts the same disclaimer in the page description, not only in a tag', async () => {
        serve(REPORT);
        renderWithProviders(<PlatformHealthPage />);

        await screen.findByTestId('platform-health-scope');
        const heading = screen.getByRole('heading', { level: 1, name: /platform health/i });
        expect(heading.closest('div').textContent).toMatch(/Citadel Nexus Inc/);
    });

    it('dates the reading as transcribed rather than live', async () => {
        serve(REPORT);
        renderWithProviders(<PlatformHealthPage />);

        const scope = await screen.findByTestId('platform-health-scope');
        expect(scope).toHaveTextContent(observedLabel);
    });

    it('claims no observation date when the report carries none', async () => {
        const undated = { ...REPORT, observed_at: null };
        serve(undated);
        renderWithProviders(<PlatformHealthPage />);

        const scope = await screen.findByTestId('platform-health-scope');
        expect(scope).toHaveTextContent(/Citadel Nexus Inc/);
        expect(scope.textContent).not.toMatch(/transcribed on/i);
        expect(scope.textContent).toMatch(/unknown/i);
    });
});

describe('a report that answers but carries no measurement', () => {
    const REASON = 'The platform assessment has not run since the vendor keys were rotated.';

    it('shows the report own reason and a retry instead of an empty page', async () => {
        serve({ schema_version: 1, state: 'UNMEASURED', reason: REASON });
        renderWithProviders(<PlatformHealthPage />);

        expect(await screen.findByText(REASON)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        expect(screen.queryByText('Platforms connected')).not.toBeInTheDocument();
    });

    it('still says something when the server supplies no reason', async () => {
        serve({ schema_version: 1, state: 'UNMEASURED' });
        renderWithProviders(<PlatformHealthPage />);

        expect(
            await screen.findByText(/carried no measurement/i),
        ).toBeInTheDocument();
    });
});
