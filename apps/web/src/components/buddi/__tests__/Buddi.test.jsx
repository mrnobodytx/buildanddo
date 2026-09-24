// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/buddi/__tests__/Buddi.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/buddi/Buddi.jsx, apps/web/src/components/buddi/BuddiGuide.jsx, apps/web/src/components/buddi/BuddiAchievements.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/buddi/Buddi.jsx; VALIDATES apps/web/src/components/buddi/BuddiGuide.jsx; VALIDATES apps/web/src/components/buddi/BuddiAchievements.jsx
// DAG Node:    none
// Intent:      Verify Buddi is accessible, answers a press, can be hidden, and celebrates each server-confirmed achievement once.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Buddi from '@/components/buddi/Buddi';
import BuddiGuide from '@/components/buddi/BuddiGuide';
import BuddiAchievements from '@/components/buddi/BuddiAchievements';
import { BUDDI_TIPS } from '@/lib/buddi';

const { learning } = vi.hoisted(() => ({ learning: { current: { data: null, loading: false } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ active: { id: 'w1' } }) }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ demo: false }) }));
vi.mock('@/hooks/useLearningSummary', () => ({ useLearningSummary: () => learning.current }));

const missions = (records, extra = {}) => ({ records, loading: false, degraded: false, ...extra });
const verified = (id) => ({ id, workspace: 'w1', status: 'verified', title: `Mission ${id}` });

beforeEach(() => {
    window.localStorage.clear();
    learning.current = { data: null, loading: false };
});

describe('Buddi figure', () => {
    it('is decorative unless it is given a name, and falls back to calm for an unknown pose', () => {
        const { container, rerender } = render(<Buddi pose="dance" />);
        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(container.querySelector('.buddi')).toHaveAttribute('data-pose', 'calm');
        rerender(<Buddi pose="verified" label="Buddi holding a verified check" />);
        expect(screen.getByRole('img', { name: 'Buddi holding a verified check' })).toBeInTheDocument();
    });
});

describe('Buddi guide', () => {
    it('speaks for the first ranked action and gives a tip on each press', async () => {
        const user = userEvent.setup();
        render(<BuddiGuide view={{ state: 'observed', actions: [{ id: 'begin', priority: 6 }] }} loading={false} />);
        expect(screen.getByTestId('buddi-line')).toHaveTextContent('Start by writing down the problem you want to solve.');
        const buddi = screen.getByRole('button', { name: /Buddi, your guide/ });
        await user.click(buddi);
        expect(screen.getByText(BUDDI_TIPS[0])).toBeVisible();
        await user.click(buddi);
        expect(screen.getByText(BUDDI_TIPS[1])).toBeVisible();
        await user.keyboard('{Escape}');
        expect(screen.queryByText(BUDDI_TIPS[1])).toBeNull();
    });

    it('looks up on focus and stays hidden once hidden', async () => {
        const user = userEvent.setup();
        const { container, unmount } = render(<BuddiGuide view={null} loading />);
        await user.tab();
        expect(container.querySelector('.buddi')).toHaveAttribute('data-look', 'up');
        await user.click(screen.getByRole('button', { name: 'Hide Buddi' }));
        expect(screen.queryByRole('button', { name: /Buddi, your guide/ })).toBeNull();
        unmount();
        render(<BuddiGuide view={null} loading />);
        await user.click(screen.getByRole('button', { name: 'Show Buddi' }));
        expect(screen.getByRole('button', { name: /Buddi, your guide/ })).toBeInTheDocument();
    });
});

describe('Buddi achievements', () => {
    it('seeds past wins silently, celebrates a new one once, and remembers it', async () => {
        const user = userEvent.setup();
        const { rerender, unmount } = render(<BuddiAchievements missions={missions([verified('a')])} />);
        expect(screen.queryByText(/Achievement earned/)).toBeNull();

        rerender(<BuddiAchievements missions={missions([verified('a'), { id: 'b', workspace: 'w1', status: 'failed' }])} />);
        expect(await screen.findByText('Achievement earned: Closed honestly')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Got it' }));
        expect(screen.queryByText(/Achievement earned/)).toBeNull();

        unmount();
        render(<BuddiAchievements missions={missions([verified('a'), { id: 'b', workspace: 'w1', status: 'failed' }])} />);
        expect(screen.queryByText(/Achievement earned/)).toBeNull();
    });

    it('says unmeasured when missions cannot be read and never celebrates client-set progress', () => {
        render(<BuddiAchievements missions={missions([{ id: 'x', workspace: 'w1', status: 'running', progress: 100 }], { degraded: true })} />);
        const first = screen.getByText('First verified mission').closest('li');
        expect(first).toHaveTextContent('Unmeasured');
        expect(screen.queryByText(/Achievement earned/)).toBeNull();
    });
});
