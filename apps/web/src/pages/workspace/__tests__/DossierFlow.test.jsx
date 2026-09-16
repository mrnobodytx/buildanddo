// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/DossierFlow.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/pages/workspace/DossierPage.jsx, apps/web/src/components/workspace/DossierEditors.jsx, tests/upgrade/dossier-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/DossierPage.jsx; VALIDATES apps/web/src/components/workspace/DossierEditors.jsx; CONSUMES tests/upgrade/dossier-fixture.mjs
// DAG Node:    none
// Intent:      Exercise rendered private dossier editing, recall, deletion, keyboard dialogs and account transitions against the actual backend policy.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { act, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link } from 'react-router-dom';
import DossierPage from '@/pages/workspace/DossierPage';
import AuthContext from '@/contexts/AuthContext';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
import { dossierFixture } from '../../../../../../tests/upgrade/dossier-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
let backend;
const native = (path, options) => {
    const e = backend.event(pb.authStore.record.id, options.body);
    return plain(path.endsWith('/read') ? backend.service.read(e) : backend.service.command(e));
};
const renderPage = (actor = 'editor', route = '/app/dossier') => {
    pb.authStore.record = { id: actor };
    return renderWithProviders(<DossierPage />, { auth: { user: { id: actor, name: actor }, isAuthed: true }, route });
};
const fillEntity = async (user, label = 'Reading project') => {
    await user.click(await screen.findByRole('button', { name: 'Add entity' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Entity name'), label);
    await user.selectOptions(dialog.getByLabelText('Entity kind'), 'project');
    await user.type(dialog.getByLabelText('First note'), 'The reading room opens on Tuesday.');
    return dialog;
};
beforeEach(() => {
    act(() => setDemoMode(false)); backend = dossierFixture(); pb.authStore.record = { id: 'editor' }; pb.send.mockReset();
    pb.send.mockImplementation(async (path, options) => native(path, options));
});
afterEach(() => { act(() => setDemoMode(false)); vi.restoreAllMocks(); });

describe('personal dossier flows', () => {
    it('creates and recalls the same encrypted entity through its real commands', async () => {
        const user = setupUser(); const storage = vi.spyOn(Storage.prototype, 'setItem'); renderPage();
        const dialog = await fillEntity(user);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-dd-privacy', 'hidden');
        expect(screen.getByRole('dialog')).toHaveAttribute('data-dd-action-name', 'Private dossier interaction');
        await user.type(dialog.getByLabelText(/Aliases/), 'Library room');
        await user.type(dialog.getByLabelText(/Tags/), 'Learning, Schedule');
        await user.type(dialog.getByLabelText('Source label (optional)'), 'My interview');
        await user.type(dialog.getByLabelText('Public HTTPS source (optional)'), 'https://buildanddo.tech/docs');
        await user.click(dialog.getByRole('button', { name: 'Save entity', exact: true }));
        expect(await screen.findByText('Saved notes (1/20)')).toBeVisible();
        expect(backend.data.dossier_entities).toHaveLength(1);
        expect(JSON.stringify(backend.data.dossier_entities)).not.toContain('Reading project');
        expect(screen.getByRole('link', { name: 'My interview' })).toHaveAttribute('href', 'https://buildanddo.tech/docs');
        expect(screen.getByRole('link', { name: 'My interview' })).toHaveAttribute('data-dd-action-name', 'Open dossier source');
        expect(screen.getByText('Also known as: Library room')).toBeVisible();
        await user.type(screen.getByLabelText(/Search names/), 'Library Tuesday');
        await user.click(screen.getByRole('button', { name: 'Recall', exact: true }));
        expect(await screen.findByText('1 match · page 1')).toBeVisible();
        expect(JSON.stringify(storage.mock.calls)).not.toContain('Tuesday');
    });

    it('recovers a lost save from inside the dialog without creating another entity', async () => {
        const user = setupUser(); renderPage(); const dialog = await fillEntity(user); let lost = true;
        pb.send.mockImplementation(async (path, options) => {
            const result = native(path, options);
            if (!path.endsWith('/read') && lost) { lost = false; throw new Error('reply lost'); }
            return result;
        });
        await user.click(dialog.getByRole('button', { name: 'Save entity', exact: true }));
        expect(await dialog.findByRole('button', { name: 'Recover previous save' })).toBeEnabled();
        expect(dialog.getByLabelText('Entity name')).toHaveValue('Reading project');
        expect(dialog.getByRole('button', { name: 'Save entity', exact: true })).toBeDisabled();
        await user.click(dialog.getByRole('button', { name: 'Recover previous save' }));
        await waitFor(() => expect(backend.data.dossier_entities).toHaveLength(1));
        expect(await screen.findByRole('button', { name: 'Open entity Reading project' })).toBeVisible();
        expect(backend.data.dossier_events).toHaveLength(1);
    });

    it('corrects labels and notes, adds provenance and removes old text from recall', async () => {
        const first = backend.create(); const user = setupUser(); renderPage('editor', `/app/dossier?entity=${first.id}`);
        await user.click(await screen.findByRole('button', { name: 'Edit entity details' }));
        let dialog = within(screen.getByRole('dialog'));
        await user.clear(dialog.getByLabelText('Entity name')); await user.type(dialog.getByLabelText('Entity name'), 'Community library');
        await user.click(dialog.getByRole('button', { name: 'Save entity details' }));
        await user.click(await screen.findByRole('button', { name: 'Add note', exact: true }));
        dialog = within(screen.getByRole('dialog')); await user.type(dialog.getByLabelText('Note text'), 'Opening changed to Monday.');
        await user.type(dialog.getByLabelText('Source label (optional)'), 'Phone call');
        await user.click(dialog.getByRole('button', { name: 'Save note', exact: true }));
        expect(await screen.findByText('Saved notes (2/20)')).toBeVisible();
        const detail = () => within(screen.getByRole('region', { name: 'Selected private entity' }));
        let article = detail().getByText('Opening changed to Monday.').closest('article');
        await user.click(within(article).getByRole('button', { name: 'Correct note' }));
        dialog = within(screen.getByRole('dialog')); await user.clear(dialog.getByLabelText('Note text'));
        await user.type(dialog.getByLabelText('Note text'), 'Opening changed to Wednesday.');
        await user.click(dialog.getByRole('button', { name: 'Save corrected note' }));
        await waitFor(() => expect(detail().getByText('Opening changed to Wednesday.')).toBeVisible());
        expect(backend.read({ action: 'recall', query: 'Monday', page: 1 }).total).toBe(0);
        article = detail().getByText('Opening changed to Wednesday.').closest('article');
        await user.click(within(article).getByRole('button', { name: 'Remove note' }));
        dialog = within(screen.getByRole('dialog')); await user.type(dialog.getByLabelText('Confirm entity name'), 'Community library');
        await user.click(dialog.getByRole('button', { name: 'Confirm note removal' }));
        expect(await screen.findByText('Saved notes (1/20)')).toBeVisible();
        expect(backend.read({ action: 'recall', query: 'Wednesday', page: 1 }).total).toBe(0);
    });

    it('requires explicit deletion confirmation and refuses a stale reviewed revision', async () => {
        const saved = backend.create(); const user = setupUser(); renderPage('editor', `/app/dossier?entity=${saved.id}`);
        await user.click(await screen.findByRole('button', { name: 'Forget entity', exact: true }));
        let dialog = within(screen.getByRole('dialog')); expect(dialog.getByRole('button', { name: 'Confirm entity deletion' })).toBeDisabled();
        await user.type(dialog.getByLabelText('Confirm entity name'), 'Wrong'); expect(dialog.getByRole('button', { name: 'Confirm entity deletion' })).toBeDisabled();
        await user.click(dialog.getByRole('button', { name: 'Cancel' }));
        backend.command('note.add', { id: saved.id, text: 'A newer note.', source_url: '', source_label: '' }, { revision: 1 });
        await user.click(screen.getByRole('button', { name: 'Forget entity', exact: true }));
        dialog = within(screen.getByRole('dialog')); await user.type(dialog.getByLabelText('Confirm entity name'), 'Library project');
        await user.click(dialog.getByRole('button', { name: 'Confirm entity deletion' }));
        expect(await dialog.findByRole('alert')).toHaveTextContent(/record changed/);
        expect(backend.data.dossier_entities).toHaveLength(1); await user.keyboard('{Escape}');
        await user.click(screen.getByRole('button', { name: 'Refresh dossier' }));
        await user.click(await screen.findByRole('button', { name: 'Forget entity', exact: true }));
        dialog = within(screen.getByRole('dialog')); await user.type(dialog.getByLabelText('Confirm entity name'), 'Library project');
        await user.click(dialog.getByRole('button', { name: 'Confirm entity deletion' }));
        expect(await screen.findByText(/Your dossier is empty/)).toBeVisible(); expect(backend.data.dossier_entities).toHaveLength(0);
    });

    it('keeps note text inert and replaces detail when another entity link is opened', async () => {
        const a = backend.create({ note: '<script>untrusted text</script>' }); const b = backend.create({ label: 'Other entity', note: 'Different private context.' });
        const user = setupUser();
        renderWithProviders(<><DossierPage /><Link to={`/app/dossier?entity=${b.id}`}>Read the other entity</Link></>, {
            auth: { user: { id: 'editor' }, isAuthed: true }, route: `/app/dossier?entity=${a.id}`,
        });
        expect((await screen.findAllByText('<script>untrusted text</script>')).length).toBeGreaterThan(0);
        expect(document.querySelector('script')).toBeNull();
        await user.click(screen.getByRole('link', { name: 'Read the other entity' }));
        expect(await screen.findByRole('heading', { level: 2, name: 'Other entity' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Close entity' }));
        expect(screen.queryByText('Saved notes (1/20)')).not.toBeInTheDocument();
    });

    it('shows empty searches, pages results and returns focus when a dialog is cancelled', async () => {
        for (let n = 0; n < 12; n++) backend.create({ label: `Entity ${n}` });
        const user = setupUser(); renderPage(); await screen.findByText('12 matches · page 1');
        const pages = within(screen.getByRole('navigation', { name: 'Dossier entities pages' }));
        await user.click(pages.getByRole('button', { name: 'Next' })); expect(await screen.findByText('12 matches · page 2')).toBeVisible();
        await user.type(screen.getByLabelText(/Search names/), 'No such note'); await user.click(screen.getByRole('button', { name: 'Recall', exact: true }));
        expect(await screen.findByText('No saved entities match this search.')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Clear search' })); expect(await screen.findByText('12 matches · page 1')).toBeVisible();
        const add = screen.getByRole('button', { name: 'Add entity' }); await user.click(add);
        await user.keyboard('{Tab}'); expect(screen.getByRole('dialog')).toContainElement(document.activeElement);
        await user.keyboard('{Escape}'); await waitFor(() => expect(add).toHaveFocus());
    });

    it('edits personal context and shows content-free change history', async () => {
        const user = setupUser(); renderPage(); await screen.findByText(/Your dossier is empty/);
        await user.click(screen.getByText('Personal context')); await user.type(screen.getByLabelText('Your goals and context (private)'), 'Learn woodworking.');
        await user.click(screen.getByRole('button', { name: 'Save personal context' }));
        await waitFor(() => expect(backend.read().dossier.about).toBe('Learn woodworking.'));
        await user.click(screen.getByText('Change history')); expect(await screen.findByText(/Dossier updated · website/)).toBeVisible();
        expect(screen.queryByText(/old note text/i)).not.toBeInTheDocument();
    });

    it('denies another user’s entity and exposes unavailable encryption without an empty-success claim', async () => {
        const saved = backend.create(); renderPage('admin', `/app/dossier?entity=${saved.id}`);
        expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/);
        expect(screen.queryByText('Confirm the reading room opening hours.')).not.toBeInTheDocument();
    });

    it('recovers from missing backend encryption while keeping saves unavailable', async () => {
        backend.privateEnv.keys = ''; const user = setupUser(); renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent(/encryption binding/);
        expect(screen.queryByRole('button', { name: 'Add entity' })).not.toBeInTheDocument();
        backend.privateEnv.keys = JSON.stringify(backend.keys); await user.click(screen.getByRole('button', { name: 'Refresh dossier' }));
        expect(await screen.findByRole('button', { name: 'Add entity' })).toBeEnabled();
    });

    it('clears private queries before making a request under a different account', async () => {
        backend.create(); const requests = [];
        pb.send.mockImplementation(async (path, options) => { requests.push({ actor: pb.authStore.record.id, body: options.body }); return native(path, options); });
        function Switchable() {
            const [actor, setActor] = useState('editor');
            return <AuthContext.Provider value={{ user: { id: actor }, isAuthed: true }}><DossierPage />
                <button onClick={() => { pb.authStore.record = { id: 'admin' }; setActor('admin'); }}>Switch account</button>
            </AuthContext.Provider>;
        }
        const user = setupUser(); renderWithProviders(<Switchable />, { route: '/app/dossier' });
        await user.type(await screen.findByLabelText(/Search names/), 'private reading room');
        await user.click(screen.getByRole('button', { name: 'Recall', exact: true }));
        await user.click(screen.getByRole('button', { name: 'Switch account' }));
        expect(await screen.findByText(/Your dossier is empty/)).toBeVisible();
        expect(screen.getByLabelText(/Search names/)).toHaveValue('');
        expect(requests.filter((row) => row.actor === 'admin' && row.body.action === 'recall').every((row) => row.body.query === '')).toBe(true);
        expect(screen.queryByText('Library project')).not.toBeInTheDocument();
    });

    it('does not query or persist personal data in demonstration mode', async () => {
        act(() => setDemoMode(true)); renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent(/demonstration mode/);
        expect(pb.send).not.toHaveBeenCalled();
    });
});
