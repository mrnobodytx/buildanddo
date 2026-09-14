// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/__tests__/ProgressionSummary.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/roadmap/ProgressionSummary.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/roadmap/ProgressionSummary.jsx
// Intent:      The glance headlines the LIVE day with its source (never as
//              doubt), keeps the axes separate and dated, marks a stale
//              projection measured-days-ago rather than current, and still
//              shows the live day when the projection is UNMEASURED.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ProgressionSummary from '@/components/roadmap/ProgressionSummary';
import { progressionOf } from '@/lib/roadmapStatus';
import { progressionFixture, statusFixture } from '@/test/roadmapFixtures';

const NOW = Date.parse('2026-09-11T12:00:00Z');

describe('ProgressionSummary', () => {
    it('headlines the live day with its source, stated as provenance not doubt', () => {
        render(<ProgressionSummary progression={progressionOf(statusFixture(), { now: NOW })} />);
        expect(screen.getByTestId('progression-summary')).toHaveAttribute('data-state', 'MEASURED');
        expect(screen.getByTestId('progression-summary-day-value')).toHaveTextContent('D11 / 21');
        expect(screen.getByTestId('progression-summary-day-source')).toHaveTextContent('operator anchor rule');
    });

    it('shows measured, verified and plan as separate axes, never one score', () => {
        render(<ProgressionSummary progression={progressionOf(statusFixture(), { now: NOW })} />);
        expect(screen.getByText('56.8%')).toBeInTheDocument(); // measured
        expect(screen.getByText('20%')).toBeInTheDocument();   // verified
        expect(screen.getByText('50%')).toBeInTheDocument();   // plan target
    });

    it('marks a stale projection as measured-days-ago, dated, not current', () => {
        const stale = progressionOf(
            statusFixture(progressionFixture({ generated_at: '2026-09-08T06:00:00+00:00', current_date: '2026-09-08', stale_days: 2 })),
            { now: NOW },
        );
        render(<ProgressionSummary progression={stale} />);
        expect(screen.getByTestId('progression-summary')).toHaveAttribute('data-state', 'STALE');
        expect(screen.getByTestId('progression-summary-state')).toHaveTextContent(/measured\s+\d+\s+days?\s+ago/i);
        expect(screen.getByTestId('progression-summary-note')).toHaveTextContent(/not recomputed for the live day/i);
    });

    it('says UNMEASURED plainly and still shows the live day counted from the anchor', () => {
        const un = progressionOf(
            statusFixture(progressionFixture({ state: 'UNMEASURED', reason: 'PROGRESSION_FILE_ABSENT', measured_pct: undefined })),
            { now: NOW },
        );
        render(<ProgressionSummary progression={un} />);
        expect(screen.getByTestId('progression-summary')).toHaveAttribute('data-state', 'UNMEASURED');
        expect(screen.getByTestId('progression-summary-unmeasured')).toBeInTheDocument();
        expect(screen.getByTestId('progression-summary-day-value')).toHaveTextContent(/D(\d\d|--) \/ 21/);
    });
});
