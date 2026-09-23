// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/suite-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/mission-suite.js, apps/mission_suite/engine.py, tests/upgrade/government-fixture.mjs
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/mission-suite.js; VALIDATES apps/mission_suite/engine.py; CONSUMES tests/upgrade/government-fixture.mjs
// DAG Node:    none
// Intent:      Connect the real mission API and Python engine while identifying storage and native-auth doubles explicitly.
// ───────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { fixture, plain, runPython } from './admin-fixture.mjs';
import { installGovernment } from './government-fixture.mjs';
export const SCHEMA = 'apps/pocketbase/pb_migrations/1790300000_mission_suite.js';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
let cachedSourceHash;
export function python(code, input = '') {
    return JSON.parse(runPython(['-c', code], { input }));
}
export const compute = (input) => python('import sys,json; from apps.mission_suite.engine import run_suite; print(json.dumps(run_suite(sys.stdin.read()),sort_keys=True,separators=(",",":")))', input);
export function suiteFixture({ bound = true } = {}) {
    const sourceHash = cachedSourceHash ||= python('import json; from apps.mission_suite.bundle import source_fingerprint; print(json.dumps(source_fingerprint()))');
    const registered = [{ workspace: 'ws1', worker_user: 'suiteworker', binding: 'mission-suite', source_sha256: sourceHash, enabled: true }];
    const env = { value: bound ? JSON.stringify(registered) : '' };
    const f = fixture({ runtime: { $os: { getenv: (name) => name === 'BUILDANDDO_SUITE_BINDINGS' ? env.value : '' }, $security: { sha256: hash } } });
    f.migration(SCHEMA).up();
    installGovernment(f, ['owner', 'admin', 'editor', 'viewer']);
    f.seed('users', { id: 'suiteworker' }); f.seed('users', { id: 'worker2' });
    f.seed('missions', { id: 'mission1', workspace: 'ws1', owner: 'owner', title: 'Submission mission', status: 'running' });
    f.seed('missions', { id: 'mission2', workspace: 'ws2', owner: 'otherowner', title: 'Foreign mission', status: 'running' });
    const service = f.load('mission-suite.js'); const policy = f.load('suite-policy.js');
    let sequence = 0;
    const body = (action, payload = {}, { mission = 'mission1', revision = 0, key } = {}) => ({ action, mission, payload, revision,
        request_key: key || 'suite_test_' + String(++sequence).padStart(8, '0') });
    const command = (action, payload = {}, options = {}) => plain(service.command(f.event(options.actor || 'editor', body(action, payload, options), { workspace: options.workspace || 'ws1' })));
    const rights = [{ source_id: 'source1', rights_id: 'rights1', license_ref: 'Operator-supplied test-only source rights', classification: 'PUBLIC',
        processing_allowed: true, export_allowed: false, expires_at: '2099-01-01T00:00:00Z', independence_group: 'group1' }];
    const configure = (overrides = {}, options = {}) => command('configure', { enabled: true, rights, parameters: plain(policy.DEFAULT_PARAMETERS), ...overrides }, { actor: 'owner', ...options });
    const observation = (overrides = {}) => ({ observation_id: 'obs1', source_id: 'source1', source_record_id: 'row1', entity_id: 'vessel1',
        event_time: '2026-01-01T00:00:00Z', latitude: 30, longitude: -90, ...overrides });
    const enqueue = (observations = [observation()], options) => command('enqueue', { suite: 'maritime', input: { observations } }, options);
    const claim = (queued, options) => command('claim', { id: queued.id }, { actor: 'suiteworker', revision: queued.revision, ...options });
    const complete = (lease, result = compute(lease.job.input_canonical), options = {}) => command('complete', {
        id: lease.id, attempt: lease.attempt, source_sha256: registered[0].source_sha256,
        result_canonical: JSON.stringify(result), failure: '', ...options.payload,
    }, { actor: 'suiteworker', revision: lease.revision, ...options });
    return { ...f, get data() { return f.data; }, registered, env, service, policy, body, command, rights, configure, observation, enqueue, claim, complete };
}
