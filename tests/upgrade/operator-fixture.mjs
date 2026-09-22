// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/operator-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     tests/upgrade/research-fixture.mjs, apps/pocketbase/pb_hooks/workspace-operator.js, apps/federal_foundry/operator.py, tests/upgrade/government-fixture.mjs
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/research-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-operator.js; CONSUMES apps/federal_foundry/operator.py; CONSUMES tests/upgrade/government-fixture.mjs
// DAG Node:    none
// Intent:      Exercise the operator route and native proposal handlers with the existing explicit storage and transport doubles.
// ───────────────────────────────────────────────────────────────

import { researchFixture } from './research-fixture.mjs';
import { plain } from './admin-fixture.mjs';
import { installGovernment } from './government-fixture.mjs';
import { repoPath, pythonBin } from './admin-fixture.mjs';
import { spawnSync } from 'node:child_process';

export function operatorFixture(options = {}) {
    const f = researchFixture(options);
    f.migration('apps/pocketbase/pb_migrations/1790300000_mission_suite.js').up();
    installGovernment(f, ['owner', 'admin', 'editor', 'viewer']);
    const Collection = f.collections.users.constructor;
    f.app.save(new Collection({ name: 'seat_events', fields: ['workspace', 'seat', 'event', 'subject', 'subject_type'].map((name) => ({ name, type: 'text' })) }));
    const service = f.load('workspace-operator.js');
    const plan = { version: 1, risk: 'A0', ...Object.fromEntries(f.load('mission-policy.js').PLAN_FIELDS.map((name) => [name, `Synthetic test ${name}`])) };
    f.seed('missions', { id: 'planned', workspace: 'ws1', owner: 'editor', title: 'Review permitted dataset', status: 'proposed', mission_plan: plan });
    f.seed('missions', { id: 'draft', workspace: 'ws1', owner: 'editor', title: 'Incomplete plan', status: 'proposed' });
    f.seed('signals', { id: 'signal1', workspace: 'ws1', owner: 'editor', title: 'Observed test failure', state: 'new', severity: 'high' });
    f.seed('evidence', { id: 'proof1', workspace: 'ws1', owner: 'editor', title: 'Source test result', mission: 'mission1', type: 'observed', content: 'Private source body must not appear in snapshot' });
    f.seed('workflow_runs', { id: 'approval', workspace: 'ws1', owner: 'editor', mission: 'mission1', workflow: 'workflow1',
        status: 'awaiting_approval', snapshot: { name: 'Dataset review', steps: [{ detail: 'Private workflow input' }] } });
    f.seed('suite_runs', { id: 'suite1', workspace: 'ws1', owner: 'editor', mission: 'mission1', suite: 'submission', status: 'queued',
        attempt: 0, revision: 1, input_canonical: 'Private suite input', result_canonical: 'Private suite result' });
    f.seed('seat_events', { id: 'seat1', workspace: 'ws1', seat: 'test-seat', subject_type: 'mission', subject: 'mission1',
        event: 'progress', summary: 'Local check recorded', detail: 'Private seat detail' });
    const submission = f.submit();
    const read = (actor = 'editor', options = {}) => plain(service.snapshot(f.event(actor, {}, options)));
    return { ...f, get data() { return f.data; }, operator: service, plan, read, submission };
}

/** Compile real portable output with optional synthetic untrusted document text. */
export function operatorPlan({ problem, document } = {}) {
    const result = spawnSync(pythonBin(), ['-c',
        'import json,sys; from apps.federal_foundry.catalog import load_catalog; from apps.federal_foundry.operator import operator_blueprint; ' +
        'from apps.research.blueprint_documents import structure_text; options=json.load(sys.stdin); ' +
        'blueprint=structure_text(options["document"],source_file="synthetic.pdf",source_hash="a"*64,page_count=1).to_dict() if options.get("document") else None; ' +
        'blueprint.update(extracted_at="2026-09-18T11:00:00Z") if blueprint else None; ' +
        'print(json.dumps(operator_blueprint(load_catalog(), problem=options.get("problem"), blueprint=blueprint, evaluated_at="2026-09-18T12:00:00Z"), sort_keys=True, ensure_ascii=False))'],
    { input: JSON.stringify({ problem, document }), encoding: 'utf8', maxBuffer: 2000000, cwd: repoPath('.') });
    if (result.status !== 0) throw new Error(result.stderr || 'Operator compiler failed');
    return JSON.parse(result.stdout);
}

/** Recompute integrity for adversarial test inputs; this grants no authority. */
export function sealOperator(plan) {
    const result = spawnSync(pythonBin(), ['-c',
        'import json,sys; from apps.federal_foundry.operator import content_fingerprint; value=json.load(sys.stdin); ' +
        'value["content_sha256"]=content_fingerprint(value); value["id"]="OP-"+value["content_sha256"][:24]; print(json.dumps(value,sort_keys=True,ensure_ascii=False))'],
    { input: JSON.stringify(plan), encoding: 'utf8', maxBuffer: 2000000, cwd: repoPath('.') });
    if (result.status !== 0) throw new Error(result.stderr || 'Operator integrity fixture failed');
    return JSON.parse(result.stdout);
}
