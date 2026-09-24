// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/knowledge-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     tests/upgrade/research-fixture.mjs, apps/pocketbase/pb_hooks/workspace-knowledge.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/research-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-knowledge.js
// DAG Node:    none
// Intent:      Exercise real workspace knowledge services with explicit storage doubles and public synthetic source records.
// ───────────────────────────────────────────────────────────────

import { researchFixture } from './research-fixture.mjs';
import { plain } from './admin-fixture.mjs';

export function knowledgeFixture({ now = () => '2026-09-18T14:00:00.000Z' } = {}) {
    // Equal-relevance ranking uses update time, then source ID. Author the
    // intended timestamp ties instead of relying on seed speed in this process.
    const f = researchFixture({ now }); f.enable();
    f.seed('missions', { id: 'mission1', workspace: 'ws1', owner: 'owner', title: 'Reduce missed appointments',
        description: 'Test booking reminders and measure customer attendance.', status: 'running' });
    f.seed('evidence', { id: 'evidence1', workspace: 'ws1', owner: 'editor', mission: 'mission1', title: 'Reminder observation',
        content: 'A small appointment study observed fewer missed bookings; the sample is limited.', type: 'observed', category: 'research', tags: 'reminders, customer' });
    f.seed('research_submissions', { id: 'research1', protocol_version: 1, revision: 2, workspace: 'ws1', owner: 'editor',
        mission: 'mission1', status: 'attached', kind: 'url', title: 'Appointment source', context: 'Compare reminder methods.',
        evidence: 'evidence1', result: f.result, processed_at: '2026-09-18T14:00:00Z' });
    f.seed('signals', { id: 'signal1', workspace: 'ws1', owner: 'editor', title: 'Afternoon bookings',
        description: 'Afternoon bookings may need a different reminder schedule.', type: 'inference', source: 'Authored test observation' });
    f.seed('wiki_pages', { id: 'wiki1', workspace: 'ws1', owner: 'owner', title: 'Appointment guide',
        body: 'Check consent before sending booking reminders to customers.', status: 'published', revision: 1 });
    const knowledge = f.load('workspace-knowledge.js');
    const snapshot = (actor = 'editor', query = {}, workspace = 'ws1') => plain(knowledge.snapshot(f.event(actor, {}, { query, workspace })));
    const assemble = (body = {}, actor = 'editor', workspace = 'ws1') => plain(knowledge.assemble(f.event(actor, body, { workspace })));
    return { ...f, get data() { return f.data; }, knowledge, snapshot, assemble };
}
