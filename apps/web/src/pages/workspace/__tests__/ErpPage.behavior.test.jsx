// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/ErpPage.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/pages/workspace/ErpPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/ErpPage.jsx
// DAG Node:    none
// Intent:      Exercise ERP task filters, linked-record navigation and editor dismissal as a member uses them.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErpPage from '@/pages/workspace/ErpPage';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn(), trackAuthIdentity: vi.fn(), readFailed: vi.fn() }));
const access = vi.hoisted(() => ({ data: { role: 'admin', can_write: true, can_admin: true }, loading: false, error: '' }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => access }));

const owned = { workspace: 'ws_test', owner: 'user_test' };
const objective = { id: 'objective1', title: 'Reduce response time', description: 'A bounded test.', success_metric: 'Median under five minutes.', status: 'active', due_date: '', ...owned };
const contact = { id: 'contact1', name: 'Training coordinator', role: 'Staff', email: 'coordinator@example.com', notes: '', ...owned };
const tasks = [
    { id: 'task1', title: 'Draft the baseline', description: '', status: 'todo', priority: 'high', objective: 'objective1', contact: 'contact1', due_date: '', ...owned },
    { id: 'task2', title: 'Publish the report', description: '', status: 'done', priority: 'low', objective: '', contact: '', due_date: '', ...owned },
    { id: 'task3', title: 'Chase the late reply', description: '', status: 'todo', priority: 'normal', objective: '', contact: 'contact1', due_date: '2020-01-01 12:00:00.000Z', ...owned },
];
const taskTitles = () => screen.queryAllByRole('heading', { level: 3 }).map((node) => node.textContent);

beforeEach(() => {
    pb.__reset(); setDemoMode(false);
    pb.__setRecords('erp_objectives', [objective]);
    pb.__setRecords('erp_contacts', [contact]);
    pb.__setRecords('erp_tasks', tasks);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('ERP task filters', () => {
    it('narrows tasks by status, overdue state and priority, and restores the full list', async () => {
        renderWithProviders(<ErpPage />); const user = setupUser();
        await user.click(screen.getByRole('tab', { name: 'Tasks' }));
        await waitFor(() => expect(taskTitles()).toHaveLength(3));
        await user.selectOptions(screen.getByLabelText('Filter by status'), 'done');
        expect(taskTitles()).toEqual(['Publish the report']);
        await user.selectOptions(screen.getByLabelText('Filter by status'), 'overdue');
        expect(taskTitles()).toEqual(['Chase the late reply']);
        expect(screen.getByText(/Due: 2020-01-01 · Overdue/)).toBeVisible();
        await user.selectOptions(screen.getByLabelText('Filter by status'), 'all');
        await user.selectOptions(screen.getByLabelText('Filter by priority'), 'high');
        expect(taskTitles()).toEqual(['Draft the baseline']);
        await user.selectOptions(screen.getByLabelText('Filter by priority'), 'low');
        await user.selectOptions(screen.getByLabelText('Filter by status'), 'todo');
        expect(screen.getByText('No records match these filters.')).toBeVisible();
        await user.selectOptions(screen.getByLabelText('Filter by priority'), 'all');
        await user.selectOptions(screen.getByLabelText('Filter by status'), 'all');
        expect(taskTitles()).toHaveLength(3);
    });

    it('filters tasks by a linked objective or contact and shows every task again on request', async () => {
        renderWithProviders(<ErpPage />); const user = setupUser();
        await user.click(screen.getByRole('tab', { name: 'Tasks' }));
        await waitFor(() => expect(taskTitles()).toHaveLength(3));
        expect(screen.queryByRole('button', { name: 'Show all tasks' })).not.toBeInTheDocument();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by objective' }), 'objective1');
        expect(taskTitles()).toEqual(['Draft the baseline']);
        await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by objective' }), '');
        expect(taskTitles()).toHaveLength(3);
        await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by contact' }), 'contact1');
        expect([...taskTitles()].sort()).toEqual(['Chase the late reply', 'Draft the baseline']);
        await user.click(screen.getByRole('button', { name: 'Show all tasks' }));
        expect(taskTitles()).toHaveLength(3);
        expect(screen.getByRole('combobox', { name: 'Filter by contact' })).toHaveValue('');
        expect(screen.queryByRole('button', { name: 'Show all tasks' })).not.toBeInTheDocument();
    });

    it('opens an objective link on the tasks tab and reports a task link that is not in this workspace', async () => {
        const view = renderWithProviders(<ErpPage />, { route: '/app/erp?objective=objective1' });
        expect(await screen.findByRole('tab', { name: 'Tasks', selected: true })).toBeVisible();
        await waitFor(() => expect(taskTitles()).toEqual(['Draft the baseline']));
        expect(screen.getByRole('combobox', { name: 'Filter by objective' })).toHaveValue('objective1');
        view.unmount();
        renderWithProviders(<ErpPage />, { route: '/app/erp?task=missing-task&contact=gone-contact' });
        expect(await screen.findByText('This task is unavailable in the current workspace.')).toBeVisible();
        expect(screen.getByRole('option', { name: 'Linked record unavailable' })).toBeInTheDocument();
    });
});

describe('ERP editor', () => {
    it('discards an unsaved edit on Cancel and on Escape, returning focus to the edit control', async () => {
        renderWithProviders(<ErpPage />); const user = setupUser();
        const edit = await screen.findByRole('button', { name: 'Edit Reduce response time' });
        await user.click(edit);
        await user.type(within(screen.getByRole('dialog')).getByLabelText('Objective'), ' (draft)');
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await user.click(edit);
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByLabelText('Objective')).toHaveValue('Reduce response time');
        await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement));
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(edit).toHaveFocus());
        expect(pb.__collection('erp_objectives').update).not.toHaveBeenCalled();
    });

    it('keeps the editor open while a save is still in flight', async () => {
        renderWithProviders(<ErpPage />); const user = setupUser();
        await user.click(await screen.findByRole('button', { name: 'Edit Reduce response time' }));
        let finish;
        pb.__collection('erp_objectives').update.mockImplementationOnce((id, values) => new Promise((resolve) => { finish = () => resolve({ ...objective, ...values, id }); }));
        await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
        expect(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Saving…' })).toBeVisible();
        await user.keyboard('{Escape}');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await act(async () => { finish(); });
        expect(await screen.findByText('Objective saved.')).toBeVisible();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('records a changed objective status and shows it on the objective card', async () => {
        renderWithProviders(<ErpPage />); const user = setupUser();
        await user.click(await screen.findByRole('button', { name: 'Edit Reduce response time' }));
        const form = within(screen.getByRole('dialog'));
        await user.selectOptions(form.getByLabelText('Status'), 'achieved');
        await user.click(form.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Objective saved.')).toBeVisible();
        expect(pb.__collection('erp_objectives').update).toHaveBeenCalledWith('objective1', expect.objectContaining({ status: 'achieved' }));
        expect(await screen.findByText('Achieved', { selector: 'p' })).toBeVisible();
    });
});
