// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/pages/workspace/__tests__/DailyEditionPage.test.jsx
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-21
// Depends:      apps/web/src/pages/workspace/DailyEditionPage.jsx, apps/web/src/lib/dailyDigest.js
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/web/src/pages/workspace/DailyEditionPage.jsx; DEPENDS_ON apps/web/src/lib/dailyDigest.js
// DAG Node:     none
// Intent:       Check rendered edition error states, true review dates and midnight rollover rather than trusting an empty or stale digest.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DailyEditionPage from '@/pages/workspace/DailyEditionPage';
const state = vi.hoisted(() => ({ sources: {}, account: 'account1', workspace: 'workspace1' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.account } }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ active: { id: state.workspace } }) }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: (name) => state.sources[name] }));
vi.mock('@/components/motion/MotionPrimitives', () => ({ MotionEntrance: ({ children }) => children, MotionList: ({ as: Element = 'div', children }) => <Element>{children}</Element>, MotionValue: ({ value }) => <span>{value}</span> }));
beforeEach(() => {
    state.account = 'account1'; state.workspace = 'workspace1';
    for (const name of ['daily_editions', 'missions', 'signals']) state.sources[name] = { records: [], loading: false, degraded: false, refresh: vi.fn(), create: vi.fn(), update: vi.fn(), saving: false, writeError: '', clearWriteError: vi.fn() };
});
afterEach(() => vi.useRealTimers());
function Page() { return <MemoryRouter><DailyEditionPage /></MemoryRouter>; }
it('shows unavailable source reads instead of reporting that no work was verified', () => {
    state.sources.missions.degraded = true; render(<Page />);
    expect(screen.queryByText('Nothing has been verified today. That is a fact, not a failure.')).not.toBeInTheDocument();
    expect(screen.getByText(/Daily summary unavailable/i)).toBeVisible();
});
it('uses the actual review timestamp and excludes a later edit from today', () => {
    const now = new Date(), yesterday = new Date(now.getTime() - 86400000);
    state.sources.missions.records = [
        { id: 'old', title: 'Reviewed yesterday', status: 'verified', mission_reviewed_at: yesterday.toISOString(), updated: now.toISOString() },
        { id: 'new', title: 'Reviewed today', status: 'verified', mission_reviewed_at: now.toISOString(), updated: now.toISOString() },
    ];
    render(<Page />); expect(screen.getByText('Reviewed today')).toBeVisible(); expect(screen.queryByText('Reviewed yesterday')).not.toBeInTheDocument();
});
it('expires the previous day digest at the local calendar boundary', () => {
    vi.useFakeTimers(); const now = new Date(2026, 8, 21, 23, 59, 30); vi.setSystemTime(now);
    state.sources.missions.records = [{ id: 'old', title: 'Earlier review', status: 'verified', mission_reviewed_at: now.toISOString() }];
    render(<Page />); expect(screen.getByText('Earlier review')).toBeVisible();
    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.queryByText('Earlier review')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing has been verified today. That is a fact, not a failure.')).toBeVisible();
});
