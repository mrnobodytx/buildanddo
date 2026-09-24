// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/RoadmapPage.activity.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/RoadmapPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/RoadmapPage.jsx
// Intent:      An activity row links its evidence only when the projection gave a web address, and states
//              the rest as text instead of rendering a broken link.
// ───────────────────────────────────────────────────────────────

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityEvidence } from '../RoadmapPage';

describe('activity evidence', () => {
    it('links a web address', () => {
        render(<ActivityEvidence id="github.buildanddo" evidence="https://github.com/mrnobodytx/buildanddo/commits" />);
        expect(screen.getByRole('link', { name: 'evidence' })).toHaveAttribute('href', 'https://github.com/mrnobodytx/buildanddo/commits');
    });

    it('states a source a visitor cannot open as text, not as a broken link', () => {
        render(<ActivityEvidence id="gitlab.pipelines" evidence="private control plane (not published)" />);
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.getByText('private control plane (not published)')).toBeInTheDocument();
    });

    it('renders nothing when there is no evidence', () => {
        const { container } = render(<ActivityEvidence id="guildmaster.forge" evidence={null} />);
        expect(container).toBeEmptyDOMElement();
    });
});
