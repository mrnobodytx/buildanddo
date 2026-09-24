// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/RoadmapPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/pages/workspace/RoadmapPage.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/pages/workspace/RoadmapPage.jsx
// DAG Node:    none
// Intent:      Regress the broken roadmap route and enforce evidence-backed completion in user flows.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoadmapPage from '@/pages/workspace/RoadmapPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
beforeEach(() => pb.__reset());

describe('workspace roadmap', () => {
    it('creates a real item through its form handler', async () => {
        const user = setupUser();
        renderWithProviders(<RoadmapPage />);
        await screen.findByText('No roadmap items yet');
        await user.click(screen.getAllByRole('button', { name: 'New item' })[0]);
        await user.type(screen.getByLabelText('Title'), 'Improve appointment follow-up');
        await user.click(screen.getByRole('button', { name: 'Save item' }));
        await waitFor(() =>
            expect(pb.collection('roadmap_items').create).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Improve appointment follow-up',
                    status: 'proposed',
                    workspace: 'ws_test',
                }),
            ),
        );
        expect(await screen.findByText('Improve appointment follow-up')).toBeVisible();
    });

    it('requires evidence before creating a verified item', async () => {
        const user = setupUser();
        renderWithProviders(<RoadmapPage />);
        await screen.findByText('No roadmap items yet');
        await user.click(screen.getAllByRole('button', { name: 'New item' })[0]);
        await user.type(screen.getByLabelText('Title'), 'Measure reminder results');
        await user.click(screen.getByRole('combobox', { name: 'Status', exact: true }));
        await user.click(screen.getByRole('option', { name: 'Verified', exact: true }));
        await user.click(screen.getByRole('button', { name: 'Save item' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'cannot be marked Verified without an evidence reference',
        );
        expect(pb.collection('roadmap_items').create).not.toHaveBeenCalled();
        await user.type(screen.getByLabelText('Evidence link / record'), 'evidence-record-1');
        await user.click(screen.getByRole('button', { name: 'Save item' }));
        await waitFor(() =>
            expect(pb.collection('roadmap_items').create).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'verified', evidence_ref: 'evidence-record-1' }),
            ),
        );
    });

    it('does not count an unsubstantiated verified status as completion', async () => {
        pb.__setRecords('roadmap_items', [
            { id: 'one', workspace: 'ws_test', title: 'Unsubstantiated', status: 'verified', evidence_ref: '' },
            { id: 'two', workspace: 'ws_test', title: 'Withdrawn', status: 'archived', evidence_ref: 'receipt' },
        ]);
        renderWithProviders(<RoadmapPage />);
        expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });
});
