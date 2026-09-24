// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/workspace-claims.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/business-policy.js, apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/business-policy.js; DEPENDS_ON apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js
// Intent:      Bind bounded workspace reports and editorial changes to native accounts, current roles and saved revisions without inventing verification.
// ----------------------------------------------------------------

const access = require(`${__hooks}/workspace-access.js`);
const ACTIONS = {
    'support.request': 'support_sources', 'correction.save': 'corrections', 'edition.save': 'daily_editions',
    'edition.publish': 'daily_editions', 'desk.save': 'specialist_desks', 'content.save': 'social_content',
    'channel.request': 'social_channels', 'seat.report': 'seat_events',
};
const TEXT = {
    support_sources: { provider: 20 }, corrections: { prior_prediction: 2000, observed_result: 2000, reference: 300 },
    daily_editions: { title: 200, summary: 1000, body: 10000, edition_date: 40 },
    specialist_desks: { desk: 30, scope: 500, status: 20 }, social_channels: { platform: 20, handle: 160 },
    social_content: { title: 200, body: 5000, format: 20, audience: 300, brief: 2000, call_to_action: 400,
        channel: 160, objective: 64, status: 30, scheduled_for: 40, review_note: 1200, published_url: 2048 },
    seat_events: { event: 20, seat: 80, actor_type: 10, subject_type: 20, subject: 200, summary: 400, pr_url: 2048, handoff_to: 80 },
};
const ADMINS = ['owner', 'admin'];
function boundedJson(value, maximum) {
    let size = 0;
    for (const char of access.canonical(value)) {
        const code = char.codePointAt(0);
        size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    if (size > maximum) access.invalid(`Keep this request within ${maximum} UTF-8 bytes.`);
}
function choice(value, allowed) {
    if (!allowed.includes(value)) access.invalid('Choose a listed value for this command.');
}

/** Apply one explicit command and its existing retry receipt in one transaction. */
function command(e) {
    const { workspace, body } = access.envelope(e);
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, body.action)) access.invalid('Choose a supported workspace claim command.');
    boundedJson(body, 30000);
    const name = ACTIONS[body.action], publishing = body.action === 'edition.publish';
    access.exact(body.payload, publishing ? ['id'] : ['id', 'values']);
    const id = access.id(body.payload.id, !publishing), creating = !id;
    const values = publishing ? {} : body.payload.values;
    const jsonFields = name === 'seat_events' ? ['detail'] : name === 'social_content' ? ['review_checks'] : [];
    if (!access.fields(values, [...Object.keys(TEXT[name]), ...jsonFields]) || (!publishing && !Object.keys(values).length))
        access.invalid('Use only the listed editable fields. Authorship, verification and provider observations are not editable.');
    for (const [field, value] of Object.entries(values)) {
        if (jsonFields.includes(field)) boundedJson(value, field === 'detail' ? 20000 : 1000);
        else access.bounded(value, TEXT[name][field], false);
    }
    if (name === 'seat_events' && !creating) access.invalid('Seat reports are append-only.');
    if (creating && body.revision !== 0) access.conflict('New records start at revision zero.');
    const status = typeof values.status === 'string' ? values.status.trim() : undefined;
    const adminOnly = ['support_sources', 'social_channels'].includes(name) || publishing ||
        name === 'social_content' && ['approved', 'published'].includes(status);
    let result;
    e.app.runInTransaction((app) => {
        const scope = access.requireRole(app, e.auth, workspace, adminOnly ? ADMINS : [...ADMINS, 'editor']);
        if (name === 'seat_events' && ((Object.hasOwn(values, 'seat') && values.seat !== e.auth.id) ||
            (Object.hasOwn(values, 'actor_type') && values.actor_type !== 'human')))
            access.invalid('Post seat events as your own human account. Agent seats publish through the server.');
        const stamps = name === 'daily_editions' ? ['published_by', 'published_at'] :
            ['support_sources', 'social_channels'].includes(name) ? ['requested_by', 'requested_at'] : [];
        const collection = access.schema(app, name, ['owner', 'workspace', 'claim_commands', 'claim_revision', ...Object.keys(TEXT[name]), ...jsonFields, ...stamps]);
        if (['createRule', 'updateRule', 'deleteRule'].some((key) => collection[key] != null))
            throw new ApiError(503, 'Install the locked workspace claim migration before writing.');
        const record = creating ? new Record(collection) : access.find(app, name, id);
        if (!creating) {
            if (record.getString('workspace') !== workspace) throw new ForbiddenError('Choose a record in the current workspace.');
            access.readable(app, record, e.requestInfo());
            if (record.getString('owner') !== e.auth.id && !ADMINS.includes(scope.role))
                throw new ForbiddenError('Only the author or a current workspace administrator may edit this record.');
        }
        if (name === 'social_content' && ['approved', 'published'].includes(status ?? record.getString('status')) && !ADMINS.includes(scope.role))
            throw new ForbiddenError('A current workspace administrator must record or recover this editorial decision.');
        // Authority and readability precede replay, including after revocation.
        result = access.audit(app, e.auth, workspace, body, () => {
            const revision = creating ? 0 : Number(record.get('claim_revision') || 0);
            if (!Number.isSafeInteger(revision) || revision !== body.revision || revision >= Number.MAX_SAFE_INTEGER)
                access.conflict('This record changed. Reload the saved version before editing.');
            if (!creating && ((name === 'daily_editions' && record.getString('status') !== 'draft') ||
                (name === 'corrections' && record.getString('status') !== 'pending')))
                access.invalid('Retain the historical decision or publication; create a new draft or comparison.');
            if (creating) {
                record.set('owner', e.auth.id); record.set('workspace', workspace);
                if (['daily_editions', 'social_content'].includes(name)) record.set('status', 'draft');
                if (['support_sources', 'social_channels', 'corrections'].includes(name)) record.set('status', 'pending');
            }
            const identity = name === 'support_sources' ? 'provider' : name === 'social_channels' ? 'platform' : name === 'specialist_desks' ? 'desk' : '';
            if (identity && !creating && Object.hasOwn(values, identity) && values[identity] !== record.getString(identity))
                access.invalid('Keep the saved provider, channel or desk identity.');
            for (const [field, value] of Object.entries(values)) record.set(field, typeof value === 'string' ? value.trim() : value);
            if (identity && creating && app.findRecordsByFilter(name, `workspace = {:workspace} && ${identity} = {:value}`, '', 1, 0,
                { workspace, value: record.getString(identity) }).length)
                access.conflict('This request or desk already exists. Reload its saved version.');
            if (name === 'support_sources' || name === 'social_channels') {
                choice(record.getString(identity), name === 'support_sources' ? ['patreon', 'kofi', 'stripe', 'gofundme'] :
                    ['discord', 'youtube', 'x', 'linkedin', 'instagram', 'tiktok', 'bluesky']);
                record.set('requested_by', e.auth.id); record.set('requested_at', new Date().toISOString());
                // No ingestor is installed. Never change legacy health or money.
            } else if (name === 'corrections') {
                access.bounded(record.getString('prior_prediction'), 2000);
                access.bounded(record.getString('observed_result'), 2000);
            } else if (name === 'daily_editions') {
                access.bounded(record.getString('title'), 200);
                const date = record.getString('edition_date');
                if (date && !Number.isFinite(Date.parse(date))) access.invalid('Choose a valid edition date.');
                if (publishing) {
                    record.set('status', 'published'); record.set('published_by', e.auth.id);
                    record.set('published_at', new Date().toISOString());
                }
            } else if (name === 'specialist_desks') {
                choice(record.getString('desk'), ['research', 'strategy', 'operations', 'verification', 'risk', 'recovery', 'history', 'optimization']);
                choice(record.getString('status'), ['idle', 'active', 'blocked']);
            } else if (name === 'social_content') {
                // app.save does not invoke HTTP request hooks. Run the existing
                // content validator explicitly with this transaction's app/auth.
                require(`${__hooks}/business-policy.js`).content({ app, auth: e.auth, record,
                    requestInfo: () => e.requestInfo(), next: () => {} }, creating);
            } else {
                choice(record.getString('event'), ['joined', 'progress', 'completed', 'blocked', 'handoff']);
                record.set('seat', e.auth.id); record.set('actor_type', 'human');
                access.bounded(record.getString('summary'), 400);
                const kind = record.getString('subject_type'), subject = record.getString('subject');
                choice(kind, ['', 'mission', 'workflow', 'page', 'issue', 'pull_request', 'other']);
                if (['mission', 'workflow'].includes(kind)) {
                    const linked = access.find(app, kind === 'mission' ? 'missions' : 'workflows', access.id(subject));
                    if (linked.getString('workspace') !== workspace) access.invalid('Report work in the same workspace.');
                    access.readable(app, linked, e.requestInfo());
                }
                const link = record.getString('pr_url');
                if (link && !/^https:\/\/[^\s/@]+(?:[/?#][^\s]*)?$/.test(link)) access.invalid('Use an HTTPS reference without credentials.');
                // Account attribution does not independently verify the report.
            }
            record.set('claim_revision', revision + 1); app.save(record);
            const saved = { id: record.id, claim_revision: revision + 1 };
            for (const field of new Set(['owner', 'workspace', 'created', 'updated', 'status', ...Object.keys(TEXT[name]), ...stamps,
                ...(name === 'social_content' ? ['reviewed_by', 'reviewed_at', 'published_by', 'published_at'] : [])])) saved[field] = record.getString(field);
            for (const field of jsonFields) saved[field] = access.json(record, field);
            return { id: record.id, workspace, action: body.action, revision: revision + 1, record: saved };
        });
    });
    return result;
}

module.exports = { command };
