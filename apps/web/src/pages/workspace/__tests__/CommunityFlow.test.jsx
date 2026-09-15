// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/CommunityFlow.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/pages/workspace/WikiPage.jsx, apps/web/src/pages/workspace/ForumsPage.jsx, tests/upgrade/admin-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/WikiPage.jsx; VALIDATES apps/web/src/pages/workspace/ForumsPage.jsx; DEPENDS_ON tests/upgrade/admin-fixture.mjs
// DAG Node:    none
// Intent:      Verify wiki publication and forum moderation across real UI, browser requests and source policies without treating storage doubles as a native backend.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import WikiPage from '@/pages/workspace/WikiPage';
import ForumsPage from '@/pages/workspace/ForumsPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'owner' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
let backend;
function send(path, options) {
    const parts = path.split('/');
    const e = backend.event(pb.authStore.record.id, options.body || {}, { workspace: parts[4], id: parts[6], query: options.query || {} });
    try {
        const service = backend.load('workspace-community.js');
        return plain(options.method === 'POST' ? service.command(e) : parts[6] ? service.thread(e) : service[parts[5]](e));
    } catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
}
function renderPage(element, actor = 'owner') {
    pb.authStore.record = { id: actor };
    return renderWithProviders(element, { auth: { user: { id: actor }, isAuthed: true }, workspace: { active: { id: 'ws1', owner: 'owner' } } });
}
const wiki = () => backend.command('wiki.save', { id: '', title: 'Working guide', slug: 'working-guide', body: 'Reviewed team instructions.' }, { actor: 'editor', revision: 0 });
const topic = () => backend.command('forum.create', { title: 'Review the plan', body: 'Share an observation with the team.' }, { revision: 0 });
beforeEach(() => { backend = fixture(); backend.enable(); pb.send.mockReset(); pb.send.mockImplementation(async (...args) => send(...args)); });

describe('workspace wiki', () => {
    it('preserves draft privacy, safely previews text and publishes only through administrator review', async () => {
        const user = setupUser(); let view = renderPage(<WikiPage />, 'editor');
        await user.click(await screen.findByRole('button', { name: 'New wiki page' }));
        let dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Page title'), 'Working guide');
        await user.type(dialog.getByLabelText('Page name'), 'working-guide');
        const body = 'Begin with the saved mission.\n\n<img src=x onerror=alert(1)>';
        await user.type(dialog.getByLabelText('Page content'), body);
        await user.click(dialog.getByRole('button', { name: 'Preview page' }));
        expect(dialog.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
        expect(screen.getByRole('dialog').querySelector('img')).toBeNull();
        await user.click(dialog.getByRole('button', { name: 'Hide preview' }));
        await user.click(dialog.getByRole('button', { name: 'Save wiki draft' }));
        expect(await screen.findByRole('heading', { name: 'Working guide' })).toBeVisible();
        expect(backend.data.wiki_pages[0].status).toBe('draft');
        expect(screen.queryByRole('button', { name: 'Publish to workspace' })).not.toBeInTheDocument();
        view.unmount(); view = renderPage(<WikiPage />, 'viewer');
        expect(await screen.findByText('No wiki pages visible on this page.')).toBeVisible();
        view.unmount(); view = renderPage(<WikiPage />, 'admin');
        await user.click(await screen.findByRole('button', { name: 'Publish to workspace' }));
        await waitFor(() => expect(backend.data.wiki_pages[0].published_by).toBe('admin'));
        view.unmount(); renderPage(<WikiPage />, 'viewer');
        const trigger = await screen.findByRole('button', { name: 'Read page' }); await user.click(trigger);
        dialog = within(screen.getByRole('dialog'));
        expect(dialog.getByText(/Last publication:/)).toBeVisible();
        expect(dialog.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(screen.queryByRole('button', { name: 'Edit draft' })).not.toBeInTheDocument();
    });

    it('retains a conflicting edit until explicitly reloaded and supports archive and return to draft', async () => {
        const saved = wiki(); const user = setupUser(); renderPage(<WikiPage />);
        await user.click(await screen.findByRole('button', { name: 'Edit draft' }));
        const dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Page content'), ' Keep this edit.');
        backend.command('wiki.save', { id: saved.id, title: 'Working guide', slug: 'working-guide', body: 'A newer saved version.' }, { revision: 1 });
        await user.click(dialog.getByRole('button', { name: 'Save wiki draft' }));
        expect(await dialog.findByRole('alert')).toHaveTextContent(/Reload/);
        expect(dialog.getByLabelText('Page content')).toHaveValue('Reviewed team instructions. Keep this edit.');
        await user.click(dialog.getByRole('button', { name: 'Reload current records' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(await screen.findByText('A newer saved version.')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Archive page' }));
        await waitFor(() => expect(backend.data.wiki_pages[0].status).toBe('archived'));
        await user.click(await screen.findByRole('button', { name: 'Return to draft' }));
        expect(await screen.findByRole('button', { name: 'Edit draft' })).toBeVisible();
    });

    it('paginates bounded results and explains disabled features without a write control', async () => {
        for (let index = 0; index < 21; index++) backend.command('wiki.save', { id: '', title: `Guide ${index}`, slug: `guide-${index}`, body: 'A complete paragraph.' }, { revision: 0 });
        const user = setupUser(); const view = renderPage(<WikiPage />);
        const pages = within(await screen.findByRole('navigation', { name: 'Wiki pages' }));
        await user.click(pages.getByRole('button', { name: 'Next' }));
        expect(await screen.findByText('Page 2')).toBeVisible();
        expect(screen.getAllByRole('button', { name: 'Read page' })).toHaveLength(1);
        await user.click(within(screen.getByRole('navigation', { name: 'Wiki pages' })).getByRole('button', { name: 'Previous' }));
        expect(await screen.findByText('Page 1')).toBeVisible();
        view.unmount(); backend.enable({ wiki_enabled: false }); renderPage(<WikiPage />);
        expect(await screen.findByRole('link', { name: 'Enable it in Administration' })).toHaveAttribute('href', '/app/admin');
        expect(screen.queryByRole('button', { name: 'New wiki page' })).not.toBeInTheDocument();
    });
});

describe('workspace forum', () => {
    it('holds editor topics for moderation and exposes them to viewers only after approval', async () => {
        const user = setupUser(); let view = renderPage(<ForumsPage />, 'editor');
        await user.click(await screen.findByRole('button', { name: 'New discussion' }));
        const dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Topic title'), 'Review the plan');
        await user.type(dialog.getByLabelText('Discussion'), 'Share an observation with the team.');
        await user.click(dialog.getByRole('button', { name: 'Submit topic' }));
        expect(await screen.findByRole('heading', { name: 'Review the plan' })).toBeVisible();
        expect(backend.data.forum_topics[0].status).toBe('pending');
        view.unmount(); view = renderPage(<ForumsPage />, 'viewer');
        expect(await screen.findByText('No discussions visible on this page.')).toBeVisible();
        view.unmount(); view = renderPage(<ForumsPage />, 'admin');
        await user.click(await screen.findByRole('button', { name: 'Open discussion' }));
        await user.click(await screen.findByText('Moderate topic'));
        await user.type(screen.getByLabelText('Reason for moderation'), 'Relevant to the workspace plan.');
        await user.click(screen.getByRole('button', { name: 'Save moderation decision' }));
        await waitFor(() => expect(backend.data.forum_topics[0].status).toBe('open'));
        expect(backend.data.forum_topics[0].moderated_by).toBe('admin');
        view.unmount(); renderPage(<ForumsPage />, 'viewer');
        await user.click(await screen.findByRole('button', { name: 'Open discussion' }));
        expect(await screen.findByText('Your current role has read access to discussions.')).toBeVisible();
        expect(screen.queryByText('Moderate topic')).not.toBeInTheDocument();
    });

    it('recovers an uncertain editor reply once, moderates it and locks further replies', async () => {
        topic(); const user = setupUser(); let lost = false;
        pb.send.mockImplementation(async (path, options) => {
            const result = send(path, options);
            if (options.method === 'POST' && !lost) { lost = true; throw new Error('Lost reply response'); }
            return result;
        });
        const view = renderPage(<ForumsPage />, 'editor');
        await user.click(await screen.findByRole('button', { name: 'Open discussion' }));
        await user.type(await screen.findByLabelText('Your reply'), 'The success criteria need a baseline.');
        await user.click(screen.getByRole('button', { name: 'Submit reply' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/confirm/);
        expect(screen.getByLabelText('Your reply')).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Retry previous save' }));
        expect(await screen.findByText('The success criteria need a baseline.')).toBeVisible();
        expect(backend.data.forum_replies).toHaveLength(1); expect(backend.data.forum_replies[0].status).toBe('pending');
        expect(backend.data.workspace_admin_events.filter((row) => row.action === 'forum.reply')).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: 'Back to discussions' }));
        expect(await screen.findByRole('button', { name: 'Open discussion' })).toBeVisible();
        view.unmount(); renderPage(<ForumsPage />, 'admin');
        await user.click(await screen.findByRole('button', { name: 'Open discussion' }));
        const replies = within(await screen.findByRole('list', { name: 'Discussion replies' }));
        await user.click(replies.getByText('Moderate reply'));
        await user.type(replies.getByLabelText('Reason for moderation'), 'Useful review feedback.');
        await user.click(replies.getByRole('button', { name: 'Save moderation decision' }));
        await waitFor(() => expect(backend.data.forum_replies[0].status).toBe('visible'));
        await user.click(await screen.findByText('Moderate topic'));
        const note = await screen.findByLabelText('Reason for moderation', { selector: `#moderation-note-${backend.data.forum_topics[0].id}` });
        await user.type(note, 'Review closed for this iteration.');
        await user.click(within(note.closest('form')).getByRole('button', { name: 'Save moderation decision' }));
        expect(await screen.findByText('Replies are closed while this topic is pending, locked or hidden.')).toBeVisible();
        expect(backend.data.forum_topics[0].status).toBe('locked');
    });

    it('explains disabled forums and offers recovery from an unavailable backend', async () => {
        backend.enable({ forum_enabled: false }); const user = setupUser();
        pb.send.mockRejectedValueOnce(new Error('Unavailable'));
        renderPage(<ForumsPage />, 'viewer');
        expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/);
        await user.click(screen.getByRole('button', { name: 'Retry loading' }));
        expect(await screen.findByText('The workspace forum is disabled.')).toBeVisible();
        expect(screen.getByText('Ask your workspace administrator to enable it.')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'New discussion' })).not.toBeInTheDocument();
    });
});
