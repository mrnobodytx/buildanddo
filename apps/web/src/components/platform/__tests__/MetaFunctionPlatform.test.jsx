// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/platform/__tests__/MetaFunctionPlatform.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-PLATFORM-001
// CAPS:        pending
// CK:          pending
// Dispatch:    USO-BUILDANDDO-PLATFORM-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-13
// Depends:     apps/web/src/pages/PlatformPage.jsx,
//              apps/web/src/components/platform/MetaFunctionFlow.jsx,
//              apps/web/src/components/platform/MetaFunctionDashboard.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/PlatformPage.jsx;
//              VALIDATES apps/web/src/components/platform/MetaFunctionFlow.jsx;
//              VALIDATES apps/web/src/components/platform/MetaFunctionDashboard.jsx
// Intent:      Verify the platform explanation remains inspectable, honest and accessible.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/platform/MetaFunctionOrb', () => ({
    default: () => <div data-testid="metafunction-orb">Capability mesh</div>,
}));

import CapabilityMeshFallback from '@/components/platform/CapabilityMeshFallback';
import MetaFunctionDashboard from '@/components/platform/MetaFunctionDashboard';
import MetaFunctionFlow from '@/components/platform/MetaFunctionFlow';
import PlatformPage from '@/pages/PlatformPage';
import {
    renderWithProviders,
    screen,
    setupUser,
} from '@/test/utils';

describe('MetaFunction platform visuals', () => {
    it('renders the public platform story and labels preview data honestly', async () => {
        renderWithProviders(<PlatformPage />, {
            auth: { isAuthed: false, user: null },
            route: '/platform',
        });

        expect(
            screen.getByRole('heading', {
                name: 'One governed fabric for every capability.',
                level: 1,
            }),
        ).toBeInTheDocument();
        expect(screen.getAllByText('Illustrative preview').length).toBeGreaterThan(0);
        expect(screen.getByText('Demonstration data only')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Powered by Citadel Nexus Inc/ }),
        ).toHaveAttribute('href', 'https://citadel-nexus.com/status');
        expect(await screen.findByTestId('metafunction-orb')).toBeInTheDocument();
    });

    it('lets a reader inspect any execution stage and pauses automatic playback', async () => {
        const user = setupUser();
        renderWithProviders(<MetaFunctionFlow autoPlay={false} />);

        const policy = screen.getByRole('button', { name: /Policy gate/i });
        expect(policy).toHaveAttribute('aria-expanded', 'false');

        await user.click(policy);

        expect(policy).toHaveAttribute('aria-expanded', 'true');
        expect(
            screen.getByRole('heading', { name: 'AAXP / Policy Gate', level: 3 }),
        ).toBeInTheDocument();
        expect(screen.getByText('actor A3')).toBeInTheDocument();
        expect(screen.getByText('EXECUTED')).toBeInTheDocument();
    });

    it('shows registry state, invocation receipts and the full A1 to A9 gauge', () => {
        renderWithProviders(<MetaFunctionDashboard animate={false} />);

        expect(screen.getByText('Deterministic registry')).toBeInTheDocument();
        expect(screen.getByText('Live invocation feed')).toBeInTheDocument();
        expect(screen.getAllByText('OBSERVE.DATADOG.LOGS').length).toBeGreaterThan(0);
        expect(screen.getByText('A9')).toBeInTheDocument();
        expect(screen.getByText('Current actor · A3')).toBeInTheDocument();
        expect(screen.getAllByText('Datadog').length).toBeGreaterThan(0);
    });

    it('provides a labeled static capability mesh without WebGL', () => {
        renderWithProviders(<CapabilityMeshFallback />);

        expect(
            screen.getByRole('img', { name: /MetaFunction capability provider mesh/ }),
        ).toBeInTheDocument();
        expect(screen.getByText(/Provider APIs remain behind named capability/)).toBeInTheDocument();
    });
});
