// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/__tests__/MotionSettings.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/motion/MotionSettings.jsx, apps/web/src/contexts/MotionContext.jsx, apps/web/src/lib/motion/catalog.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/motion/MotionSettings.jsx; CONSUMES apps/web/src/contexts/MotionContext.jsx; CONSUMES apps/web/src/lib/motion/catalog.js
// DAG Node:    none
// Intent:      Prove presets, movement, device limits, the usage filter and the preview switcher change what is stored and shown.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, setupUser } from '@/test/utils';
import { MotionProvider } from '@/contexts/MotionContext';
import { MOTION_STORAGE_KEY } from '@/lib/motion/preferences';
import { MOTION_CATALOG } from '@/lib/motion/catalog';
import MotionSettings from '../MotionSettings';

const renderSettings = () => renderWithProviders(<MotionProvider><MotionSettings /></MotionProvider>);
const stored = () => JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY));
const status = () => screen.getByText(/motion is|Full motion is available|Your device requests/i, { selector: 'p[role="status"]' });

afterEach(() => vi.restoreAllMocks());

describe('MotionSettings presets and controls', () => {
    it('applies the reduced, off and editorial presets and explains each resulting mode', async () => {
        const user = setupUser();
        renderSettings();
        const mode = screen.getByRole('combobox', { name: 'Motion mode' });

        await user.click(screen.getByRole('button', { name: 'Reduced preset' }));
        expect(mode).toHaveValue('reduced');
        expect(stored().mode).toBe('reduced');
        expect(status()).toHaveTextContent('Reduced motion is active. State changes appear immediately.');

        await user.click(screen.getByRole('button', { name: 'Turn motion off' }));
        expect(mode).toHaveValue('off');
        expect(status()).toHaveTextContent('Motion is off. All content, controls and status text remain available.');
        expect(document.documentElement).toHaveAttribute('data-motion', 'off');

        await user.click(screen.getByRole('button', { name: 'Editorial preset' }));
        expect(mode).toHaveValue('system');
        expect(stored().mode).toBe('system');
        expect(status()).toHaveTextContent('Full motion is available for the enabled categories.');
    });

    it('stores the chosen movement intensity and applies it to the document', async () => {
        const user = setupUser();
        renderSettings();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Movement' }), 'expressive');
        expect(stored().intensity).toBe('expressive');
        expect(document.documentElement).toHaveAttribute('data-motion-intensity', 'expressive');
    });

    it('explains device limits on touch screens and flags opted-in effects that cannot run', () => {
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
            matches: query === '(pointer: coarse)', media: query, onchange: null,
            addEventListener() {}, removeEventListener() {},
            addListener() {}, removeListener() {}, dispatchEvent: () => false,
        }));
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, categories: { ambient: true } }));
        renderSettings();
        expect(status()).toHaveTextContent('Touch, a narrow viewport or Data Saver limits optional effects.');
        const ambient = screen.getByRole('checkbox', { name: /Ambient decoration/ });
        expect(ambient).toBeChecked();
        expect(ambient.closest('label')).toHaveTextContent('Currently limited by your motion or device settings.');
        expect(screen.getByRole('checkbox', { name: /Pointer & depth/ }).closest('label'))
            .not.toHaveTextContent('Currently limited');
    });
});

describe('MotionSettings usage reference and previews', () => {
    it('filters the usage reference by category and combines the filter with search', async () => {
        const user = setupUser();
        renderSettings();
        await user.click(screen.getByText('Usage reference · all 50 areas'));
        const layout = MOTION_CATALOG.filter((entry) => entry.category === 'layout');
        await user.selectOptions(screen.getByRole('combobox', { name: 'Filter motion category' }), 'layout');
        expect(screen.getByText(`${layout.length} of 50 areas`)).toBeVisible();
        expect(screen.getByText(layout[0].title)).toBeVisible();

        await user.type(screen.getByRole('searchbox', { name: 'Search motion usage' }), 'zzz-no-such-area');
        expect(screen.getByText('0 of 50 areas')).toBeVisible();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Filter motion category' }), 'all');
        await user.clear(screen.getByRole('searchbox', { name: 'Search motion usage' }));
        expect(screen.getByText('50 of 50 areas')).toBeVisible();
    });

    it('opens previews from the shortcut button, switches collections and closes them again', async () => {
        const user = setupUser();
        renderSettings();
        expect(screen.queryByRole('combobox', { name: 'Preview collection' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Open previews' }));
        const collection = screen.getByRole('combobox', { name: 'Preview collection' });
        expect(collection).toHaveValue('interface');

        await user.selectOptions(collection, 'data');
        expect(await screen.findByRole('progressbar', { name: 'Example progress' })).toBeVisible();

        await user.click(screen.getByRole('button', { name: 'Close previews' }));
        expect(screen.queryByRole('combobox', { name: 'Preview collection' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open previews' })).toBeVisible();
    });
});
