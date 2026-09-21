// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/assistant-fixture.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/workspace-assistant.js
// EnumType:     Test
// EnumEdges:    DEPENDS_ON tests/upgrade/admin-fixture.mjs; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-assistant.js
// DAG Node:     none
// Intent:       Exercise real assistant policies through explicit storage and inference doubles, without live model or database claims.
// ───────────────────────────────────────────────────────────────

import { fixture, plain } from './admin-fixture.mjs';
export const assistantMigration = 'apps/pocketbase/pb_migrations/1790900000_workspace_assistant.js';
export const assistantSurface = { id: 'current-surface', route: '/app/erp', controls: [
    { id: 'control-0', label: 'Task title', kind: 'text', options: [], max_length: 200 },
    { id: 'control-1', label: 'Save task', kind: 'button', options: [], max_length: 0 },
] };
export function assistantFixture() {
    const config = { reply: { reply: 'Review a proposed task title.', steps: [{ kind: 'fill', control: 'control-0', value: 'Customer follow-up' }] }, calls: [], during: null, enabled: true };
    const f = fixture({ runtime: { $os: { getenv: (key) => !config.enabled ? '' : ({ BUILDANDDO_ASSISTANT_URL: 'https://agent.example.org/chat', BUILDANDDO_ASSISTANT_MODEL: 'configured-model' }[key] || '') },
        $http: { send: (request) => { config.calls.push(JSON.parse(request.body)); config.during?.();
            return { statusCode: 200, raw: JSON.stringify({ choices: [{ message: { content: JSON.stringify(config.reply) } }] }) }; } } } });
    f.migration(assistantMigration).up(); const service = f.load('workspace-assistant.js');
    let count = 0;
    const key = () => `assistant-request-${String(++count).padStart(6, '0')}`;
    f.command = (action, payload, actor = 'owner', request_key = key()) => plain(service.command(f.event(actor, { action, payload, request_key })));
    f.start = (actor = 'owner') => f.command('session.start', { title: 'Plan a business task' }, actor);
    f.chat = (session, actor = 'owner', extra = {}) => plain(service.chat(f.event(actor, { session: session.id, message: 'Help me create a follow-up task', surface: assistantSurface, request_key: key(), ...extra })));
    f.service = service; f.agentConfig = config;
    return f;
}
