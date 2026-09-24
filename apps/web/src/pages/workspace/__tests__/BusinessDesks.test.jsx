// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/BusinessDesks.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/pages/workspace/ErpPage.jsx, apps/web/src/components/workspace/ContentStudio.jsx, apps/web/src/components/workspace/StructuredContent.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/ErpPage.jsx; VALIDATES apps/web/src/components/workspace/ContentStudio.jsx; VALIDATES apps/web/src/components/workspace/StructuredContent.jsx
// DAG Node:    none
// Intent:      Exercise real ERP and editorial components through failed saves, retained fields, review decisions and workspace changes.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErpPage from '@/pages/workspace/ErpPage';
import ContentStudio from '@/components/workspace/ContentStudio';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
import { createMockWorkspace, createWorkspaceValue, mockPocketBaseError, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn(), trackAuthIdentity: vi.fn() }));
const access = vi.hoisted(() => ({ data: { role: 'admin', can_write: true, can_admin: true }, loading: false, error: '' }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => access }));
const objective = { id: 'objective1', title: 'Reduce response time', description: 'A bounded test.', success_metric: 'Compare the observed median over one week.', status: 'active', due_date: '', workspace: 'ws_test', owner: 'user_test' };
const draft = { id: 'draft1', title: 'How to review a draft', format: 'blog', audience: 'New editors', brief: 'A synthetic editorial exercise.', body: '# Useful steps\n\n- Read the source\n- Record the limitation', call_to_action: '', channel: '', objective: '', status: 'draft', workspace: 'ws_test', owner: 'user_test' };
beforeEach(() => {
    pb.__reset(); setDemoMode(false);
    access.data = { role: 'admin', can_write: true, can_admin: true }; access.loading = false; access.error = '';
    // Transport-only fixture: native policy is exercised in workspace-claims.test.mjs.
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
    pb.__setRecords('erp_contacts', [{ id: 'contact1', name: 'Training coordinator', role: 'Staff', email: 'coordinator@example.com', notes: '', workspace: 'ws_test', owner: 'user_test' }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('ERP planning', () => {
    it('creates a linked task with an explicit priority, due date and workspace ownership', async () => {
        renderWithProviders(<ErpPage />);
        const user = setupUser();
        await user.click(screen.getByRole('tab', { name: 'Tasks' }));
        const add = screen.getByRole('button', { name: 'Add task' });
        await waitFor(() => expect(add).toBeEnabled()); await user.click(add);
        const form = within(screen.getByRole('dialog'));
        await user.type(form.getByLabelText('Task'), 'Collect the test baseline');
        await user.type(form.getByLabelText('Task details'), 'Record the source and observation period.');
        await user.selectOptions(form.getByLabelText('Priority'), 'high');
        await user.selectOptions(form.getByLabelText('Linked objective'), 'objective1');
        await user.selectOptions(form.getByLabelText('Point of contact'), 'contact1');
        fireEvent.change(form.getByLabelText('Due date'), { target: { value: '2026-10-01' } });
        await user.click(form.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Task saved.')).toBeVisible();
        expect(pb.__collection('erp_tasks').create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Collect the test baseline', objective: 'objective1', contact: 'contact1', priority: 'high', status: 'todo', due_date: '2026-10-01 12:00:00.000Z', workspace: 'ws_test', owner: 'user_test' }));
        expect(screen.getByText('Objective: Reduce response time')).toBeVisible();
        expect(screen.getByText('Contact: Training coordinator')).toBeVisible();
    });

    it('preserves an objective edit after a rejected save and permits a useful retry', async () => {
        renderWithProviders(<ErpPage />); const user = setupUser();
        await user.click(await screen.findByRole('button', { name: 'Edit Reduce response time' }));
        const form = within(screen.getByRole('dialog'));
        await user.clear(form.getByLabelText('Success measure')); await user.type(form.getByLabelText('Success measure'), 'Use a measured baseline and a five-minute target.');
        pb.__collection('erp_objectives').update.mockRejectedValueOnce(mockPocketBaseError('Permission changed', 403));
        await user.click(form.getByRole('button', { name: 'Save' }));
        expect(await form.findByRole('alert')).toHaveTextContent('Permission changed');
        expect(form.getByLabelText('Success measure')).toHaveValue('Use a measured baseline and a five-minute target.');
        await user.click(form.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Objective saved.')).toBeVisible();
    });

    it('keeps the saved identity when an old backend drops new ERP fields', async () => {
        renderWithProviders(<ErpPage />); const user = setupUser();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Add objective' })).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'Add objective' }));
        const form = within(screen.getByRole('dialog'));
        await user.type(form.getByLabelText('Objective'), 'Measure a baseline');
        await user.type(form.getByLabelText('Success measure'), 'One readable baseline report.');
        pb.__collection('erp_objectives').create.mockImplementationOnce(async (fields) => {
            const record = { id: 'partially-saved', title: fields.title, description: fields.description, status: fields.status };
            pb.__setRecords('erp_objectives', [record]); return record;
        });
        await user.click(form.getByRole('button', { name: 'Save' }));
        expect(await form.findByRole('alert')).toHaveTextContent('did not retain every field');
        expect(form.getByLabelText('Success measure')).toHaveValue('One readable baseline report.');
        await user.click(form.getByRole('button', { name: 'Save' }));
        expect(pb.__collection('erp_objectives').create).toHaveBeenCalledTimes(1);
        expect(pb.__collection('erp_objectives').update).toHaveBeenCalledWith('partially-saved', expect.any(Object));
    });

    it('edits contact notes and searches saved contact fields', async () => {
        renderWithProviders(<ErpPage />); const user = setupUser();
        await user.click(screen.getByRole('tab', { name: 'Contacts' }));
        await user.click(await screen.findByRole('button', { name: 'Edit Training coordinator' }));
        const form = within(screen.getByRole('dialog')); await user.type(form.getByLabelText('Notes'), 'Coordinates the consent review.');
        await user.click(form.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Contact saved.')).toBeVisible();
        await user.type(screen.getByLabelText('Search contacts'), 'consent');
        expect(screen.getByRole('heading', { name: 'Training coordinator' })).toBeVisible();
        await user.clear(screen.getByLabelText('Search contacts')); await user.type(screen.getByLabelText('Search contacts'), 'not-there');
        expect(screen.getByText('No records match these filters.')).toBeVisible();
    });

    it('distinguishes failed reads from empty data and keeps demo mode read-only', async () => {
        pb.__setError('erp_objectives');
        const view = renderWithProviders(<ErpPage />);
        expect(await screen.findByText('The objectives list is unavailable.')).toBeVisible();
        expect(screen.queryByText('No objectives yet. Add a record to begin.')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add objective' })).toBeDisabled();
        view.unmount(); pb.__clearError('erp_objectives'); setDemoMode(true);
        renderWithProviders(<ErpPage />);
        expect(screen.getByRole('button', { name: 'Add objective' })).toBeDisabled();
        expect(pb.__collection('erp_objectives').create).not.toHaveBeenCalled();
    });

    it('closes a pending editor when the active workspace changes and ignores its late result', async () => {
        const first = createWorkspaceValue();
        const view = renderWithProviders(<WorkspaceContext.Provider value={first}><ErpPage /></WorkspaceContext.Provider>);
        const user = setupUser(); await user.click(await screen.findByRole('button', { name: 'Edit Reduce response time' }));
        let resolveSave;
        pb.__collection('erp_objectives').update.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
        pb.__setRecords('erp_objectives', []);
        const second = createWorkspaceValue({ active: createMockWorkspace({ id: 'other-workspace' }) });
        view.rerender(<WorkspaceContext.Provider value={second}><ErpPage /></WorkspaceContext.Provider>);
        await act(async () => { resolveSave(objective); });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText('Objective saved.')).not.toBeInTheDocument();
    });
});

describe('content production', () => {
    it('produces an editable outline, previews it as text and saves a scoped draft', async () => {
        renderWithProviders(<ContentStudio />); const user = setupUser();
        await waitFor(() => expect(screen.getByRole('button', { name: 'New draft' })).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'New draft' }));
        const form = within(screen.getByRole('dialog'));
        await user.type(form.getByLabelText('Title'), 'A test article'); await user.type(form.getByLabelText('Intended audience'), 'New operators');
        await user.type(form.getByLabelText('Brief and supporting facts'), 'Explain a synthetic test.');
        await user.click(form.getByRole('button', { name: 'Create outline' }));
        expect(form.getByLabelText('Draft body').value).toContain('# A test article');
        await user.clear(form.getByLabelText('Draft body')); await user.type(form.getByLabelText('Draft body'), '# Heading\n\n<img src=x onerror=alert(1)>');
        await user.click(form.getByRole('button', { name: 'Preview copy' }));
        expect(form.getByRole('heading', { name: 'Heading' })).toBeVisible();
        expect(form.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
        expect(screen.getByRole('dialog').querySelector('img')).toBeNull();
        await user.click(form.getByRole('button', { name: 'Save draft' }));
        expect(await screen.findByText('Draft saved. Request review when the copy is ready.')).toBeVisible();
        expect(pb.send).toHaveBeenCalledWith('/api/buildanddo/workspaces/ws_test/claims', expect.objectContaining({ body: expect.objectContaining({
            action: 'content.save', revision: 0, payload: { id: '', values: expect.objectContaining({ status: 'draft', format: 'blog' }) },
        }) }));
        expect(pb.__collection('social_content').create).not.toHaveBeenCalled();
    });

    it('requires confirmation before replacing copy and retains it after a save failure', async () => {
        pb.__setRecords('social_content', [draft]); renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click(await screen.findByRole('button', { name: `Open ${draft.title}` }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit draft' }));
        const form = within(screen.getByRole('dialog'));
        await user.click(form.getByRole('button', { name: 'Create outline' }));
        expect(form.getByLabelText('Draft body')).toHaveValue(draft.body);
        await user.click(form.getByRole('button', { name: 'Keep draft' }));
        pb.send.mockRejectedValueOnce(mockPocketBaseError('Save was rejected', 403));
        await user.click(form.getByRole('button', { name: 'Save draft' }));
        expect(await form.findByRole('alert')).toHaveTextContent('Save was rejected');
        expect(form.getByLabelText('Draft body')).toHaveValue(draft.body);
    });

    it('requires completed review inputs and retains them after a role rejection', async () => {
        pb.__setRecords('social_content', [{ ...draft, status: 'awaiting_approval' }]);
        renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click(await screen.findByRole('button', { name: `Open ${draft.title}` }));
        const detail = within(screen.getByRole('dialog'));
        expect(detail.getByRole('button', { name: 'Approve reviewed copy' })).toBeDisabled();
        for (const checkbox of detail.getAllByRole('checkbox')) await user.click(checkbox);
        await user.type(detail.getByLabelText('Review note'), 'Checked sources and the synthetic example.');
        pb.send.mockRejectedValueOnce(mockPocketBaseError('Owner or admin required', 403));
        await user.click(detail.getByRole('button', { name: 'Approve reviewed copy' }));
        expect(await detail.findByRole('alert')).toHaveTextContent('Owner or admin required');
        expect(detail.getByLabelText('Review note')).toHaveValue('Checked sources and the synthetic example.');
        expect(pb.send).toHaveBeenCalledWith('/api/buildanddo/workspaces/ws_test/claims', expect.objectContaining({ body: expect.objectContaining({
            action: 'content.save', payload: { id: 'draft1', values: expect.objectContaining({ status: 'approved', review_checks: { accuracy: true, privacy: true, rights: true, accessibility: true } }) },
        }) }));
        expect(pb.__collection('social_content').update).not.toHaveBeenCalled();
    });

    it('records a planned date without claiming delivery and requires a checked publication URL', async () => {
        const approved = { ...draft, status: 'approved', reviewed_by: 'user_test', reviewed_at: '2026-09-15 04:00:00.000Z', review_note: 'Checked the draft.' };
        pb.__setRecords('social_content', [approved]); renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click(await screen.findByRole('button', { name: `Open ${draft.title}` }));
        const detail = within(screen.getByRole('dialog'));
        expect(detail.getByRole('button', { name: 'Record publication' })).toBeDisabled();
        fireEvent.change(detail.getByLabelText('Planned publication date'), { target: { value: '2026-10-02' } });
        await user.click(detail.getByRole('button', { name: 'Save publication plan' }));
        expect(await detail.findByText('Planned saved.')).toBeVisible();
        expect(pb.send).toHaveBeenCalledWith('/api/buildanddo/workspaces/ws_test/claims', expect.objectContaining({ body: expect.objectContaining({
            action: 'content.save', payload: { id: 'draft1', values: { status: 'scheduled', scheduled_for: '2026-10-02 12:00:00.000Z' } },
        }) }));
        expect(detail.getByText('This saves a date; it does not schedule an external job.')).toBeVisible();
        await user.type(detail.getByLabelText('Checked publication URL'), 'https://example.com/article');
        await user.click(detail.getByRole('button', { name: 'Record publication' }));
        expect(await detail.findByRole('link', { name: /Open recorded publication/ })).toHaveAttribute('href', 'https://example.com/article');
        expect(detail.queryByRole('button', { name: 'Edit draft' })).not.toBeInTheDocument();
    });

    it('does not accept a legacy published label as a receipt or let a plan without review advance', async () => {
        pb.__setRecords('social_content', [{ ...draft, status: 'scheduled' }]); renderWithProviders(<ContentStudio />);
        await setupUser().click(await screen.findByRole('button', { name: `Open ${draft.title}` }));
        const detail = within(screen.getByRole('dialog'));
        expect(detail.getByText(/This state has no saved review receipt/)).toBeVisible();
        expect(detail.queryByRole('button', { name: 'Record publication' })).not.toBeInTheDocument();
    });

    it('keeps the desk read-only in demo mode', () => {
        setDemoMode(true); renderWithProviders(<ContentStudio />);
        expect(screen.getByRole('button', { name: 'New draft' })).toBeDisabled();
        expect(pb.__collection('social_content').create).not.toHaveBeenCalled();
    });

    it('does not let another editor edit a draft but permits a separate authored copy', async () => {
        access.data = { role: 'editor', can_write: true, can_admin: false };
        pb.__setRecords('social_content', [{ ...draft, owner: 'another-author', claim_revision: 2 }]);
        renderWithProviders(<ContentStudio />);
        await setupUser().click(await screen.findByRole('button', { name: `Open ${draft.title}` }));
        const detail = within(screen.getByRole('dialog'));
        expect(detail.getByRole('button', { name: 'Edit draft' })).toBeDisabled();
        expect(detail.getByRole('button', { name: 'Request review' })).toBeDisabled();
        expect(detail.getByRole('button', { name: 'Copy to a new draft' })).toBeEnabled();
    });

    it('retains the original revision after the list refreshes while an editor is open', async () => {
        const saved = { ...draft, claim_revision: 2 };
        pb.__setRecords('social_content', [saved]); renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click(await screen.findByRole('button', { name: `Open ${draft.title}` }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit draft' }));
        pb.__setRecords('social_content', [{ ...saved, claim_revision: 3, body: 'A concurrent edit' }]);
        pb.send.mockRejectedValueOnce(mockPocketBaseError('This record changed. Reload the saved version.', 409));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('This record changed');
        expect(pb.send.mock.calls[0][1].body.revision).toBe(2);
        expect(within(screen.getByRole('dialog')).getByLabelText('Draft body')).toHaveValue(draft.body);
    });

    it('offers retry inside the dialog after an uncertain save without issuing raw CRUD', async () => {
        pb.__setRecords('social_content', [draft]); renderWithProviders(<ContentStudio />); const user = setupUser();
        await user.click(await screen.findByRole('button', { name: `Open ${draft.title}` }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit draft' }));
        pb.send.mockRejectedValueOnce(mockPocketBaseError('Response unavailable', 503));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft' }));
        await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Retry previous content save' }));
        expect(pb.send.mock.calls[1][1].body).toEqual(pb.send.mock.calls[0][1].body);
        expect(pb.__collection('social_content').update).not.toHaveBeenCalled();
    });
});
