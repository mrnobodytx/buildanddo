// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/roomGraph.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/roomGraph.js, apps/web/src/lib/workspaceRooms.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/roomGraph.js
// DAG Node:    none
// Intent:      Hold the room layout to the two vocabularies it actually receives, so a workspace room is a graph and not one unreadable row.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { layoutProjection } from '@/lib/roomGraph';

// The kinds workspaceRoom() emits, with the edge directions the knowledge hook
// records: evidence and research hang off a mission, and documents point at the
// vocabulary they were filed under.
const WORKSPACE_ROOM = {
    projection: 'organization',
    nodes: [
        { id: 'w/signals/a', type: 'signal', title: 'Signal A' },
        { id: 'w/evidence/a', type: 'evidence', title: 'Evidence A' },
        { id: 'w/evidence/b', type: 'evidence', title: 'Evidence B' },
        { id: 'w/research_submissions/a', type: 'research', title: 'Research A' },
        { id: 'w/missions/a', type: 'mission', title: 'Mission A' },
        { id: 'w/missions/b', type: 'mission', title: 'Mission B' },
        { id: 'w/wiki_pages/a', type: 'wiki', title: 'Wiki A' },
        { id: 'w/category/build', type: 'category', title: 'build' },
        { id: 'w/topic/rooms', type: 'topic', title: 'rooms' },
    ],
    edges: [
        { source: 'w/evidence/a', target: 'w/missions/a', relation: 'EVIDENCE_FOR' },
        { source: 'w/evidence/b', target: 'w/research_submissions/a', relation: 'DERIVED_FROM' },
        { source: 'w/research_submissions/a', target: 'w/missions/a', relation: 'RESEARCH_FOR' },
        { source: 'w/missions/b', target: 'w/category/build', relation: 'CATEGORIZED_AS' },
        { source: 'w/signals/a', target: 'w/category/build', relation: 'CATEGORIZED_AS' },
        { source: 'w/wiki_pages/a', target: 'w/topic/rooms', relation: 'TAGGED_WITH' },
    ],
};

// The separately published estate projection, whose vocabulary the map already
// carried and must keep carrying.
const ESTATE_ROOM = {
    projection: 'organization',
    nodes: [
        { id: 'org', type: 'organization', title: 'Organization' },
        { id: 'guild', type: 'guild', title: 'Guild' },
        { id: 'team', type: 'team', title: 'Team' },
        { id: 'seat', type: 'seat', title: 'Seat' },
        { id: 'cap', type: 'capability', title: 'Capability' },
    ],
};

describe('room layout levels', () => {
    it('spreads a workspace room over more than one level', () => {
        const positions = layoutProjection(WORKSPACE_ROOM);
        const rows = new Set([...positions.values()].map((point) => point.y));
        expect(rows.size).toBeGreaterThan(1);
    });

    it('points every recorded relationship down the page', () => {
        const positions = layoutProjection(WORKSPACE_ROOM);
        for (const edge of WORKSPACE_ROOM.edges)
            expect([edge.relation, positions.get(edge.source).y < positions.get(edge.target).y]).toEqual([edge.relation, true]);
    });

    it('keeps the published estate vocabulary on its own descending levels', () => {
        const positions = layoutProjection(ESTATE_ROOM);
        const y = (id) => positions.get(id).y;
        expect(y('org')).toBeLessThan(y('guild'));
        expect(y('guild')).toBeLessThan(y('team'));
        expect(y('team')).toBeLessThan(y('seat'));
        expect(y('seat')).toBeLessThan(y('cap'));
    });
});
