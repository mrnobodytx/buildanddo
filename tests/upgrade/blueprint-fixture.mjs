// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/blueprint-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/workspace-blueprints.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/workspace-blueprints.js
// DAG Node:    none
// Intent:      Reuse the transactional research fixture for workspace blueprint intake and worker completion.
// ───────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { researchFixture } from './research-fixture.mjs';
import { plain } from './admin-fixture.mjs';

export const SCHEMA = 'apps/pocketbase/pb_migrations/1790500000_workspace_blueprints.js';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function blueprintFixture() {
    const f = researchFixture({ runtime: { $security: { sha256: hash } } });
    f.migration(SCHEMA).up();
    const blueprint = f.load('workspace-blueprints.js');
    let sequence = 0;
    const upload = ({ actor = 'editor', workspace = 'ws1', name = 'sample.pdf', bytes = Buffer.from('%PDF-fixture'), key,
        fields = {}, count = 1, size = bytes.length } = {}) => {
        const body = { request_key: key || 'blueprint_request_' + ++sequence, input_sha256: hash(bytes), ...fields };
        const event = f.event(actor, body, { workspace });
        event.findUploadedFiles = () => Array.from({ length: count }, () => ({ originalName: name, name, size }));
        const result = plain(blueprint.upload(event));
        const submission = f.app.findRecordById('research_submissions', result.record.submission);
        // Model only native file persistence; all access and application handlers run.
        const file = f.app.findRecordById('research_uploads', submission.getString('upload'));
        file.set('asset', name); f.app.save(file);
        return result;
    };
    const result = {
        text: 'Account Service must encrypt records.', citations: [], processor: 'local-blueprint', version: 'pypdf-fixture',
        input_sha256: hash(Buffer.from('%PDF-fixture')), truncated: false, blueprint_failure: '', evaluation_failure: '', evaluation: null,
        blueprint: { title: 'Portal', source_file: 'sample.pdf', source_hash: hash(Buffer.from('%PDF-fixture')),
            extracted_at: '2026-09-17T00:00:00+00:00', parser_version: 'blueprint-1.0', page_count: 1, truncated: false, extraction_confidence: .7,
            sections: [{ id: 'SEC-001', title: 'Security', text: 'Account Service must encrypt records.', level: 1, start_line: 1, end_line: 2 }],
            requirements: [{ id: 'REQ-001', text: 'Account Service must encrypt records.', priority: 'must', type: 'security',
                section: 'SEC-001', raw_context: 'Account Service must encrypt records.' }],
            components: [{ name: 'Account Service', type: 'service', description: 'Account Service must encrypt records.', requirements: ['REQ-001'], dependencies: [] }],
            constraints: [], assumptions: [], open_questions: [] },
    };
    const questions = ['feasibility', 'complexity', 'component_type', 'automatable', 'risk'];
    result.evaluation = {
        source_hash: result.input_sha256, authority: 'A0', verified: false,
        requirements: [{ requirement_id: 'REQ-001', feasibility: null, complexity: null, component_type: null, automatable: null, risk: null,
            confidence: Object.fromEntries(questions.map((key) => [key, .5])), abstained: questions, components: ['Account Service'],
            route: 'abstain', trace_id: 'test-trace', state_hash: 'a'.repeat(64) }],
        overall: { status: 'review_required', requirement_count: 1, assessed_count: 0, review_count: 1,
            average_scores: { feasibility: null, complexity: null, risk: null } },
    };
    const detail = (id, actor = 'editor', workspace = 'ws1') => plain(blueprint.detail(f.event(actor, {}, { id, workspace })));
    const command = (id, action, revision, actor = 'editor', key = 'blueprint_command_' + ++sequence) =>
        plain(blueprint.command(f.event(actor, { action, revision, request_key: key }, { id })));
    return { ...f, get data() { return f.data; }, blueprint, upload, detail, blueprintCommand: command, result };
}
