// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/motion/__tests__/MotionSettings.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/motion/MotionSettings.jsx, apps/web/src/components/motion/MotionPlayground.jsx, apps/web/src/pages/workspace/SettingsPage.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/components/motion/MotionSettings.jsx; DEPENDS_ON apps/web/src/components/motion/MotionPlayground.jsx; DEPENDS_ON apps/web/src/pages/workspace/SettingsPage.jsx
// DAG Node:    none
// Intent:      Exercise personal preference controls, their real Settings location and media previews without business writes.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, setupUser } from '@/test/utils';
import { MotionProvider } from '@/contexts/MotionContext';
import MotionSettings from '../MotionSettings';
import MotionPlayground from '../MotionPlayground';
import MotionToggle from '../MotionToggle';
import SettingsPage from '@/pages/workspace/SettingsPage';
import { MOTION_STORAGE_KEY } from '@/lib/motion/preferences';

const renderMotion = (element = <MotionSettings />) => renderWithProviders(<MotionProvider>{element}</MotionProvider>);
afterEach(() => vi.restoreAllMocks());

describe('organized personal motion settings', () => {
    it('keeps motion in its own Settings tab and connects it to Appearance', async () => {
        const user = setupUser();
        renderMotion(<SettingsPage />);
        expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Workspace' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Open motion settings' }));
        expect(screen.getByRole('tab', { name: 'Motion & interaction' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('heading', { name: 'Motion & interaction' })).toBeVisible();
        expect(screen.getByRole('group', { name: 'Optional effects' })).toBeInTheDocument();
    });

    it('persists grouped choices, applies them at the document root, and resets coherently', async () => {
        const user = setupUser();
        renderMotion();
        await user.click(screen.getByRole('checkbox', { name: /Numbers & diagrams/ }));
        await user.selectOptions(screen.getByRole('combobox', { name: 'Pace' }), 'quick');
        const stored = JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY));
        expect(stored.categories.data).toBe(false);
        expect(stored.pace).toBe('quick');
        expect(document.documentElement).toHaveAttribute('data-motion-data', 'off');
        await user.click(screen.getByRole('button', { name: 'Expressive preset' }));
        expect(screen.getByRole('checkbox', { name: /Ambient decoration/ })).toBeChecked();
        await user.click(screen.getByRole('checkbox', { name: 'Pause automatic effects' }));
        expect(document.documentElement).toHaveAttribute('data-motion-automatic', 'off');
        await user.click(screen.getByRole('button', { name: 'Reset motion settings' }));
        expect(screen.getByRole('checkbox', { name: /Ambient decoration/ })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: /Numbers & diagrams/ })).toBeChecked();
        expect(screen.getByRole('combobox', { name: 'Pace' })).toHaveValue('standard');
    });

    it('explains an OS reduction and never overrides it with an expressive preset', async () => {
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
            matches: query === '(prefers-reduced-motion: reduce)', media: query,
            addEventListener() {}, removeEventListener() {},
        }));
        const user = setupUser();
        renderMotion();
        await user.click(screen.getByRole('button', { name: 'Expressive preset' }));
        expect(screen.getByRole('combobox', { name: 'Motion mode' })).toHaveValue('full');
        expect(document.documentElement).toHaveAttribute('data-motion', 'reduced');
        expect(document.documentElement).toHaveAttribute('data-motion-spatial', 'off');
        expect(screen.getByText(/Your device requests reduced motion/)).toBeVisible();
    });

    it('updates already mounted controls after a cross-tab preference change', () => {
        renderMotion();
        act(() => {
            localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'off' }));
            window.dispatchEvent(new StorageEvent('storage', { key: MOTION_STORAGE_KEY }));
        });
        expect(screen.getByRole('combobox', { name: 'Motion mode' })).toHaveValue('off');
        expect(document.documentElement).toHaveAttribute('data-motion', 'off');
    });

    it('keeps controls usable and reports session-only choices when storage rejects a write', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        const user = setupUser();
        renderMotion();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Motion mode' }), 'off');
        expect(document.documentElement).toHaveAttribute('data-motion', 'off');
        expect(screen.getByText(/choices apply for this visit/)).toBeVisible();
    });

    it('finds every requested area and opens its related preview from the usage reference', async () => {
        const user = setupUser();
        renderMotion();
        await user.click(screen.getByText('Usage reference · all 50 areas'));
        expect(screen.getByText('50 of 50 areas')).toBeVisible();
        await user.type(screen.getByRole('searchbox', { name: 'Search motion usage' }), 'Card-to-detail continuity');
        expect(screen.getByText('1 of 50 areas')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Show related preview' }));
        expect(screen.getByRole('combobox', { name: 'Preview collection' })).toHaveValue('gallery');
        expect(await screen.findByRole('button', { name: 'Expand example image' })).toBeVisible();
    });

    it('gives a public visitor keyboard access and returns focus after closing', async () => {
        const user = setupUser();
        renderMotion(<MotionToggle />);
        const opener = screen.getByRole('button', { name: 'Motion settings' });
        opener.focus();
        await user.keyboard('{Enter}');
        const dialog = await screen.findByRole('dialog', { name: 'Personal display preferences' });
        expect(await within(dialog).findByRole('combobox', { name: 'Motion mode' })).toBeVisible();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });
});

describe('isolated motion previews', () => {
    it('preserves entered text through an explicit simulated failure and retry', async () => {
        const user = setupUser();
        renderMotion(<MotionPlayground kind="interface" />);
        await user.type(screen.getByRole('textbox', { name: 'Preview draft' }), 'Keep this draft');
        await user.click(screen.getByRole('button', { name: 'Run failure example' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Simulated failure');
        expect(screen.getByRole('textbox', { name: 'Preview draft' })).toHaveValue('Keep this draft');
        await user.click(screen.getByRole('button', { name: 'Retry example' }));
        expect(await screen.findByText('Example confirmed. No record was saved.')).toBeVisible();
    });

    it('offers a keyboard alternative to dragging even when motion is off', async () => {
        localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ version: 1, mode: 'off' }));
        const user = setupUser();
        renderMotion(<MotionPlayground kind="planning" />);
        await user.click(screen.getByRole('button', { name: 'Move Review evidence up' }));
        const items = within(screen.getByRole('list', { name: 'Example plan' })).getAllByRole('listitem');
        expect(items[1]).toHaveTextContent('Review evidence');
        items[1].focus();
        await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
        expect(within(screen.getByRole('list', { name: 'Example plan' })).getAllByRole('listitem')[0]).toHaveTextContent('Review evidence');
    });

    it('keeps exact example progress and labels separate from real execution', async () => {
        const user = setupUser();
        renderMotion(<MotionPlayground kind="data" />);
        expect(screen.getByRole('progressbar', { name: 'Example progress' })).toHaveAttribute('aria-valuenow', '2');
        for (let index = 0; index < 3; index++) await user.click(screen.getByRole('button', { name: 'Increase example' }));
        expect(screen.getByRole('progressbar', { name: 'Example progress' })).toHaveAttribute('aria-valuenow', '5');
        expect(screen.getByText(/Example milestone reached/)).toBeVisible();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Example integration state' }), 'observed');
        expect(screen.getByText(/No executor was contacted/)).toBeVisible();
    });

    it('loads only supported local images, releases their URLs and offers image detail', async () => {
        const create = vi.fn(() => 'blob:local-preview');
        const revoke = vi.fn();
        vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
        try {
            const user = setupUser();
            const rendered = renderMotion(<MotionPlayground kind="gallery" />);
            const input = screen.getByLabelText(/Try a local image/);
            fireEvent.change(input, { target: { files: [new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })] } });
            expect(screen.getByRole('alert')).toHaveTextContent('supported file');
            expect(create).not.toHaveBeenCalled();
            await user.upload(input, new File(['image'], 'example.png', { type: 'image/png' }));
            await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
            await user.click(screen.getByRole('button', { name: 'Expand example image' }));
            expect(screen.getByRole('dialog', { name: 'Image detail' })).toBeVisible();
            await user.keyboard('{Escape}');
            await waitFor(() => expect(screen.getByRole('button', { name: 'Expand example image' })).toHaveFocus());
            rendered.unmount();
            expect(revoke).toHaveBeenCalledWith('blob:local-preview');
        } finally { vi.unstubAllGlobals(); }
    });

    it('keeps media paused until chosen, displays a transcript and clears the source on exit', async () => {
        const create = vi.fn(() => 'blob:video-preview');
        const revoke = vi.fn();
        vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
        vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
        try {
            const user = setupUser();
            const rendered = renderMotion(<MotionPlayground kind="media" />);
            await user.upload(screen.getByLabelText(/Local video preview \(MP4/), new File(['video'], 'example.webm', { type: 'video/webm' }));
            const video = await screen.findByLabelText('Local video preview');
            expect(video).toHaveAttribute('controls');
            expect(video).not.toHaveAttribute('autoplay');
            await user.type(screen.getByRole('textbox', { name: 'Readable transcript' }), 'A readable example.');
            await user.click(screen.getByText('Show transcript'));
            expect(screen.getByText('A readable example.', { selector: 'p' })).toBeVisible();
            rendered.unmount();
            expect(revoke).toHaveBeenCalledWith('blob:video-preview');
        } finally { vi.unstubAllGlobals(); }
    });
});
