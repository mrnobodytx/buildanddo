// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/RoadmapPage.capabilities.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/pages/RoadmapPage.jsx, scripts/ci/capability_inventory.py
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/RoadmapPage.jsx
// Intent:      Keep the capability inventory from ever claiming something is usable that the
//              measurement did not say is usable.
// ───────────────────────────────────────────────────────────────

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CapabilityInventory } from '../RoadmapPage';

const report = (over = {}) => ({
    state: 'MEASURED',
    deployed: { production: '0b9faeb', staging: 'c07ca7e' },
    counts: { LIVE: 1, STAGED: 1, BUILT: 0, UNMEASURABLE: 0, DECLARED: 0 },
    total: 2,
    with_tests: 1,
    readiness_basis: 'presence of the source file in the commit each environment reports serving',
    capabilities: [
        { path: '/app/signals', label: 'Signals', state: 'LIVE', tests: 1, lines: 483 },
        { path: '/app/fleet', label: 'Fleet', state: 'STAGED', tests: 0, lines: 522 },
    ],
    ...over,
});

describe('the inventory never invents readiness', () => {
    it('renders NOTHING when nothing was measured', () => {
        // An empty capability list would read as "there is nothing", which is a different claim
        // from "we could not measure" - and the wrong one to make on a public page.
        const { container } = render(<CapabilityInventory report={{ state: 'UNMEASURED' }} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when no report arrived at all', () => {
        const { container } = render(<CapabilityInventory report={undefined} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when the report is measured but carries no capabilities', () => {
        const { container } = render(
            <CapabilityInventory report={report({ capabilities: [], counts: {} })} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('what it tells a reader', () => {
    it('separates what is usable now from what is only built', () => {
        render(<CapabilityInventory report={report()} />);
        expect(screen.getByText('Ready to use')).toBeInTheDocument();
        expect(screen.getByText('Built, waiting to ship')).toBeInTheDocument();
        expect(screen.getByText('Signals')).toBeInTheDocument();
        expect(screen.getByText('Fleet')).toBeInTheDocument();
    });

    it('names the commit each environment is serving, so the claim is checkable', () => {
        render(<CapabilityInventory report={report()} />);
        expect(screen.getByText(/production 0b9faeb/)).toBeInTheDocument();
        expect(screen.getByText(/staging c07ca7e/)).toBeInTheDocument();
    });

    it('says plainly that a staged capability needs a promote, not more building', () => {
        render(<CapabilityInventory report={report()} />);
        expect(screen.getByText(/closes on a promote, not on more building/)).toBeInTheDocument();
    });

    it('does not nag about a promote when nothing is waiting', () => {
        render(<CapabilityInventory report={report({
            counts: { LIVE: 1, STAGED: 0 },
            capabilities: [{ path: '/app/signals', label: 'Signals', state: 'LIVE', tests: 1 }],
        })} />);
        expect(screen.queryByText(/closes on a promote/)).not.toBeInTheDocument();
    });

    it('marks an untested capability as untested rather than leaving it blank', () => {
        // "no tests" beside a live capability is information; a blank space is not.
        render(<CapabilityInventory report={report()} />);
        expect(screen.getByText(/no tests/)).toBeInTheDocument();
    });

    it('publishes what readiness was derived from', () => {
        // The basis travels with the claim, so a reader can judge it instead of trusting a colour.
        render(<CapabilityInventory report={report()} />);
        expect(screen.getByText(/^presence of the source file in the commit/)).toBeInTheDocument();
    });
});
