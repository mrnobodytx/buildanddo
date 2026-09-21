// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_hooks/business-action-policy.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      AGENTS.md
// EnumType:     Schema
// EnumEdges:    DEPENDS_ON AGENTS.md
// DAG Node:     none
// Intent:       Freeze narrowly scoped action inputs before workflow approval and reject arbitrary commands or callback targets.
// ───────────────────────────────────────────────────────────────

function invalid(message) { throw new BadRequestError(message); }
function exact(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
        Object.keys(value).some((key) => !keys.includes(key))) invalid('Use the declared action fields.');
}
function text(value, limit, empty = false) {
    if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim())) invalid('Supply bounded action text.');
    return value.trim();
}
function id(value) {
    if (typeof value !== 'string' || (value && !/^[a-zA-Z0-9_-]{1,64}$/.test(value))) invalid('Use a saved workspace record identifier.');
    return value;
}
function publicUrl(value) {
    const url = text(value, 2048);
    const host = /^https:\/\/([a-zA-Z0-9.-]+)(?::443)?(?:[/?][^\s\\#]*)?$/.exec(url)?.[1]?.toLowerCase();
    if (!host || !host.includes('.') || host.endsWith('.') || /^[0-9.]+$/.test(host) ||
        /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) ||
        host.split('.').some((part) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)))
        invalid('Choose a public HTTPS source without credentials, fragments or custom ports.');
    return url;
}
/** Admit only bounded built-in effects and explicitly registered external bindings. */
function action(value) {
    exact(value, ['provider', 'binding', 'parameters', 'max_seconds']);
    if (!['erp', 'firecrawl', 'n8n'].includes(value.provider) || !Number.isSafeInteger(value.max_seconds) || value.max_seconds < 5 || value.max_seconds > 60)
        invalid('Choose a supported business action with a limit of 5 to 60 seconds.');
    const binding = text(value.binding, 64, value.provider === 'erp');
    if (value.provider === 'erp' ? binding !== '' : !/^[a-z][a-z0-9._-]{1,63}$/.test(binding)) invalid('Choose the registered connector binding.');
    const p = value.parameters; let parameters;
    if (value.provider === 'erp') {
        exact(p, ['title', 'description', 'objective', 'contact', 'priority', 'due_date']);
        if (!['low', 'normal', 'high'].includes(p.priority) || typeof p.due_date !== 'string' ||
            p.due_date && (!/^\d{4}-\d{2}-\d{2}$/.test(p.due_date) || !Number.isFinite(Date.parse(p.due_date)) ||
                new Date(p.due_date).toISOString().slice(0, 10) !== p.due_date)) invalid('Choose a valid priority and calendar due date.');
        parameters = { title: text(p.title, 200), description: text(p.description, 2000, true), objective: id(p.objective),
            contact: id(p.contact), priority: p.priority, due_date: p.due_date };
    } else if (value.provider === 'firecrawl') {
        exact(p, ['url']); parameters = { url: publicUrl(p.url) };
    } else {
        exact(p, ['operation', 'input']);
        const operation = text(p.operation, 64);
        if (!/^[a-z][a-z0-9_-]{1,63}$/.test(operation)) invalid('Choose a registered workflow operation.');
        if (!p.input || typeof p.input !== 'object' || Array.isArray(p.input) || JSON.stringify(p.input).length > 4000)
            invalid('Supply an object with at most 4,000 characters of workflow input.');
        parameters = { operation, input: p.input };
    }
    return { provider: value.provider, binding, parameters, max_seconds: value.max_seconds };
}
module.exports = { action, publicUrl };
