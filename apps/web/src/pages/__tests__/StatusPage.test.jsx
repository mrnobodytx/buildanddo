// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/StatusPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/pages/StatusPage.jsx, apps/web/src/pages/RoadmapPage.jsx,
//              apps/web/src/components/site/StatusPanels.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/StatusPage.jsx; VALIDATES apps/web/src/pages/RoadmapPage.jsx;
//              VALIDATES apps/web/src/components/site/StatusPanels.jsx
// Intent:      Prove the same-domain status page and the roadmap's community group show UNMEASURED
//              whenever there is no fresh reading, and can show UP when there is one.
// ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/App';
import { COMMUNITY_LINKS } from '@/lib/communityLinks';
import { COMMUNITY_STATUS_SCHEMA } from '@/lib/communityStatus';
import pb from '@/lib/pocketbaseClient';
import { SITE_ORIGIN } from '@/lib/publicPages';
import { renderWithProviders, screen, waitFor, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

const LAZY = 20000;
const SEED = JSON.parse(readFileSync(resolve(process.cwd(), 'public/community-status.json'), 'utf8'));
// A recorded assessment from 2026-09-11: older than a day on any clock this suite runs under.
const PLATFORM = {
    schema_version: 1,
    generated_at: '2026-09-22T16:12:31+00:00',
    observed_at: '2026-09-11T00:00:00+00:00',
    platforms: [
        { id: 'datadog', label: 'Datadog', state: 'connected', verified: true, detail: 'Agents reporting.' },
        { id: 'hostinger', label: 'Hostinger', state: 'hold', verified: false, detail: 'Bridge unverified.' },
    ],
};

function fresh(states) {
    const at = new Date(Date.now() - 10 * 60_000).toISOString();
    return {
        schema: COMMUNITY_STATUS_SCHEMA,
        generated_at: at,
        stale_after_seconds: 21600,
        surfaces: COMMUNITY_LINKS.map((link) => ({
            id: link.id, label: link.label, url: link.url,
            state: states[link.id] || 'UP', checked_at: at, detail: 'HTTP 200',
        })),
    };
}

function serve(files) {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(url in files
        ? { ok: true, status: 200, json: () => Promise.resolve(files[url]) }
        : { ok: false, status: 404, json: () => Promise.reject(new Error('404')) })));
}

async function renderRoute(route) {
    renderWithProviders(<AppRoutes />, { route, auth: { isAuthed: false, user: null } });
    return screen.findByRole('heading', { level: 1 }, { timeout: LAZY });
}

const badgeOf = (id) => within(screen.getByTestId(`community-surface-${id}`));

beforeEach(() => pb.__reset());
afterEach(() => vi.unstubAllGlobals());

describe('/status', () => {
    it('shows every community surface as UNMEASURED before any probe has run', async () => {
        serve({ '/community-status.json': SEED, '/platform-health.json': PLATFORM });
        expect(await renderRoute('/status')).toHaveTextContent('What is up, and how we know.');
        await screen.findByTestId('community-surface-forum');
        for (const link of COMMUNITY_LINKS) {
            expect(badgeOf(link.id).getByText('UNMEASURED')).toBeInTheDocument();
            expect(badgeOf(link.id).getByRole('link', { name: link.label })).toHaveAttribute('href', link.url);
        }
        expect(screen.queryByText('UP')).not.toBeInTheDocument();
        expect(screen.getByText(/UNMEASURED · The published reading has no measurement time/)).toBeInTheDocument();
        await waitFor(() => expect(document.title).toBe('Service status | BuildAndDo'));
        expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_ORIGIN}/status`);
    }, LAZY);

    it('dates the platform assessment and calls an old one STALE rather than connected', async () => {
        serve({ '/community-status.json': SEED, '/platform-health.json': PLATFORM });
        await renderRoute('/status');
        const platform = await screen.findByTestId('platform-datadog');
        expect(within(platform).getByText('connected')).toBeInTheDocument();
        expect(screen.getByText(/Observed 2026-09-11T00:00:00\+00:00 \(\d+ d ago\)/)).toBeInTheDocument();
        expect(screen.getByText(/STALE: a recorded assessment, not a live probe/)).toBeInTheDocument();
        expect(within(screen.getByTestId('platform-hostinger')).getByText('unverified')).toBeInTheDocument();
    }, LAZY);

    it('shows UP only for what a fresh reading says is up', async () => {
        serve({ '/community-status.json': fresh({ discord: 'DOWN', youtube: 'DEGRADED' }) });
        await renderRoute('/status');
        await screen.findByTestId('community-surface-forum');
        expect(badgeOf('forum').getByText('UP')).toBeInTheDocument();
        expect(badgeOf('discord').getByText('DOWN')).toBeInTheDocument();
        expect(badgeOf('youtube').getByText('DEGRADED')).toBeInTheDocument();
        expect(screen.getByText(/UNMEASURED · platform-health.json was not served/)).toBeInTheDocument();
    }, LAZY);

    it('shows nothing as up when neither file can be read', async () => {
        serve({});
        await renderRoute('/status');
        await screen.findByTestId('community-surface-forum');
        expect(screen.getByText(/ABSENT · No community reading could be read/)).toBeInTheDocument();
        expect(screen.queryByText('UP')).not.toBeInTheDocument();
    }, LAZY);
});

describe('/roadmap', () => {
    it('carries a community group read from the same file', async () => {
        serve({ '/community-status.json': fresh({ wiki: 'DOWN' }) });
        await renderRoute('/roadmap');
        expect(screen.getByText('Activity · community')).toBeInTheDocument();
        await screen.findByTestId('community-surface-wiki');
        expect(badgeOf('wiki').getByText('DOWN')).toBeInTheDocument();
        expect(badgeOf('forum').getByText('UP')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'service status' })).toHaveAttribute('href', '/status');
    }, LAZY);
});
