// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/lib/workspaceAssistant.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/assistant-policy.js, apps/pocketbase/pb_hooks/workspace-assistant.js
// EnumType:     Adapter
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/assistant-policy.js; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-assistant.js
// DAG Node:     none
// Intent:       Constrain assistant form assistance to current visible controls and account-bound native conversations.
// ───────────────────────────────────────────────────────────────

const PRIVATE = /password|passcode|secret|credential|token|api.?key|private.?key|credit.?card|card.?number|security.?code|payment|bank.?account/i;
const HUMAN = /approv|verif|publish|delete|remove|forget|grant|invite|deploy|sign.?out|log.?out|revoke|billing|payment|submit.?bid|\brole\b|permission|authority|add.?member/i;
const KINDS = ['text', 'textarea', 'select', 'checkbox', 'number', 'date', 'email', 'url', 'button'];
const safeId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);

/** Bind assistant requests to one mounted account/workspace and discard late responses.
 * @param {object} options Native client, request admission and immutable scope guards.
 * @returns {object} Authenticated conversation operations.
 */
export function createAssistantClient({ client, workspaceId, accountId, isCurrent, isScopeCurrent = isCurrent }) {
    const scoped = () => Boolean(safeId(workspaceId) && safeId(accountId) && isScopeCurrent() && client.authStore.record?.id === accountId);
    const current = () => scoped() && isCurrent();
    const base = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/assistant`;
    const request = async (suffix, method, body, query) => {
        if (!current()) return { ok: false, stale: true };
        // Only command receipts can settle during polling; chat and private
        // reads still require current permission. Every response keeps its scope.
        const canSettle = method === 'POST' && suffix === '' ? scoped : current;
        try {
            const data = await client.send(base + suffix, { method, body, query, requestKey: null });
            if (!canSettle()) return { ok: false, stale: true };
            if (data?.workspace !== workspaceId || data?.owner !== accountId) return { ok: false, error: 'The assistant response does not belong to this account and workspace.' };
            return { ok: true, data };
        } catch (error) {
            return canSettle() ? { ok: false, error: error?.response?.message || 'Could not confirm the assistant response. Reload the session or retry the same message.' } : { ok: false, stale: true };
        }
    };
    return {
        snapshot: (session = '', page = 1, turnPage = 1) => request('', 'GET', undefined, { session, page, turn_page: turnPage }),
        command: (action, payload, requestKey) => request('', 'POST', { action, payload, request_key: requestKey }),
        chat: (body) => request('/chat', 'POST', body),
        knowledge: (page = 1) => request('/knowledge', 'GET', undefined, { page }),
    };
}
function labelOf(element) {
    const labels = [...(element.labels || [])].map((label) => {
        const text = label.cloneNode(true);
        text.querySelectorAll('input,textarea,select,button,[role="combobox"],[role="listbox"]').forEach((control) => control.remove());
        return text.textContent;
    }).join(' ');
    return (element.getAttribute('aria-label') || labels ||
        (['BUTTON', 'A'].includes(element.tagName) || ['button', 'option', 'menuitem', 'tab'].includes(element.getAttribute('role')) ? element.textContent : '') || element.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}
function kindOf(element) {
    return element.tagName === 'TEXTAREA' ? 'textarea' : element.tagName === 'SELECT' ? 'select' : (['BUTTON', 'A'].includes(element.tagName) || ['button', 'combobox', 'option', 'menuitem', 'tab'].includes(element.getAttribute('role'))) ? 'button' : element.type || 'text';
}
function visible(element, document) {
    const style = document.defaultView.getComputedStyle(element);
    return element.isConnected && !element.disabled && element.getAttribute('aria-disabled') !== 'true' && !element.readOnly && !element.closest('[hidden], [inert], [aria-hidden="true"], [data-assistant-panel]') &&
        style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}
function humanContext(element) {
    if (element.closest('[data-assistant-authority="human"], [role="alertdialog"]')) return true;
    const boundary = element.closest('[role="dialog"], form');
    if (!boundary) return false;
    const named = (boundary.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => boundary.ownerDocument.getElementById(id)?.textContent || '').join(' ');
    const title = [...boundary.querySelectorAll('h1,h2,h3,legend')].map((item) => item.textContent).join(' ');
    return HUMAN.test(`${boundary.getAttribute('aria-label') || ''} ${named} ${title}`);
}
function describe(element) {
    if (humanContext(element)) return null;
    if (element.tagName === 'A' && !/^\/app(?:[/?]|$)/.test(element.getAttribute('href') || '')) return null;
    const label = labelOf(element), kind = kindOf(element);
    if (!label || PRIVATE.test(label + ' ' + element.name + ' ' + element.id) || HUMAN.test(label) || !KINDS.includes(kind)) return null;
    const options = kind === 'select' ? [...element.options].filter((item) => !item.disabled && item.value && !HUMAN.test(item.value + ' ' + item.textContent)).map((item) => item.value) : [];
    if (options.length > 40 || options.some((item) => item.length > 160)) return null;
    return { label, kind, options, max_length: kind === 'button' || kind === 'checkbox' ? 0 : Math.min(4000, element.maxLength > 0 ? element.maxLength : 4000) };
}
function localValue(element) { return element.type === 'checkbox' ? element.checked : element.value; }

/** Capture only visible control metadata; keep existing field values inside this browser.
 * @param {Document} document The current page document.
 * @param {string} route Current router pathname.
 * @param {() => string} key Surface identity generator.
 * @returns {object} Public metadata and a private element map.
 */
export function captureAssistantSurface(document, route, key = () => globalThis.crypto.randomUUID()) {
    const controls = [], targets = new Map();
    const roots = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"]')].filter((element) => !element.closest('[data-assistant-panel]') && visible(element, document));
    if (!roots.length) roots.push(...document.querySelectorAll('[data-assistant-surface]'));
    for (const root of roots) for (const element of root.querySelectorAll('input,textarea,select,button,a[href],[role=button],[role=combobox],[role=option],[role=menuitem],[role=tab]')) {
        if (controls.length >= 60 || !visible(element, document)) continue;
        const descriptor = describe(element); if (!descriptor) continue;
        const id = `control-${controls.length}`;
        if (JSON.stringify([...controls, { id, ...descriptor }]).length > 11000) continue;
        controls.push({ id, ...descriptor });
        targets.set(id, { element, descriptor, previous: localValue(element) });
    }
    return { public: { id: key(), route, controls }, targets };
}

/** Apply a user-reviewed plan to the exact captured surface, stopping when its scope changes.
 * @param {object} options Plan, captured controls, router and scope guards.
 * @returns {Promise<object>} Browser-observed outcome; never a verified business result.
 */
export async function applyAssistantPlan({ plan, surface, document, currentRoute, isCurrent, navigate }) {
    let completed = 0;
    const fail = () => ({ outcome: completed ? 'partial' : 'failed', completed_steps: completed, observation: 'The page, field or permission context changed. Inspect a fresh surface before continuing.' });
    if (!isCurrent() || plan.surface_id !== surface.public.id || plan.route !== currentRoute() || !Array.isArray(plan.steps) || plan.steps.length > 8) return fail();
    for (const step of plan.steps) {
        if (!isCurrent() || currentRoute() !== surface.public.route) return fail();
        if (step.kind === 'navigate') {
            if (typeof step.path !== 'string' || !/^\/app(?:\/[a-zA-Z0-9_-]+)*$/.test(step.path)) return fail();
            navigate(step.path); completed++; break;
        }
        const target = surface.targets.get(step.control);
        if (!target || !visible(target.element, document) || JSON.stringify(describe(target.element)) !== JSON.stringify(target.descriptor) ||
            localValue(target.element) !== target.previous) return fail();
        const element = target.element, kind = target.descriptor.kind;
        if (step.kind === 'activate') {
            if (kind !== 'button' || HUMAN.test(labelOf(element))) return fail();
            element.click(); completed++; break;
        }
        if (step.kind !== 'fill' || kind === 'button' || kind === 'select' && !target.descriptor.options.includes(step.value) ||
            kind !== 'checkbox' && (typeof step.value !== 'string' || step.value.length > target.descriptor.max_length) ||
            kind === 'checkbox' && typeof step.value !== 'boolean') return fail();
        element.focus();
        const view = document.defaultView;
        if (kind === 'checkbox') {
            if (element.checked !== step.value) element.click();
        } else {
            const proto = kind === 'textarea' ? view.HTMLTextAreaElement.prototype : kind === 'select' ? view.HTMLSelectElement.prototype : view.HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, step.value);
            element.dispatchEvent(new view.Event('input', { bubbles: true }));
            element.dispatchEvent(new view.Event('change', { bubbles: true }));
        }
        await Promise.resolve();
        if (!isCurrent() || localValue(element) !== step.value) return fail();
        target.previous = localValue(element); completed++;
    }
    return { outcome: completed === plan.steps.length ? 'applied' : 'partial', completed_steps: completed,
        observation: 'Browser interaction observed. Confirm the saved result in its native desk; this is not independent verification.' };
}
