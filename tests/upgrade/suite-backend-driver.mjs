// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/suite-backend-driver.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     tests/upgrade/suite-fixture.mjs
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/suite-fixture.mjs
// DAG Node:    none
// Intent:      Connect the actual portable Python worker to the mission API source using an explicitly simulated native storage boundary.
// ───────────────────────────────────────────────────────────────

import readline from 'node:readline';
import { suiteFixture } from './suite-fixture.mjs';
const f = suiteFixture(); f.configure();
for await (const line of readline.createInterface({ input: process.stdin })) {
    try {
        const request = JSON.parse(line); let value;
        if (request.operation === 'revoke') { f.app.delete(f.app.findRecordById('workspace_members', 'editormember')); value = {}; }
        else if (request.operation === 'disable') { f.env.value = ''; value = {}; }
        else if (request.operation === 'state') value = f.data;
        else {
            const path = new URL(request.path, 'http://127.0.0.1');
            if (request.method !== 'POST' || !/^\/api\/buildanddo\/workspaces\/[A-Za-z0-9_-]+\/suite$/.test(path.pathname)) throw new Error('Unexpected API route.');
            value = f.service.command(f.event(request.actor || 'editor', request.body, { workspace: path.pathname.split('/')[4] }));
        }
        process.stdout.write(JSON.stringify({ value }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ error: error.status || 500, message: error.message }) + '\n'); }
}
