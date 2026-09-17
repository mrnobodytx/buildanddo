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
// Intent:      Verify the rendered PDF review flow, prompt generation, export and account/workspace isolation.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import BlueprintPage from '@/pages/workspace/BlueprintPage';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { act, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { decisionFixture, layoutBlueprintResult } from '../../../../../../tests/upgrade/decision-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'member' } }, send: vi.fn() } }));
let backend;
let result;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
    setDemoMode(false); pb.authStore.record = { id: 'member' };
    result = layoutBlueprintResult(); backend = decisionFixture();
    backend.transport((options) => {
        const value = structuredClone(result);
        if (!JSON.parse(options.body).include_prompts) value.session_prompts = [];
        return { statusCode: 200, json: value };
    });
    pb.send.mockReset();
    pb.send.mockImplementation(async (path, options) => {
        if (path === '/api/buildanddo/workspaces/ws1/blueprints' && options.method === 'GET')
            return { workspace: 'ws1', role: 'editor', page: 1, has_more: false, items: [] };
        expect(path).toBe('/api/buildanddo/workspaces/ws1/blueprints/analyze');
        return backend.request(options.body, { operation: 'blueprints/analyze' }).result;
    });
    URL.createObjectURL = vi.fn(() => 'blob:mission-plan');
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    setDemoMode(false); vi.restoreAllMocks();
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
});

function renderPage() {
    return renderWithProviders(<BlueprintPage />, {
        auth: { user: { id: 'member' }, isAuthed: true },
        workspace: { active: { id: 'ws1' } }, route: '/app/blueprints',
    });
}
async function selectPdf(user) {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);
    const file = new File([bytes], 'sample.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
    await user.upload(screen.getByLabelText('Blueprint PDF (up to 20 MiB)'), file);
}

describe('BlueprintPage review flow', () => {
    it('keeps saved uploads reachable and clears analysis when changing views', async () => {
        const user = setupUser(); renderPage(); await selectPdf(user);
        await user.click(screen.getByRole('button', { name: 'Analyze blueprint' }));
        expect(await screen.findByRole('heading', { name: 'Pass 1 — Scan' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Saved PDFs' }));
        expect(await screen.findByText('No blueprints have been uploaded to this workspace.')).toBeVisible();
        expect(screen.getByLabelText('Blueprint PDF')).toBeVisible();
        expect(screen.queryByRole('heading', { name: 'Pass 1 — Scan' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Analyze PDF' }));
        expect(screen.getByLabelText('Blueprint PDF (up to 20 MiB)')).toBeVisible();
        expect(screen.queryByRole('heading', { name: 'Pass 1 — Scan' })).not.toBeInTheDocument();
    });

    it('displays the three passes, confidence, dependencies and ordered challenges from the adapter', async () => {
        const user = setupUser(); renderPage(); await selectPdf(user);
        await user.click(screen.getByRole('button', { name: 'Analyze blueprint' }));
        expect(await screen.findByRole('heading', { name: 'Pass 1 — Scan' })).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Pass 2 — Parsed structure' })).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Pass 3 — Assessment' })).toBeVisible();
        expect(screen.getAllByText(/Confidence 97%/).length).toBeGreaterThan(0);
        expect(screen.getByRole('heading', { name: 'Component dependencies' })).toBeVisible();
        expect(screen.getByRole('heading', { name: '1. Event database' })).toBeVisible();
        expect(screen.getByRole('heading', { name: '2. Event worker' })).toBeVisible();
        expect(screen.getByRole('heading', { name: '3. Notification service' })).toBeVisible();
        expect(screen.queryByRole('region', { name: 'Session prompts for review' })).not.toBeInTheDocument();
        expect(backend.rows).toHaveLength(3);
    });

    it('generates review-only session prompts on request and exports the mission as JSON', async () => {
        const user = setupUser(); renderPage(); await selectPdf(user);
        await user.click(screen.getByRole('button', { name: 'Analyze blueprint' }));
        await user.click(await screen.findByRole('button', { name: 'Generate session prompts' }));
        expect(await screen.findByRole('region', { name: 'Session prompts for review' })).toBeVisible();
        await user.click(screen.getByText('Prompt 1 · Event database'));
        expect(screen.getByLabelText('Review prompt 1').value).toContain('Authority: A0');
        expect(screen.getByLabelText('Review prompt 1')).toHaveAttribute('readonly');
        expect(pb.send.mock.calls.at(-1)[1].body.include_prompts).toBe(true);
        expect(backend.rows).toHaveLength(3);
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        await user.click(screen.getByRole('button', { name: 'Export mission plan as JSON' }));
        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(click).toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /Create session/i })).not.toBeInTheDocument();
    });

    it('renders document markup as text and makes processing failures recoverable', async () => {
        result.blueprint.parsed.requirements[0].text = '<img src=x onerror=alert(1)> untrusted requirement';
        const user = setupUser(); renderPage(); await selectPdf(user);
        pb.send.mockRejectedValueOnce(new Error('private processor diagnostic'));
        await user.click(screen.getByRole('button', { name: 'Analyze blueprint' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Analysis is unavailable/);
        expect(screen.queryByText(/private processor diagnostic/)).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Analyze blueprint' }));
        expect(await screen.findByText('<img src=x onerror=alert(1)> untrusted requirement')).toBeVisible();
        expect(document.querySelector('[onerror]')).toBeNull();
    });

    it('keeps scan results available when dependencies prevent a mission plan', async () => {
        result.mission_plan = null; result.planning_error = 'cyclic_dependencies'; result.session_prompts = [];
        const user = setupUser(); renderPage(); await selectPdf(user);
        await user.click(screen.getByRole('button', { name: 'Analyze blueprint' }));
        expect(await screen.findByRole('heading', { name: 'Pass 1 — Scan' })).toBeVisible();
        expect(screen.getByRole('alert')).toHaveTextContent(/cyclic dependencies/);
        expect(screen.queryByRole('button', { name: 'Generate session prompts' })).not.toBeInTheDocument();
    });

    it('clears results when the workspace changes and discards an old response', async () => {
        let complete;
        pb.send.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
        const user = setupUser(); const view = renderPage(); await selectPdf(user);
        await user.click(screen.getByRole('button', { name: 'Analyze blueprint' }));
        await waitFor(() => expect(pb.send).toHaveBeenCalled());
        view.workspace.active = { id: 'ws2' }; view.rerender(<BlueprintPage />);
        await act(async () => { complete({ ...result, workspace: 'ws1' }); });
        expect(screen.queryByRole('heading', { name: 'Pass 1 — Scan' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Analyze blueprint' })).toBeDisabled();
    });

    it('does not process PDFs in demonstration mode', () => {
        setDemoMode(true); renderPage();
        expect(screen.getByRole('status')).toHaveTextContent(/turn off demonstration mode/);
        expect(screen.getByLabelText('Blueprint PDF (up to 20 MiB)')).toBeDisabled();
        expect(pb.send).not.toHaveBeenCalled();
    });
});
