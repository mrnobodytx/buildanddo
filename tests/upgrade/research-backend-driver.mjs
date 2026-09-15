// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/research-backend-driver.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     tests/upgrade/research-fixture.mjs, apps/pocketbase/pb_hooks/mission-research.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/research-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/mission-research.js
// DAG Node:    none
// Intent:      Connect actual Python bot and worker source to the actual JavaScript command policy in one persistent storage double.
// ───────────────────────────────────────────────────────────────

import readline from 'node:readline';
import { researchFixture } from './research-fixture.mjs';
const f = researchFixture(); const files = new Map();
for await (const line of readline.createInterface({ input: process.stdin })) {
    try {
        const request = JSON.parse(line); const url = new URL(request.path, 'http://127.0.0.1');
        const event = f.event(request.actor || 'editor', request.body || {}, { workspace: url.pathname.split('/')[4] || 'ws1',
            id: url.pathname.split('/').at(-1), query: Object.fromEntries(url.searchParams) });
        let value;
        if (request.operation === 'revoke') {
            f.app.delete(f.app.findRecordById('workspace_members', 'editormember')); value = {};
        } else if (request.operation === 'audit-failure') { f.app.fail = 'research_events'; value = {}; }
        else if (request.operation === 'upload') {
            const body = Buffer.from(request.bytes, 'base64');
            event.findUploadedFiles = () => [{ originalName: request.name, name: request.name, size: body.length }];
            value = f.service.discordUpload(event);
            // This is the native file-storage boundary, not a PocketBase runtime.
            const row = f.app.findRecordById('research_uploads', value.id);
            row.set('asset', request.name); f.app.save(row); files.set(value.id, body);
        } else if (url.pathname === '/api/files/token') value = { token: 'test-only-file-session' };
        else if (url.pathname.startsWith('/api/files/research_uploads/')) {
            const row = f.app.findRecordById('research_uploads', url.pathname.split('/')[4]);
            f.policy.download({ ...event, record: row, next: () => undefined });
            value = { bytes: files.get(row.id).toString('base64') };
        } else if (url.pathname.endsWith('/discord-research')) value = f.service.discordCommand(event);
        else if (url.pathname.endsWith('/research-worker/queue')) value = f.service.queue(event);
        else if (url.pathname.endsWith('/research-worker')) value = f.service.work(event);
        else if (url.pathname.endsWith('/research')) value = request.method === 'GET' ? f.service.snapshot(event) : f.service.command(event);
        else value = f.service.detail(event);
        process.stdout.write(JSON.stringify({ value }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ error: error.status || 500, message: error.message }) + '\n'); }
}
