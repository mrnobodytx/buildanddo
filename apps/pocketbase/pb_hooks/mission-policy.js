// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_hooks/mission-policy.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js
// EnumType:     Service
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js
// DAG Node:     none
// Intent:       Enforce persisted mission boundaries, lifecycle transitions and evidence requirements independently of the browser.
// ───────────────────────────────────────────────────────────────

// Kept dependency-free for PocketBase's isolated JSVM callbacks. UI contract
// parity is tested; the request hook is authoritative for mission writes.
const PLAN_FIELDS = [
    'purpose',
    'beneficiary',
    'in_scope',
    'out_of_scope',
    'baseline',
    'target',
    'authorization',
    'input_validation',
    'data_handling',
    'rollback',
    'test',
    'evaluate',
    'verify',
    'validate',
];
const TEVV = ['test', 'evaluate', 'verify', 'validate'];
const ANSWERS = {
    scope: ['activity', 'measured', 'optimistic'],
    tevv: ['validation', 'compilation', 'badge'],
    owasp: ['obey', 'reward', 'boundary'],
    credentials: ['yes', 'evidence', 'points'],
};
const TRANSITIONS = {
    proposed: ['approved'],
    approved: ['proposed', 'running'],
    running: ['needs_attention', 'verified', 'failed'],
    needs_attention: ['proposed', 'running', 'failed'],
    verified: [],
    failed: [],
};

function invalid(message) {
    throw new BadRequestError(message);
}
function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value, limit, required) {
    return (
        typeof value === 'string' && value.length <= limit && (!required || value.trim().length > 0)
    );
}
function keys(value, allowed) {
    return object(value) && Object.keys(value).every((key) => allowed.includes(key));
}
function json(record, name) {
    // JSONRaw is exposed by getString as its serialized JSON, unlike a Go map.
    const raw = record.getString(name);
    if (!raw || raw === 'null') return null;
    try {
        return JSON.parse(raw);
    } catch {
        invalid('The mission data format is invalid. Reload and try again.');
    }
}
function same(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b))
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => same(value, b[i]));
    if (!object(a) || !object(b)) return false;
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    return ak.length === bk.length && ak.every((key, i) => key === bk[i] && same(a[key], b[key]));
}
function draft() {
    const plan = { version: 1, risk: 'A1' };
    PLAN_FIELDS.forEach((field) => {
        plan[field] = '';
    });
    return plan;
}
function validatePlan(plan, complete) {
    if (
        !keys(plan, ['version', 'risk', 'independent_review'].concat(PLAN_FIELDS)) ||
        plan.version !== 1 ||
        (Object.hasOwn(plan, 'independent_review') && typeof plan.independent_review !== 'boolean') ||
        !['A0', 'A1', 'A2'].includes(plan.risk)
    ) {
        invalid(
            'Use the current mission plan and a risk tier from A0 to A2. Higher risk needs a separate authorization.',
        );
    }
    if (!PLAN_FIELDS.every((field) => text(plan[field], 1200, complete))) {
        invalid(
            complete
                ? 'Complete the purpose, boundaries, security and four TEVV methods before approval or work.'
                : 'Keep each plan answer within 1,200 characters.',
        );
    }
}
function validateLearning(learning) {
    if (
        !keys(learning, Object.keys(ANSWERS)) ||
        !Object.keys(learning).every((id) => ANSWERS[id].includes(learning[id]))
    ) {
        invalid(
            'Save a listed lesson answer. Learning points cannot be submitted or used as permission.',
        );
    }
}
function validateReview(review) {
    if (!keys(review, TEVV.concat(['version', 'reflection', 'evidence_snapshot'])) ||
        (Object.hasOwn(review, 'version') && review.version !== 1) || !text(review.reflection, 1200, false))
        invalid('Use review version 1, the four TEVV review sections and a reflection.');
    TEVV.forEach((id) => {
        const item = review[id];
        if (
            !keys(item, ['outcome', 'observation', 'evidence']) ||
            !['not_run', 'pass', 'fail'].includes(item.outcome) ||
            !text(item.observation, 1200, false) ||
            !text(item.evidence, 30, false)
        ) {
            invalid(
                'Keep each review observation within 1,200 characters and select a listed outcome.',
            );
        }
    });
}
function writableWorkspace(e, workspaceId) {
    const workspace = e.app.findRecordById('workspaces', workspaceId);
    if (workspace.getString('owner') === e.auth.id) return;
    // Parameterized values and one row bind role, workspace and user together.
    const members = e.app.findRecordsByFilter(
        'workspace_members',
        'workspace = {:workspace} && user = {:user} && (role = "owner" || role = "admin" || role = "editor")',
        '',
        1,
        0,
        { workspace: workspaceId, user: e.auth.id },
    );
    if (!members.length)
        throw new ForbiddenError('A workspace owner, admin or editor must record this decision.');
}
function evidenceFor(e, id, independent = false) {
    let evidence;
    try {
        evidence = e.app.findRecordById('evidence', id);
    } catch {
        invalid('Choose readable evidence recorded for this mission and workspace.');
    }
    if (
        evidence.getString('workspace') !== e.record.getString('workspace') ||
        evidence.getString('mission') !== e.record.id ||
        !e.app.canAccessRecord(evidence, e.requestInfo(), evidence.collection().viewRule) ||
        !evidence.getString('source').trim() ||
        !evidence.getString('content').trim()
    ) {
        invalid(
            'Choose readable evidence with a source and observation for this mission and workspace.',
        );
    }
    if (independent && (!evidence.getString('owner') || evidence.getString('owner') === e.auth.id))
        invalid('An independent reviewer must differ from every selected evidence author.');
    return Object.fromEntries(['workspace', 'mission', 'owner', 'type', 'title', 'source', 'content', 'url', 'created', 'updated']
        .map((field) => [field, evidence.getString(field)]).concat([['id', evidence.id]]));
}
function passingReview(e, review, independent = false) {
    if (!review || !text(review.reflection, 1200, true))
        invalid('Record what you learned before verification.');
    const checked = new Set();
    const snapshots = [];
    TEVV.forEach((id) => {
        const item = review[id];
        if (item.outcome !== 'pass' || !text(item.observation, 1200, true) || !item.evidence)
            invalid('Verification needs four passing TEVV observations with evidence.');
        if (!checked.has(item.evidence)) {
            snapshots.push(evidenceFor(e, item.evidence, independent));
            checked.add(item.evidence);
        }
    });
    return snapshots;
}

/** Enforce native authenticated mission request invariants before persistence. */
function enforce(e, creating) {
    if (!e.auth || !e.auth.id) throw new ForbiddenError('Sign in to save a mission.');
    const record = e.record;
    for (const name of [
        'mission_plan',
        'mission_learning',
        'mission_review',
        'mission_approved_by',
        'mission_approved_at',
        'mission_reviewed_by',
        'mission_reviewed_at',
    ]) {
        if (!record.collection().fields.getByName(name))
            throw new ApiError(
                503,
                'The mission schema upgrade is not installed yet. Ask the workspace operator to apply it.',
            );
    }
    const original = creating ? null : record.original();
    if (creating && record.getString('owner') !== e.auth.id)
        throw new ForbiddenError('Create a mission under your own account.');
    if (
        !creating &&
        (record.getString('owner') !== original.getString('owner') ||
            record.getString('workspace') !== original.getString('workspace'))
    )
        invalid('Mission ownership and workspace cannot be reassigned.');
    writableWorkspace(e, record.getString('workspace'));

    const before = creating ? '' : original.getString('status');
    const after = record.getString('status');
    if (
        creating
            ? after !== 'proposed'
            : !Object.prototype.hasOwnProperty.call(TRANSITIONS, before) ||
              (before !== after && !TRANSITIONS[before].includes(after))
    )
        invalid(
            'Follow the mission sequence: propose, approve, record work, then review the outcome.',
        );

    const oldPlan = creating ? null : json(original, 'mission_plan');
    let plan = json(record, 'mission_plan');
    // Existing drafts can enter the builder without an invented baseline.
    if (plan === null && after === 'proposed') {
        plan = draft();
        record.set('mission_plan', plan);
    }
    if (plan !== null) validatePlan(plan, ['approved', 'running', 'verified'].includes(after));
    else if (before !== after && ['approved', 'running', 'verified'].includes(after))
        invalid('Complete a mission plan before continuing this legacy mission.');

    const changedPlan =
        !same(oldPlan, plan) ||
        (!creating &&
            (record.getString('title') !== original.getString('title') ||
                record.getString('description') !== original.getString('description')));
    if (
        !creating &&
        changedPlan &&
        before !== 'proposed' &&
        !(after === 'proposed' && ['approved', 'needs_attention'].includes(before))
    )
        invalid('Pause work and return to a proposal before changing the approved goal or plan.');
    if (!creating && before === 'proposed' && after === 'approved' && changedPlan)
        invalid('Save the plan first, then approve the saved proposal.');
    if (
        !creating &&
        ['running', 'verified'].includes(after) &&
        before !== after &&
        (!original.getString('mission_approved_by') || !original.getString('mission_approved_at'))
    )
        invalid(
            'Return this legacy mission to a proposal and record approval before starting work.',
        );

    const learning = json(record, 'mission_learning');
    if (learning !== null) validateLearning(learning);
    const review = json(record, 'mission_review');
    if (review !== null) validateReview(review);
    if (review && Object.hasOwn(review, 'evidence_snapshot') && before !== 'verified')
        invalid('Reviewed evidence snapshots are supplied by the server at verification.');
    const changedReview = !same(creating ? null : json(original, 'mission_review'), review);
    if (changedReview && !['running', 'needs_attention', 'verified', 'failed'].includes(after))
        invalid('Record work before adding a TEVV review.');
    if (
        ['verified', 'failed'].includes(before) &&
        (changedReview ||
            changedPlan ||
            record.get('progress') !== original.get('progress') ||
            record.getString('priority') !== original.getString('priority') ||
            record.getString('due_date') !== original.getString('due_date'))
    )
        invalid('A finished mission keeps its outcome. Propose a new mission for further work.');

    // Client-supplied authorship is never accepted. Reapproval invalidates the
    // earlier review so its outcome cannot silently refer to a changed plan.
    record.set('mission_approved_by', creating ? '' : original.getString('mission_approved_by'));
    record.set('mission_approved_at', creating ? '' : original.getString('mission_approved_at'));
    record.set('mission_reviewed_by', creating ? '' : original.getString('mission_reviewed_by'));
    record.set('mission_reviewed_at', creating ? '' : original.getString('mission_reviewed_at'));
    if (after === 'approved' && before !== after) {
        record.set('mission_approved_by', e.auth.id);
        record.set('mission_approved_at', new Date().toISOString());
    }
    if (changedReview && review && ['running', 'needs_attention', 'failed'].includes(after)) {
        record.set('mission_review', { ...review, version: 1 });
        record.set('mission_reviewed_by', e.auth.id);
        record.set('mission_reviewed_at', new Date().toISOString());
    }
    if (after === 'proposed' && before && before !== after) {
        record.set('mission_review', null);
        record.set('mission_reviewed_by', '');
        record.set('mission_reviewed_at', '');
        record.set('mission_approved_by', '');
        record.set('mission_approved_at', '');
    }
    if (after === 'verified' && before !== 'verified') {
        if (plan?.independent_review && record.getString('owner') === e.auth.id)
            invalid('An independent reviewer must differ from the mission proposer.');
        const snapshots = passingReview(e, review, plan?.independent_review === true);
        // Freeze the exact observations reviewed; later record changes cannot
        // silently change what this decision actually evaluated.
        record.set('mission_review', { ...review, version: 1, evidence_snapshot: snapshots });
        record.set('mission_reviewed_by', e.auth.id);
        record.set('mission_reviewed_at', new Date().toISOString());
        record.set('progress', 100);
    }
    if (
        after === 'failed' &&
        before !== 'failed' &&
        (!review || !text(review.reflection, 1200, true))
    )
        invalid('Record the failure and what to try next in the review reflection.');
    // Measure the final JSONField bytes, including server metadata and snapshots.
    // Unchanged historical reviews are neither upgraded nor re-sized on unrelated edits.
    if (review && (changedReview || (after === 'verified' && before !== after))) {
        let bytes = 0;
        for (const character of record.getString('mission_review')) {
            const code = character.codePointAt(0);
            bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
        }
        if (bytes > 24000)
            invalid('The complete review, including evidence snapshots, must fit within 24,000 UTF-8 bytes. Shorten observations or select smaller evidence records.');
    }
    return e.next();
}
module.exports = { PLAN_FIELDS, TEVV, ANSWERS, TRANSITIONS, enforce };
