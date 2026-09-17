// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/blueprint-backend-driver.mjs
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
// Intent:      Connect the real research worker to blueprint intake and protected retrieval using the existing storage double.
// ───────────────────────────────────────────────────────────────

import readline from 'node:readline';
import { blueprintFixture } from './blueprint-fixture.mjs';
const f = blueprintFixture(); const files = new Map();
for await (const line of readline.createInterface({ input: process.stdin })) {
    try {
        const request = JSON.parse(line); const url = new URL(request.path, 'http://127.0.0.1');
        const event = f.event(request.actor || 'editor', request.body || {}, { workspace: url.pathname.split('/')[4] || 'ws1',
            id: url.pathname.split('/').at(-1), query: Object.fromEntries(url.searchParams) });
        let value;
        if (request.operation === 'upload') {
            const data = Buffer.from(request.bytes, 'base64');
            value = f.upload({ actor: request.actor, bytes: data, name: request.name, fields: request.body });
            const row = f.app.findRecordById('research_submissions', value.record.submission);
            files.set(row.getString('upload'), data);
        } else if (url.pathname === '/api/files/token') value = { token: 'test-only-file-session' };
        else if (url.pathname.startsWith('/api/files/research_uploads/')) {
            const row = f.app.findRecordById('research_uploads', url.pathname.split('/')[4]);
            f.policy.download({ ...event, record: row, next: () => undefined });
            value = { bytes: files.get(row.id).toString('base64') };
        } else if (url.pathname.endsWith('/research-worker/queue')) value = f.service.queue(event);
        else if (url.pathname.endsWith('/research-worker')) value = f.service.work(event);
        else if (url.pathname.endsWith('/blueprints')) value = f.blueprint.snapshot(event);
        else value = f.blueprint.detail(event);
        process.stdout.write(JSON.stringify({ value }) + '\n');
    } catch (error) {
        process.stdout.write(JSON.stringify({ error: error.status || 500, message: error.message }) + '\n');
    }
}
