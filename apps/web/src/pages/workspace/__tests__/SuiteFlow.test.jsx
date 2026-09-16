// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/SuiteFlow.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/pages/workspace/SuitePage.jsx, tests/upgrade/suite-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/SuitePage.jsx; DEPENDS_ON tests/upgrade/suite-fixture.mjs
// DAG Node:    none
// Intent:      Exercise rendered suite queue, review, access loss and recovery against actual command and computation source.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import SuitePage from '@/pages/workspace/SuitePage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';
import { suiteFixture } from '../../../../../../tests/upgrade/suite-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: (name) => ({ records: name === 'missions' ?
    [{ id: 'mission1', title: 'Government brief preparation', status: 'running' }] : [], loading: false, degraded: false, refresh: vi.fn() }) }));
let backend;
const call = (path, options) => {
    try { return plain(backend.service.command(backend.event(pb.authStore.record.id, options.body, { workspace: path.split('/')[4] }))); }
    catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
};
const renderPage = (actor = 'editor', route = '/app/suite?mission=mission1') => {
    pb.authStore.record = { id: actor };
    return renderWithProviders(<SuitePage />, { auth: { user: { id: actor }, isAuthed: true }, workspace: { active: { id: 'ws1' } }, route });
};
const fillObservation = async (user) => {
    await user.selectOptions(await screen.findByLabelText('Analysis tool'), 'maritime');
    await user.selectOptions(screen.getByLabelText('Source'), 'source1');
    for (const [label, value] of [['Observation identifier', 'obs-new'], ['Source record identifier', 'source-new'], ['Claimed vessel identifier', 'vessel1'],
        ['Observation time (UTC)', '2026-01-01T00:00:00Z'], ['Latitude (WGS84)', '30'], ['Longitude (WGS84)', '-90']]) await user.type(screen.getByLabelText(label), value);
};
const openRun = async (user) => user.click(await within(screen.getByRole('region', { name: 'Mission run history' })).findByRole('button', { name: /Maritime analysis/ }));
beforeEach(() => { backend = suiteFixture(); backend.configure(); pb.send.mockReset(); pb.send.mockImplementation(async (...args) => call(...args)); });

it('provides a saved mission entry point and direct government learning link', async () => {
    renderPage('editor', '/app/suite');
    expect(await screen.findByRole('heading', { name: 'Start with a saved mission' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Government submission tutorials' })).toHaveAttribute('href', '/app/tutorials?path=government');
    expect(pb.send).not.toHaveBeenCalled();
});

it('queues an actual observation and shows blocked configuration without a fabricated result', async () => {
    backend.env.value = ''; const user = setupUser(); renderPage(); await fillObservation(user);
    await user.click(screen.getByRole('button', { name: 'Queue observation analysis' }));
    await waitFor(() => expect(backend.data.suite_runs).toHaveLength(1));
    expect(backend.data.suite_runs[0].status).toBe('blocked');
    expect(await screen.findByText('The operator must connect the worker before this can run.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Attach reviewed result to mission' })).not.toBeInTheDocument();
});

it('requires human review before attaching an actual computed result as observed evidence', async () => {
    const queued = backend.enqueue(); backend.complete(backend.claim(queued));
    const user = setupUser(); renderPage(); await screen.findByRole('region', { name: 'Mission run history' }); await openRun(user);
    expect(await screen.findByText(/1 observations.*0 admitted cues/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Attach reviewed result to mission' })); expect(backend.data.evidence).toHaveLength(0);
    await user.type(screen.getByLabelText('Human review note'), 'Reviewed the retained observation and replay limits.');
    await user.click(screen.getByRole('button', { name: 'Attach reviewed result to mission' }));
    await waitFor(() => expect(backend.data.evidence).toHaveLength(1)); expect(backend.data.evidence[0].type).toBe('observed');
    expect(backend.data.missions[0].status).toBe('running'); expect(await screen.findByText('Review attached as observed evidence.')).toBeVisible();
});

it('keeps an uncertain request recoverable while preventing another change', async () => {
    const user = setupUser(); renderPage(); await fillObservation(user); let lost = true;
    pb.send.mockImplementation(async (path, options) => { const value = call(path, options); if (options.body.action === 'enqueue' && lost) { lost = false; throw new Error('lost response'); } return value; });
    await user.click(screen.getByRole('button', { name: 'Queue observation analysis' }));
    expect(await screen.findByRole('button', { name: 'Recover previous request' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Queue observation analysis' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Recover previous request' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Recover previous request' })).not.toBeInTheDocument());
    expect(backend.data.suite_runs).toHaveLength(1);
});

it('shows viewer reads with disabled execution and clears details after membership revocation', async () => {
    const queued = backend.enqueue(); backend.complete(backend.claim(queued));
    const user = setupUser(); renderPage('viewer'); await screen.findByRole('region', { name: 'Mission run history' }); await openRun(user);
    expect(await screen.findByLabelText('Human review note')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Attach reviewed result to mission' })).toBeDisabled();
    backend.app.delete(backend.app.findRecordById('workspace_members', 'viewermember'));
    await user.click(screen.getByRole('button', { name: 'Refresh run status' }));
    await waitFor(() => expect(screen.queryByLabelText('Suite run details')).not.toBeInTheDocument());
    expect(await screen.findByRole('alert')).toBeVisible();
});

it('edits mission settings through the real owner permission and leaves one saved revision', async () => {
    const user = setupUser(); renderPage('owner');
    await user.click(await screen.findByText('Mission settings and source rights'));
    await user.click(screen.getByLabelText('Enable suite analysis for this mission'));
    await user.click(screen.getByRole('button', { name: 'Save mission settings' }));
    await waitFor(() => expect(backend.data.suite_controls[0].revision).toBe(2));
    expect(backend.data.suite_controls[0].enabled).toBe(false);
    expect(await screen.findByText('A workspace owner or administrator must enable this mission’s suite.')).toBeVisible();
});
