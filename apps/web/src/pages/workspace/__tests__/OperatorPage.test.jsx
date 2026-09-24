// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/OperatorPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-PUBLIC-REDACTION-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/pages/workspace/OperatorPage.jsx, tests/upgrade/operator-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/OperatorPage.jsx; CONSUMES tests/upgrade/operator-fixture.mjs
// DAG Node:    none
// Intent:      Exercise scoped operator reads, inert plan review, explicit proposal recovery and immediate removal of inaccessible workspace state.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OperatorPage from '@/pages/workspace/OperatorPage';
import WorkspaceAccessContext from '@/contexts/WorkspaceAccessContext';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { canonicalPolicy } from '@/lib/policyIntelligence';
import { OPERATOR_MAX_BYTES } from '@/lib/operatorPlane';
import { act, cleanup, renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';
import { operatorFixture, operatorPlan } from '../../../../../../tests/upgrade/operator-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));

let backend; let plan;
const page = (canWrite = true, error = '') => <WorkspaceAccessContext.Provider value={{
    data: { can_write: canWrite }, loading: false, error, refresh: vi.fn(),
}}><OperatorPage /></WorkspaceAccessContext.Provider>;
const renderPage = (actor = 'editor') => {
    pb.authStore.record = { id: actor };
    return renderWithProviders(page(actor !== 'viewer'), { auth: { user: { id: actor }, isAuthed: true },
        workspace: { active: { id: 'ws1', owner: 'owner' } }, route: '/app/operator' });
};
const route = (path, options) => {
    const event = backend.event(pb.authStore.record.id, options.body || {}, { workspace: path.split('/')[4], query: options.query || {} });
    return plain(options.method === 'GET' ? backend.operator.snapshot(event) : backend.service.command(event));
};
const fileFor = (raw, read = async () => raw) => {
    const file = new File([raw], 'operator-blueprint.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: read }); return file;
};
const load = async (user) => {
    await user.upload(screen.getByLabelText('Operator blueprint JSON'), fileFor(canonicalPolicy(plan)));
    return screen.findByRole('region', { name: 'Imported build plan' });
};
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve: (value) => resolve(value) };
};
const readBlob = (blob) => new Promise((resolve) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob);
});

beforeAll(() => {
    plan = operatorPlan({ problem: 'Inspect Cultural Property source requirements. <script>globalThis.operatorExecuted=true</script>' });
});
beforeEach(() => {
    setDemoMode(false); backend = operatorFixture(); pb.send.mockImplementation(route);
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL = vi.fn(() => 'blob:operator-plan');
        static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); setDemoMode(false); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('OperatorPage', () => {
    it('renders economic unknowns and switches all three lenses without new reads or writes', async () => {
        const user = setupUser(); renderPage();
        const values = await screen.findByRole('region', { name: 'Business value' });
        expect(values).toHaveTextContent('Value created');
        expect(values).toHaveTextContent('Hours returned');
        expect(values).toHaveTextContent('Work verified');
        expect(values).toHaveTextContent('Risk prevented');
        expect(values).toHaveTextContent('Automation rate');
        expect(within(values).getAllByText('Not yet measured')).toHaveLength(4);
        expect(values).not.toHaveTextContent('$4,820');
        expect(values).not.toHaveTextContent('68%');
        const reads = pb.send.mock.calls.length;
        await user.click(within(values).getByRole('button', { name: 'Operator', exact: true }));
        expect(within(values).getByRole('button', { name: 'Operator', exact: true })).toHaveAttribute('aria-pressed', 'true');
        expect(values).toHaveTextContent('Work and blockers');
        await user.click(within(values).getByRole('button', { name: 'Reviewer', exact: true }));
        expect(values).toHaveTextContent('Trace each outcome');
        expect(values).toHaveTextContent('Mission → action → evidence → reviewer → provider receipt → declared release.');
        const title = backend.app.findRecordById('missions', 'mission1').getString('title');
        await user.click(within(values).getByText(title, { exact: true }));
        expect(values).toHaveTextContent('Unresolved; link this record through its canonical owner.');
        expect(within(values).getAllByRole('link', { name: 'Open mission, evidence and replay export' })
            .some((link) => link.getAttribute('href') === '/app/missions?mission=mission1')).toBe(true);
        await user.click(within(values).getByRole('button', { name: 'Owner', exact: true }));
        expect(values).toHaveTextContent('What needs attention');
        expect(within(values).getAllByText('Not yet measured')).toHaveLength(4);
        expect(pb.send).toHaveBeenCalledTimes(reads);
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    });

    it('clears value lineage when a refreshed workspace read loses access', async () => {
        const user = setupUser(); renderPage();
        await screen.findByRole('region', { name: 'Business value' });
        backend.app.delete(backend.app.findRecordById('workspace_members', 'editormember'));
        await user.click(screen.getByRole('button', { name: 'Refresh workspace state' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Business value' })).not.toBeInTheDocument());
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    });

    it('prioritizes actual human decisions and reads existing state without writing', async () => {
        const before = JSON.stringify(backend.data); const user = setupUser(); renderPage();
        const decisions = await screen.findByRole('region', { name: 'Human decisions' });
        expect(decisions.closest('[data-dd-privacy="mask"]')).toHaveClass('ph-no-capture');
        expect(decisions).toHaveTextContent('Review permitted dataset');
        expect(decisions).toHaveTextContent('Dataset review');
        expect(decisions).not.toHaveTextContent('Incomplete plan');
        expect(within(decisions).getAllByRole('link').map((link) => link.getAttribute('href'))).toContain('/app/missions?mission=planned');
        await user.click(screen.getByText('Work and active missions'));
        expect(screen.getByRole('region', { name: 'Work queue' })).toHaveTextContent('Incomplete plan');
        expect(screen.getByRole('region', { name: 'Systems and evidence' })).toHaveTextContent('Firecrawl');
        expect(screen.getByRole('region', { name: 'Systems and evidence' })).toHaveTextContent('Configuration alone does not establish live health.');
        await user.click(screen.getByText('Recent changes and worker activity'));
        expect(screen.getByRole('region', { name: 'Worker activity' })).toHaveTextContent('Recorded activity does not establish available capacity.');
        expect(document.body).not.toHaveTextContent('Private source body');
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
        expect(JSON.stringify(backend.data)).toBe(before);
    });

    it('shows sampled coverage and pages each source without turning unavailable stores into zero work', async () => {
        for (let index = 0; index < 25; index++) backend.seed('missions', {
            id: `extra${index}`, workspace: 'ws1', owner: 'editor', title: `Recorded mission ${index}`, status: 'running',
        });
        backend.app.delete(backend.collections.suite_runs);
        const user = setupUser(); renderPage();
        const coverage = await screen.findByRole('region', { name: 'Source coverage' });
        expect(coverage).toHaveTextContent('Partial coverage.');
        expect(coverage).toHaveTextContent('at most 20 visible rows per source');
        expect(coverage).toHaveTextContent('suite_runs: unavailable');
        await user.click(screen.getByRole('button', { name: 'Next', exact: true }));
        await waitFor(() => expect(pb.send).toHaveBeenLastCalledWith(expect.stringContaining('/operator'), expect.objectContaining({ query: { page: 2 } })));
        expect(await screen.findByRole('region', { name: 'Source coverage' })).toHaveTextContent('missions: available · Page 2');
        expect(screen.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Previous', exact: true }));
        await waitFor(() => expect(pb.send).toHaveBeenLastCalledWith(expect.stringContaining('/operator'), expect.objectContaining({ query: { page: 1 } })));
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    });

    it('renders a real compiler plan as inert input and keeps future approvals out of live decisions', async () => {
        const user = setupUser(); renderPage();
        const decisions = await screen.findByRole('region', { name: 'Human decisions' });
        const liveDecisions = decisions.textContent;
        const imported = await load(user);
        expect(imported).toHaveTextContent('<script>globalThis.operatorExecuted=true</script>');
        expect(imported.querySelector('script')).toBeNull(); expect(globalThis.operatorExecuted).toBeUndefined();
        expect(screen.getByRole('region', { name: 'Opportunity deadlines' })).toHaveTextContent('Unknown (unverified)');
        await user.click(within(imported).getByText('Source reuse and capability gaps'));
        expect(imported).toHaveTextContent('Runtime readiness: unknown');
        expect(imported).toHaveTextContent('apps/research/documents.py');
        await user.click(within(imported).getByText('Proposed work and dependencies'));
        expect(screen.getByRole('list', { name: 'Planned dependencies' })).toHaveTextContent('→');
        await user.click(within(imported).getByText('Conditional approval gates'));
        expect(imported).toHaveTextContent('Approve pricing and financial commitments');
        expect(decisions.textContent).toBe(liveDecisions);
        await user.click(screen.getByRole('button', { name: 'Export build plan' }));
        const exported = JSON.parse(await readBlob(URL.createObjectURL.mock.calls[0][0]));
        expect(exported).toEqual(plan); expect(exported.verified).toBe(false); expect(exported.hosted_dispatches_created).toBe(0);
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    });

    it('rejects oversized or tampered replacements and clears the previously imported plan', async () => {
        const user = setupUser(); renderPage(); await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        const oversized = fileFor('{}'); Object.defineProperty(oversized, 'size', { value: OPERATOR_MAX_BYTES + 1 });
        await user.upload(screen.getByLabelText('Operator blueprint JSON'), oversized);
        expect(await screen.findByRole('alert')).toHaveTextContent('Choose a nonempty blueprint JSON file');
        expect(screen.queryByRole('region', { name: 'Imported build plan' })).not.toBeInTheDocument();
        await load(user);
        await user.upload(screen.getByLabelText('Operator blueprint JSON'), fileFor(canonicalPolicy({ ...plan, verified: true })));
        expect(await screen.findByRole('alert')).toHaveTextContent('Use an unchanged operator-blueprint.json compiler export.');
        expect(screen.queryByRole('button', { name: 'Propose review mission' })).not.toBeInTheDocument();
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    });

    it('creates only an explicit proposed review mission and recovers an uncertain receipt', async () => {
        let lost = true;
        pb.send.mockImplementation((path, options) => {
            const result = route(path, options);
            if (options.method === 'POST' && lost) { lost = false; throw new Error('lost response'); }
            return result;
        });
        const before = backend.data.missions.length; const evidenceBefore = backend.data.evidence.length;
        const user = setupUser(); renderPage(); await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        expect(backend.data.missions).toHaveLength(before);
        await user.click(screen.getByRole('button', { name: 'Propose review mission' }));
        const recover = await screen.findByRole('button', { name: 'Recover previous proposal' });
        expect(backend.data.missions).toHaveLength(before + 1);
        expect(screen.getByRole('button', { name: 'Propose review mission' })).toBeDisabled();
        await user.click(recover);
        expect(await screen.findByText(/Review mission proposed:/)).toBeVisible();
        expect(backend.data.missions).toHaveLength(before + 1);
        expect(backend.data.missions.at(-1).status).toBe('proposed');
        expect(backend.data.missions.at(-1).mission_approved_by || '').toBe('');
        expect(backend.data.evidence).toHaveLength(evidenceBefore);
        expect(pb.send.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(2);
    });

    it('allows viewers to inspect and export while preventing proposals', async () => {
        const user = setupUser(); renderPage('viewer'); await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        expect(screen.getByRole('button', { name: 'Propose review mission' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Export build plan' }));
        expect(URL.createObjectURL).toHaveBeenCalledOnce();
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    });

    it('keeps an uncertain proposal recoverable after a failed refresh without retaining private data', async () => {
        let lost = true;
        pb.send.mockImplementation((path, options) => {
            const result = route(path, options);
            if (options.method === 'POST' && lost) { lost = false; throw new Error('lost response'); }
            return result;
        });
        const before = backend.data.missions.length; const user = setupUser(); renderPage();
        await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        await user.click(screen.getByRole('button', { name: 'Propose review mission' }));
        await screen.findByRole('button', { name: 'Recover previous proposal' });
        pb.send.mockImplementationOnce(() => { throw new Error('read unavailable'); });
        await user.click(screen.getByRole('button', { name: 'Refresh workspace state' }));
        await screen.findByText('The previous proposal needs recovery after workspace access is refreshed.');
        expect(screen.getByRole('button', { name: 'Recover previous proposal' })).toBeDisabled();
        expect(screen.queryByRole('region', { name: 'Imported build plan' })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Human decisions' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Refresh workspace state' }));
        await screen.findByRole('region', { name: 'Human decisions' });
        await user.click(screen.getByRole('button', { name: 'Recover previous proposal' }));
        expect(await screen.findByText(/Review mission proposed:/)).toBeVisible();
        expect(backend.data.missions).toHaveLength(before + 1);
    });

    it('requires fresh workspace observations before a review proposal', async () => {
        pb.send.mockImplementation((path, options) => {
            const result = route(path, options);
            if (options.method === 'GET') result.observed_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            return result;
        });
        const user = setupUser(); renderPage(); await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        expect(screen.getByText(/Freshness: stale/)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Propose review mission' })).toBeDisabled();
        expect(screen.getByText('Refresh current workspace access before proposing a review.')).toBeVisible();
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    });

    it('uses the refreshed role when the shared access context still permits writes', async () => {
        const user = setupUser(); renderPage(); await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        const member = backend.app.findRecordById('workspace_members', 'editormember'); member.set('role', 'viewer'); backend.app.save(member);
        await user.click(screen.getByRole('button', { name: 'Refresh workspace state' }));
        await screen.findByRole('region', { name: 'Human decisions' });
        expect(screen.getByRole('button', { name: 'Propose review mission' })).toBeDisabled();
        expect(pb.send.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    });

    it('removes private snapshots and imports after an access failure', async () => {
        const user = setupUser(); const rendered = renderPage();
        await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        backend.app.delete(backend.app.findRecordById('workspace_members', 'editormember'));
        await user.click(screen.getByRole('button', { name: 'Refresh workspace state' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Current workspace membership is required.');
        expect(screen.queryByRole('region', { name: 'Human decisions' })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Imported build plan' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Propose review mission' })).not.toBeInTheDocument();
        rendered.rerender(page(true, 'Workspace access was revoked.'));
        expect(screen.getByRole('alert')).toHaveTextContent('Workspace access was revoked.');
        expect(screen.queryByLabelText('Operator blueprint JSON')).not.toBeInTheDocument();
    });

    it('ignores a delayed workspace snapshot after the account and workspace change', async () => {
        const pending = deferred(); const oldSnapshot = backend.read();
        pb.send.mockImplementationOnce(() => pending.promise);
        const rendered = renderPage(); await waitFor(() => expect(pb.send).toHaveBeenCalledOnce());
        rendered.auth.user = { id: 'otherowner' }; rendered.workspace.active = { id: 'ws2' }; pb.authStore.record = { id: 'otherowner' };
        rendered.rerender(page());
        await screen.findByRole('region', { name: 'Human decisions' });
        await act(async () => { pending.resolve(oldSnapshot); });
        expect(screen.queryByRole('heading', { name: 'Review permitted dataset' })).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Human decisions' })).toHaveTextContent('No human decisions appear in this sample.');
    });

    it('ignores delayed file content after the workspace changes', async () => {
        const pending = deferred(); const user = setupUser(); const rendered = renderPage();
        await screen.findByRole('region', { name: 'Human decisions' });
        await user.upload(screen.getByLabelText('Operator blueprint JSON'), fileFor(canonicalPolicy(plan), () => pending.promise));
        expect(screen.getByRole('status')).toHaveTextContent('Reading build plan');
        rendered.workspace.active = { id: 'ws2' }; rendered.rerender(page());
        await act(async () => { pending.resolve(canonicalPolicy(plan)); });
        expect(screen.queryByRole('region', { name: 'Imported build plan' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Review permitted dataset' })).not.toBeInTheDocument();
    });

    it('discards a delayed proposal receipt when the observed role is revoked', async () => {
        const pending = deferred(); let receipt;
        pb.send.mockImplementation((path, options) => {
            const result = route(path, options);
            if (options.method === 'POST') { receipt = result; return pending.promise; }
            return result;
        });
        const user = setupUser(); const rendered = renderPage(); await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        await user.click(screen.getByRole('button', { name: 'Propose review mission' }));
        await waitFor(() => expect(receipt?.status).toBe('proposed'));
        const member = backend.app.findRecordById('workspace_members', 'editormember'); member.set('role', 'viewer'); backend.app.save(member);
        rendered.rerender(page(false));
        expect(screen.queryByRole('region', { name: 'Imported build plan' })).not.toBeInTheDocument();
        await act(async () => { pending.resolve(receipt); });
        expect(screen.queryByText(/Review mission proposed:/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Recover previous proposal' })).not.toBeInTheDocument();
    });

    it('discards live state on a demo change and never queries or writes in demo mode', async () => {
        const user = setupUser(); renderPage(); await screen.findByRole('region', { name: 'Human decisions' }); await load(user);
        const reads = pb.send.mock.calls.length;
        act(() => setDemoMode(true));
        expect(screen.getByRole('status')).toHaveTextContent('Demonstration mode: workspace state is not queried');
        expect(screen.queryByRole('region', { name: 'Human decisions' })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Imported build plan' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Propose review mission' })).not.toBeInTheDocument();
        expect(pb.send).toHaveBeenCalledTimes(reads);
    });
});
