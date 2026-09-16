// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/dossier-backend-driver.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     tests/upgrade/dossier-fixture.mjs
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/dossier-fixture.mjs
// DAG Node:    none
// Intent:      Connect Python Discord commands and website commands to one actual dossier policy with explicit native storage and crypto boundaries.
// ───────────────────────────────────────────────────────────────

import readline from 'node:readline';
import { dossierFixture } from './dossier-fixture.mjs';
const f = dossierFixture();
for await (const line of readline.createInterface({ input: process.stdin })) {
    try {
        const request = JSON.parse(line); let value;
        if (request.operation === 'revoke') { f.app.delete(f.app.findRecordById('workspace_members', 'editormember')); value = {}; }
        else if (request.operation === 'relink') {
            f.app.delete(f.app.findRecordById('_externalAuths', 'discordlink'));
            f.seed('_externalAuths', { id: 'changedlink', provider: 'discord', providerId: '34567890123456789',
                collectionRef: f.collections.users.id, recordRef: 'admin' }); value = {};
        } else if (request.operation === 'locked') { f.privateEnv.keys = ''; value = {}; }
        else if (request.operation === 'storage') value = { entities: f.data.dossier_entities, events: f.data.dossier_events };
        else {
            const event = f.event(request.actor || 'editor', request.body || {});
            value = request.path.endsWith('/discord-dossier') ? f.service.discord(event) :
                request.path.endsWith('/read') ? f.service.read(event) : f.service.command(event);
        }
        process.stdout.write(JSON.stringify({ value }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ error: error.status || 500, message: error.message }) + '\n'); }
}
