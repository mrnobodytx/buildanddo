// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_hooks/workspace-onboarding.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-SITE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js, apps/pocketbase/pb_migrations/1791100000_objective_onboarding.js
// EnumType:     Service
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js; DEPENDS_ON apps/pocketbase/pb_migrations/1791100000_objective_onboarding.js
// DAG Node:     none
// Intent:       Complete onboarding in one transaction so failed seeds and lost responses cannot create duplicate workspaces.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const INTENTS = ['learn', 'build', 'project', 'class', 'challenge', 'explore'];
const SERVICES = [
    ['Firecrawl', 'Public website research'], ['n8n', 'Approved business workflows'],
    ['Supabase', 'Optional external data source'], ['Mautic', 'Reviewed campaigns'],
    ['Twenty', 'Customer records'], ['Tutorial system', 'Personal lessons and certificates'],
    ['ERP system', 'Workspace objectives, tasks and contacts'],
];

/** Create an entire initial workspace, or recover its original receipt, atomically. */
function create(e) {
    access.authenticated(e);
    const input = e.requestInfo().body;
    const objectiveSetup = input && Object.prototype.hasOwnProperty.call(input, 'intent');
    access.exact(input, objectiveSetup ? ['name', 'domain', 'intent', 'objective', 'business_context'] : ['name', 'domain']);
    const value = { name: access.bounded(input.name, 120), domain: access.domainName(input.domain, false) };
    if (objectiveSetup) {
        if (!INTENTS.includes(input.intent)) access.invalid('Choose a supported intent.');
        Object.assign(value, { intent: input.intent, objective: access.bounded(input.objective, 160),
            business_context: access.bounded(input.business_context, 120, false) });
    }
    const key = $security.sha256(access.canonical(value));
    let result;
    e.app.runInTransaction((app) => {
        const collection = access.schema(app, 'workspace_onboarding', ['owner', 'workspace', 'request_key', 'input', 'result', 'protocol_version']);
        if (['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((field) => collection[field] !== null) ||
            !collection.indexes.includes('create unique index idx_workspace_onboarding_retry on workspace_onboarding (owner, request_key)'))
            throw new ApiError(503, 'Workspace setup storage requires operator review.');
        if (objectiveSetup) {
            access.schema(app, 'workspace_onboarding', ['objective_protocol']);
            access.schema(app, 'workspaces', ['onboarding_intent', 'onboarding_objective', 'business_context']);
            access.schema(app, 'erp_objectives', ['title', 'status', 'workspace', 'owner']);
        }
        const rows = app.findRecordsByFilter('workspace_onboarding', 'owner = {:owner} && request_key = {:key}', '', 2, 0, { owner: e.auth.id, key });
        if (rows.length > 1) throw new ApiError(503, 'Duplicate setup receipts require operator review.');
        if (rows.length) {
            const receipt = rows[0];
            if (access.canonical(access.json(receipt, 'input')) !== access.canonical(value)) access.conflict('The setup identity changed.');
            const workspace = access.find(app, 'workspaces', receipt.getString('workspace'));
            if (workspace.getString('owner') !== e.auth.id) throw new ForbiddenError('This workspace is no longer owned by this account.');
            result = { ...access.json(receipt, 'result'), replayed: true }; return;
        }
        let domain = '';
        if (value.domain) {
            const record = new Record(app.findCollectionByNameOrId('domains'));
            for (const [field, data] of Object.entries({ domain: value.domain, status: 'selected', has_website: true, owner: e.auth.id })) record.set(field, data);
            app.save(record); domain = record.id;
        }
        const workspace = new Record(app.findCollectionByNameOrId('workspaces'));
        for (const [field, data] of Object.entries({ name: value.name, domain, owner: e.auth.id })) workspace.set(field, data);
        if (objectiveSetup) {
            workspace.set('onboarding_intent', value.intent);
            workspace.set('business_context', value.business_context);
        }
        app.save(workspace);
        let objectiveId = '';
        if (objectiveSetup) {
            const objective = new Record(app.findCollectionByNameOrId('erp_objectives'));
            for (const [field, data] of Object.entries({ title: value.objective, status: 'active', workspace: workspace.id, owner: e.auth.id }))
                objective.set(field, data);
            app.save(objective); objectiveId = objective.id;
            workspace.set('onboarding_objective', objectiveId);
            app.save(workspace);
        }
        const services = [];
        for (const [name, purpose] of SERVICES) {
            const service = new Record(app.findCollectionByNameOrId('services'));
            for (const [field, data] of Object.entries({ name, purpose, workspace: workspace.id, owner: e.auth.id, status: 'planned',
                data_boundary: 'Workspace records and explicitly configured service access.',
                next_action: name === 'Tutorial system' ? 'Open the Field Manual.' : name === 'ERP system' ? 'Open workspace business planning.' : 'Request a registered connection through Integrations.' })) service.set(field, data);
            app.save(service); services.push(service.id);
        }
        const saved = { workspace: workspace.id, owner: e.auth.id, domain, services };
        if (objectiveSetup) Object.assign(saved, { intent: value.intent, objective: objectiveId });
        const receipt = new Record(collection);
        for (const [field, data] of Object.entries({ owner: e.auth.id, workspace: workspace.id,
            request_key: key, input: value, result: saved, protocol_version: objectiveSetup ? 2 : 1 })) receipt.set(field, data);
        if (objectiveSetup) receipt.set('objective_protocol', 1);
        app.save(receipt); result = { ...saved, replayed: false };
    });
    return result;
}
module.exports = { create };
