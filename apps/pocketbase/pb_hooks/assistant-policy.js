// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_hooks/assistant-policy.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/workspace-access.js
// EnumType:     Service
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js
// DAG Node:     none
// Intent:       Constrain inferred assistant plans to known routes and current nonsensitive controls while preserving human authority decisions.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const ROUTES = [
    ['/app', 'Front Page'], ['/app/journey', 'Start a journey'], ['/app/career', 'Career Passport'],
    ['/app/operator', 'Operator cockpit'], ['/app/signals', 'Signals'], ['/app/missions', 'Challenge Desk'],
    ['/app/workflows', 'Workflows'], ['/app/evidence', 'Evidence Ledger'], ['/app/research', 'Mission research'],
    ['/app/knowledge', 'Knowledge and context'], ['/app/blueprints', 'Blueprints'],
    ['/app/policy', 'Policy intelligence'], ['/app/suite', 'Mission suite'], ['/app/dossier', 'My dossier'], ['/app/edition', 'Daily Edition'],
    ['/app/desks', 'Specialist desks'], ['/app/replay', 'Execution replay'], ['/app/rooms', 'Living Rooms'], ['/app/rooms/organization', 'Organization Room'],
    ['/app/rooms/capability', 'Capability Room'], ['/app/rooms/development', 'Development Room'], ['/app/rooms/systems', 'Systems Room'],
    ['/app/rooms/live', 'Live Experiment Room'], ['/app/passport', 'Capability Passport'], ['/app/corrections', 'Corrections'],
    ['/app/tutorials', 'Field Manual'], ['/app/classrooms', 'Classrooms'], ['/app/erp', 'ERP'], ['/app/support', 'Support and revenue'],
    ['/app/community', 'Community and social'], ['/app/wiki', 'Workspace wiki'], ['/app/forums', 'Workspace forum'],
    ['/app/roadmap', 'Roadmap'], ['/app/operations', 'Operations Desk'], ['/app/fleet', 'Fleet'], ['/app/platforms', 'Platform health'],
    ['/app/integrations', 'Sinks and extensions'], ['/app/admin', 'Administration'], ['/app/settings', 'Settings'],
];
const sensitive = /password|passcode|secret|credential|token|api.?key|private.?key|credit.?card|card.?number|security.?code|payment|bank.?account/i;
const human = /approv|verif|publish|delete|remove|forget|grant|invite|deploy|sign.?out|log.?out|revoke|billing|payment|submit.?bid|\brole\b|permission|authority|add.?member/i;
function route(value, role) {
    const path = access.bounded(value, 300);
    if (!(ROUTES.some((item) => item[0] === path) || /^\/app\/classrooms\/[a-zA-Z0-9_-]{1,64}$/.test(path)) ||
        path === '/app/admin' && !['owner', 'admin'].includes(role)) access.invalid('Choose an accessible platform route.');
    return path;
}
function surface(value, role) {
    access.exact(value, ['id', 'route', 'controls']); access.id(value.id); route(value.route, role);
    if (access.canonical(value).length > 12000) access.invalid('Inspect a smaller visible form before requesting assistance.');
    if (!Array.isArray(value.controls) || value.controls.length > 60) access.invalid('Provide at most sixty visible controls.');
    const ids = new Set();
    const controls = value.controls.map((control) => {
        access.exact(control, ['id', 'label', 'kind', 'options', 'max_length']);
        access.id(control.id); const label = access.bounded(control.label, 160);
        if (ids.has(control.id) || sensitive.test(label) || human.test(label) || !['text', 'textarea', 'select', 'checkbox', 'number', 'date', 'email', 'url', 'button'].includes(control.kind))
            access.invalid('This control requires direct user interaction.');
        ids.add(control.id);
        if (!Number.isSafeInteger(control.max_length) || control.max_length < 0 || control.max_length > 4000 ||
            !Array.isArray(control.options) || control.options.length > 40 || control.options.some((item) => !access.text(item, 160)))
            access.invalid('The visible control limits are unsupported.');
        return { ...control, label };
    });
    return { id: value.id, route: value.route, controls };
}
function plan(value, captured, role) {
    access.exact(value, ['reply', 'steps']); const reply = access.bounded(value.reply, 8000);
    if (access.canonical(value).length > 16000) access.invalid('The proposed plan exceeds its bounded response budget.');
    if (!Array.isArray(value.steps) || value.steps.length > 8) access.invalid('A plan may contain at most eight bounded steps.');
    let navigated = false;
    const steps = value.steps.map((step) => {
        if (navigated) access.invalid('Inspect the destination before proposing its controls.');
        if (step.kind === 'navigate') {
            access.exact(step, ['kind', 'path']); navigated = true;
            return { kind: 'navigate', path: route(step.path, role) };
        }
        if (role === 'viewer') throw new ForbiddenError('A viewer can navigate and read; form assistance requires write access.');
        const control = captured.controls.find((item) => item.id === step.control);
        if (!control || sensitive.test(control.label) || human.test(control.label)) access.invalid('Use only current visible controls.');
        if (step.kind === 'activate') {
            access.exact(step, ['kind', 'control']);
            if (control.kind !== 'button') access.invalid('Choose a visible supported action.');
            navigated = true;
            return { kind: 'activate', control: control.id, label: control.label };
        }
        access.exact(step, ['kind', 'control', 'value']);
        if (step.kind !== 'fill' || control.kind === 'button') access.invalid('Choose a writable form field.');
        if (control.kind === 'checkbox' ? typeof step.value !== 'boolean' : !access.text(step.value, control.max_length, false))
            access.invalid('The proposed value exceeds this field limit.');
        if (control.kind === 'select' && (!control.options.includes(step.value) || human.test(step.value))) access.invalid('Choose a current select option.');
        return { kind: 'fill', control: control.id, label: control.label, value: step.value };
    });
    return { reply, steps, surface_id: captured.id, route: captured.route };
}
module.exports = { ROUTES, sensitive, human, route, surface, plan };
