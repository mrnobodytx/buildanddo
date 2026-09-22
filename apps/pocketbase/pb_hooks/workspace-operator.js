// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-operator.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/workspace-administration.js, apps/pocketbase/pb_hooks/research-policy.js, apps/pocketbase/pb_hooks/mission-policy.js, apps/pocketbase/pb_hooks/workspace-value.js, apps/pocketbase/pb_hooks/government-access.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/workspace-administration.js; CONSUMES apps/pocketbase/pb_hooks/research-policy.js; CONSUMES apps/pocketbase/pb_hooks/mission-policy.js; CONSUMES apps/pocketbase/pb_hooks/workspace-value.js; CONSUMES apps/pocketbase/pb_hooks/government-access.js
// DAG Node:    none
// Intent:      Project bounded existing workspace observations without creating work, exposing source bodies or replacing current record authority.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const administration = require(`${__hooks}/workspace-administration.js`);
const research = require(`${__hooks}/research-policy.js`);
const missionPolicy = require(`${__hooks}/mission-policy.js`);
const PAGE_SIZE = 20;
const value = require(__hooks + '/workspace-value.js');

function text(record, name, limit = 240) { return record.getString(name).slice(0, limit); }
function summary(record, status = 'status', title = 'title') {
    return { id: record.id, workspace: text(record, 'workspace', 64), title: text(record, title),
        status: text(record, status, 64), owner: text(record, 'owner', 64),
        mission: text(record, 'mission', 64), created: text(record, 'created', 80), updated: text(record, 'updated', 80) };
}
function observed(e, workspace, page, collection, fields, project, permit) {
    try {
        access.schema(e.app, collection, ['workspace', ...fields]);
        const listed = access.list(e.app, collection, 'workspace = {:workspace}', { workspace }, page, PAGE_SIZE);
        const items = [];
        for (const record of listed.rows) {
            // The query and record must both agree on scope. The native rule
            // remains authoritative even after workspace membership succeeds.
            if (record.getString('workspace') !== workspace) throw new Error('Scope mismatch');
            try {
                if (permit) permit(record);
                else access.readable(e.app, record, e.requestInfo());
            } catch (error) {
                if ([403, 404].includes(error.status)) continue;
                throw error;
            }
            items.push(project(record));
        }
        return { state: 'available', items, page, has_more: listed.has_more };
    } catch {
        // No body, private error text, guessed zero total or synthetic health.
        return { state: 'unavailable', items: [], page, has_more: false };
    }
}

/** Read an independently bounded page of existing records under current authority. */
function snapshot(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    access.requireRole(e.app, e.auth, workspace);
    const page = access.page(e);
    const list = (collection, fields, project = summary, permit) => observed(e, workspace, page, collection, fields, project, permit);
    const missionReadable = (row) => research.mission(e.app, e.auth, e.requestInfo(), workspace, row.getString('mission'));
    const sources = {
        missions: list('missions', ['title', 'status', 'mission_plan'], (row) => {
            const plan = access.json(row, 'mission_plan', {});
            return { ...summary(row), priority: text(row, 'priority', 32),
                plan_complete: Boolean(plan && plan.version === 1 && ['A0', 'A1', 'A2'].includes(plan.risk) &&
                    missionPolicy.PLAN_FIELDS.every((field) => access.text(plan[field], 1200))),
                approved: Boolean(row.getString('mission_approved_by') && row.getString('mission_approved_at')),
                value: value.outcome(e, row) };
        }),
        signals: list('signals', ['title', 'state'], (row) => ({ ...summary(row, 'state'), severity: text(row, 'severity', 32) })),
        evidence: list('evidence', ['mission', 'type'], (row) => summary(row, 'type'), (row) => {
            access.readable(e.app, row, e.requestInfo());
            if (row.getString('mission')) missionReadable(row);
        }),
        workflow_runs: list('workflow_runs', ['status', 'mission', 'snapshot'], (row) => {
            const saved = access.json(row, 'snapshot', {});
            return { ...summary(row), title: typeof saved?.name === 'string' ? saved.name.slice(0, 240) : '',
                workflow: text(row, 'workflow', 64) };
        }, (row) => {
            access.readable(e.app, row, e.requestInfo());
            if (row.getString('mission')) missionReadable(row);
        }),
        research: list('research_submissions', ['status', 'mission', 'attempt', 'revision'], (row) => ({
            ...summary(row), attempt: Number(row.get('attempt')), revision: Number(row.get('revision')),
            lease_until: text(row, 'lease_until', 80), mode: text(row, 'mode', 32), failure: text(row, 'failure', 80),
        }), (row) => research.submissionScope(e.app, e.auth, e.requestInfo(), workspace, row)),
        suite_runs: list('suite_runs', ['status', 'mission', 'suite', 'attempt', 'revision'], (row) => ({
            ...summary(row), title: text(row, 'suite', 64), attempt: Number(row.get('attempt')), revision: Number(row.get('revision')),
            lease_until: text(row, 'lease_until', 80), failure: text(row, 'failure', 80),
        }), (row) => { require(`${__hooks}/government-access.js`).requireMember(e.app, e.auth); missionReadable(row); }),
        seat_events: list('seat_events', ['seat', 'event', 'subject', 'subject_type'], (row) => ({
            ...summary(row, 'event', 'summary'), seat: text(row, 'seat', 80),
            subject: text(row, 'subject', 64), subject_type: text(row, 'subject_type', 32),
        }), (row) => {
            access.readable(e.app, row, e.requestInfo());
            const type = row.getString('subject_type'); const subject = row.getString('subject');
            if (subject && ['mission', 'workflow'].includes(type)) {
                const target = access.find(e.app, type === 'mission' ? 'missions' : 'workflows', subject);
                if (target.getString('workspace') !== workspace) throw new ForbiddenError('Scope mismatch');
                access.readable(e.app, target, e.requestInfo());
            }
        }),
    };
    try {
        sources.integrations = { state: 'available', page: 1, has_more: false,
            items: administration.integrations(e).items.map((item) => ({ provider: item.provider, label: item.label,
                desired_enabled: item.desired_enabled, observation: item.observation })) };
    } catch { sources.integrations = { state: 'unavailable', items: [], page: 1, has_more: false }; }
    // A source failure must never conceal loss of the workspace itself.
    const scope = access.requireRole(e.app, e.auth, workspace);
    return { schema_version: 'buildanddo.operator-snapshot/v1', workspace, role: scope.role,
        observed_at: new Date().toISOString(), page_size: PAGE_SIZE, sources };
}

module.exports = { snapshot };
