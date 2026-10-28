// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/ResearchPage.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/pages/workspace/ResearchPage.jsx, tests/upgrade/research-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/ResearchPage.jsx; CONSUMES tests/upgrade/research-fixture.mjs
// DAG Node:    none
// Intent:      Exercise upload recovery, original-file download, review closing, mission reload and cross-workspace links against the real command policy.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResearchPage from '@/pages/workspace/ResearchPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { researchFixture } from '../../../../../../tests/upgrade/research-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn(), collection: vi.fn(), filter: vi.fn(), files: {} } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
const missions = vi.hoisted(() => ({ records: [], loading: false, degraded: false, refresh: null }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: () => missions }));
let backend;
const read = (path, options) => {
    const event = backend.event(pb.authStore.record.id, options.body || {}, { workspace: path.split('/')[4], id: path.split('/')[6], query: options.query || {} });
    try { return plain(options.method === 'POST' ? backend.service.command(event) : path.split('/')[6] ? backend.service.detail(event) : backend.service.snapshot(event)); }
    catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
};
const renderPage = (route = '/app/research', workspace = { active: { id: 'ws1', owner: 'owner' } }) => {
    pb.authStore.record = { id: 'editor' };
    return renderWithProviders(<ResearchPage />, { auth: { user: { id: 'editor' }, isAuthed: true }, workspace, route });
};
const seedUpload = () => backend.seed('research_uploads', { id: 'upload1', workspace: 'ws1', owner: 'editor', kind: 'document', original_name: 'source.txt', asset: 'source.txt' });
// Opening a source deep link costs sequential detail and list reads; ResearchFlow measured ~1.2s.
const SOURCE_TIMEOUT = 10000;

beforeEach(() => {
    backend = researchFixture(); pb.send.mockReset(); pb.collection.mockReset();
    pb.files = {};
    Object.assign(missions, { records: [{ id: 'mission1', title: 'Research mission', status: 'running' }], loading: false, degraded: false, refresh: vi.fn() });
    pb.authStore.record = { id: 'editor' };
    pb.send.mockImplementation(async (...args) => read(...args));
});

describe('saved upload recovery', () => {
    it('lists saved uploads and submits a recovered upload without uploading the file again', async () => {
        const user = setupUser(); renderPage();
        await user.selectOptions(await screen.findByLabelText('Mission'), 'mission1');
        await user.selectOptions(screen.getByLabelText('Source type'), 'document');
        await user.type(screen.getByLabelText('Source title'), 'Recovered document');
        seedUpload();
        const create = vi.fn();
        pb.collection.mockReturnValue({ create, getList: vi.fn().mockResolvedValue({ items: [plain(backend.data.research_uploads[0])], totalPages: 2 }) });
        await user.click(screen.getByRole('button', { name: 'Refresh saved uploads' }));
        const recover = await screen.findByLabelText(/^Recover an upload/);
        expect(screen.getByText('Showing the latest 50 uploads.')).toBeVisible();
        await user.selectOptions(recover, 'upload1');
        expect(screen.getByText(/Upload saved/)).toBeVisible();
        expect(screen.getByLabelText(/Source file/)).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Submit research' }));
        await waitFor(() => expect(backend.data.research_submissions).toHaveLength(1));
        expect(backend.data.research_submissions[0].upload).toBe('upload1');
        expect(create).not.toHaveBeenCalled();
    });

    it('returns to a new file when the recovered upload is deselected', async () => {
        const user = setupUser(); renderPage();
        await user.selectOptions(await screen.findByLabelText('Source type'), 'document');
        seedUpload();
        pb.collection.mockReturnValue({ getList: vi.fn().mockResolvedValue({ items: [plain(backend.data.research_uploads[0])], totalPages: 1 }) });
        await user.click(screen.getByRole('button', { name: 'Refresh saved uploads' }));
        await user.selectOptions(await screen.findByLabelText(/^Recover an upload/), 'upload1');
        expect(screen.getByLabelText('Source type')).toBeDisabled();
        await user.selectOptions(screen.getByLabelText(/^Recover an upload/), '');
        expect(screen.queryByText(/Upload saved/)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/Source file/)).toBeEnabled();
        expect(screen.getByLabelText('Source type')).toHaveValue('document');
        expect(screen.queryByText('Showing the latest 50 uploads.')).not.toBeInTheDocument();
    });

    it('explains why saved uploads could not be listed', async () => {
        const user = setupUser(); renderPage();
        await user.selectOptions(await screen.findByLabelText('Source type'), 'document');
        pb.collection.mockReturnValue({ getList: vi.fn().mockRejectedValue({ status: 500, response: { message: 'Saved uploads are unavailable.' } }) });
        await user.click(screen.getByRole('button', { name: 'Refresh saved uploads' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Saved uploads are unavailable.');
        expect(screen.queryByLabelText(/^Recover an upload/)).not.toBeInTheDocument();
    });
});

describe('source review', () => {
    const submitFile = () => { seedUpload(); return backend.submit({ kind: 'document', input: '', upload: 'upload1' }); };

    it('prepares a download link for the original uploaded file', async () => {
        const saved = submitFile();
        const getOne = vi.fn().mockResolvedValue({ id: 'upload1', workspace: 'ws1', asset: 'source.txt' });
        pb.collection.mockReturnValue({ getOne });
        pb.files = { getToken: vi.fn().mockResolvedValue('file-token'), getURL: vi.fn(() => 'https://files.example/source.txt?token=file-token') };
        const user = setupUser(); renderPage('/app/research?source=' + saved.id);
        await user.click(await screen.findByRole('button', { name: 'Prepare original file download' }, { timeout: SOURCE_TIMEOUT }));
        expect(await screen.findByRole('link', { name: 'Download original file' })).toHaveAttribute('href', 'https://files.example/source.txt?token=file-token');
        expect(getOne).toHaveBeenCalledWith('upload1', expect.any(Object));
    });

    it('reports an original file that can no longer be downloaded', async () => {
        const saved = submitFile();
        pb.collection.mockReturnValue({ getOne: vi.fn().mockRejectedValue({ status: 404, response: { message: 'The original file was removed.' } }) });
        const user = setupUser(); renderPage('/app/research?source=' + saved.id);
        await user.click(await screen.findByRole('button', { name: 'Prepare original file download' }, { timeout: SOURCE_TIMEOUT }));
        expect(await screen.findByText('The original file was removed.')).toBeVisible();
        expect(screen.queryByRole('link', { name: 'Download original file' })).not.toBeInTheDocument();
    });

    it('closes an open review and lets the member open another submission', async () => {
        const saved = backend.submit({ title: 'Reviewed source' });
        const user = setupUser(); renderPage('/app/research?source=' + saved.id);
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Reviewed source', level: 2 })).toBeVisible(), { timeout: SOURCE_TIMEOUT });
        await user.click(screen.getByRole('button', { name: 'Close review' }));
        expect(screen.queryByRole('heading', { name: 'Reviewed source', level: 2 })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Close review' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Review Reviewed source' }));
        expect(await screen.findByRole('heading', { name: 'Reviewed source', level: 2 }, { timeout: SOURCE_TIMEOUT })).toBeVisible();
    });
});

describe('page context', () => {
    it('blocks submission while missions are unavailable and reloads them on request', async () => {
        missions.degraded = true;
        const user = setupUser(); renderPage();
        expect(await screen.findByText(/Mission loading failed/)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Submit research' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Reload missions' }));
        expect(missions.refresh).toHaveBeenCalledTimes(1);
    });

    it('offers to switch to the workspace that owns a research link', async () => {
        const workspace = { active: { id: 'ws1' }, workspaces: [{ id: 'ws1' }, { id: 'ws2', name: 'Partner clinic' }] };
        const user = setupUser(); const view = renderPage('/app/research?workspace=ws2', workspace);
        expect(screen.getByText('This submission belongs to Partner clinic.')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Submit research' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Switch to linked workspace' }));
        expect(view.workspace.setActive).toHaveBeenCalledWith('ws2');
    });

    it('does not offer a switch for a workspace the member cannot access', () => {
        renderPage('/app/research?workspace=elsewhere');
        expect(screen.getByText(/This link belongs to a different workspace/)).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Switch to linked workspace' })).not.toBeInTheDocument();
        expect(pb.send).not.toHaveBeenCalled();
    });
});
