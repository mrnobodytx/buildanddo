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
import broadcastCurriculum from '../../../../../pocketbase/pb_migrations/data/broadcast-classroom-lessons.json?public-lessons';
import authorityCurriculum from '../../../../../pocketbase/pb_migrations/data/authority-repairs-lessons.json?public-lessons';
import EvidencePage from '@/pages/workspace/EvidencePage';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { createMockEvidence, renderWithProviders, screen, setupUser, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn(), trackAuthIdentity: vi.fn(), readFailed: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));

beforeEach(() => { pb.__reset(); setDemoMode(false); });
afterEach(() => vi.restoreAllMocks());
const sourcePanel = () => within(screen.getByRole('region', { name: 'Source case studies' }));
const sourceCases = [broadcastCurriculum, authorityCurriculum];
const casePanel = (curriculum) => within(sourcePanel().getByRole('article', { name: curriculum.lessons[0].title }));
const noWrites = () => {
    for (const name of ['evidence', 'missions', 'tutorial_progress', 'tutorial_learning']) {
        for (const method of ['create', 'update', 'delete']) expect(pb.__collection(name)[method]).not.toHaveBeenCalled();
    }
};

it('shows both public cases separately even when the workspace has no evidence', async () => {
    renderWithProviders(<EvidencePage />, { route: '/app/evidence' });
    expect(await screen.findByText('No evidence available yet')).toBeVisible();
    const panel = sourcePanel();
    expect(panel.getAllByRole('article')).toHaveLength(2);
    for (const curriculum of sourceCases) {
        const tutorial = curriculum.lessons[0];
        expect(panel.getByRole('heading', { name: tutorial.title })).toBeVisible();
        expect(panel.getByText(curriculum.source_evidence.boundary)).toBeVisible();
        expect(panel.getByRole('link', { name: `Read the repair lesson: ${tutorial.title}` })).toHaveAttribute('href', `/app/tutorials?lesson=${tutorial.slug}`);
    }
    expect(panel.getByText(/separate from workspace evidence records, totals and verification badges/)).toBeVisible();
    expect(panel.queryByText('Verified', { exact: true })).not.toBeInTheDocument();
    expect(panel.queryByRole('button', { name: /Add evidence|Inspect evidence|Save/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    noWrites();
});

it('preserves the dated broadcast observation as limited history, not a current full-test gate', async () => {
    renderWithProviders(<EvidencePage />);
    await screen.findByText('No evidence available yet');
    const panel = casePanel(broadcastCurriculum), title = broadcastCurriculum.lessons[0].title;
    expect(panel.getByText(/Historical source observation dated/)).toHaveTextContent(broadcastCurriculum.source_evidence.observation.observed_at);
    expect(panel.getByText(/Not a current full-test gate/)).toBeVisible();
    await setupUser().click(panel.getByText('Validation evidence and public source references'));
    const { counts } = broadcastCurriculum.source_evidence.observation;
    expect(panel.getByLabelText(`Recorded source run: ${title}`)).toHaveTextContent(`${counts.pass}/${counts.tests} passed`);
    expect(panel.getByLabelText(`Recorded source run: ${title}`)).toHaveTextContent(broadcastCurriculum.source_evidence.observation.source_sha256);
    expect(panel.getByRole('link', { name: `Download the captured source test output: ${title}` })).toHaveAttribute('href', '/broadcast-repairs-source.txt');
    expect(panel.getByText(`Public capture SHA-256: ${broadcastCurriculum.source_evidence.artifact.sha256}`)).toBeVisible();
    const plan = within(panel.getByRole('list', { name: `Case study validation plan: ${title}` }));
    for (const check of broadcastCurriculum.source_evidence.validation) {
        expect(plan.getByRole('heading', { name: `${check.label}: ${check.status}` })).toBeVisible();
        expect(plan.getByText(check.description)).toBeVisible();
        for (const command of check.commands) expect(plan.getByText(command)).toBeVisible();
    }
    const references = within(panel.getByRole('navigation', { name: `Case study source references: ${title}` }));
    for (const reference of broadcastCurriculum.lessons[0].lesson.references.filter((item) => item.url.startsWith('https://'))) {
        const link = references.getByRole('link', { name: `${reference.label} (opens in a new tab)` });
        expect(link).toHaveAttribute('href', reference.url);
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(panel.queryByText(/^(PASS|Verified|Completed)$/)).not.toBeInTheDocument();
    noWrites();
});

it('opens the measured authority case with bounded source evidence and distinct labels', async () => {
    renderWithProviders(<EvidencePage />);
    await screen.findByText('No evidence available yet');
    const panel = casePanel(authorityCurriculum), title = authorityCurriculum.lessons[0].title;
    const summary = panel.getByText('Validation evidence and public source references');
    expect(summary).toHaveAccessibleName(`Validation evidence and public source references: ${title}`);
    await setupUser().click(summary);
    expect(panel.getByLabelText(`Recorded source run: ${title}`)).toHaveTextContent('135/135 passed');
    expect(panel.getByLabelText(`Recorded source run: ${title}`)).toHaveTextContent(authorityCurriculum.source_evidence.observation.source_sha256);
    expect(panel.getByRole('link', { name: /Download/ })).toHaveAttribute('href', '/authority-repairs-recovery-source.txt');
    for (const artifact of authorityCurriculum.source_evidence.previous_artifacts) {
        expect(panel.getByRole('link', { name: artifact.label })).toHaveAttribute('href', artifact.url);
        expect(panel.getByText(`SHA-256: ${artifact.sha256}`)).toBeVisible();
    }
    expect(panel.queryByText(/No measured source run or result artifact is recorded/)).not.toBeInTheDocument();
    const plan = within(panel.getByRole('list', { name: `Case study validation plan: ${title}` }));
    for (const check of authorityCurriculum.source_evidence.validation) {
        expect(plan.getByRole('heading', { name: `${check.label}: ${check.status}` })).toBeVisible();
        for (const command of check.commands) expect(plan.getByText(command)).toBeVisible();
    }
    const references = within(panel.getByRole('navigation', { name: `Case study source references: ${title}` }));
    for (const reference of authorityCurriculum.lessons[0].lesson.references.filter((item) => item.url.startsWith('https://'))) {
        const link = references.getByRole('link', { name: `${reference.label} (opens in a new tab)` });
        expect(link).toHaveAttribute('href', reference.url);
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(casePanel(broadcastCurriculum).getByText('Validation evidence and public source references').closest('details')).not.toHaveAttribute('open');
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
    for (const curriculum of sourceCases) {
        await user.clear(search);
        await user.type(search, curriculum.lessons[0].title);
        expect(screen.getByText('Showing 0 of 2')).toBeVisible();
        expect(screen.getByText('No evidence matches that search.')).toBeVisible();
        expect(casePanel(curriculum).getByRole('heading', { name: curriculum.lessons[0].title })).toBeVisible();
    }
    noWrites();
});

it('keeps public source material readable when workspace evidence cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pb.__setError('evidence');
    renderWithProviders(<EvidencePage />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText('No evidence available yet')).not.toBeInTheDocument();
    for (const curriculum of sourceCases)
        expect(sourcePanel().getByRole('link', { name: `Read the repair lesson: ${curriculum.lessons[0].title}` })).toBeVisible();
    expect(sourcePanel().getByText(/Source regression: recorded source pass.*Hosted media: unmeasured/)).toBeVisible();
    expect(sourcePanel().getByText(/Source regression: recorded source pass.*Deployment and payment observations: unmeasured/)).toBeVisible();
    noWrites();
});

it('does not invent output when a source case has no recorded run', async () => {
    const saved = authorityCurriculum.source_evidence;
    authorityCurriculum.source_evidence = { ...saved, observation: null, artifact: null };
    try {
        renderWithProviders(<EvidencePage />);
        await screen.findByText('No evidence available yet');
        const panel = casePanel(authorityCurriculum), title = authorityCurriculum.lessons[0].title;
        await setupUser().click(panel.getByText('Validation evidence and public source references'));
        expect(panel.getByText(/No measured source run or result artifact is recorded/)).toBeVisible();
        expect(panel.queryByLabelText(`Recorded source run: ${title}`)).not.toBeInTheDocument();
        expect(panel.queryByRole('link', { name: /Download/ })).not.toBeInTheDocument();
        noWrites();
    } finally { authorityCurriculum.source_evidence = saved; }
});
