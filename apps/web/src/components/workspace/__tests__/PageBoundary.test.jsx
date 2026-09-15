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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { act } from '@testing-library/react';
import PageBoundary from '@/components/workspace/PageBoundary';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import AuthContext from '@/contexts/AuthContext';
import { createAuthValue, createMockWorkspace, createWorkspaceValue, renderWithProviders, screen, setupUser } from '@/test/utils';
import { setDemoMode } from '@/lib/demoWorkspace';
import { trackRenderError } from '@/lib/observability/runtime';

vi.mock('@/lib/observability/runtime', () => ({
    trackRenderError: vi.fn(),
    reportAction: vi.fn(),
}));
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
                            <PageBoundary name="Signals">
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
        broken = false;
        await user.click(screen.getByRole('button', { name: 'Try this page again' }));
        expect(screen.getByRole('heading', { name: 'Recovered content' })).toBeVisible();
        await user.click(screen.getByRole('link', { name: 'Settings' }));
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    });
});
