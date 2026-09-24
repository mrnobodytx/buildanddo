// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-record-policy.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js
// DAG Node:    none
// Intent:      Reject stale membership, reassigned records, foreign relations and browser-asserted review, revenue or seat identity at the native workspace write boundary.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const ADMIN_ONLY = ['services', 'social_channels'];
const RELATIONS = { evidence: { mission: 'missions' }, erp_tasks: { objective: 'erp_objectives', contact: 'erp_contacts', mission: 'missions' },
    social_content: { objective: 'erp_objectives' }, operation_runs: { operation: 'operations' } };
// Editors change only their own shared records; a verified correction or a
// published edition is locked to owners and admins in every direction.
const AUTHORED = ['corrections', 'specialist_desks', 'social_content', 'daily_editions'];
const LOCKED = { corrections: 'verified', daily_editions: 'published' };
// Written only by the server-side sync (app.save bypasses request hooks).
const SYNCED = ['provider', 'gross', 'platform_fees', 'refunds', 'currency', 'payout_status', 'last_sync', 'date_range_start', 'date_range_end'];

/** Enforce the same account/workspace boundary for native CRUD and custom commands. */
function enforce(e, operation) {
    access.authenticated(e);
    const record = e.record;
    const name = record.collection().name;
    const workspace = record.getString('workspace');
    const { role } = access.requireRole(e.app, e.auth, workspace,
        ADMIN_ONLY.includes(name) ? ['owner', 'admin'] : ['owner', 'admin', 'editor']);
    const admin = ['owner', 'admin'].includes(role);
    if (!admin && operation === 'update' && AUTHORED.includes(name) && record.original().getString('owner') !== e.auth.id)
        throw new ForbiddenError('Editors change only records they authored. Ask an owner or admin.');
    if (!admin && LOCKED[name] && (record.getString('status') === LOCKED[name] ||
        (operation === 'update' && record.original().getString('status') === LOCKED[name])))
        throw new ForbiddenError(name === 'corrections' ? 'Only a workspace owner or admin may verify a correction or change a verified one.' :
            'Only a workspace owner or admin may publish an edition or change a published one.');
    if (operation === 'create') {
        if (record.getString('owner') !== e.auth.id) throw new ForbiddenError('Create records under your own account.');
    } else if (operation === 'update') {
        const old = record.original();
        if (old.getString('owner') !== record.getString('owner') || old.getString('workspace') !== workspace)
            access.invalid('A record cannot change its author or workspace.');
    } else if (record.getString('owner') !== e.auth.id) {
        throw new ForbiddenError('Only the author with current write access may delete this record.');
    }
    if (operation === 'delete' && name === 'missions') {
        const runs = e.app.findRecordsByFilter('workflow_runs', 'mission = {:mission}', '', 1, 0, { mission: record.id });
        if (record.getString('status') === 'verified' || runs.length)
            access.invalid('Retain reviewed missions and their execution history. Record a new mission or correction.');
    }
    if (operation !== 'delete') {
        const protectedFields = name === 'signals' ? ['ingest_digest', 'ingest_url', 'ingest_provider', 'ingested_at'] :
            name === 'erp_tasks' ? ['execution', 'evidence'] : [];
        if (protectedFields.some((field) => operation === 'create' ? record.getString(field) :
            record.getString(field) !== record.original().getString(field)))
            access.invalid('Execution and source provenance are written only by their retained receipts.');
        if (name === 'signals' && operation === 'update' && record.original().getString('ingest_digest') &&
            ['title', 'description', 'source', 'type'].some((field) => record.getString(field) !== record.original().getString(field)))
            access.invalid('Retain captured source text; record a separate correction or a new capture.');
        for (const [field, target] of Object.entries(RELATIONS[name] || {})) {
            const id = record.getString(field);
            if (!id) continue;
            const relation = access.find(e.app, target, id);
            if (relation.getString('workspace') !== workspace) access.invalid('Linked records must belong to this workspace.');
            access.readable(e.app, relation, e.requestInfo());
        }
        if (['services', 'social_channels'].includes(name)) {
            const initial = name === 'services' ? ['planned', 'not_connected'] : ['pending', 'not_connected'];
            const stamp = name === 'services' ? 'last_health_check' : 'last_check';
            if (operation === 'create' ? !initial.includes(record.getString('status')) || record.getString(stamp) :
                (!initial.includes(record.getString('status')) && record.getString('status') !== record.original().getString('status')) ||
                record.getString(stamp) !== record.original().getString(stamp))
                access.invalid('Use Integrations to request changes. Runtime health cannot be set by a browser.');
        }
        if (name === 'support_sources') {
            const status = record.getString('status');
            if (operation === 'create' ? status !== 'pending' || SYNCED.some((field) => field !== 'provider' && !['', '0'].includes(record.getString(field))) :
                (status !== 'pending' && status !== record.original().getString('status')) ||
                SYNCED.some((field) => record.getString(field) !== record.original().getString(field)))
                access.invalid('Request a connection only. Synced revenue and its status are written by the server.');
        }
        // No account maps to an agent seat yet, so a browser speaks only as its own human account.
        if (name === 'seat_events' && (record.getString('actor_type') !== 'human' || record.getString('seat') !== e.auth.id))
            throw new ForbiddenError('Post seat events as your own account. Agent seats publish through the server.');
    }
    return e.next();
}

/** Keep workspace creation tied to the caller and their readable domain. */
function workspaceCreate(e) {
    access.authenticated(e);
    if (e.record.getString('owner') !== e.auth.id) throw new ForbiddenError('Create a workspace under your own account.');
    if (['onboarding_intent', 'onboarding_objective', 'business_context'].some((field) => e.record.getString(field)))
        access.invalid('Use workspace onboarding to save an intent and objective together.');
    const domainId = e.record.getString('domain');
    if (domainId) {
        const domain = access.find(e.app, 'domains', domainId);
        if (domain.getString('owner') !== e.auth.id) throw new ForbiddenError('Choose a domain owned by this account.');
        access.readable(e.app, domain, e.requestInfo());
    }
    return e.next();
}

module.exports = { enforce, workspaceCreate };
