// CGRF: SRS=SRS-BUILDANDDO-WORKSPACE-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/site/__tests__/Header.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/components/site/Header.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/site/Header.jsx;
//              VALIDATES apps/web/src/lib/roadmapStatus.js
// Intent:      Prove the header groups navigation, marks the active route,
//              opens and closes a real mobile menu with focus return, offers
//              a skip link, and quotes - or hides - the live-signals state.
// ───────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest';

import Header, { NAV, isActiveRoute } from '@/components/site/Header';
import { act, fireEvent, renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

const mockFetch = (body) => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
};
const failFetch = () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));
};

const measured = () => ({ signals_state: 'MEASURED', signals: { sources: {} } });

// Render and wait for the projection fetch to land, so the chip's state
// update happens inside the test's act() scope rather than after it.
async function renderHeader(options) {
    const utils = renderWithProviders(<Header />, options);
    await screen.findAllByTestId('header-signals-chip');
    return utils;
}

describe('isActiveRoute', () => {
    it('matches path, and hash when the route names one', () => {
        expect(isActiveRoute('/roadmap', { pathname: '/roadmap', hash: '' })).toBe(true);
        expect(isActiveRoute('/roadmap', { pathname: '/roadmap', hash: '#live-sources' })).toBe(true);
        expect(isActiveRoute('/#faq', { pathname: '/', hash: '#faq' })).toBe(true);
        expect(isActiveRoute('/#faq', { pathname: '/', hash: '' })).toBe(false);
        expect(isActiveRoute('/practice', { pathname: '/', hash: '' })).toBe(false);
    });
});

describe('Header', () => {
    afterEach(() => {
        delete globalThis.fetch;
    });

    it('renders grouped navigation with absolute routes', async () => {
        mockFetch(measured());
        await renderHeader({ auth: { isAuthed: false } });
        const nav = screen.getByRole('navigation', { name: 'Primary' });
        expect(within(nav).getByRole('button', { name: 'Learn' })).toHaveAttribute('aria-expanded', 'false');
        expect(within(nav).getByRole('button', { name: 'Do' })).toHaveAttribute('aria-expanded', 'false');
        expect(within(nav).getByRole('link', { name: 'Roadmap' })).toHaveAttribute('href', '/roadmap');
        expect(within(nav).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/#faq');
        const learn = NAV.find((g) => g.label === 'Learn');
        expect(learn.items.map((i) => i.label)).toEqual(['Field Manual', 'Daily Edition']);
        const doGroup = NAV.find((g) => g.label === 'Do');
        expect(doGroup.items.map((i) => i.label)).toEqual(['Challenge Desk', 'Evidence Ledger', 'Practice']);
    });

    it('opens a group on click, Escape closes it and returns focus to the button', async () => {
        mockFetch(measured());
        await renderHeader({ auth: { isAuthed: false } });
        const nav = screen.getByRole('navigation', { name: 'Primary' });
        const button = within(nav).getByRole('button', { name: 'Learn' });
        fireEvent.click(button);
        expect(button).toHaveAttribute('aria-expanded', 'true');
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        expect(panel).not.toHaveAttribute('hidden');
        expect(within(panel).getByRole('link', { name: 'Field Manual' })).toHaveAttribute('href', '/#field-manual');
        expect(within(panel).getByRole('link', { name: 'Daily Edition' })).toHaveAttribute('href', '/#daily-edition');
        fireEvent.keyDown(panel, { key: 'Escape' });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(document.activeElement).toBe(button);
    });

    it('marks the active route with aria-current, including inside a group', async () => {
        mockFetch(measured());
        await renderHeader({ auth: { isAuthed: false }, route: '/practice' });
        const nav = screen.getByRole('navigation', { name: 'Primary' });
        const doButton = within(nav).getByRole('button', { name: 'Do' });
        expect(doButton).toHaveAttribute('data-active', 'true');
        fireEvent.click(doButton);
        const panel = document.getElementById(doButton.getAttribute('aria-controls'));
        expect(within(panel).getByRole('link', { name: 'Practice' })).toHaveAttribute('aria-current', 'page');
        expect(within(nav).getByRole('link', { name: 'Roadmap' })).not.toHaveAttribute('aria-current');
    });

    it('marks Roadmap current on /roadmap', async () => {
        mockFetch(measured());
        await renderHeader({ auth: { isAuthed: false }, route: '/roadmap' });
        const nav = screen.getByRole('navigation', { name: 'Primary' });
        expect(within(nav).getByRole('link', { name: 'Roadmap' })).toHaveAttribute('aria-current', 'page');
        expect(within(nav).getByRole('button', { name: 'Do' })).not.toHaveAttribute('data-active');
    });

    it('offers a skip link to the main landmark', async () => {
        mockFetch(measured());
        await renderHeader({ auth: { isAuthed: false } });
        expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    });

    it('opens the mobile menu with aria-expanded, Escape closes it and focus returns', async () => {
        mockFetch(measured());
        await renderHeader({ auth: { isAuthed: false }, route: '/roadmap' });
        const user = setupUser();
        const trigger = screen.getByRole('button', { name: 'Open menu' });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await user.click(trigger);
        const dialog = await screen.findByRole('dialog');
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        const mobileNav = within(dialog).getByRole('navigation', { name: 'Mobile' });
        expect(within(mobileNav).getByText('Learn')).toBeInTheDocument();
        expect(within(mobileNav).getByRole('link', { name: 'Challenge Desk' })).toHaveAttribute('href', '/#challenge-desk');
        expect(within(mobileNav).getByRole('link', { name: 'Roadmap' })).toHaveAttribute('aria-current', 'page');
        expect(within(dialog).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
        expect(within(dialog).getByRole('link', { name: 'Join early access' })).toHaveAttribute('href', '/#early-access');
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(document.activeElement).toBe(trigger);
    });

    it('shows Sign in and Join early access when signed out, Open workspace when signed in', async () => {
        mockFetch(measured());
        const { unmount } = await renderHeader({ auth: { isAuthed: false } });
        expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: 'Join early access' })[0]).toHaveAttribute('href', '/#early-access');
        unmount();
        await renderHeader({ auth: { isAuthed: true } });
        expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute('href', '/app');
        expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    });

    it('quotes the live-signals state from roadmap-status.json', async () => {
        mockFetch(measured());
        await renderHeader({ auth: { isAuthed: false } });
        const chips = await screen.findAllByTestId('header-signals-chip');
        expect(chips[0]).toHaveTextContent('MEASURED');
        expect(chips[0]).toHaveAttribute('href', '/roadmap#live-sources');
        expect(chips[0]).toHaveAttribute('aria-label', 'Live signals: MEASURED. Open the roadmap live sources.');
    });

    it('says UNMEASURED when the projection did not measure signals', async () => {
        mockFetch({ signals_state: 'UNMEASURED', signals: null });
        await renderHeader({ auth: { isAuthed: false } });
        const chips = await screen.findAllByTestId('header-signals-chip');
        expect(chips[0]).toHaveTextContent('UNMEASURED');
        expect(chips[0].textContent).not.toMatch(/\bMEASURED\b/);
    });

    it('hides the chip entirely when the projection cannot be read', async () => {
        failFetch();
        renderWithProviders(<Header />, { auth: { isAuthed: false } });
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
        // let the rejection settle inside act()
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(screen.queryByTestId('header-signals-chip')).not.toBeInTheDocument();
    });

    it('compacts after scrolling past the threshold', async () => {
        mockFetch(measured());
        await renderHeader({ auth: { isAuthed: false } });
        const header = screen.getByRole('banner');
        expect(header).toHaveAttribute('data-compact', 'false');
        act(() => {
            Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });
            window.dispatchEvent(new Event('scroll'));
        });
        expect(header).toHaveAttribute('data-compact', 'true');
        act(() => {
            Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
            window.dispatchEvent(new Event('scroll'));
        });
        expect(header).toHaveAttribute('data-compact', 'false');
    });
});
