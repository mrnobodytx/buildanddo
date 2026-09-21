// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/assistant-browser.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-21
// Depends:      apps/web/src/lib/workspaceAssistant.js
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/web/src/lib/workspaceAssistant.js
// DAG Node:     none
// Intent:       Exercise real DOM boundaries, reviewed form values, navigation and partial outcomes independently of unavailable React test dependencies.
// ───────────────────────────────────────────────────────────────

import { captureAssistantSurface, applyAssistantPlan } from '../../apps/web/src/lib/workspaceAssistant.js';

/** Exercise production form assistance on real browser elements without claiming rendered React acceptance.
 * @param {Document} document Browser document containing only this disposable fixture.
 * @returns {Promise<object>} Explicit behavior observations.
 */
export async function runAssistantBrowserChecks(document) {
    const results = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const fixture = (content) => { document.body.innerHTML = `<main data-assistant-surface>${content}</main>`; };
    const capture = () => captureAssistantSurface(document, '/app/erp', () => 'browser-fixture-surface');
    const apply = (surface, steps, extra = {}) => applyAssistantPlan({ surface, plan: { route: '/app/erp', surface_id: surface.public.id, steps },
        document, currentRoute: () => '/app/erp', isCurrent: () => true, navigate: () => {}, ...extra });
    const fill = (value, control = 'control-0') => ({ kind: 'fill', control, value });
    const check = async (name, test) => {
        try { await test(); results.push({ name, status: 'PASS' }); }
        catch (error) { results.push({ name, status: 'FAIL', observation: error.message }); }
    };
    await check('metadata excludes values, hidden/disabled/readonly inputs, private controls and authority actions', () => {
        fixture('<label>Task title<input value="private initial text"></label><label>Password<input type="password" value="synthetic"></label>' +
            '<label>Hidden<input type="hidden"></label><label>Disabled<input disabled></label><label>Readonly<input readonly></label>' +
            '<button>Approve mission</button><a href="https://outside.example.org">External site</a><div data-assistant-panel><button>Internal chat</button></div>');
        const surface = capture();
        assert(surface.public.controls.length === 1 && surface.public.controls[0].label === 'Task title', 'Unsupported controls were captured');
        assert(!JSON.stringify(surface.public).includes('private initial text'), 'Existing values left the browser');
    });
    for (const tag of ['input', 'textarea']) await check(`native ${tag} setter emits input and change events`, async () => {
        fixture(`<label>Task text<${tag}></${tag}></label>`);
        const element = document.querySelector(tag), events = [];
        element.addEventListener('input', () => events.push('input')); element.addEventListener('change', () => events.push('change'));
        const result = await apply(capture(), [fill('Reviewed text')]);
        assert(result.outcome === 'applied' && element.value === 'Reviewed text', 'Text was not applied');
        assert(events.join(',') === 'input,change', 'Controlled-field events were missing');
    });
    await check('current select options exclude human-authority values', async () => {
        fixture('<label>Status<select><option value="draft">Draft</option><option value="ready">Ready</option><option value="verified">Verified</option></select></label>');
        const surface = capture(); assert(!surface.public.controls[0].options.includes('verified'), 'Authority option was captured');
        assert((await apply(surface, [fill('ready')])).outcome === 'applied', 'Allowed select was rejected');
        assert((await apply(capture(), [fill('verified')])).outcome === 'failed', 'Authority option was applied');
    });
    await check('checkbox updates through one native click and skips unchanged values', async () => {
        fixture('<label>Include summary<input type="checkbox"></label>');
        const element = document.querySelector('input'); let clicks = 0; element.addEventListener('click', () => clicks++);
        assert((await apply(capture(), [fill(true)])).outcome === 'applied' && element.checked, 'Checkbox was not checked');
        assert((await apply(capture(), [fill(true)])).outcome === 'applied' && clicks === 1, 'Unchanged checkbox was clicked again');
        assert((await apply(capture(), [fill('true')])).outcome === 'failed', 'Checkbox accepted a nonboolean value');
    });
    await check('field length and unknown option limits are enforced at application', async () => {
        fixture('<label>Title<input maxlength="3"></label>');
        assert((await apply(capture(), [fill('too long')])).outcome === 'failed', 'Length bound was ignored');
        fixture('<label>Stage<select><option value="draft">Draft</option></select></label>');
        assert((await apply(capture(), [fill('unknown')])).outcome === 'failed', 'Unknown option was applied');
    });
    await check('activation stops before later controls and reports a partial plan', async () => {
        fixture('<button>Save task</button><label>Title<input></label>'); let clicks = 0;
        document.querySelector('button').onclick = () => clicks++;
        const result = await apply(capture(), [{ kind: 'activate', control: 'control-0' }, fill('Later', 'control-1')]);
        assert(result.outcome === 'partial' && result.completed_steps === 1 && clicks === 1 && !document.querySelector('input').value, 'Action boundary was crossed');
    });
    await check('navigation is local and stops before destination interactions', async () => {
        fixture('<label>Title<input></label>'); const paths = [];
        const result = await apply(capture(), [{ kind: 'navigate', path: '/app/missions' }, fill('Later')], { navigate: (path) => paths.push(path) });
        assert(result.outcome === 'partial' && paths[0] === '/app/missions', 'Navigation boundary was lost');
        assert((await apply(capture(), [{ kind: 'navigate', path: '//outside.example.org' }])).outcome === 'failed', 'External navigation was accepted');
    });
    await check('stale routes, surfaces and account authority prevent changes', async () => {
        fixture('<label>Title<input></label>'); const surface = capture();
        assert((await apply(surface, [fill('Stale')], { currentRoute: () => '/app/signals' })).outcome === 'failed', 'Stale route was accepted');
        assert((await apply(surface, [fill('Stale')], { isCurrent: () => false })).outcome === 'failed', 'Stale account was accepted');
        assert((await apply(surface, [fill('Stale')], { plan: { route: '/app/erp', surface_id: 'foreign', steps: [fill('Stale')] } })).outcome === 'failed', 'Stale surface was accepted');
        assert(!document.querySelector('input').value, 'A stale plan changed the form');
    });
    for (const change of ['user edit', 'disabled', 'removed', 'label changed', 'hidden']) await check(`intervening ${change} invalidates the captured control`, async () => {
        fixture('<label>Title<input value="original"></label>'); const element = document.querySelector('input'), surface = capture();
        if (change === 'user edit') element.value = 'user correction';
        if (change === 'disabled') element.disabled = true;
        if (change === 'removed') element.remove();
        if (change === 'label changed') element.setAttribute('aria-label', 'Different field');
        if (change === 'hidden') element.style.display = 'none';
        assert((await apply(surface, [fill('Old model answer')])).outcome === 'failed', 'Changed control was overwritten');
    });
    await check('changed select options invalidate the original surface', async () => {
        fixture('<label>Stage<select><option value="draft">Draft</option></select></label>'); const surface = capture();
        document.querySelector('select').append(new Option('Other', 'other'));
        assert((await apply(surface, [fill('draft')])).outcome === 'failed', 'Changed option set was accepted');
    });
    for (const boundary of ['role="dialog" aria-label="Mission approval"', 'role="alertdialog"', 'role="dialog" data-assistant-authority="human"']) await check(`human boundary ${boundary} excludes generic confirmation and background`, () => {
        fixture('<label>Background<input></label>'); const element = document.createElement('section');
        element.innerHTML = `<section ${boundary}><label>Note<input></label><button>Confirm</button></section>`; document.body.append(element);
        assert(capture().public.controls.length === 0, 'Authority dialog exposed controls');
    });
    await check('ordinary modal and menu control scopes exclude the background', () => {
        fixture('<label>Background<input></label>'); const dialog = document.createElement('section'); dialog.setAttribute('role', 'dialog');
        dialog.innerHTML = '<h2>Task editor</h2><label>Task name<input></label>'; document.body.append(dialog);
        assert(capture().public.controls.map((item) => item.label).join(',') === 'Task name', 'Ordinary dialog scope was incorrect');
        dialog.remove(); const menu = document.createElement('div'); menu.setAttribute('role', 'menu');
        menu.innerHTML = '<div role="menuitem" tabindex="0">Draft view</div>'; document.body.append(menu);
        assert(capture().public.controls.map((item) => item.label).join(',') === 'Draft view', 'Menu scope was incorrect');
    });
    await check('a changed later control retains only the completed steps', async () => {
        fixture('<label>First<input id="first"></label><label>Second<input id="second"></label>'); const surface = capture();
        document.getElementById('first').addEventListener('input', () => { document.getElementById('second').disabled = true; });
        const result = await apply(surface, [fill('First value'), fill('Second value', 'control-1')]);
        assert(result.outcome === 'partial' && result.completed_steps === 1 && !document.getElementById('second').value, 'Partial result lost its boundary');
    });
    await check('control count is bounded for a large real form', () => {
        fixture(Array.from({ length: 100 }, (_, i) => `<label>Field ${i}<input></label>`).join(''));
        assert(capture().public.controls.length === 60, 'Surface exceeded its control count');
    });
    const failed = results.filter((item) => item.status === 'FAIL');
    return { schema_version: 'buildanddo.assistant-browser-check/v1', observed_at: new Date().toISOString(),
        scope: 'Production DOM helper in Chromium with synthetic controls; no rendered React, model, native backend or deployment claim',
        tests: results.length, passed: results.length - failed.length, failed: failed.length, results };
}
