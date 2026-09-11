// CGRF: SRS=SRS-BUILDANDDO-PUBLIC-RECORD-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/TutorialsPage.failureTutorials.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-PUBLIC-RECORD-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/pages/workspace/TutorialsPage.jsx,
//              apps/web/src/lib/integrationsStatus.js,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/TutorialsPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      The Failure tutorials tab lists only what the projection
//              carries (already public-safe), links a wiki page only when
//              one exists, and says UNMEASURED when the section is absent.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import TutorialsPage from '@/pages/workspace/TutorialsPage';
import { renderWithProviders, screen, setupUser, within } from '@/test/utils';

const fixture = (overrides = {}) => ({
    schema: 'buildanddo.integrations-status/v1',
    generated_at: new Date().toISOString(),
    state: 'MEASURED',
    sections: {
        deliveries: { state: 'MEASURED', reason: null },
        outbox: { state: 'MEASURED', reason: null },
        tutorials: { state: 'MEASURED', reason: null },
        validity: { state: 'MEASURED', reason: null },
    },
    channels: {},
    tutorials: [
        {
            lesson_id: 'LES-ERR-40A9F0E0D62E61D431FA', error_class: 'BACKEND_PROXY_MISSING', severity: 'P0', env: 'staging',
            channels: ['wiki', 'forum', 'discord', 'reddit'], wiki_change_id: 'BC-B513FBF4563B',
            wiki_url: 'https://wiki.example.test/roadmap/changes/2026-09-11-BC-B513FBF4563B',
            wiki_join: 'incident_dir->manifest.evidence->change_id->wiki delivery',
        },
        {
            lesson_id: 'LES-ERR-893D056467C750238189', error_class: 'STALE_STATUS', severity: 'P2', env: 'production',
            channels: ['wiki'], wiki_change_id: 'BC-55FFAE2549EF', wiki_url: null, wiki_join: 'CHANGE_FOUND_NOT_PUBLISHED',
        },
    ],
    validity: [],
    ...overrides,
});

const mockFetch = (statusResponse) => {
    globalThis.fetch = vi.fn((url) => {
        if (String(url).includes('integrations-status.json')) return Promise.resolve(statusResponse);
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
};

const openFailures = async () => {
    const user = setupUser();
    await user.click(await screen.findByRole('tab', { name: 'Failure tutorials' }));
    return user;
};

describe('TutorialsPage - Failure tutorials tab', () => {
    beforeEach(() => {
        pb.__reset();
        pb.__setRecords('tutorials', []);
        pb.__setRecords('tutorial_progress', []);
    });
    afterEach(() => {
        delete globalThis.fetch;
    });

    it('lists the projected lessons with class, severity, env, channels and a wiki link only when published', async () => {
        mockFetch({ ok: true, json: () => Promise.resolve(fixture()) });
        renderWithProviders(<TutorialsPage />);
        await openFailures();

        expect(await screen.findByRole('heading', { name: 'Failures on staging become documented lessons', level: 2 })).toBeInTheDocument();
        const list = screen.getByRole('list', { name: 'Failure tutorials' });
        const items = within(list).getAllByRole('listitem');
        expect(items).toHaveLength(2);

        const first = items[0];
        expect(within(first).getByRole('heading', { name: 'BACKEND_PROXY_MISSING', level: 3 })).toBeInTheDocument();
        expect(within(first).getByText('staging')).toBeInTheDocument();
        expect(within(first).getByText('P0')).toBeInTheDocument();
        expect(within(first).getByText('Channels: wiki, forum, discord, reddit')).toBeInTheDocument();
        const link = within(first).getByRole('link', { name: 'Read the wiki lesson' });
        expect(link).toHaveAttribute('href', 'https://wiki.example.test/roadmap/changes/2026-09-11-BC-B513FBF4563B');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');

        const second = items[1];
        expect(within(second).getByRole('heading', { name: 'STALE_STATUS', level: 3 })).toBeInTheDocument();
        expect(within(second).queryByRole('link')).not.toBeInTheDocument();
        expect(within(second).getByText('Wiki page not yet published')).toBeInTheDocument();
    });

    it('says so when the estate has published no public-safe lesson', async () => {
        mockFetch({ ok: true, json: () => Promise.resolve(fixture({ tutorials: [] })) });
        renderWithProviders(<TutorialsPage />);
        await openFailures();

        expect(await screen.findByRole('heading', { name: 'No public-safe failure tutorials yet', level: 3 })).toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Failure tutorials' })).not.toBeInTheDocument();
    });

    it('renders UNMEASURED when the tutorials section was not readable at build time', async () => {
        mockFetch({
            ok: true,
            json: () => Promise.resolve(fixture({ sections: { tutorials: { state: 'UNMEASURED', reason: 'FILE_ABSENT' } }, tutorials: [] })),
        });
        renderWithProviders(<TutorialsPage />);
        await openFailures();

        expect(await screen.findByRole('heading', { name: 'Failure tutorials UNMEASURED', level: 3 })).toBeInTheDocument();
        expect(screen.getByText(/FILE_ABSENT/)).toBeInTheDocument();
    });

    it('renders UNMEASURED when the projection is not served at all', async () => {
        mockFetch({ ok: false, status: 404 });
        renderWithProviders(<TutorialsPage />);
        await openFailures();

        expect(await screen.findByRole('heading', { name: 'Failure tutorials UNMEASURED', level: 3 })).toBeInTheDocument();
        expect(screen.getByText(/was not served with this build/)).toBeInTheDocument();
    });
});
