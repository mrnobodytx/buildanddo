// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/KnowledgeContext.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/workspace/KnowledgeContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/KnowledgeContext.jsx
// Intent:      Hold the knowledge context to rendering absence as absence, because the payload it
//              is handed does not always carry one and it used to take the whole page down.
// ───────────────────────────────────────────────────────────────

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KnowledgeContextResults } from '@/components/workspace/KnowledgeContext';

const packet = (sources) => JSON.stringify({ sources });
const source = {
    citation: 'bdo://evidence/1', title: 'A cited source', state: 'VERIFIED', content: 'body text',
    provenance: { updated_at: '2026-09-20T00:00:00Z' }, truncated: false,
};

describe('KnowledgeContextResults', () => {
    it('renders the citations it was given', () => {
        // The control. If this ever stops passing, the tests below are measuring a broken
        // component rather than a defended one, and their green means nothing.
        render(<KnowledgeContextResults context={{ text: packet([source]), characters: 120, max_chars: 8000 }} />);
        expect(screen.getByText('A cited source')).toBeInTheDocument();
        expect(screen.getByText(/1 cited sources/)).toHaveTextContent('120 / 8,000 character budget');
    });

    it('renders absence when the payload carries no context at all', () => {
        // THE DEFECT THIS FILE EXISTS FOR. workspace-assistant.js returns the graph without a
        // `context` key, the page rendered this anyway, and JSON.parse(undefined.text) replaced
        // the whole of Knowledge & context with an error card - on a backend answering 200.
        expect(() => render(<KnowledgeContextResults context={undefined} />)).not.toThrow();
        expect(screen.getByRole('status')).toHaveTextContent('No context has been assembled');
    });

    it('renders absence rather than throwing when the context has no text', () => {
        expect(() => render(<KnowledgeContextResults context={{ characters: 0 }} />)).not.toThrow();
        expect(screen.getByRole('status')).toHaveTextContent('No context has been assembled');
    });

    it('says so out loud when the packet will not parse', () => {
        // Unreadable is NOT the same as absent: one is a fault an operator should see, the other
        // is an ordinary empty state. Rendering both as blank is how the page hid this for weeks.
        render(<KnowledgeContextResults context={{ text: '{not json', characters: 1, max_chars: 2 }} />);
        expect(screen.getByRole('alert')).toHaveTextContent('could not be read');
    });

    it('treats a parsed packet with no sources array as unreadable, not as empty', () => {
        render(<KnowledgeContextResults context={{ text: '{"nope":true}', characters: 1, max_chars: 2 }} />);
        expect(screen.getByRole('alert')).toHaveTextContent('could not be read');
    });

    it('reports an unknown budget instead of crashing on absent counters', () => {
        expect(() => render(<KnowledgeContextResults context={{ text: packet([]) }} />)).not.toThrow();
        expect(screen.getByText(/character budget unknown/)).toBeInTheDocument();
    });
});
