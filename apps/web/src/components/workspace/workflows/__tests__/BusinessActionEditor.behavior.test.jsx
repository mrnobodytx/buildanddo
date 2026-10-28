// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/__tests__/BusinessActionEditor.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/workspace/workflows/BusinessActionEditor.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/workflows/BusinessActionEditor.jsx
// DAG Node:    none
// Intent:      Hold the bounded action editor to emitting only supported effect shapes, linking only loaded records and refusing non-object operation input.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = Object.assign(createMockPocketBase(), { send: vi.fn() });
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_collection, _verb, operation) => operation() }));
vi.mock('@/lib/observability/runtime', async (importOriginal) => ({ ...await importOriginal(), readFailed: vi.fn() }));

import pb from '@/lib/pocketbaseClient';
import BusinessActionEditor from '@/components/workspace/workflows/BusinessActionEditor';
import { defaultBusinessAction } from '@/lib/businessExecution';
import { setDemoMode } from '@/lib/demoWorkspace';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

/** Keeps the edited action in state, as the workflow step form does, and records every emitted value. */
function Harness({ initial, onChange }) {
    const [value, setValue] = useState(initial);
    return <BusinessActionEditor value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
}
const renderEditor = (initial) => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={initial} onChange={onChange} />);
    return { onChange, last: () => onChange.mock.calls.at(-1)[0] };
};

beforeEach(() => {
    pb.__reset(); pb.send.mockReset(); pb.send.mockRejectedValue(new Error('integrations offline')); setDemoMode(false);
    pb.__setRecords('erp_objectives', [{ id: 'obj1', title: 'Close the books', workspace: 'ws_test' }]);
    pb.__setRecords('erp_contacts', [{ id: 'contact1', name: 'Ada Lovelace', workspace: 'ws_test' }]);
});

describe('bounded ERP task action', () => {
    it('starts from the default ERP task and emits each edited task field', async () => {
        const user = setupUser(); const { last } = renderEditor(undefined);
        expect(screen.getByLabelText('Action type')).toHaveValue('erp');
        await user.type(screen.getByLabelText('Task title'), 'R');
        expect(last()).toEqual({ ...defaultBusinessAction(), parameters: { ...defaultBusinessAction().parameters, title: 'R' } });
        await user.type(screen.getByLabelText('Task details'), 'D');
        await user.selectOptions(screen.getByLabelText('Priority'), 'high');
        await user.type(screen.getByLabelText('Due date'), '2026-11-01');
        expect(last().parameters).toMatchObject({ title: 'R', description: 'D', priority: 'high', due_date: '2026-11-01' });
        expect(last().provider).toBe('erp');
    });

    it('links only objectives and contacts loaded from the workspace', async () => {
        const user = setupUser(); const { last } = renderEditor(defaultBusinessAction());
        await waitFor(() => expect(screen.getByLabelText('Objective')).toBeEnabled());
        await waitFor(() => expect(screen.getByLabelText('Contact')).toBeEnabled());
        await user.selectOptions(screen.getByLabelText('Objective'), 'Close the books');
        await user.selectOptions(screen.getByLabelText('Contact'), 'Ada Lovelace');
        expect(last().parameters).toMatchObject({ objective: 'obj1', contact: 'contact1' });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('disables record links and explains why when related records cannot be loaded', async () => {
        pb.__setError('erp_contacts');
        renderEditor(defaultBusinessAction());
        expect(await screen.findByText(/Related records are unavailable/)).toHaveAttribute('role', 'alert');
        expect(screen.getByLabelText('Contact')).toBeDisabled();
    });

    it('stores the time limit as a number of seconds', async () => {
        const user = setupUser(); const { last } = renderEditor(defaultBusinessAction());
        const limit = screen.getByLabelText('Time limit (5–60 seconds)');
        await user.clear(limit); await user.type(limit, '45');
        expect(last().max_seconds).toBe(45);
    });
});

describe('connector-backed actions', () => {
    it('switches to a public source capture with only a URL parameter and no client endpoint', async () => {
        const user = setupUser(); const { last } = renderEditor(defaultBusinessAction());
        await user.selectOptions(screen.getByLabelText('Action type'), 'firecrawl');
        expect(last()).toEqual({ provider: 'firecrawl', binding: '', max_seconds: 30, parameters: { url: '' } });
        expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();
        expect(screen.getByText(/must have a registered worker/)).toBeInTheDocument();
        await user.type(screen.getByLabelText('Public HTTPS source'), 'https://e.x');
        expect(last().parameters).toEqual({ url: 'https://e.x' });
    });

    it('accepts only a JSON object as registered n8n operation input', async () => {
        const user = setupUser(); const { last } = renderEditor(defaultBusinessAction());
        await user.selectOptions(screen.getByLabelText('Action type'), 'n8n');
        expect(last()).toEqual({ provider: 'n8n', binding: '', max_seconds: 30, parameters: { operation: '', input: {} } });
        await user.type(screen.getByLabelText('Registered operation'), 'sync');
        expect(last().parameters.operation).toBe('sync');

        const input = screen.getByLabelText('Operation input (JSON)');
        expect(input).toHaveValue('{}');
        await user.clear(input); await user.type(input, '[[1]');
        expect(screen.getByText('Enter a JSON object before adding this step.')).toHaveAttribute('role', 'alert');
        expect(last().parameters.input).toBeNull();

        await user.clear(input); await user.type(input, '{{"limit": 5}');
        expect(screen.queryByText('Enter a JSON object before adding this step.')).not.toBeInTheDocument();
        expect(last().parameters.input).toEqual({ limit: 5 });

        await user.clear(input); await user.type(input, 'not json');
        expect(screen.getByText('Enter a JSON object before adding this step.')).toBeInTheDocument();
        expect(last().parameters.input).toBeNull();
    });

    it('clears a JSON error and restores the full ERP defaults when switching back to a task', async () => {
        const user = setupUser(); const { last } = renderEditor(defaultBusinessAction());
        await user.selectOptions(screen.getByLabelText('Action type'), 'n8n');
        const input = screen.getByLabelText('Operation input (JSON)');
        await user.clear(input); await user.type(input, 'oops');
        expect(screen.getByText('Enter a JSON object before adding this step.')).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Action type'), 'erp');
        expect(last()).toEqual(defaultBusinessAction());
        expect(screen.queryByText('Enter a JSON object before adding this step.')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Task title')).toHaveValue('');
    });
});
