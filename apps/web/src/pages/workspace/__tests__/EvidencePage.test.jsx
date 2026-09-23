// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/pages/workspace/__tests__/EvidencePage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/workspace/EvidencePage.jsx, apps/web/src/test/utils.jsx, apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/EvidencePage.jsx; CONSUMES apps/web/src/test/utils.jsx; CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json
// DAG Node:    none
// Intent:      Keep source case studies readable and linked without counting them as workspace outcomes or writing learning state.
// ----------------------------------------------------------------

import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import broadcastCurriculum from '../../../../../pocketbase/pb_migrations/data/broadcast-classroom-lessons.json';
import EvidencePage from '@/pages/workspace/EvidencePage';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { createMockEvidence, renderWithProviders, screen, setupUser, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn(), trackAuthIdentity: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));

beforeEach(() => { pb.__reset(); setDemoMode(false); });
afterEach(() => vi.restoreAllMocks());
const sourcePanel = () => within(screen.getByRole('region', { name: 'Source case studies' }));
const noWrites = () => {
    for (const name of ['evidence', 'missions', 'tutorial_progress', 'tutorial_learning']) {
        for (const method of ['create', 'update', 'delete']) expect(pb.__collection(name)[method]).not.toHaveBeenCalled();
    }
};

it('shows the public case separately even when the workspace has no evidence', async () => {
    renderWithProviders(<EvidencePage />, { route: '/app/evidence' });
    expect(await screen.findByText('No evidence available yet')).toBeVisible();
    const panel = sourcePanel(), tutorial = broadcastCurriculum.lessons[0];
    expect(panel.getByRole('heading', { name: tutorial.title })).toBeVisible();
    expect(panel.getByText(broadcastCurriculum.source_evidence.boundary)).toBeVisible();
    expect(panel.getByText(/separate from workspace evidence records, totals and verification badges/)).toBeVisible();
    expect(panel.getByRole('link', { name: 'Read the repair lesson' })).toHaveAttribute('href', `/app/tutorials?lesson=${tutorial.slug}`);
    expect(panel.queryByText('Verified', { exact: true })).not.toBeInTheDocument();
    expect(panel.queryByRole('button', { name: /Add evidence|Inspect evidence|Save/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    noWrites();
});

it('exposes a scoped source observation and references without claiming native or deployed verification', async () => {
    renderWithProviders(<EvidencePage />);
    await screen.findByText('No evidence available yet');
    const panel = sourcePanel();
    await setupUser().click(panel.getByText('Validation evidence and public source references'));
    expect(panel.getByLabelText('Recorded source run')).toHaveTextContent('121/121 passed');
    expect(panel.getByLabelText('Recorded source run')).toHaveTextContent(broadcastCurriculum.source_evidence.observation.source_sha256);
    expect(panel.getByRole('link', { name: 'Download the captured source test output' })).toHaveAttribute('href', '/broadcast-repairs-source.txt');
    const plan = within(panel.getByRole('list', { name: 'Case study validation plan' }));
    for (const check of broadcastCurriculum.source_evidence.validation) {
        expect(plan.getByRole('heading', { name: `${check.label}: ${check.status}` })).toBeVisible();
        expect(plan.getByText(check.description)).toBeVisible();
        for (const command of check.commands) expect(plan.getByText(command)).toBeVisible();
    }
    const references = within(panel.getByRole('navigation', { name: 'Case study source references' }));
    for (const reference of broadcastCurriculum.lessons[0].lesson.references.filter((item) => item.url.startsWith('https://'))) {
        const link = references.getByRole('link', { name: `${reference.label} (opens in a new tab)` });
        expect(link).toHaveAttribute('href', reference.url);
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(panel.queryByText(/^(PASS|Verified|Completed)$/)).not.toBeInTheDocument();
    noWrites();
});

it('does not include source cases in workspace filters, record counts or verification badges', async () => {
    pb.__setRecords('evidence', [
        createMockEvidence({ id: 'note-one', title: 'Observation one', content: 'First fixture note.', type: 'observed' }),
        createMockEvidence({ id: 'note-two', title: 'Decision two', content: 'Second fixture note.', type: 'decided' }),
    ]);
    renderWithProviders(<EvidencePage />);
    expect(await screen.findByText('Observation one')).toBeVisible();
    const user = setupUser(), search = screen.getByRole('searchbox');
    await user.type(search, 'Observation one');
    expect(screen.getByText('Showing 1 of 2')).toBeVisible();
    await user.clear(search);
    await user.type(search, broadcastCurriculum.lessons[0].title);
    expect(screen.getByText('Showing 0 of 2')).toBeVisible();
    expect(screen.getByText('No evidence matches that search.')).toBeVisible();
    expect(sourcePanel().getByRole('heading', { name: broadcastCurriculum.lessons[0].title })).toBeVisible();
    noWrites();
});

it('keeps public source material readable when workspace evidence cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pb.__setError('evidence');
    renderWithProviders(<EvidencePage />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText('No evidence available yet')).not.toBeInTheDocument();
    expect(sourcePanel().getByRole('link', { name: 'Read the repair lesson' })).toBeVisible();
    expect(sourcePanel().getByText(/Source regression: recorded source pass.*Hosted media: unmeasured/)).toBeVisible();
    noWrites();
});
