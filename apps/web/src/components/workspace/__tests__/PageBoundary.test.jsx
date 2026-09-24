// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/PageBoundary.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/workspace/PageBoundary.jsx, apps/web/src/components/workspace/WorkspaceLayout.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/components/workspace/PageBoundary.jsx; VALIDATES apps/web/src/components/workspace/WorkspaceLayout.jsx
// DAG Node:    none
// Intent:      Prove a page failure preserves navigation, carries page attribution and can recover.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { act } from '@testing-library/react';
import { AppRoutes } from '@/App';
import PageBoundary from '@/components/workspace/PageBoundary';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import AuthContext from '@/contexts/AuthContext';
import { createAuthValue, createMockWorkspace, createWorkspaceValue, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
import { trackRenderError, trackUnknownRoute } from '@/lib/observability/runtime';

vi.mock('@/lib/observability/runtime', () => ({
    trackRenderError: vi.fn(),
    reportAction: vi.fn(),
    reportMetric: vi.fn(),
    trackAuthIdentity: vi.fn(),
    readFailed: vi.fn(),
    trackUnknownRoute: vi.fn(),
}));
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
const publicPage = vi.hoisted(() => ({ broken: true }));
vi.mock('@/pages/AboutPage', () => ({ default: () => {
    if (publicPage.broken) throw new Error('public panel failed');
    return <h1>Recovered public content</h1>;
} }));
vi.mock('@/pages/HomePage', () => ({ default: () => <h1>Public home</h1> }));
beforeEach(() => { pb.__reset(); publicPage.broken = true; });
afterEach(() => { setDemoMode(false); vi.restoreAllMocks(); });

function DraftPage() {
    const [draft, setDraft] = useState('');
    return <label>Private draft<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label>;
}
function WorkspaceScene({ workspace = 'ws1', account = 'account1' }) {
    return (
        <AuthContext.Provider value={createAuthValue({ user: { id: account } })}>
            <WorkspaceContext.Provider value={createWorkspaceValue({ active: createMockWorkspace({ id: workspace }) })}>
                <Routes>
                    <Route path="/app" element={<WorkspaceLayout />}>
                        <Route index element={<DraftPage />} />
                    </Route>
                </Routes>
            </WorkspaceContext.Provider>
        </AuthContext.Provider>
    );
}

describe('page error isolation', () => {
    it('renders the real workspace controls and clears private page state on workspace, account and demo changes', async () => {
        const user = setupUser();
        const view = renderWithProviders(<WorkspaceScene />, { route: '/app' });
        expect(screen.getByRole('button', { name: /Start a mission/ })).toBeInTheDocument();
        await user.type(screen.getByLabelText('Private draft'), 'First workspace draft');
        view.rerender(<WorkspaceScene workspace="ws2" />);
        expect(screen.getByLabelText('Private draft')).toHaveValue('');
        await user.type(screen.getByLabelText('Private draft'), 'First account draft');
        view.rerender(<WorkspaceScene workspace="ws2" account="account2" />);
        expect(screen.getByLabelText('Private draft')).toHaveValue('');
        await user.type(screen.getByLabelText('Private draft'), 'Live workspace draft');
        act(() => setDemoMode(true));
        expect(screen.getByLabelText('Private draft')).toHaveValue('');
    });

    it('attributes a failed page, keeps the shell available and recovers on retry', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        let broken = true;
        function Page() {
            if (broken) throw new Error('panel failed');
            return <h1>Recovered content</h1>;
        }
        const user = setupUser();
        renderWithProviders(
            <Routes>
                <Route path="/app" element={<WorkspaceLayout />}>
                    <Route
                        index
                        element={
                            <PageBoundary name="Signals" section="/app/signals">
                                <Page />
                            </PageBoundary>
                        }
                    />
                    <Route path="settings" element={<h1>Settings</h1>} />
                </Route>
            </Routes>,
            { route: '/app' },
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Signals could not be displayed');
        expect(screen.getByRole('link', { name: 'Settings' })).toBeVisible();
        expect(trackRenderError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ page: 'Signals' }),
        );
        expect(trackRenderError).toHaveBeenCalledTimes(1);
        expect(trackRenderError).toHaveBeenLastCalledWith(
            expect.any(Error),
            expect.objectContaining({ section: '/app/signals' }),
        );
        broken = false;
        await user.click(screen.getByRole('button', { name: 'Try this page again' }));
        expect(screen.getByRole('heading', { name: 'Recovered content' })).toBeVisible();
        await user.click(screen.getByRole('link', { name: 'Settings' }));
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
        expect(trackRenderError).toHaveBeenCalledTimes(1);
    });

    it('isolates a public route failure and resets the real parent boundary on navigation', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = setupUser();
        renderWithProviders(<>
            <Link to="/">Leave failed page</Link>
            <Link to="/about">Return to public page</Link>
            <AppRoutes />
        </>, { route: '/about', auth: { isAuthed: false, user: null } });
        expect(await screen.findByRole('alert')).toHaveTextContent('Page could not be displayed');
        expect(screen.getByRole('link', { name: 'Leave failed page' })).toBeVisible();
        expect(trackRenderError).toHaveBeenCalledTimes(1);
        expect(trackRenderError).toHaveBeenLastCalledWith(expect.any(Error), expect.objectContaining({ page: 'Page', section: '/about' }));

        await user.click(screen.getByRole('link', { name: 'Leave failed page' }));
        expect(await screen.findByRole('heading', { name: 'Public home' })).toBeVisible();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(trackRenderError).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole('link', { name: 'Return to public page' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Page could not be displayed');
        expect(trackRenderError).toHaveBeenCalledTimes(2);
        publicPage.broken = false;
        await user.click(screen.getByRole('button', { name: 'Try this page again' }));
        expect(await screen.findByRole('heading', { name: 'Recovered public content' })).toBeVisible();
        expect(trackRenderError).toHaveBeenCalledTimes(2);
    });

    it('attributes a real shell render failure to the shell boundary and retries only that subtree', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = setupUser();
        // A malformed switcher row fails outside the page outlet.
        const view = renderWithProviders(<><p>Outside the workspace</p><AppRoutes /></>, {
            route: '/app/settings',
            workspace: { active: createMockWorkspace(), workspaces: [null] },
        });
        expect(await screen.findByRole('alert')).toHaveTextContent('Workspace shell could not be displayed');
        expect(screen.getByText('Outside the workspace')).toBeVisible();
        expect(trackRenderError).toHaveBeenCalledTimes(1);
        expect(trackRenderError).toHaveBeenLastCalledWith(expect.any(Error), expect.objectContaining({ page: 'Workspace shell', section: '/app' }));
        view.workspace.workspaces = [view.workspace.active];
        await user.click(screen.getByRole('button', { name: 'Try this page again' }));
        expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible();
        expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
        expect(screen.getByText('Outside the workspace')).toBeVisible();
        expect(trackRenderError).toHaveBeenCalledTimes(1);
    });

    it('reports an unknown route once under StrictMode before redirecting without its private URL', async () => {
        renderWithProviders(<StrictMode><AppRoutes /></StrictMode>, {
            route: '/private-missing-page?query=private-value#private-fragment',
            auth: { isAuthed: false, user: null },
        });
        expect(await screen.findByRole('heading', { name: 'Public home' })).toBeVisible();
        await waitFor(() => expect(trackUnknownRoute).toHaveBeenCalledTimes(1));
        expect(trackUnknownRoute).toHaveBeenCalledWith();
        expect(trackRenderError).not.toHaveBeenCalled();
    });
});
