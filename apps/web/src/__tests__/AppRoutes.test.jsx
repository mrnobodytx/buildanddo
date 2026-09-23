// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/__tests__/AppRoutes.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        BITS-CODEGEN, C-ONE (guild and status entries)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/App.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/App.jsx
// DAG Node:    none
// Intent:      Load every real workspace route and the five public entries while preserving authentication gates.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
beforeEach(() => {
    pb.__reset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
});
afterEach(() => vi.unstubAllGlobals());

// These routes are React.lazy, so each assertion waits on a real dynamic import.
// Under the full 64-file parallel run that regularly exceeds the 1s default and
// the file failed wholesale while passing 37/37 on its own. The wait is generous
// on purpose: it is bounded, and a genuinely missing route still fails.
const LAZY_ROUTE_TIMEOUT = 20000;

describe('lazy route entry points', () => {
    it.each(['/hostinger-challenge', '/pricing', '/about', '/docs', '/classrooms', '/blog', '/contact',
        '/guild', '/guild/forge', '/status'])(
        'loads %s without an authenticated account',
        async (route) => {
            renderWithProviders(<AppRoutes />, { route, auth: { isAuthed: false, user: null } });
            expect(await screen.findByRole('heading', { level: 1 }, { timeout: LAZY_ROUTE_TIMEOUT })).toBeVisible();
            expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
        },
        LAZY_ROUTE_TIMEOUT,
    );

    it.each([
        '',
        '/signals',
        '/missions',
        '/workflows',
        '/tutorials',
        '/classrooms',
        '/classrooms/roomalpha',
        '/erp',
        '/operations',
        '/fleet',
        '/platforms',
        '/evidence',
        '/research',
        '/suite',
        '/dossier',
        '/edition',
        '/journey',
        '/desks',
        '/passport',
        '/corrections',
        '/support',
        '/community',
        '/roadmap',
        '/settings',
        '/admin',
        '/integrations',
        '/wiki',
        '/forums',
    ])('mounts the real /app%s page inside the workspace shell', async (suffix) => {
        renderWithProviders(<AppRoutes />, { route: `/app${suffix}` });
        expect(await screen.findByRole('heading', { level: 1 }, { timeout: LAZY_ROUTE_TIMEOUT })).toBeVisible();
        expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
        expect(screen.queryByText(/could not be displayed/)).not.toBeInTheDocument();
    }, LAZY_ROUTE_TIMEOUT);

    it('gates a protected page behind sign-in', async () => {
        renderWithProviders(<AppRoutes />, {
            route: '/app/settings',
            auth: { isAuthed: false, user: null },
        });
        expect(await screen.findByLabelText(/email/i)).toBeVisible();
        expect(
            screen.queryByRole('heading', { name: 'Settings', exact: true }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Workspace' })).not.toBeInTheDocument();
    });

    it('announces workspace loading without redirecting prematurely', () => {
        renderWithProviders(<AppRoutes />, {
            route: '/app',
            workspace: { loading: true, hasWorkspaces: false },
        });
        expect(screen.getByRole('status')).toHaveTextContent('Loading page');
        expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });

    it('offers recovery for a failed workspace read instead of redirecting to onboarding', async () => {
        const refresh = vi.fn();
        renderWithProviders(<AppRoutes />, {
            route: '/app',
            workspace: { active: null, hasWorkspaces: false, error: 'Could not load your workspaces. Try again.', refresh },
        });
        expect(await screen.findByRole('heading', { name: 'Your workspaces are unavailable' })).toBeVisible();
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load your workspaces');
        await setupUser().click(screen.getByRole('button', { name: 'Try again' }));
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('navigation', { name: 'Workspace' })).not.toBeInTheDocument();
    });
});
