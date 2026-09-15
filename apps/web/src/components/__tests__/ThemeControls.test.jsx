// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/__tests__/ThemeControls.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/ThemeControls.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/components/ThemeControls.jsx
// DAG Node:    none
// Intent:      Verify persistent theme selection, system changes and unavailable browser storage.
// ───────────────────────────────────────────────────────────────

import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeSelect, ThemeToggle } from '@/components/ThemeControls';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

afterEach(() => vi.restoreAllMocks());

describe('theme controls', () => {
    it('persists a toggle across a new page mount', async () => {
        const user = setupUser();
        const view = renderWithProviders(<ThemeToggle />);
        await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
        await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
        expect(localStorage.getItem('buildanddo.theme')).toBe('dark');
        view.unmount();
        renderWithProviders(<ThemeToggle />);
        expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
        expect(document.documentElement).not.toHaveClass('dark');
    });

    it('keeps Settings and the Header toggle in sync', async () => {
        const user = setupUser();
        renderWithProviders(
            <>
                <ThemeSelect />
                <ThemeToggle />
            </>,
        );
        await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'dark');
        expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
        expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('light');
    });

    it('follows device changes only when system theme is selected', async () => {
        const listeners = new Set();
        let dark = false;
        vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({
            media,
            matches: dark,
            addListener: (fn) => listeners.add(fn),
            removeListener: (fn) => listeners.delete(fn),
            addEventListener: () => {},
            removeEventListener: () => {},
        }));
        const user = setupUser();
        renderWithProviders(<ThemeSelect />, { theme: 'system' });
        act(() => {
            dark = true;
            listeners.forEach((fn) => fn({ matches: true }));
        });
        await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
        await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'light');
        act(() => {
            dark = false;
            listeners.forEach((fn) => fn({ matches: false }));
        });
        expect(document.documentElement).not.toHaveClass('dark');
    });

    it('still changes appearance when browser storage is unavailable', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage unavailable');
        });
        const user = setupUser();
        renderWithProviders(<ThemeToggle />);
        await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
        expect(document.documentElement).toHaveClass('dark');
    });
});
