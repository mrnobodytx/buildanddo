// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/editorial/__tests__/EditorialReels.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/components/editorial/VerticalNewsReel.jsx, apps/web/src/components/editorial/LivingStill.jsx, apps/web/src/components/editorial/AndroidPhoneFrame.jsx, apps/web/src/components/editorial/EditorialFrontPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/editorial/VerticalNewsReel.jsx; VALIDATES apps/web/src/components/editorial/LivingStill.jsx; VALIDATES apps/web/src/components/editorial/AndroidPhoneFrame.jsx; VALIDATES apps/web/src/components/editorial/EditorialFrontPage.jsx
// DAG Node:    none
// Intent:      Exercise independent story navigation, accessible pauses, changing sources and interactive phone content using the actual components.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VerticalNewsReel from '../VerticalNewsReel';
import LivingStill from '../LivingStill';
import AndroidPhoneFrame from '../AndroidPhoneFrame';
import EditorialFrontPage from '../EditorialFrontPage';

const policy = vi.hoisted(() => ({ active: true, enabled: true, automatic: true }));
vi.mock('@/contexts/MotionContext', () => ({
    useMotionActivity: () => ({ ref: null, active: policy.active, enabled: policy.enabled, motion: { automatic: policy.automatic } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthed: true, user: { id: 'reader' } }) }));

const items = ['First', 'Second', 'Third', 'Fourth', 'Fifth'].map((title, index) => ({
    id: String(index), title, description: 'Read this story in its original context.',
    kicker: 'Research', source: 'Original source', date: '2026-01-01',
    href: '/practice', linkLabel: 'Read ' + title, illustration: 'wireless',
}));
const mount = (child) => render(<MemoryRouter>{child}</MemoryRouter>);
const reel = (name) => within(screen.getByRole('region', { name }));
const tick = (milliseconds) => act(() => vi.advanceTimersByTime(milliseconds));
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(policy, { active: true, enabled: true, automatic: true });
});
afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('independent newspaper reels', () => {
    it('advances left and right at their own intervals', () => {
        mount(<>
            <VerticalNewsReel items={items} label="Left" visibleCount={1} interval={6000} />
            <VerticalNewsReel items={items} label="Right" visibleCount={1} interval={9000} />
        </>);
        tick(6000);
        expect(reel('Left').getByRole('heading', { name: 'Second' })).toBeVisible();
        expect(reel('Right').getByRole('heading', { name: 'First' })).toBeVisible();
        tick(3000);
        expect(reel('Right').getByRole('heading', { name: 'Second' })).toBeVisible();
    });

    it('pauses a hovered column while the other continues, then starts a fresh reading interval', () => {
        mount(<>
            <VerticalNewsReel items={items} label="Left" visibleCount={1} interval={6000} />
            <VerticalNewsReel items={items} label="Right" visibleCount={1} interval={6000} />
        </>);
        fireEvent.mouseEnter(screen.getByRole('region', { name: 'Left' }));
        tick(12000);
        expect(reel('Left').getByRole('heading', { name: 'First' })).toBeVisible();
        expect(reel('Right').getByRole('heading', { name: 'Third' })).toBeVisible();
        fireEvent.mouseLeave(screen.getByRole('region', { name: 'Left' }));
        tick(6000);
        expect(reel('Left').getByRole('heading', { name: 'Second' })).toBeVisible();
    });

    it('stops when a keyboard reader enters and waits for an explicit play request after focus leaves', () => {
        mount(<><VerticalNewsReel items={items} label="Left" visibleCount={1} interval={6000} /><button>Outside</button></>);
        act(() => reel('Left').getByRole('link', { name: 'Read First' }).focus());
        tick(18000);
        expect(reel('Left').getByRole('heading', { name: 'First' })).toBeVisible();
        act(() => screen.getByRole('button', { name: 'Outside' }).focus());
        tick(18000);
        expect(reel('Left').getByRole('heading', { name: 'First' })).toBeVisible();
        fireEvent.click(reel('Left').getByRole('button', { name: 'Play Left' }));
        tick(6000);
        expect(reel('Left').getByRole('heading', { name: 'Second' })).toBeVisible();
    });

    it('a pointer click on Pause remains a pause when the button receives focus', async () => {
        mount(<VerticalNewsReel items={items} label="Left" visibleCount={1} interval={6000} />);
        await user().click(reel('Left').getByRole('button', { name: 'Pause Left' }));
        fireEvent.mouseLeave(screen.getByRole('region', { name: 'Left' }));
        expect(reel('Left').getByRole('button', { name: 'Play Left' })).toBeVisible();
        tick(18000);
        expect(reel('Left').getByRole('heading', { name: 'First' })).toBeVisible();
    });

    it('manual previous and next wrap while automatic rotation stays paused', async () => {
        mount(<VerticalNewsReel items={items} label="Left" visibleCount={1} interval={6000} />);
        const reader = user();
        await reader.click(reel('Left').getByRole('button', { name: 'Previous in Left' }));
        expect(reel('Left').getByRole('heading', { name: 'Fifth' })).toBeVisible();
        await reader.click(reel('Left').getByRole('button', { name: 'Next in Left' }));
        expect(reel('Left').getByRole('heading', { name: 'First' })).toBeVisible();
        fireEvent.mouseLeave(screen.getByRole('region', { name: 'Left' }));
        tick(12000);
        expect(reel('Left').getByRole('heading', { name: 'First' })).toBeVisible();
    });

    it('keeps transition-buffer links inert and exposes only the visible story window', () => {
        const view = mount(<VerticalNewsReel items={items} label="Left" visibleCount={3} />);
        expect(reel('Left').getAllByRole('link')).toHaveLength(3);
        expect(reel('Left').getAllByRole('heading').map((node) => node.textContent)).toEqual(['First', 'Second', 'Third']);
        const buffers = view.container.querySelectorAll('article[aria-hidden="true"]');
        expect(buffers).toHaveLength(2);
        buffers.forEach((buffer) => {
            expect(buffer).toHaveAttribute('inert');
            expect(buffer.querySelector('a')).toHaveAttribute('tabindex', '-1');
        });
    });

    it('removes old stories immediately when the source changes and handles an empty response', () => {
        const view = mount(<VerticalNewsReel items={items} label="Left" visibleCount={1} />);
        tick(60000);
        view.rerender(<MemoryRouter><VerticalNewsReel items={[{ ...items[0], id: 'new', title: 'Replacement' }]} label="Left" /></MemoryRouter>);
        expect(reel('Left').getByRole('heading', { name: 'Replacement' })).toBeVisible();
        expect(screen.queryByText('Second')).not.toBeInTheDocument();
        expect(reel('Left').queryByRole('button')).not.toBeInTheDocument();
        view.rerender(<MemoryRouter><VerticalNewsReel items={[]} label="Left" /></MemoryRouter>);
        expect(reel('Left').getByRole('status')).toHaveTextContent('There are no stories');
        expect(reel('Left').queryByRole('link')).not.toBeInTheDocument();
    });

    it('stops offscreen or policy-disabled clocks and leaves manual navigation available', () => {
        const view = mount(<VerticalNewsReel items={items} label="Left" visibleCount={1} interval={6000} />);
        policy.active = false;
        view.rerender(<MemoryRouter><VerticalNewsReel items={items} label="Left" visibleCount={1} interval={6000} /></MemoryRouter>);
        tick(12000);
        expect(reel('Left').getByRole('heading', { name: 'First' })).toBeVisible();
        Object.assign(policy, { enabled: false, automatic: false });
        view.rerender(<MemoryRouter><VerticalNewsReel items={items} label="Left" visibleCount={1} interval={6000} /></MemoryRouter>);
        fireEvent.click(reel('Left').getByRole('button', { name: 'Next in Left' }));
        expect(reel('Left').getByRole('heading', { name: 'Second' })).toBeVisible();
        expect(reel('Left').getByRole('button', { name: 'Play Left' })).toBeDisabled();
        tick(12000);
        expect(reel('Left').getByRole('heading', { name: 'Second' })).toBeVisible();
    });

    it('cleans up every reel clock when unmounted', () => {
        const view = mount(<VerticalNewsReel items={items} label="Left" visibleCount={1} />);
        expect(vi.getTimerCount()).toBe(1);
        view.unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('freezes living stills under local pause and reduced-motion policy', () => {
        const view = mount(<LivingStill src="/illustration.svg" alt="An engraved book" />);
        expect(screen.getByRole('img', { name: 'An engraved book' }).closest('figure')).toHaveAttribute('data-moving', 'on');
        view.rerender(<MemoryRouter><LivingStill src="/illustration.svg" alt="An engraved book" paused /></MemoryRouter>);
        expect(screen.getByRole('img', { name: 'An engraved book' }).closest('figure')).toHaveAttribute('data-moving', 'off');
        Object.assign(policy, { enabled: false, active: false });
        view.rerender(<MemoryRouter><LivingStill src="/illustration.svg" alt="An engraved book" /></MemoryRouter>);
        expect(screen.getByRole('img', { name: 'An engraved book' }).closest('figure')).toHaveAttribute('data-motion-enabled', 'off');
    });

    it('phone content remains interactive and does not introduce another main landmark', () => {
        mount(<main><AndroidPhoneFrame><a href="/classrooms">Find a classroom</a></AndroidPhoneFrame></main>);
        expect(screen.getAllByRole('main')).toHaveLength(1);
        expect(screen.getByRole('link', { name: 'Find a classroom' })).toHaveAttribute('href', '/classrooms');
    });

    it('switches the phone reading independently of both desktop reels', async () => {
        mount(<EditorialFrontPage />);
        const initialResearch = reel('Research news').getAllByRole('heading').map((node) => node.textContent);
        const initialPlatform = reel('Platform areas').getAllByRole('heading').map((node) => node.textContent);
        await user().click(screen.getByRole('button', { name: 'Research', exact: true }));
        expect(reel('Pocket edition').getByRole('heading', { name: 'Give the answer a source.' })).toBeVisible();
        expect(reel('Research news').getAllByRole('heading').map((node) => node.textContent)).toEqual(initialResearch);
        expect(reel('Platform areas').getAllByRole('heading').map((node) => node.textContent)).toEqual(initialPlatform);
    });

    it('removes private research on scope change and shows a recoverable unavailable state', async () => {
        const data = { workspace: 'one', items: [{ id: 'r1', workspace: 'one', status: 'ready', title: 'Private research',
            context: 'Private context', processed_at: new Date(Date.now() - 60000).toISOString() }] };
        const refresh = vi.fn();
        const view = mount(<EditorialFrontPage workspaceId="one" sources={{ research: { data, refresh } }} />);
        await user().selectOptions(screen.getByRole('combobox', { name: 'Research source' }), 'workspace');
        expect(reel('Research news').getByRole('heading', { name: 'Private research' })).toBeVisible();
        view.rerender(<MemoryRouter><EditorialFrontPage workspaceId="two" sources={{ research: { data, refresh, loading: true } }} /></MemoryRouter>);
        expect(screen.queryByText('Private research')).not.toBeInTheDocument();
        expect(screen.getByText('Reading your research desk…')).toBeVisible();
        view.rerender(<MemoryRouter><EditorialFrontPage workspaceId="two" sources={{ research: { data, refresh, error: 'offline' } }} /></MemoryRouter>);
        await user().click(screen.getByRole('button', { name: 'Try again' }));
        expect(refresh).toHaveBeenCalledOnce();
        expect(screen.queryByText('Private research')).not.toBeInTheDocument();
    });
});
