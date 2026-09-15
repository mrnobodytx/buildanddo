// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/__tests__/DialogFocus.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/ui/dialog.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/components/ui/dialog.jsx
// DAG Node:    none
// Intent:      Verify keyboard trapping and focus return for real workspace dialogs opened without a trigger wrapper.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import MissionsPage from '@/pages/workspace/MissionsPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
beforeEach(() => pb.__reset());

describe('programmatically opened workspace dialogs', () => {
    it('traps Tab focus and restores the exact initiating button on Escape', async () => {
        const user = setupUser();
        renderWithProviders(<MissionsPage />);
        const trigger = (await screen.findAllByRole('button', { name: /start a mission/i }))[0];
        await user.click(trigger);
        const dialog = screen.getByRole('dialog');
        for (let i = 0; i < 18; i++) {
            await user.tab();
            expect(dialog).toContainElement(document.activeElement);
        }
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(trigger).toHaveFocus();
        expect(pb.collection('missions').create).not.toHaveBeenCalled();
    });
});
