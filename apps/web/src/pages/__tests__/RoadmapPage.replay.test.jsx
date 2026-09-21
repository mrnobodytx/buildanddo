// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/RoadmapPage.replay.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/pages/RoadmapPage.jsx, scripts/ci/sprint_replay.py
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/RoadmapPage.jsx
// Intent:      Hold the public replay panel to the rule the whole day-21 mechanism rests
//              on - that what was not checked never renders as though it had been.
// ───────────────────────────────────────────────────────────────

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReplayVerdict } from '../RoadmapPage';

const entry = (over = {}) => ({
    day: 1,
    verdict: 'HOLDS',
    claims: { held: 2, rotted: 0, external: 1, unmeasurable: 0 },
    rot: [],
    ...over,
});

describe('the replay panel never invents a pass', () => {
    it('renders NOTHING when the projection carried no replay', () => {
        // The failure that would matter: a page that defaults to a green verdict is
        // asserting exactly the thing the replay exists to stop anyone asserting.
        const { container } = render(<ReplayVerdict entry={undefined} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('stays silent for a milestone that was never verified', () => {
        const { container } = render(<ReplayVerdict entry={entry({ verdict: 'NOT_VERIFIED' })} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('says UNCHECKED out loud rather than leaving it to look like a pass', () => {
        // This is where evidence that names nothing re-checkable lands - the case
        // sprint_cycle.py scored as full credit.
        render(<ReplayVerdict entry={entry({ verdict: 'UNCHECKED', claims: {} })} />);
        expect(screen.getByText(/Replay: UNCHECKED/)).toBeInTheDocument();
        expect(screen.getByText(/names nothing re-checkable/)).toBeInTheDocument();
    });
});

describe('what it shows', () => {
    it('prints the claim tally so a verdict is never just a colour', () => {
        render(<ReplayVerdict entry={entry()} />);
        expect(screen.getByText(/Replay: HOLDS/)).toBeInTheDocument();
        expect(screen.getByText(/2 held, 0 rotted, 1 external, 0 unmeasurable/)).toBeInTheDocument();
    });

    it('names each rotted claim WITH its reason', () => {
        // A rot reduced to a red pill is unactionable; the reason is the finding.
        render(<ReplayVerdict entry={entry({
            verdict: 'ROTTED',
            claims: { held: 1, rotted: 1, external: 0, unmeasurable: 0 },
            rot: [{ kind: 'repo_path', ref: 'apps/web/public/.well-known/citadel-release.json',
                reason: 'not in the working tree, nor in cited commit(s) d2d5f83' }],
        })} />);
        expect(screen.getByText(/citadel-release\.json/)).toBeInTheDocument();
        expect(screen.getByText(/nor in cited commit\(s\) d2d5f83/)).toBeInTheDocument();
    });

    it('tolerates a tally the projection did not fill in', () => {
        // An older roadmap-status.json must degrade to zeroes, not to a crash that takes
        // the whole roadmap page down with it.
        render(<ReplayVerdict entry={{ day: 3, verdict: 'HOLDS' }} />);
        expect(screen.getByText(/0 held, 0 rotted/)).toBeInTheDocument();
    });
});
