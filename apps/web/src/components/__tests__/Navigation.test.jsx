// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/__tests__/Navigation.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/workspace/WorkspaceLayout.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/components/workspace/WorkspaceLayout.jsx
// DAG Node:    none
// Intent:      Exercise keyboard entry, modal menu focus, navigation and workspace selection.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import Header from '@/components/site/Header';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';
import SkipNavigation from '@/components/SkipNavigation';
import {
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
    within,
    createMockWorkspace,
} from '@/test/utils';

describe('keyboard navigation', () => {
    it('provides a skip link to the main landmark', async () => {
        const user = setupUser();
        renderWithProviders(
            <>
                <SkipNavigation />
                <Header />
                <main id="main-content" tabIndex={-1}>
                    Contents
                </main>
            </>,
        );
        await user.tab();
        expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(screen.getByRole('main')).toHaveFocus();
    });

    it('traps public menu focus and returns it to its trigger on Escape', async () => {
        const user = setupUser();
        renderWithProviders(<Header />);
        const trigger = screen.getByRole('button', { name: 'Open menu' });
        await user.click(trigger);
        const dialog = screen.getByRole('dialog', { name: 'Browse BuildAndDo' });
        expect(within(dialog).getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
        for (let i = 0; i < 16; i++) {
            await user.tab();
            expect(dialog).toContainElement(document.activeElement);
        }
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(trigger).toHaveFocus();
    });

    it('closes workspace navigation on selection and keeps its trigger associated with the dialog', async () => {
        const user = setupUser();
        renderWithProviders(
            <Routes>
                <Route path="/app" element={<WorkspaceLayout />}>
                    <Route index element={<h1>Front page content</h1>} />
                    <Route path="settings" element={<h1>Settings content</h1>} />
                </Route>
            </Routes>,
            { route: '/app' },
        );
        const trigger = screen.getByRole('button', { name: 'Open navigation' });
        await user.click(trigger);
        let dialog = screen.getByRole('dialog', { name: 'Workspace navigation' });
        expect(trigger).toHaveAttribute('aria-controls', dialog.id);
        await user.keyboard('{Escape}');
        await waitFor(() => expect(trigger).toHaveFocus());
        await user.click(trigger);
        dialog = screen.getByRole('dialog', { name: 'Workspace navigation' });
        await user.click(within(dialog).getByRole('link', { name: 'Settings' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByRole('heading', { name: 'Settings content' })).toBeVisible();
    });

    it('exposes the workspace switcher as a labeled native selection', async () => {
        const user = setupUser();
        const first = createMockWorkspace({ id: 'workspace-one', name: 'First workspace' });
        const second = createMockWorkspace({ id: 'workspace-two', name: 'Second workspace' });
        const view = renderWithProviders(<WorkspaceLayout />, {
            workspace: { active: first, workspaces: [first, second] },
        });
        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Active workspace' }),
            second.id,
        );
        expect(view.workspace.setActive).toHaveBeenCalledWith(second.id);
    });
});
