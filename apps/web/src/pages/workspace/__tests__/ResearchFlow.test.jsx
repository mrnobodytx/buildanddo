// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/ResearchFlow.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/pages/workspace/ResearchPage.jsx, tests/upgrade/research-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/ResearchPage.jsx; CONSUMES tests/upgrade/research-fixture.mjs
// DAG Node:    none
// Intent:      Exercise rendered submission, recovery and review against the real command policy rather than advancing state in UI fixtures.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Link } from 'react-router-dom';
import ResearchPage from '@/pages/workspace/ResearchPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, scriptsCarrying, screen, setupUser, waitFor, within } from '@/test/utils';
import { researchFixture } from '../../../../../../tests/upgrade/research-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn(), collection: vi.fn(), filter: vi.fn(), files: {} } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: () => ({ records: [{ id: 'mission1', title: 'Research mission', status: 'running' }], loading: false, degraded: false, refresh: vi.fn() }) }));
let backend;
const read = (path, options) => {
    const event = backend.event(pb.authStore.record.id, options.body || {}, { workspace: path.split('/')[4], id: path.split('/')[6], query: options.query || {} });
    try { return plain(options.method === 'POST' ? backend.service.command(event) : path.split('/')[6] ? backend.service.detail(event) : backend.service.snapshot(event)); }
    catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
};
const renderPage = (actor = 'editor', route = '/app/research') => {
    pb.authStore.record = { id: actor };
    return renderWithProviders(<ResearchPage />, { auth: { user: { id: actor }, isAuthed: true }, workspace: { active: { id: 'ws1', owner: 'owner' } }, route });
};
const fill = async (user, title = 'Search source') => {
    await user.selectOptions(await screen.findByLabelText('Mission'), 'mission1');
    await user.type(screen.getByLabelText('Source title'), title);
    await user.type(screen.getByLabelText('Search query'), 'source methods');
    await user.type(screen.getByLabelText('Why this source matters'), 'Compare the method with the approved plan.');
};
beforeEach(() => {
    backend = researchFixture(); pb.send.mockReset(); pb.collection.mockReset();
    pb.authStore.record = { id: 'editor' };
    pb.send.mockImplementation(async (...args) => read(...args));
});

describe('mission research', () => {
    it('opens a different research link in the current workspace without keeping the old source', async () => {
        const first = backend.submit({ title: 'First source' }); const second = backend.submit({ title: 'Second source' });
        for (const [saved, text] of [[first, 'The first extracted source.'], [second, 'The second extracted source.']]) {
            const claim = backend.work('claim', { id: saved.id });
            backend.work('complete', { id: saved.id, attempt: 1, result: { ...backend.result, text }, failure: '' }, { revision: claim.revision });
        }
        const user = setupUser();
        renderWithProviders(<><ResearchPage /><Link to={'/app/research?source=' + second.id}>Open the other source</Link></>, {
            auth: { user: { id: 'editor' }, isAuthed: true }, workspace: { active: { id: 'ws1' } }, route: '/app/research?source=' + first.id,
        });
        // Opening a source deep link costs three sequential reads (detail, list, detail),
        // which regularly exceeds findBy's 1s default. Measured: the text is present at
        // ~1.2s. Bounded, so a source that never renders still fails.
        const SOURCE_TIMEOUT = 10000;
        // waitFor re-queries each poll. findBy resolves once and the node it returned is
        // detached by the next render, so toBeVisible then reports it is not in the document.
        await waitFor(() => expect(screen.getByText('The first extracted source.')).toBeVisible(), { timeout: SOURCE_TIMEOUT });
        await user.click(screen.getByRole('link', { name: 'Open the other source' }));
        await waitFor(() => expect(screen.getByText('The second extracted source.')).toBeVisible(), { timeout: SOURCE_TIMEOUT });
        expect(screen.queryByText('The first extracted source.')).not.toBeInTheDocument();
    });

    it('submits through the backend, refreshes a real result and requires a review note before evidence creation', async () => {
        const user = setupUser(); renderPage(); await fill(user);
        await user.click(screen.getByRole('button', { name: 'Submit research' }));
        await waitFor(() => expect(backend.data.research_submissions).toHaveLength(1));
        const submission = backend.data.research_submissions[0]; expect(submission.status).toBe('queued'); expect(backend.data.evidence).toHaveLength(0);
        const claim = backend.work('claim', { id: submission.id });
        backend.work('complete', { id: submission.id, attempt: claim.job.attempt, result: { ...backend.result, text: '<script>untrusted source</script>' }, failure: '' }, { revision: claim.revision });
        await user.click(await screen.findByRole('button', { name: 'Refresh status' }));
        expect(await screen.findByText('<script>untrusted source</script>')).toBeVisible();
        expect(scriptsCarrying('untrusted source')).toEqual([]);
        await user.click(screen.getByRole('button', { name: 'Attach reviewed source to evidence' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Record what you checked/);
        await user.type(screen.getByLabelText('Review note'), 'Compared the original; this excerpt supports the research question with stated limits.');
        await user.click(screen.getByRole('button', { name: 'Attach reviewed source to evidence' }));
        await waitFor(() => expect(backend.data.evidence).toHaveLength(1));
        expect(backend.data.evidence[0].type).toBe('observed'); expect(backend.data.missions.find((item) => item.id === 'mission1').status).toBe('running');
        expect(await screen.findByText(/Saved as observed evidence/)).toBeVisible();
    });

    it('preserves an uncertain submission and recovers its existing receipt', async () => {
        const user = setupUser(); renderPage(); await fill(user);
        let lost = true; pb.send.mockImplementation(async (path, options) => { const result = read(path, options); if (options.method === 'POST' && lost) { lost = false; throw new Error(); } return result; });
        await user.click(screen.getByRole('button', { name: 'Submit research' }));
        expect(await screen.findByRole('button', { name: 'Retry previous request' })).toBeEnabled();
        expect(screen.getByLabelText('Source title')).toHaveValue('Search source'); expect(backend.data.research_submissions).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: 'Retry previous request' }));
        expect(await screen.findByText(/Request saved/)).toBeVisible(); expect(backend.data.research_submissions).toHaveLength(1);
    });

    it('shows unavailable processing and viewer access without inventing results or permitting writes', async () => {
        backend.env.value = ''; const saved = backend.submit();
        renderPage('viewer', '/app/research?source=' + saved.id);
        expect(await screen.findByText(/No processing capability is enabled/)).toBeVisible();
        expect(await screen.findByText(/An operator must enable/)).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Submit research' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Attach reviewed/ })).not.toBeInTheDocument();
        expect(screen.getByText(/Viewer access permits reading/)).toBeVisible();
    });

    it('supports recoverable uploads and reuses the uploaded file when submitting fails', async () => {
        const user = setupUser(); renderPage();
        await user.selectOptions(await screen.findByLabelText('Mission'), 'mission1');
        await user.selectOptions(screen.getByLabelText('Source type'), 'document');
        await user.type(screen.getByLabelText('Source title'), 'Document source');
        const uploaded = backend.seed('research_uploads', { id: 'upload1', workspace: 'ws1', owner: 'editor', kind: 'document', original_name: 'source.txt', asset: 'source.txt' });
        const create = vi.fn().mockResolvedValue({ id: uploaded.id, workspace: 'ws1', owner: 'editor', kind: 'document' });
        pb.collection.mockReturnValue({ create, getList: vi.fn().mockResolvedValue({ items: [plain(backend.data.research_uploads[0])], totalPages: 1 }) });
        await user.upload(screen.getByLabelText(/Source file/), new File(['Source text.'], 'source.txt', { type: 'text/plain' }));
        let failed = true; pb.send.mockImplementation(async (path, options) => { if (options.method === 'POST' && failed) { failed = false; throw { status: 409, response: { message: 'Reload the current source.' } }; } return read(path, options); });
        await user.click(screen.getByRole('button', { name: 'Submit research' }));
        expect(await screen.findByText(/Upload saved/)).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Submit research' }));
        await waitFor(() => expect(backend.data.research_submissions).toHaveLength(1)); expect(create).toHaveBeenCalledTimes(1);
        expect(backend.data.research_submissions[0].upload).toBe('upload1');
    });

    it('cancels pending work, retries a failed parse and paginates submitted records', async () => {
        const saved = backend.submit(); const claim = backend.work('claim', { id: saved.id });
        backend.work('complete', { id: saved.id, attempt: 1, result: null, failure: 'timeout' }, { revision: claim.revision });
        for (let i = 0; i < 21; i++) backend.submit({ title: 'Source ' + i });
        const user = setupUser(); renderPage('editor', '/app/research?source=' + saved.id);
        await user.click(await screen.findByRole('button', { name: 'Retry processing' }));
        await waitFor(() => expect(backend.data.research_submissions.find((item) => item.id === saved.id).status).toBe('queued'));
        await user.click(await screen.findByRole('button', { name: 'Cancel submission' }));
        await waitFor(() => expect(backend.data.research_submissions.find((item) => item.id === saved.id).status).toBe('cancelled'));
        const navigation = within(screen.getByRole('navigation', { name: 'Research submissions pages' }));
        await user.click(navigation.getByRole('button', { name: 'Next' }));
        expect(await screen.findByText('Page 2')).toBeVisible();
    });

    it('clears private source content and controls when permission is revoked', async () => {
        const saved = backend.submit(); const claim = backend.work('claim', { id: saved.id });
        backend.work('complete', { id: saved.id, attempt: 1, result: backend.result, failure: '' }, { revision: claim.revision });
        const user = setupUser(); renderPage('editor', '/app/research?source=' + saved.id);
        expect(await screen.findByText(backend.result.text)).toBeVisible();
        backend.app.delete(backend.app.findRecordById('workspace_members', 'editormember'));
        await user.click(screen.getByRole('button', { name: 'Refresh status' }));
        await waitFor(() => expect(screen.queryByText(backend.result.text)).not.toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /Attach reviewed/ })).not.toBeInTheDocument();
    });
});
