// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/PolicyPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/pages/workspace/PolicyPage.jsx, tests/upgrade/policy-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/PolicyPage.jsx; CONSUMES tests/upgrade/policy-fixture.mjs
// DAG Node:    none
// Intent:      Check policy review, inert source rendering, scoped imports and explicit mission recovery in the actual workspace page.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PolicyPage from '@/pages/workspace/PolicyPage';
import WorkspaceAccessContext from '@/contexts/WorkspaceAccessContext';
import pb from '@/lib/pocketbaseClient';
import { canonicalPolicy } from '@/lib/policyIntelligence';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';
import { researchPacket, seal } from '../../../../../../tests/upgrade/policy-fixture.mjs';
import { researchFixture } from '../../../../../../tests/upgrade/research-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
let backend;
const page = (canWrite = true) => <WorkspaceAccessContext.Provider value={{ data: { can_write: canWrite }, loading: false, error: '' }}>
    <PolicyPage /></WorkspaceAccessContext.Provider>;
const renderPage = (actor = 'editor') => {
    pb.authStore.record = { id: actor };
    return renderWithProviders(page(actor !== 'viewer'), { auth: { user: { id: actor }, isAuthed: true },
        workspace: { active: { id: 'ws1', owner: 'owner' } }, route: '/app/policy' });
};
const route = (path, options) => plain(backend.service.command(backend.event(pb.authStore.record.id, options.body, { workspace: path.split('/')[4] })));
const load = async (user, data = researchPacket()) => {
    const raw = canonicalPolicy(data);
    const file = new File([raw], 'policy.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => raw });
    await user.upload(screen.getByLabelText('Policy JSON pack'), file);
    await screen.findByRole('navigation', { name: 'Policy views' });
};

beforeEach(() => {
    backend = researchFixture(); pb.send.mockImplementation(route);
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL = vi.fn(() => 'blob:policy-pack');
        static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('PolicyPage', () => {
    it('shows the labelled synthetic walkthrough and disables workspace writes', async () => {
        const user = setupUser(); renderPage();
        await user.click(screen.getByRole('button', { name: 'Explore small-business demo' }));
        expect(await screen.findByText(/Synthetic demonstration — no official event was retrieved/)).toBeVisible();
        expect(within(screen.getByRole('region', { name: 'Policy observations' })).getAllByRole('article')).toHaveLength(4);
        await user.click(screen.getByRole('button', { name: 'Alerts', exact: true }));
        expect(screen.getByRole('region', { name: 'Policy alert candidates' })).toHaveTextContent('business:vendor-intake');
        expect(screen.queryByRole('button', { name: 'Propose source-review mission' })).not.toBeInTheDocument();
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('filters archives, bookmarks and source categories without turning markup into executable content', async () => {
        const user = setupUser(); renderPage();
        const data = researchPacket(); data.observations[1].excerpt += '\n<script>globalThis.policyExecuted=true</script>'; seal(data);
        await load(user, data);
        const observations = screen.getByRole('region', { name: 'Policy observations' });
        expect(observations).toHaveTextContent('<script>globalThis.policyExecuted=true</script>');
        expect(observations.querySelector('script')).toBeNull();
        await user.click(within(observations).getAllByRole('button', { name: 'Bookmark', exact: true })[0]);
        await user.click(screen.getByLabelText('Bookmarks only'));
        expect(within(observations).getAllByRole('article')).toHaveLength(1);
        await user.click(screen.getByLabelText('Bookmarks only'));
        await user.click(screen.getByLabelText('Include archived captures'));
        expect(within(observations).getAllByRole('article')).toHaveLength(5);
        await user.type(screen.getByLabelText('Search imported sources'), 'agency statement');
        expect(within(observations).getAllByRole('article')).toHaveLength(1);
        expect(globalThis.policyExecuted).toBeUndefined();
    });

    it('configures an exportable local watch and exposes source-linked brief candidates', async () => {
        const user = setupUser(); renderPage(); await load(user);
        await user.click(screen.getByRole('button', { name: 'Watchlists', exact: true }));
        await user.type(screen.getByLabelText('Watch name'), 'Supplier review');
        await user.type(screen.getByLabelText('Keywords, separated by commas'), 'supplier');
        await user.type(screen.getByLabelText('Business object reference'), 'business:compliance-review');
        await user.click(screen.getByRole('button', { name: 'Add watch', exact: true }));
        expect(await screen.findByRole('heading', { name: 'Supplier review' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Export policy pack' }));
        expect(URL.createObjectURL).toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Daily Brief', exact: true }));
        expect(screen.getByRole('region', { name: 'Policy daily brief' })).toHaveTextContent('UNRESOLVED');
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('creates a proposed source review and recovers a lost response without another mission', async () => {
        let lost = true;
        pb.send.mockImplementation((...args) => { const response = route(...args); if (lost) { lost = false; throw new Error('lost'); } return response; });
        const user = setupUser(); renderPage(); await load(user);
        await user.click(screen.getByRole('button', { name: 'Alerts', exact: true }));
        const before = backend.data.missions.length;
        await user.click(screen.getAllByRole('button', { name: 'Propose source-review mission' })[0]);
        await user.click(await screen.findByRole('button', { name: 'Recover previous proposal' }));
        expect(await screen.findByText(/Review mission proposed:/)).toBeVisible();
        expect(backend.data.missions).toHaveLength(before + 1);
        expect(backend.data.missions.at(-1).status).toBe('proposed');
        expect(backend.data.evidence).toHaveLength(0);
    });

    it('keeps viewer proposals unavailable and rejects a foreign workspace pack', async () => {
        const user = setupUser(); renderPage('viewer'); await load(user);
        await user.click(screen.getByRole('button', { name: 'Alerts', exact: true }));
        expect(screen.queryByRole('button', { name: 'Propose source-review mission' })).not.toBeInTheDocument();
        const raw = canonicalPolicy(researchPacket('ws2'));
        const file = new File([raw], 'foreign.json', { type: 'application/json' });
        Object.defineProperty(file, 'text', { value: async () => raw });
        await user.upload(screen.getByLabelText('Policy JSON pack'), file);
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not read this policy pack');
        expect(screen.queryByRole('region', { name: 'Policy alert candidates' })).not.toBeInTheDocument();
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('clears the imported source and bookmarks immediately when the account or workspace changes', async () => {
        const user = setupUser(); const rendered = renderPage(); await load(user);
        rendered.workspace.active = { id: 'ws2', owner: 'otherowner' };
        rendered.rerender(page());
        expect(screen.queryByRole('region', { name: 'Policy observations' })).not.toBeInTheDocument();
        rendered.workspace.active = { id: 'ws1', owner: 'owner' }; rendered.rerender(page());
        await load(user);
        rendered.auth.user = { id: 'viewer' }; pb.authStore.record = { id: 'viewer' };
        rendered.rerender(page(false));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Policy observations' })).not.toBeInTheDocument());
    });
});
