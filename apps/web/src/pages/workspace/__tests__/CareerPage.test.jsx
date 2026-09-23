// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/CareerPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/pages/workspace/CareerPage.jsx, tests/upgrade/career-fixture.mjs, tests/upgrade/operator-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/CareerPage.jsx; CONSUMES tests/upgrade/career-fixture.mjs; CONSUMES tests/upgrade/operator-fixture.mjs
// Intent:      Exercise private career review, actual compiler output, inert imported text and scope changes in the rendered workspace.
// ───────────────────────────────────────────────────────────────

import React, { StrictMode } from 'react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CareerPage from '@/pages/workspace/CareerPage';
import WorkspaceAccessContext from '@/contexts/WorkspaceAccessContext';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { act, cleanup, renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';
import { careerPacket, sealCareer } from '../../../../../../tests/upgrade/career-fixture.mjs';
import { operatorFixture } from '../../../../../../tests/upgrade/operator-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
let backend; let packet;
const page = (error = '', loading = false, canWrite = true) => <WorkspaceAccessContext.Provider value={{
    data: error ? null : { role: canWrite ? 'editor' : 'viewer', can_write: canWrite }, loading, error, refresh: vi.fn(),
}}><CareerPage /></WorkspaceAccessContext.Provider>;
const options = { auth: { user: { id: 'editor' }, isAuthed: true }, workspace: { active: { id: 'ws1' } }, route: '/app/career' };
const fileFor = (value) => {
    const raw = JSON.stringify(value); const file = new File([raw], 'review.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => raw }); return file;
};
const load = async (user, value = packet) => {
    await waitFor(() => expect(screen.getByLabelText('Career review file')).toBeEnabled());
    await user.upload(screen.getByLabelText('Career review file'), fileFor(value));
};

beforeAll(() => { packet = careerPacket(); });
beforeEach(() => {
    setDemoMode(false); backend = operatorFixture(); pb.authStore.record = { id: 'editor' };
    pb.send.mockImplementation((path, request) => plain(backend.operator.snapshot(backend.event(pb.authStore.record.id, {},
        { workspace: path.split('/')[4], query: request.query }))));
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL = vi.fn(() => 'blob:career-private');
        static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); setDemoMode(false); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('CareerPage', () => {
    it('reads current work and exports a scoped private capture without mutations', async () => {
        const user = setupUser(); renderWithProviders(page(), options);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Export private work capture' })).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'Export private work capture' }));
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(pb.send.mock.calls.every(([, request]) => request.method === 'GET')).toBe(true);
        expect(screen.queryByRole('button', { name: /submit|approve/i })).not.toBeInTheDocument();
    });

    it('renders the real compiler format, participation and every exclusion as a reported review', async () => {
        const user = setupUser(); renderWithProviders(page(), options); await load(user);
        const review = await screen.findByRole('region', { name: 'Career review' });
        expect(review).toHaveTextContent('100 captured postings');
        expect(review).toHaveTextContent('3 application drafts');
        expect(review).toHaveTextContent('with agent assistance');
        expect(within(review).getAllByRole('heading', { name: 'DO NOT CLAIM' })).toHaveLength(10);
        expect(review).toHaveTextContent('Current live availability has not been verified');
        expect(review).toHaveTextContent('No real submission');
    });

    it('rejects a foreign candidate and leaves no previous review visible', async () => {
        const user = setupUser(); renderWithProviders(page(), options); await load(user);
        await screen.findByRole('region', { name: 'Career review' });
        await load(user, sealCareer({ ...careerPacket(), person: 'cni://person/foreign' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('another person or workspace');
        expect(screen.queryByRole('region', { name: 'Career review' })).not.toBeInTheDocument();
    });

    it('retains the imported review through permission polls without permitting pending exports or imports', async () => {
        const user = setupUser(); const rendered = renderWithProviders(page(), options); await load(user);
        await screen.findByRole('region', { name: 'Career review' });
        const exportButton = screen.getByRole('button', { name: 'Export private work capture' });
        const requests = pb.send.mock.calls.length;
        rendered.rerender(page('', true));
        expect(screen.queryByRole('region', { name: 'Career review' })).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Checking workspace access');
        expect(screen.getByLabelText('Career review file')).toBeDisabled();
        expect(exportButton).toBeDisabled();
        rendered.rerender(page());
        expect(screen.getByRole('region', { name: 'Career review' })).toHaveTextContent('100 captured postings');
        expect(pb.send).toHaveBeenCalledTimes(requests);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('retains a selected file while permission polling is unresolved and checks it only after access returns', async () => {
        const user = setupUser(); const rendered = renderWithProviders(page(), options);
        await waitFor(() => expect(screen.getByLabelText('Career review file')).toBeEnabled());
        let release;
        const file = new File(['pending'], 'review.json', { type: 'application/json' });
        Object.defineProperty(file, 'text', { value: () => new Promise((resolve) => { release = resolve; }) });
        await user.upload(screen.getByLabelText('Career review file'), file);
        rendered.rerender(page('', true));
        await act(async () => { release(JSON.stringify(packet)); });
        expect(screen.queryByRole('region', { name: 'Career review' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Career review file')).toBeDisabled();
        rendered.rerender(page());
        expect(await screen.findByRole('region', { name: 'Career review' })).toHaveTextContent('100 captured postings');
    });

    it('clears a retained review on revocation or changed capabilities, including after access returns', async () => {
        const user = setupUser(); const rendered = renderWithProviders(page(), options); await load(user);
        await screen.findByRole('region', { name: 'Career review' });
        rendered.rerender(page('Membership revoked'));
        expect(screen.getByRole('alert')).toHaveTextContent('Membership revoked');
        rendered.rerender(page());
        await waitFor(() => expect(screen.getByLabelText('Career review file')).toBeEnabled());
        expect(screen.queryByRole('region', { name: 'Career review' })).not.toBeInTheDocument();
        await load(user); await screen.findByRole('region', { name: 'Career review' });
        rendered.rerender(page('', false, false));
        expect(screen.queryByRole('region', { name: 'Career review' })).not.toBeInTheDocument();
    });

    it('keeps a fresh same-account record but clears the review for a replacement session', async () => {
        const user = setupUser(); const rendered = renderWithProviders(page(), { ...options, auth: { ...options.auth, sessionEpoch: 1 } });
        await load(user); await screen.findByRole('region', { name: 'Career review' });
        rendered.auth.user = { id: 'editor', name: 'Fresh native record' }; pb.authStore.record = rendered.auth.user;
        rendered.rerender(page());
        expect(screen.getByRole('region', { name: 'Career review' })).toBeVisible();
        rendered.auth.sessionEpoch = 2; rendered.rerender(page());
        expect(screen.queryByRole('region', { name: 'Career review' })).not.toBeInTheDocument();
    });

    it.each(['account', 'workspace', 'session', 'demo', 'revoke'])('fences delayed file reads across %s changes', async (boundary) => {
        const user = setupUser(); const rendered = renderWithProviders(page(), { ...options, auth: { ...options.auth, sessionEpoch: 1 } });
        await waitFor(() => expect(screen.getByLabelText('Career review file')).toBeEnabled());
        let release;
        const file = new File(['pending'], 'review.json', { type: 'application/json' });
        Object.defineProperty(file, 'text', { value: () => new Promise((resolve) => { release = resolve; }) });
        await user.upload(screen.getByLabelText('Career review file'), file);
        if (boundary === 'account') { rendered.auth.user = { id: 'owner' }; pb.authStore.record = rendered.auth.user; }
        if (boundary === 'workspace') rendered.workspace.active = { id: 'ws2' };
        if (boundary === 'session') rendered.auth.sessionEpoch = 2;
        if (boundary === 'demo') act(() => setDemoMode(true));
        rendered.rerender(page(boundary === 'revoke' ? 'Membership revoked' : ''));
        await act(async () => { release(JSON.stringify(packet)); });
        expect(screen.queryByRole('region', { name: 'Career review' })).not.toBeInTheDocument();
    });

    it('keeps imported HTML inert and has no send or approval control', async () => {
        const user = setupUser(); renderWithProviders(page(), options);
        const value = careerPacket(); value.passport.claims[0].statement = '<script>globalThis.careerExecuted=true</script>';
        await load(user, sealCareer(value));
        const review = await screen.findByRole('region', { name: 'Career review' });
        expect(review).toHaveTextContent('<script>globalThis.careerExecuted=true</script>');
        expect(review.querySelector('script')).toBeNull();
        expect(globalThis.careerExecuted).toBeUndefined();
        expect(pb.send.mock.calls.every(([, request]) => request.method === 'GET')).toBe(true);
    });

    it('uses no personal workspace data in demonstration mode', () => {
        setDemoMode(true); renderWithProviders(page(), options);
        expect(screen.getByText(/Demonstration mode has no personal career evidence/)).toBeInTheDocument();
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('supports React strict effect cleanup without retaining a disposed client', async () => {
        renderWithProviders(<StrictMode>{page()}</StrictMode>, options);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Export private work capture' })).toBeEnabled());
    });
});
