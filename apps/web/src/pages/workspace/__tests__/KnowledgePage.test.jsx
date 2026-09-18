// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/KnowledgePage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/pages/workspace/KnowledgePage.jsx, apps/web/src/components/workspace/KnowledgeContext.jsx, tests/upgrade/knowledge-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/KnowledgePage.jsx; VALIDATES apps/web/src/components/workspace/KnowledgeContext.jsx; CONSUMES tests/upgrade/knowledge-fixture.mjs
// DAG Node:    none
// Intent:      Exercise rendered graph navigation and automatic context with the actual backend policy and explicit storage doubles.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgePage from '@/pages/workspace/KnowledgePage';
import MissionKnowledgeContext from '@/components/workspace/KnowledgeContext';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor, within, fireEvent } from '@/test/utils';
import { knowledgeFixture } from '../../../../../../tests/upgrade/knowledge-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: () => ({ records: [{ id: 'mission1', title: 'Reduce missed appointments' }], loading: false, degraded: false }) }));
let backend;
const settings = { auth: { user: { id: 'editor' }, isAuthed: true }, workspace: { active: { id: 'ws1' } }, route: '/app/knowledge' };
const renderPage = (route = settings.route) => renderWithProviders(<KnowledgePage />, { ...settings, route });
beforeEach(() => {
    backend = knowledgeFixture(); pb.authStore.record = { id: 'editor' }; pb.send.mockReset();
    pb.send.mockImplementation(async (path, options) => backend.assemble(options.body, pb.authStore.record.id, path.split('/')[4]));
});

describe('workspace knowledge', () => {
    it('assembles on load and automatically updates citations and budgets when the question changes', async () => {
        backend.seed('signals', { id: 'invoice', workspace: 'ws1', owner: 'editor', title: 'Invoice estimate', description: 'Replacement cost.', type: 'user' });
        const user = setupUser(); renderPage();
        expect(await screen.findByRole('list', { name: 'Context citations' })).toBeVisible();
        await user.type(screen.getByLabelText('Context question'), 'invoice');
        await waitFor(() => expect(within(screen.getByRole('list', { name: 'Context citations' })).getAllByRole('listitem')).toHaveLength(1));
        expect(within(screen.getByRole('list', { name: 'Context citations' })).getByText('Invoice estimate')).toBeVisible();
        await user.selectOptions(screen.getByLabelText('Context character budget'), '4000');
        await waitFor(() => expect(pb.send.mock.calls.at(-1)[1].body.max_chars).toBe(4000));
        expect(pb.send.mock.calls.every(([url]) => !url.includes('invoice'))).toBe(true);
    });

    it('filters source categories and explores graph nodes with the keyboard', async () => {
        const user = setupUser(); renderPage();
        await screen.findByRole('list', { name: 'Knowledge sources' });
        await user.selectOptions(screen.getByLabelText('Knowledge source type'), 'signal');
        const sources = within(screen.getByRole('list', { name: 'Knowledge sources' }));
        expect(sources.getAllByRole('listitem')).toHaveLength(1);
        await user.click(sources.getByRole('button', { name: /Afternoon bookings/ }));
        const diagram = within(screen.getByRole('group', { name: 'Knowledge graph neighborhood' }));
        fireEvent.keyDown(diagram.getByRole('button', { name: 'Inspect Operations' }), { key: 'Enter' });
        expect(within(screen.getByRole('region', { name: 'Selected knowledge source' })).getByRole('heading', { name: 'Operations' })).toBeVisible();
        await user.selectOptions(screen.getByLabelText('Knowledge category'), 'research');
        expect(screen.getByText('No sources in this category and type.')).toBeVisible();
    });

    it('anchors a mission link and keeps shared source states explicit', async () => {
        renderPage('/app/knowledge?mission=mission1');
        const citations = await screen.findByRole('list', { name: 'Context citations' });
        expect(within(citations).getAllByRole('listitem')[0]).toHaveTextContent('Reduce missed appointments');
        expect(citations).toHaveTextContent('Recorded state: observed');
        expect(citations).toHaveTextContent('Recorded state: inference');
        expect(pb.send.mock.calls.at(-1)[1].body.mission).toBe('mission1');
    });

    it('displays limited source coverage and renders hostile source markup as text', async () => {
        const row = backend.app.findRecordById('signals', 'signal1'); row.set('description', '<script>untrusted source</script>'); backend.app.save(row);
        backend.collections.research_submissions.fields.removeByName('protocol_version');
        renderPage();
        expect(await screen.findByText(/Some knowledge sources are unavailable or capped/)).toBeVisible();
        expect(screen.getByText(/Completed research: unavailable/)).toBeVisible();
        expect(screen.getAllByText('<script>untrusted source</script>').length).toBeGreaterThan(0);
        expect(document.querySelector('script')).toBeNull();
    });

    it('clears private excerpts on permission loss and permits retry after access is restored', async () => {
        const user = setupUser(); renderPage(); await screen.findByRole('list', { name: 'Context citations' });
        backend.app.delete(backend.app.findRecordById('workspace_members', 'editormember'));
        await user.click(screen.getByRole('button', { name: 'Refresh knowledge' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/);
        expect(screen.queryByRole('list', { name: 'Context citations' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Download cited context' })).not.toBeInTheDocument();
        backend.seed('workspace_members', { id: 'editormember', workspace: 'ws1', user: 'editor', role: 'viewer' });
        await user.click(screen.getByRole('button', { name: 'Refresh knowledge' }));
        expect(await screen.findByRole('list', { name: 'Context citations' })).toBeVisible();
    });

    it('assembles mission detail context automatically without changing the mission', async () => {
        renderWithProviders(<MissionKnowledgeContext missionId="mission1" />, settings);
        expect(await screen.findByRole('list', { name: 'Context citations' })).toHaveTextContent('Reduce missed appointments');
        expect(screen.getByRole('link', { name: /Explore this mission/ })).toHaveAttribute('href', '/app/knowledge?mission=mission1');
        expect(backend.data.missions.find((row) => row.id === 'mission1').status).toBe('running');
    });
});
