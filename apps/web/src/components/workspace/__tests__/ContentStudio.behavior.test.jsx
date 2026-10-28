// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/ContentStudio.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/workspace/ContentStudio.jsx, apps/web/src/components/workspace/StructuredContent.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/ContentStudio.jsx; VALIDATES apps/web/src/components/workspace/StructuredContent.jsx
// DAG Node:    none
// Intent:      Exercise content-desk filtering, editor controls, editorial transitions, receipts and uncertain-save recovery as a user sees them.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContentStudio from '@/components/workspace/ContentStudio';
import { readMediaDraft } from '@/lib/contentMedia';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
import { mockPocketBaseError, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn(), trackAuthIdentity: vi.fn(), readFailed: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/contentMedia', () => ({ readMediaDraft: vi.fn() }));
const access = vi.hoisted(() => ({ data: { role: 'admin', can_write: true, can_admin: true }, loading: false, error: '' }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => access }));

const objective = { id: 'objective1', title: 'Reduce response time', description: 'A bounded test.', success_metric: 'Median over one week.', status: 'active', due_date: '', workspace: 'ws_test', owner: 'user_test' };
const draft = { id: 'draft1', title: 'How to review a draft', format: 'blog', audience: 'New editors', brief: 'A synthetic editorial exercise.', body: '# Useful steps\n\n- Read the source\n- Record the limitation', call_to_action: '', channel: '', objective: '', status: 'draft', workspace: 'ws_test', owner: 'user_test' };

// Radix attaches its Escape listener in the effect that moves focus into the dialog.
async function escapeDialog(user) {
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement));
    await user.keyboard('{Escape}');
}

function sentValues(call = 0) {
    return pb.send.mock.calls[call][1].body.payload;
}

async function openRecord(user, title = draft.title) {
    await user.click(await screen.findByRole('button', { name: `Open ${title}` }));
    return within(screen.getByRole('dialog'));
}

async function startNewDraft(user) {
    const start = screen.getByRole('button', { name: 'New draft' });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    return within(screen.getByRole('dialog'));
}

beforeEach(() => {
    pb.__reset(); setDemoMode(false);
    vi.mocked(readMediaDraft).mockReset();
    access.data = { role: 'admin', can_write: true, can_admin: true }; access.loading = false; access.error = '';
    // Transport-only fixture mirroring the scoped claims command; native policy is tested server-side.
    pb.send = vi.fn(async (_path, { body }) => {
        const { id, values } = body.payload;
        const before = id ? await pb.__collection('social_content').getOne(id) : {};
        const record = { ...before, ...values, id: id || 'commanddraft1', owner: before.owner || 'user_test',
            workspace: 'ws_test', claim_revision: body.revision + 1, created: before.created || new Date().toISOString(), updated: new Date().toISOString() };
        if (values.status === 'approved') { record.reviewed_by = 'user_test'; record.reviewed_at = new Date().toISOString(); }
        if (values.status === 'published') { record.published_by = 'user_test'; record.published_at = new Date().toISOString(); }
        pb.__setRecords('social_content', [record]);
        return { id: record.id, workspace: 'ws_test', action: body.action, revision: body.revision + 1, record, replayed: false };
    });
    pb.__setRecords('erp_objectives', [objective]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('content list', () => {
    const records = [
        { ...draft, id: 'c1', title: 'Launch notes', audience: 'Operators', channel: 'Newsletter', scheduled_for: '2026-11-02 12:00:00.000Z' },
        { ...draft, id: 'c2', title: 'Quick tip', format: '', status: 'legacy_hold', audience: '' },
        { ...draft, id: 'c3', title: 'Setup tutorial', format: 'tutorial', status: 'approved', audience: 'New staff' },
    ];

    it('labels legacy records honestly and shows channel and planned date when recorded', async () => {
        pb.__setRecords('social_content', records);
        renderWithProviders(<ContentStudio />);
        const legacy = (await screen.findByRole('heading', { name: 'Quick tip' })).closest('li');
        expect(within(legacy).getByText('Social post · legacy_hold')).toBeVisible();
        expect(within(legacy).getByText('Audience: Not recorded yet.')).toBeVisible();
        const launch = screen.getByRole('heading', { name: 'Launch notes' }).closest('li');
        expect(within(launch).getByText('Blog article · Draft')).toBeVisible();
        expect(within(launch).getByText('Channel: Newsletter')).toBeVisible();
        expect(within(launch).getByText('Planned: 2026-11-02')).toBeVisible();
        expect(within(legacy).queryByText(/Channel:/)).not.toBeInTheDocument();
        expect(within(legacy).queryByText(/Planned:/)).not.toBeInTheDocument();
    });

    it('narrows the list by search text, editorial state and format, and explains an empty match', async () => {
        pb.__setRecords('social_content', records);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        await screen.findByRole('heading', { name: 'Launch notes' });
        const titles = () => screen.queryAllByRole('heading', { level: 3 }).map((node) => node.textContent);

        await user.type(screen.getByLabelText('Search content'), 'newsletter');
        expect(titles()).toEqual(['Launch notes']);
        await user.clear(screen.getByLabelText('Search content'));

        await user.selectOptions(screen.getByLabelText('Editorial state'), 'approved');
        expect(titles()).toEqual(['Setup tutorial']);
        await user.selectOptions(screen.getByLabelText('Editorial state'), 'all');

        // A record saved before formats existed is treated as a social post.
        await user.selectOptions(screen.getByLabelText('Content format'), 'social');
        expect(titles()).toEqual(['Quick tip']);

        await user.type(screen.getByLabelText('Search content'), 'launch');
        expect(titles()).toEqual([]);
        expect(screen.getByText('No content matches these filters.')).toBeVisible();
    });

    it('invites a first draft when the workspace has no content yet', async () => {
        renderWithProviders(<ContentStudio />);
        expect(await screen.findByText(/No drafts yet\. Start with a reader/)).toBeVisible();
        expect(screen.queryByText('No content matches these filters.')).not.toBeInTheDocument();
    });

    it('asks for a workspace instead of rendering the desk when none is active', () => {
        renderWithProviders(<ContentStudio />, { workspace: { active: null } });
        expect(screen.getByText('Select a workspace to manage content.')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'New draft' })).not.toBeInTheDocument();
    });

    it('shows a readable fallback when a media import fails without an error message', async () => {
        vi.mocked(readMediaDraft).mockRejectedValue('unreadable');
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const input = screen.getByLabelText('Import media draft');
        await waitFor(() => expect(input).toBeEnabled());
        await user.upload(input, new File(['{}'], 'broken.json', { type: 'application/json' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the selected media draft.');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

describe('draft editor', () => {
    it('saves the chosen format and linked business objective with the draft', async () => {
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const form = await startNewDraft(user);
        await user.type(form.getByLabelText('Title'), 'Tutorial for operators');
        await user.selectOptions(form.getByLabelText('Format'), 'tutorial');
        await form.findByRole('option', { name: 'Reduce response time' });
        await user.selectOptions(form.getByLabelText('Business objective'), 'objective1');
        await user.click(form.getByRole('button', { name: 'Save draft' }));
        expect(await screen.findByText('Draft saved. Request review when the copy is ready.')).toBeVisible();
        expect(sentValues()).toEqual({ id: '', values: expect.objectContaining({ title: 'Tutorial for operators', format: 'tutorial', objective: 'objective1', status: 'draft' }) });
    });

    it('retains a link to an objective that is no longer listed and explains unavailable objectives', async () => {
        pb.__setRecords('social_content', [{ ...draft, objective: 'objective-gone' }]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click((await openRecord(user)).getByRole('button', { name: 'Edit draft' }));
        const form = within(screen.getByRole('dialog'));
        const select = form.getByLabelText('Business objective');
        await form.findByRole('option', { name: 'Reduce response time' });
        expect(select).toHaveValue('objective-gone');
        expect(form.getByRole('option', { name: 'Current objective unavailable' }).selected).toBe(true);
        expect(form.queryByText('Objectives are unavailable; the current link is retained.')).not.toBeInTheDocument();
    });

    it('disables the objective picker and keeps the saved link when objectives cannot be read', async () => {
        pb.__setError('erp_objectives');
        pb.__setRecords('social_content', [{ ...draft, objective: 'objective1' }]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click((await openRecord(user)).getByRole('button', { name: 'Edit draft' }));
        const form = within(screen.getByRole('dialog'));
        expect(await form.findByText('Objectives are unavailable; the current link is retained.')).toBeVisible();
        expect(form.getByLabelText('Business objective')).toBeDisabled();
        expect(form.getByLabelText('Business objective')).toHaveValue('objective1');
    });

    it('replaces existing copy with an outline only after the writer confirms', async () => {
        pb.__setRecords('social_content', [draft]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click((await openRecord(user)).getByRole('button', { name: 'Edit draft' }));
        const form = within(screen.getByRole('dialog'));
        await user.click(form.getByRole('button', { name: 'Create outline' }));
        expect(form.getByLabelText('Draft body')).toHaveValue(draft.body);
        await user.click(form.getByRole('button', { name: 'Replace current text' }));
        expect(form.getByLabelText('Draft body').value).toMatch(/^# How to review a draft/);
        expect(form.getByLabelText('Draft body').value).toContain('Audience: New editors');
        expect(form.queryByRole('button', { name: 'Replace current text' })).not.toBeInTheDocument();
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('previews numbered steps as a list and prompts for copy when the body is empty', async () => {
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const form = await startNewDraft(user);
        await user.click(form.getByRole('button', { name: 'Preview copy' }));
        expect(form.getByText('Add copy to preview it.')).toBeVisible();
        await user.click(form.getByRole('button', { name: 'Edit copy' }));
        await user.type(form.getByLabelText('Draft body'), '1. Open the source\n2. Record the result');
        await user.click(form.getByRole('button', { name: 'Preview copy' }));
        const preview = within(form.getByRole('region', { name: 'Draft preview' }));
        expect(preview.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Open the source', 'Record the result']);
        expect(preview.getByRole('list').tagName).toBe('OL');
        expect(form.queryByText('Add copy to preview it.')).not.toBeInTheDocument();
    });

    it('refuses to save a draft whose title is only whitespace', async () => {
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const form = await startNewDraft(user);
        await user.type(form.getByLabelText('Title'), '   ');
        await user.click(form.getByRole('button', { name: 'Save draft' }));
        expect(form.getByRole('alert')).toHaveTextContent('Name the draft.');
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('closes the editor without saving through Cancel or Escape', async () => {
        renderWithProviders(<ContentStudio />); const user = setupUser();
        let form = await startNewDraft(user);
        await user.type(form.getByLabelText('Title'), 'Unsaved idea');
        await user.click(form.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        form = await startNewDraft(user);
        expect(form.getByLabelText('Title')).toHaveValue('');
        await escapeDialog(user);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('keeps the editor open with the saved identity when the backend drops draft fields', async () => {
        pb.send.mockImplementationOnce(async (_path, { body }) => {
            const record = { id: 'partial1', title: body.payload.values.title, status: 'draft', workspace: 'ws_test', owner: 'user_test', claim_revision: 1 };
            pb.__setRecords('social_content', [record]);
            return { id: record.id, workspace: 'ws_test', action: body.action, revision: 1, record, replayed: false };
        });
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const form = await startNewDraft(user);
        await user.type(form.getByLabelText('Title'), 'Partly kept');
        await user.type(form.getByLabelText('Intended audience'), 'Reviewers');
        await user.click(form.getByRole('button', { name: 'Save draft' }));
        expect(await form.findByRole('alert')).toHaveTextContent('some draft fields were not retained');
        expect(form.getByRole('heading', { name: 'Edit draft' })).toBeVisible();
        expect(form.getByLabelText('Intended audience')).toHaveValue('Reviewers');
        await user.click(form.getByRole('button', { name: 'Save draft' }));
        await waitFor(() => expect(pb.send).toHaveBeenCalledTimes(2));
        expect(sentValues(1).id).toBe('partial1');
    });

    it('keeps an uncertain save recoverable after the editor is closed', async () => {
        pb.__setRecords('social_content', [draft]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click((await openRecord(user)).getByRole('button', { name: 'Edit draft' }));
        pb.send.mockRejectedValueOnce(mockPocketBaseError('Response unavailable', 503));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft' }));
        await within(screen.getByRole('dialog')).findByRole('button', { name: 'Retry previous content save' });
        await escapeDialog(user);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        // The pending write stays visible on the desk, not only inside the dismissed editor.
        expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain('Response unavailable');
        expect(screen.getByRole('button', { name: 'New draft' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Retry previous content save' }));
        expect(await screen.findByText('Previous save confirmed. Refresh to inspect the latest version.')).toBeVisible();
        expect(pb.send.mock.calls[1][1].body).toEqual(pb.send.mock.calls[0][1].body);
        expect(screen.getByRole('dialog')).toHaveTextContent(draft.title);
    });
});

describe('editorial decisions', () => {
    it('requests review for a saved draft and then offers the review checklist', async () => {
        pb.__setRecords('social_content', [draft]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const detail = await openRecord(user);
        await user.click(detail.getByRole('button', { name: 'Request review' }));
        expect(await detail.findByText('Awaiting review saved.')).toBeVisible();
        expect(sentValues()).toEqual({ id: 'draft1', values: { status: 'awaiting_approval' } });
        expect(detail.getByRole('heading', { name: 'Review this saved copy' })).toBeVisible();
        expect(detail.queryByRole('button', { name: 'Request review' })).not.toBeInTheDocument();
    });

    it('returns copy awaiting review to draft', async () => {
        pb.__setRecords('social_content', [{ ...draft, status: 'awaiting_approval' }]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const detail = await openRecord(user);
        await user.click(detail.getByRole('button', { name: 'Return to draft' }));
        expect(await detail.findByText('Draft saved.')).toBeVisible();
        expect(sentValues()).toEqual({ id: 'draft1', values: { status: 'draft' } });
        expect(detail.getByRole('button', { name: 'Request review' })).toBeVisible();
    });

    it('reports a missing decision receipt instead of claiming the transition succeeded', async () => {
        pb.__setRecords('social_content', [draft]);
        pb.send.mockImplementationOnce(async (_path, { body }) => ({
            id: 'draft1', workspace: 'ws_test', action: body.action, revision: 1, record: { ...draft, claim_revision: 1 }, replayed: false,
        }));
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const detail = await openRecord(user);
        await user.click(detail.getByRole('button', { name: 'Request review' }));
        expect(await detail.findByRole('alert')).toHaveTextContent('did not return the required decision receipt');
        expect(detail.queryByText('Awaiting review saved.')).not.toBeInTheDocument();
    });

    it('copies a saved item into a new, separately saved draft', async () => {
        pb.__setRecords('social_content', [{ ...draft, status: 'approved', reviewed_by: 'user_test', reviewed_at: '2026-09-15 04:00:00.000Z' }]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const detail = await openRecord(user);
        await user.click(detail.getByRole('button', { name: 'Copy to a new draft' }));
        const form = within(screen.getByRole('dialog'));
        expect(form.getByRole('heading', { name: 'New content draft' })).toBeVisible();
        expect(form.getByLabelText('Title')).toHaveValue(draft.title);
        expect(form.getByLabelText('Draft body')).toHaveValue(draft.body);
        await user.click(form.getByRole('button', { name: 'Save draft' }));
        expect(await screen.findByText('Draft saved. Request review when the copy is ready.')).toBeVisible();
        expect(sentValues()).toEqual({ id: '', values: expect.objectContaining({ title: draft.title, status: 'draft' }) });
    });

    it('closes the saved item with its Close button or Escape', async () => {
        pb.__setRecords('social_content', [draft]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        let detail = await openRecord(user);
        await user.click(detail.getByRole('button', { name: 'Close content' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        detail = await openRecord(user);
        expect(detail.getByRole('heading', { name: draft.title })).toBeVisible();
        await escapeDialog(user);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('describes legacy saved items without inventing format, audience or body', async () => {
        pb.__setRecords('social_content', [{ ...draft, format: '', status: 'legacy_hold', audience: '', brief: '', body: '' }]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        const detail = await openRecord(user);
        expect(detail.getByText('legacy_hold · Social post')).toBeVisible();
        expect(detail.getByText('Audience: Not recorded yet.')).toBeVisible();
        expect(detail.getByText('This draft has no body yet.')).toBeVisible();
        expect(detail.queryByText(/^Brief:/)).not.toBeInTheDocument();
    });

    it('distinguishes a legacy published label from a recorded publication receipt', async () => {
        pb.__setRecords('social_content', [
            { ...draft, status: 'published', published_url: '' },
            { ...draft, id: 'draft2', title: 'Receipt without time', status: 'published', published_url: 'https://example.com/post', published_at: '' },
        ]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        let detail = await openRecord(user);
        expect(detail.getByText('This legacy published state has no publication receipt from the content desk.')).toBeVisible();
        expect(detail.queryByRole('link', { name: /Open recorded publication/ })).not.toBeInTheDocument();
        await user.click(detail.getByRole('button', { name: 'Close content' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        detail = await openRecord(user, 'Receipt without time');
        expect(detail.getByRole('link', { name: /Open recorded publication/ })).toHaveAttribute('href', 'https://example.com/post');
        expect(detail.getByText(/Receipt recorded at an unavailable time/)).toBeVisible();
    });
});
