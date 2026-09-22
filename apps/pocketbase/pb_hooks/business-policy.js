// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/business-policy.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workflow-policy.js, apps/pocketbase/pb_hooks/government-access.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js; CONSUMES apps/pocketbase/pb_hooks/government-access.js
// DAG Node:    none
// Intent:      Preserve workspace relations and require attributed review before recording content publication.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workflow-policy.js`);
const COPY_FIELDS = ['title', 'body', 'format', 'audience', 'brief', 'call_to_action', 'channel', 'objective'];
const REVIEW_CHECKS = ['accuracy', 'privacy', 'rights', 'accessibility'];

/** Validate current workspace authority and retain ownership. */
function workspace(e, creating) {
    access.authenticated(e);
    const record = e.record;
    const original = creating ? null : record.original();
    if (creating ? record.getString('owner') !== e.auth.id :
        record.getString('owner') !== original.getString('owner') ||
        record.getString('workspace') !== original.getString('workspace'))
        access.invalid('Ownership and workspace cannot be reassigned.');
    access.writable(e.app, e.auth, record.getString('workspace'));
    return original;
}

/** Require a selected business record to be readable in this workspace. */
function relation(e, field, collection) {
    const id = e.record.getString(field);
    if (!id) return;
    const linked = access.find(e.app, collection, id);
    if (linked.getString('workspace') !== e.record.getString('workspace'))
        access.invalid('Select a related record from this workspace.');
    access.readable(e.app, linked, e.requestInfo());
}

/** Validate editable objectives, tasks and contacts. */
function erp(e, creating) {
    workspace(e, creating);
    const record = e.record;
    const name = record.collection().name;
    const required = { erp_tasks: ['description', 'priority', 'due_date', 'contact'], erp_objectives: ['success_metric', 'due_date'] };
    if ((required[name] || []).some((field) => !record.collection().fields.getByName(field)))
        throw new ApiError(503, 'The ERP planning migration is required before editing.');
    if (name === 'erp_tasks') {
        relation(e, 'objective', 'erp_objectives');
        relation(e, 'contact', 'erp_contacts');
        relation(e, 'mission', 'missions');
        if (!creating && record.original().getString('execution') &&
            record.getString('mission') !== record.original().getString('mission'))
            access.invalid('Keep an executed task linked to its approved mission.');
        if (!record.getString('priority')) record.set('priority', 'normal');
        if (!['todo', 'in_progress', 'done'].includes(record.getString('status')) ||
            !['low', 'normal', 'high'].includes(record.getString('priority')))
            access.invalid('Choose a listed task state and priority.');
    } else if (name === 'erp_objectives' &&
        !['active', 'achieved', 'archived'].includes(record.getString('status')))
        access.invalid('Choose a listed objective state.');
    return e.next();
}

function httpsLink(value) {
    if (!access.text(value, 2048)) return false;
    const match = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::([0-9]{1,5}))?(?:[/?#][^\s]*)?$/i.exec(value);
    return Boolean(match) && (!match[1] || (Number(match[1]) > 0 && Number(match[1]) <= 65535));
}

/** Enforce draft, review and operator-recorded publication transitions. */
function content(e, creating) {
    const original = workspace(e, creating);
    const record = e.record;
    const status = record.getString('status');
    const previous = original?.getString('status');
    for (const name of ['format', 'audience', 'brief', 'call_to_action', 'objective', 'review_checks', 'review_note', 'reviewed_by', 'reviewed_at', 'published_url', 'published_at', 'published_by']) {
        if (!record.collection().fields.getByName(name))
            throw new ApiError(503, 'The content desk migration is required before editing.');
    }
    relation(e, 'objective', 'erp_objectives');
    if (!record.getString('format')) record.set('format', 'social');
    if (!['blog', 'tutorial', 'social'].includes(record.getString('format')))
        access.invalid('Choose blog, tutorial or social content.');
    if (!access.text(record.getString('title'), 200)) access.invalid('Name the draft.');
    if (creating && status !== 'draft') access.invalid('Save a draft before requesting review.');
    const transitions = {
        draft: ['draft', 'awaiting_approval'],
        awaiting_approval: ['awaiting_approval', 'draft', 'approved'],
        approved: ['draft', 'scheduled', 'published'],
        scheduled: ['draft', 'scheduled', 'published'],
        failed: ['draft'],
        published: [],
    };
    if (!creating && !(transitions[previous] || []).includes(status))
        access.invalid('This content transition is unavailable. Published receipts are retained; copy to a new draft.');
    const changed = original && COPY_FIELDS.some((name) => record.getString(name) !== original.getString(name));
    if (changed && status !== 'draft') access.invalid('Return to draft before changing copy or its brief.');
    if (status !== 'draft' && (!access.text(record.getString('body'), 5000) || !access.text(record.getString('audience'), 300)))
        access.invalid('Add the intended audience and draft body before review.');
    if (status === 'approved') {
        access.writable(e.app, e.auth, record.getString('workspace'), true);
        const checks = access.json(record, 'review_checks', {});
        if (!access.fields(checks, REVIEW_CHECKS) || !REVIEW_CHECKS.every((name) => checks[name] === true) ||
            !access.text(record.getString('review_note'), 1200))
            access.invalid('Record the four review checks and a review note.');
        record.set('reviewed_by', e.auth.id);
        record.set('reviewed_at', new Date().toISOString());
    } else {
        for (const name of ['reviewed_by', 'reviewed_at', 'review_note'])
            record.set(name, status === 'draft' ? '' : original?.getString(name) || '');
        record.set('review_checks', status === 'draft' ? {} : access.json(original, 'review_checks', {}));
    }
    if (['scheduled', 'published'].includes(status)) {
        if (!original?.getString('reviewed_by') || !original.getString('reviewed_at') ||
            !REVIEW_CHECKS.every((name) => access.json(original, 'review_checks', {})[name] === true))
            access.invalid('A saved review is required before planning or recording publication.');
    }
    if (status === 'scheduled' && !record.getString('scheduled_for'))
        access.invalid('Choose a planned publication date.');
    if (status === 'published') {
        access.writable(e.app, e.auth, record.getString('workspace'), true);
        if (!httpsLink(record.getString('published_url')))
            access.invalid('Record the HTTPS URL of the publication you checked.');
        record.set('published_by', e.auth.id);
        record.set('published_at', new Date().toISOString());
    } else {
        for (const name of ['published_url', 'published_by', 'published_at']) record.set(name, '');
    }
    return e.next();
}

/** Retain reviewed content and publication receipts through ordinary requests. */
function removeContent(e) {
    workspace(e, false);
    if (e.record.getString('status') !== 'draft')
        access.invalid('Retain reviewed content and publication history.');
    return e.next();
}

/** Preserve account-owned lesson progress and completed learning. */
function progress(e, creating) {
    access.authenticated(e);
    const record = e.record;
    const original = creating ? null : record.original();
    if (record.getString('owner') !== e.auth.id || (!creating &&
        (record.getString('owner') !== original.getString('owner') || record.getString('tutorial') !== original.getString('tutorial'))))
        access.invalid('Learning progress stays with its original account and lesson.');
    const tutorial = access.find(e.app, 'tutorials', record.getString('tutorial'));
    if (!require(`${__hooks}/government-access.js`).lesson(e.app, e.auth, tutorial)) access.readable(e.app, tutorial, e.requestInfo());
    const status = record.getString('status');
    if (!['not_started', 'in_progress', 'completed'].includes(status)) access.invalid('Choose a listed learning state.');
    if (original?.getString('status') === 'completed' && status !== 'completed')
        access.invalid('Reviewing a lesson keeps its completed progress.');
    record.set('progress', { not_started: 0, in_progress: 50, completed: 100 }[status]);
    return e.next();
}

module.exports = { erp, content, removeContent, progress };
