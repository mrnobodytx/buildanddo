// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/SignalsPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/pages/workspace/SignalsPage.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/SignalsPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Protect the provenance contract — every signal must keep showing
//              whether it is a fact, an inference or user-supplied, plus its
//              source and confidence.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import SignalsPage from '@/pages/workspace/SignalsPage';
import {
    createMockSignal,
    isoMinutesAgo,
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
    within,
} from '@/test/utils';

const signalList = () => screen.getByRole('list');

const openDialog = async (user) => {
    await user.click(await screen.findByRole('button', { name: 'Add signal' }));
    return within(await screen.findByRole('dialog'));
};

describe('SignalsPage', () => {
    beforeEach(() => {
        pb.__reset();
    });

    it('renders the page header', async () => {
        pb.__setRecords('signals', []);
        renderWithProviders(<SignalsPage />);

        expect(
            await screen.findByRole('heading', { name: 'Signals', level: 1 }),
        ).toBeInTheDocument();
    });

    it('does not flash an empty state while records are still loading', () => {
        pb.__setRecords('signals', [createMockSignal()]);
        renderWithProviders(<SignalsPage />);

        expect(screen.queryByText('No signals collected yet')).not.toBeInTheDocument();
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('explains what signals are when none have been collected', async () => {
        pb.__setRecords('signals', []);
        renderWithProviders(<SignalsPage />);

        expect(await screen.findByText('No signals collected yet')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add a signal' }),
        ).toBeInTheDocument();
    });

    it('labels every signal with its provenance type', async () => {
        pb.__setRecords('signals', [
            createMockSignal({ title: 'No-show rate up', type: 'fact' }),
            createMockSignal({ title: 'Likely cause is weather', type: 'inference' }),
            createMockSignal({ title: 'Van is in the shop', type: 'user' }),
        ]);
        renderWithProviders(<SignalsPage />);

        const list = within(await waitFor(signalList));
        expect(list.getAllByRole('listitem')).toHaveLength(3);
        expect(list.getByText('Fact')).toBeInTheDocument();
        expect(list.getByText('Inference')).toBeInTheDocument();
        expect(list.getByText('User-provided')).toBeInTheDocument();
    });

    it('shows source, relative age and rounded confidence', async () => {
        pb.__setRecords('signals', [
            createMockSignal({
                title: 'No-show rate up',
                source: 'Appointment calendar',
                confidence: 71.6,
                created: isoMinutesAgo(5),
            }),
        ]);
        renderWithProviders(<SignalsPage />);

        const list = within(await waitFor(signalList));
        expect(list.getByText('Source: Appointment calendar')).toBeInTheDocument();
        expect(list.getByText('5m ago')).toBeInTheDocument();
        expect(list.getByText('Confidence: 72%')).toBeInTheDocument();
    });

    it('falls back to an em dash rather than inventing a source', async () => {
        pb.__setRecords('signals', [
            createMockSignal({ source: '', confidence: null }),
        ]);
        renderWithProviders(<SignalsPage />);

        const list = within(await waitFor(signalList));
        expect(list.getByText('Source: \u2014')).toBeInTheDocument();
        expect(list.queryByText(/Confidence:/)).not.toBeInTheDocument();
    });

    it('opens the record dialog with every provenance field', async () => {
        const user = setupUser();
        pb.__setRecords('signals', []);
        renderWithProviders(<SignalsPage />);

        const dialog = await openDialog(user);

        expect(dialog.getByLabelText('Title')).toBeInTheDocument();
        expect(dialog.getByLabelText('Description')).toBeInTheDocument();
        expect(dialog.getByLabelText('Source')).toBeInTheDocument();
        expect(dialog.getByLabelText(/Confidence/)).toBeInTheDocument();
        // Two selects: provenance type and triage severity.
        expect(dialog.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
        expect(dialog.getByRole('combobox', { name: 'Severity' })).toBeInTheDocument();
        expect(dialog.getAllByRole('combobox')).toHaveLength(2);
    });

    it('refuses to save a signal without a title', async () => {
        const user = setupUser();
        pb.__setRecords('signals', []);
        renderWithProviders(<SignalsPage />);

        const dialog = await openDialog(user);
        await user.click(dialog.getByRole('button', { name: 'Save signal' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Give the signal a short title.',
        );
        expect(pb.__collection('signals').create).not.toHaveBeenCalled();
    });

    it('saves a signal as a new medium-severity fact with a numeric confidence', async () => {
        const user = setupUser();
        pb.__setRecords('signals', []);
        renderWithProviders(<SignalsPage />);

        const dialog = await openDialog(user);
        await user.type(dialog.getByLabelText('Title'), 'No-show rate up');
        await user.type(dialog.getByLabelText('Description'), 'Four missed visits.');
        await user.type(dialog.getByLabelText('Source'), 'Appointment calendar');
        await user.type(dialog.getByLabelText(/Confidence/), '72');
        await user.click(dialog.getByRole('button', { name: 'Save signal' }));

        await waitFor(() =>
            expect(pb.__collection('signals').create).toHaveBeenCalledWith({
                title: 'No-show rate up',
                description: 'Four missed visits.',
                source: 'Appointment calendar',
                type: 'fact',
                severity: 'medium',
                state: 'new',
                confidence: 72,
                workspace: 'ws_test',
                owner: 'user_test',
            }),
        );
        expect(await screen.findByText('No-show rate up')).toBeInTheDocument();
    });

    it('stores a null confidence rather than zero when the field is left blank', async () => {
        const user = setupUser();
        pb.__setRecords('signals', []);
        renderWithProviders(<SignalsPage />);

        const dialog = await openDialog(user);
        await user.type(dialog.getByLabelText('Title'), 'Van is in the shop');
        await user.click(dialog.getByRole('button', { name: 'Save signal' }));

        await waitFor(() =>
            expect(pb.__collection('signals').create).toHaveBeenCalledWith(
                expect.objectContaining({ confidence: null }),
            ),
        );
    });

    it('reports the server message when saving is rejected', async () => {
        const user = setupUser();
        pb.__setRecords('signals', []);
        renderWithProviders(<SignalsPage />);

        const dialog = await openDialog(user);
        await user.type(dialog.getByLabelText('Title'), 'No-show rate up');

        pb.__setError('signals', Object.assign(new Error('nope'), {
            response: { message: 'Failed to create record.' },
        }));
        await user.click(dialog.getByRole('button', { name: 'Save signal' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Failed to create record.',
        );
    });
});
