// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/BlueprintPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/web/src/pages/workspace/BlueprintPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/BlueprintPage.jsx
// DAG Node:    none
// Intent:      Exercise rendered upload, review, proposal export and private-state cleanup against the existing research storage fixture.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BlueprintPage from '@/pages/workspace/BlueprintPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';
import { blueprintFixture, hash } from '../../../../../../tests/upgrade/blueprint-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn(), collection: vi.fn(), files: {} } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
let backend;
const route = async (path, options) => {
    if (options.body instanceof FormData) {
        const file = options.body.get('asset');
        return backend.upload({ actor: pb.authStore.record.id, name: file.name, bytes: Buffer.from('%PDF-fixture'),
            fields: { request_key: options.body.get('request_key'), input_sha256: options.body.get('input_sha256') } });
    }
    const event = backend.event(pb.authStore.record.id, options.body || {}, { workspace: path.split('/')[4],
        id: path.split('/')[6] || '', query: options.query || {} });
    return plain(options.method === 'POST' ? backend.blueprint.command(event) : path.split('/')[6] ? backend.blueprint.detail(event) : backend.blueprint.snapshot(event));
};
const renderPage = (actor = 'editor') => {
    pb.authStore.record = { id: actor };
    return renderWithProviders(<BlueprintPage />, { auth: { user: { id: actor }, isAuthed: true },
        workspace: { active: { id: 'ws1', owner: 'owner' } }, route: '/app/blueprints' });
};
const ready = (overrides = {}) => {
    const saved = backend.upload();
    const claim = backend.work('claim', { id: saved.record.submission });
    backend.work('complete', { id: claim.id, attempt: claim.job.attempt, result: { ...backend.result, ...overrides }, failure: '' }, { revision: claim.revision });
    return saved;
};
const upload = async (user) => {
    const file = new File(['%PDF-fixture'], 'sample.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('%PDF-fixture').buffer });
    await user.upload(await screen.findByLabelText('Blueprint PDF'), file);
    await user.click(screen.getByRole('button', { name: 'Upload blueprint', exact: true }));
};

beforeEach(() => {
    backend = blueprintFixture();
    pb.send.mockImplementation(route);
    vi.stubGlobal('crypto', { randomUUID: () => 'rendered_blueprint_request01',
        subtle: { digest: async () => Uint8Array.from(Buffer.from(hash('%PDF-fixture'), 'hex')).buffer } });
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL = vi.fn(() => 'blob:blueprint-proposal');
        static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('BlueprintPage', () => {
    it('uploads a PDF and refreshes the completed requirement and A0 assessment', async () => {
        const user = setupUser(); renderPage(); await upload(user);
        await waitFor(() => expect(backend.data.workspace_blueprints).toHaveLength(1));
        const submission = backend.data.research_submissions[0];
        const claim = backend.work('claim', { id: submission.id });
        backend.work('complete', { id: claim.id, attempt: claim.job.attempt, result: backend.result, failure: '' }, { revision: claim.revision });
        await user.click(screen.getByRole('button', { name: 'Refresh status' }));
        expect(await screen.findByRole('heading', { name: 'Portal' })).toBeVisible();
        expect(screen.getByRole('region', { name: 'Extracted requirements' })).toHaveTextContent('Account Service must encrypt records.');
        expect(within(screen.getByRole('region', { name: 'Extracted requirements' })).getAllByText('Needs review')).toHaveLength(5);
        expect(backend.data.evidence).toHaveLength(0);
    });

    it('retains and recovers an uncertain upload without adding another document', async () => {
        let lost = true;
        pb.send.mockImplementation(async (path, options) => { const result = await route(path, options); if (options.method === 'POST' && lost) { lost = false; throw new Error(); } return result; });
        const user = setupUser(); renderPage(); await upload(user);
        expect(await screen.findByRole('button', { name: 'Retry previous request' })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Retry previous request' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry previous request' })).not.toBeInTheDocument());
        expect(backend.data.research_uploads).toHaveLength(1);
    });

    it('renders document markup as text and exports a proposed definition', async () => {
        const result = plain(backend.result);
        result.blueprint.requirements[0].text = '<script>source instructions</script>';
        ready(result);
        const user = setupUser(); renderPage();
        await user.click(await screen.findByRole('button', { name: /sample.pdf/ }));
        expect(await screen.findByText('<script>source instructions</script>')).toBeVisible();
        expect(document.querySelector('script')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Export mission definition' }));
        const blob = URL.createObjectURL.mock.calls[0][0];
        const content = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
        const definition = JSON.parse(content);
        expect(definition.definition.status).toBe('proposed');
        expect(definition.definition.mission_plan.authorization).toBe('');
        expect(definition.evaluation.verified).toBe(false);
        expect(backend.data.missions).toHaveLength(2);
    });

    it('shows flat fallback and truncation without inventing requirements', async () => {
        ready({ processor: 'local-document', blueprint: null, blueprint_failure: 'no_requirements', evaluation: null, truncated: true });
        const user = setupUser(); renderPage(); await user.click(await screen.findByRole('button', { name: /sample.pdf/ }));
        expect(await screen.findByText(/Structured extraction was unavailable/)).toBeVisible();
        expect(screen.getByText(/Extraction is truncated/)).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Export mission definition' })).not.toBeInTheDocument();
    });

    it('keeps viewer access read-only and clears details after revocation', async () => {
        ready();
        const user = setupUser(); renderPage('viewer');
        expect(await screen.findByLabelText('Blueprint PDF')).toBeDisabled();
        await user.click(screen.getByRole('button', { name: /sample.pdf/ }));
        expect(await screen.findByRole('heading', { name: 'Portal' })).toBeVisible();
        backend.app.delete(backend.app.findRecordById('workspace_members', 'viewermember'));
        await user.click(screen.getByRole('button', { name: 'Refresh status' }));
        await waitFor(() => expect(screen.queryByRole('heading', { name: 'Portal' })).not.toBeInTheDocument());
        expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });

    it('synchronously clears saved documents when the account or workspace changes', async () => {
        ready();
        const user = setupUser(); const rendered = renderPage();
        await user.click(await screen.findByRole('button', { name: /sample.pdf/ }));
        expect(await screen.findByRole('heading', { name: 'Portal' })).toBeVisible();
        rendered.auth.user = { id: 'otherowner' }; rendered.workspace.active = { id: 'ws2' }; pb.authStore.record = { id: 'otherowner' };
        rendered.rerender(<BlueprintPage />);
        expect(screen.queryByRole('heading', { name: 'Portal' })).not.toBeInTheDocument();
        expect(await screen.findByText('No blueprints have been uploaded to this workspace.')).toBeVisible();
    });

    it('shows blocked processing and permits a retry only after configuration is available', async () => {
        backend.env.value = '';
        const saved = backend.upload(); const user = setupUser(); renderPage();
        await user.click(await screen.findByRole('button', { name: /sample.pdf/ }));
        expect(await screen.findByText(/Document processing is unavailable/)).toBeVisible();
        backend.env.value = JSON.stringify(backend.registered);
        await user.click(screen.getByRole('button', { name: 'Retry extraction' }));
        await waitFor(() => expect(backend.data.research_submissions.find((row) => row.id === saved.record.submission).status).toBe('queued'));
    });
});
