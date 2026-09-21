// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/__tests__/AssistantSurface.test.jsx
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
// Intent:       Exercise reviewed assistance against rendered React controls, stale user input and human-authority dialog boundaries.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyAssistantPlan, captureAssistantSurface } from '@/lib/workspaceAssistant';
beforeEach(() => { vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{ width: 100, height: 20 }]); });
afterEach(() => { vi.restoreAllMocks(); });
function Editor() {
    const [title, setTitle] = useState('Original private value');
    return <main data-assistant-surface><form><h2>Task editor</h2><label>Task title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Password<input type="password" defaultValue="fixture-only" /></label><label>Hidden field<input type="hidden" defaultValue="not-context" /></label>
        <button type="button">Save task</button><button type="button">Approve mission</button></form><output>{title}</output></main>;
}
const capture = () => captureAssistantSurface(document, '/app/erp', () => 'stable-current-surface');
async function apply(surface, steps, overrides = {}) {
    let result;
    await act(async () => { result = await applyAssistantPlan({ plan: { route: '/app/erp', surface_id: surface.public.id, steps }, surface, document,
        currentRoute: () => '/app/erp', isCurrent: () => true, navigate: vi.fn(), ...overrides }); });
    return result;
}
it('captures control metadata without current values, credentials or authority controls', () => {
    render(<Editor />); const surface = capture();
    expect(surface.public.controls.map((item) => item.label)).toEqual(['Task title', 'Save task']);
    expect(JSON.stringify(surface.public)).not.toContain('Original private value'); expect(JSON.stringify(surface.public)).not.toContain('fixture-only');
});
it('fills a real controlled React field only when the reviewed plan is applied', async () => {
    render(<Editor />); const surface = capture();
    expect(screen.getByLabelText('Task title')).toHaveValue('Original private value');
    const result = await apply(surface, [{ kind: 'fill', control: 'control-0', value: 'A reviewed title' }]);
    expect(result.outcome).toBe('applied'); expect(screen.getByRole('status')).toHaveTextContent('A reviewed title');
});
it('separates a wrapping select label from its options and excludes privileged options', async () => {
    render(<main data-assistant-surface><label>Status<select defaultValue="draft"><option value="draft">Draft</option><option value="ready">Ready</option><option value="verified">Verified</option></select></label></main>);
    const surface = capture();
    expect(surface.public.controls[0].label).toBe('Status');
    expect(surface.public.controls[0].options).toEqual(['draft', 'ready']);
    expect((await apply(surface, [{ kind: 'fill', control: 'control-0', value: 'ready' }])).outcome).toBe('applied');
    expect((await apply(capture(), [{ kind: 'fill', control: 'control-0', value: 'verified' }])).outcome).toBe('failed');
});
it('rejects changed field contents instead of overwriting the user’s intervening input', async () => {
    render(<Editor />); const surface = capture(); fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'User correction' } });
    expect((await apply(surface, [{ kind: 'fill', control: 'control-0', value: 'Old model value' }])).outcome).toBe('failed');
    expect(screen.getByLabelText('Task title')).toHaveValue('User correction');
});
it('rejects a stale route, unmounted controls and changed account authority', async () => {
    const view = render(<Editor />), surface = capture(); const steps = [{ kind: 'fill', control: 'control-0', value: 'Stale' }];
    expect((await apply(surface, steps, { currentRoute: () => '/app/missions' })).outcome).toBe('failed');
    expect((await apply(surface, steps, { isCurrent: () => false })).outcome).toBe('failed');
    view.unmount(); expect((await apply(surface, steps)).outcome).toBe('failed');
});
it('stops after one activation and does not apply controls from the next page', async () => {
    render(<Editor />); const button = screen.getByRole('button', { name: 'Save task' }), activated = vi.fn(); button.onclick = activated;
    const surface = capture(); const result = await apply(surface, [{ kind: 'activate', control: 'control-1' }, { kind: 'fill', control: 'control-0', value: 'Should not happen' }]);
    expect(activated).toHaveBeenCalledTimes(1); expect(result.outcome).toBe('partial'); expect(result.completed_steps).toBe(1);
    expect(screen.getByLabelText('Task title')).toHaveValue('Original private value');
});
it('generic confirmation in a human approval dialog never becomes an inferred control', () => {
    render(<><Editor /><section role="dialog" aria-label="Mission approval"><label>Note<input /></label><button>Confirm</button></section></>);
    expect(capture().public.controls).toEqual([]);
});
it('destructive alert dialogs hide both their own controls and the background page', () => {
    render(<><Editor /><section role="alertdialog"><button>Continue</button></section></>); expect(capture().public.controls).toEqual([]);
});
it('allows local navigation and rejects model-supplied external addresses', async () => {
    render(<Editor />); const surface = capture(), navigate = vi.fn();
    expect((await apply(surface, [{ kind: 'navigate', path: '/app/missions' }], { navigate })).outcome).toBe('applied');
    expect(navigate).toHaveBeenCalledWith('/app/missions');
    expect((await apply(surface, [{ kind: 'navigate', path: '//attacker.example.org' }], { navigate })).outcome).toBe('failed');
});
