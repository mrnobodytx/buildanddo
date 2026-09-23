// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/__tests__/HostingerChallengePage.test.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001, VCC-BUILDANDDO-UPGRADE-001
// Seat:        CLA-INSTALLER
// Owner:       Citadel Nexus Inc.
// Depends:     apps/web/src/pages/HostingerChallengePage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/HostingerChallengePage.jsx
// Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
// ───────────────────────────────────────────────────────────────
import React from 'react';
import { describe, expect, it } from 'vitest';
import HostingerChallengePage from '@/pages/HostingerChallengePage';
import { renderWithProviders, screen } from '@/test/utils';

describe('HostingerChallengePage', () => {
    it('states the focused judge story and exposes the real CTAs', async () => {
        renderWithProviders(<HostingerChallengePage />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Learn by doing. Verify what you did. Do it together.');
        for (const link of screen.getAllByRole('link', { name: /Bring a project challenge/i })) {
            expect(link).toHaveAttribute('href', '/#challenge-desk');
        }
        expect(screen.getByRole('link', { name: /Create an account/i })).toHaveAttribute('href', '/signup');
    });

    it('names all four Hostinger challenge products', () => {
        renderWithProviders(<HostingerChallengePage />);
        for (const name of ['Unlimited Web Hosting', 'Hostinger Agents', 'Hostinger AI Builder', 'VPS KVM 1']) {
            expect(screen.getByText(name, { selector: 'h3' })).toBeVisible();
        }
    });

    it('does not present architecture text as verification', () => {
        renderWithProviders(<HostingerChallengePage />);
        expect(screen.getByText(/not a self-issued verification/i)).toBeVisible();
    });
});
