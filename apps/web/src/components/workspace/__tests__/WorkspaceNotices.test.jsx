// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/components/workspace/__tests__/WorkspaceNotices.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/components/workspace/WorkspaceNotices.jsx, apps/web/src/components/workspace/ControlPrimitives.jsx, apps/web/src/hooks/useFailureTelemetry.js, apps/web/src/hooks/useWorkspaceControl.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/WorkspaceNotices.jsx; VALIDATES apps/web/src/components/workspace/ControlPrimitives.jsx; VALIDATES apps/web/src/hooks/useFailureTelemetry.js; VALIDATES apps/web/src/hooks/useWorkspaceControl.js
// DAG Node:    none
// Intent:      Verify rendered failure transitions and cancellation through production hooks while replacing only transport and telemetry sinks.
// ----------------------------------------------------------------

import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlFeedback, ControlState } from '@/components/workspace/ControlPrimitives';
import { DegradedNotice, WriteErrorNotice } from '@/components/workspace/WorkspaceNotices';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';
import { setDemoMode } from '@/lib/demoWorkspace';
import { reportAction } from '@/lib/observability/report';
import pb from '@/lib/pocketbaseClient';
import { trackEvent } from '@/lib/telemetry';
import { act, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

// Keep the runtime and failure hook real, so a cancelled read cannot pass by
// replacing the failure reporter with a no-op.
vi.mock('@/lib/observability/report', () => ({
    reportAction: vi.fn(), reportError: vi.fn(), reportFeatureFlag: vi.fn(),
    reportLog: vi.fn(), reportMetric: vi.fn(), setGlobalProperty: vi.fn(), isReporting: vi.fn(),
}));
vi.mock('@/lib/datadogRum', () => ({ initDatadogRum: vi.fn(), identifyRumUser: vi.fn(), clearRumUser: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), identifyTelemetryUser: vi.fn(), clearTelemetryUser: vi.fn() }));
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    client.send = vi.fn();
    return { default: client, pocketbaseClient: client };
});

beforeEach(() => {
    pb.__reset(); pb.send.mockReset(); setDemoMode(false);
    // MemoryRouter does not update the browser location used by telemetry.
    window.history.replaceState(null, '', '/app/settings');
});
afterEach(() => { window.history.replaceState(null, '', '/'); });

describe('rendered notice telemetry', () => {
    it('reports a degraded notice once across StrictMode replay and text changes, then again after recovery', async () => {
        const onRetry = vi.fn();
        const notice = (message) => <StrictMode><DegradedNotice message={message} onRetry={onRetry}
            section="/app/classrooms/private-room?query=private-value" reason="invalid_response" status={200} /></StrictMode>;
        const view = renderWithProviders(notice('Private response detail'));
        expect(screen.getByRole('status')).toHaveTextContent('Private response detail');
        expect(reportAction).toHaveBeenCalledTimes(1);
        expect(reportAction).toHaveBeenLastCalledWith('section.failure', {
            section: '/app/classrooms/:room', source: 'degraded_notice', reason: 'invalid_response', outcome: 'failure', status_class: '2xx',
        });
        view.rerender(notice('Different private response detail'));
        await setupUser().click(screen.getByRole('button', { name: 'Try again' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(reportAction).toHaveBeenCalledTimes(1);
        view.rerender(<StrictMode><p>Recovered records</p></StrictMode>);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        view.rerender(notice('Private response detail'));
        expect(reportAction).toHaveBeenCalledTimes(2);
        expect(trackEvent.mock.calls).toEqual(reportAction.mock.calls);
        expect(JSON.stringify(reportAction.mock.calls)).not.toMatch(/private|Private/);
    });

    it('resets an inline write notice after clearing the message without re-emitting for text-only changes', async () => {
        const onDismiss = vi.fn();
        const notice = (message) => <StrictMode><WriteErrorNotice message={message} onDismiss={onDismiss} reason="forbidden" status={403} /></StrictMode>;
        const view = renderWithProviders(notice(''));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(reportAction).not.toHaveBeenCalled();
        view.rerender(notice('Private permission detail'));
        expect(screen.getByRole('alert')).toHaveTextContent('Private permission detail');
        expect(reportAction).toHaveBeenCalledTimes(1);
        expect(reportAction).toHaveBeenLastCalledWith('section.failure', {
            section: '/app/settings', source: 'write_notice', reason: 'forbidden', outcome: 'forbidden', status_class: '4xx',
        });
        view.rerender(notice('Updated private permission detail'));
        await setupUser().click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(reportAction).toHaveBeenCalledTimes(1);
        view.rerender(notice(''));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        view.rerender(notice('Private permission detail'));
        expect(reportAction).toHaveBeenCalledTimes(2);
        expect(trackEvent.mock.calls).toEqual(reportAction.mock.calls);
        expect(JSON.stringify(reportAction.mock.calls)).not.toMatch(/private|Private/);
    });
});

describe('rendered control telemetry', () => {
    it('waits for settled controls, preserves failure metadata and resets after recovery', () => {
        const control = { loading: false, demo: false, data: null, error: 'Private read detail', refresh: vi.fn(),
            readFailure: { reason: 'unavailable', status: 403 } };
        const state = (value) => <StrictMode><ControlState control={value}><h1>Loaded controls</h1></ControlState></StrictMode>;
        const view = renderWithProviders(state({ ...control, loading: true }));
        expect(screen.getByRole('status')).toHaveTextContent('Loading workspace controls');
        expect(reportAction).not.toHaveBeenCalled();
        view.rerender(state(control));
        expect(screen.getByRole('alert')).toHaveTextContent('Private read detail');
        expect(screen.queryByRole('heading', { name: 'Loaded controls' })).not.toBeInTheDocument();
        expect(reportAction).toHaveBeenCalledTimes(1);
        expect(reportAction).toHaveBeenLastCalledWith('section.failure', {
            section: '/app/settings', source: 'control_state', reason: 'forbidden', outcome: 'forbidden', status_class: '4xx',
        });
        view.rerender(state({ ...control, error: 'Changed private detail', readFailure: { ...control.readFailure } }));
        expect(reportAction).toHaveBeenCalledTimes(1);
        view.rerender(state({ ...control, data: {}, error: '', readFailure: undefined }));
        expect(screen.getByRole('heading', { name: 'Loaded controls' })).toBeVisible();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        view.rerender(state(control));
        expect(reportAction).toHaveBeenCalledTimes(2);
        view.rerender(state({ ...control, readFailure: { reason: 'invalid_response', status: 200 } }));
        expect(reportAction).toHaveBeenCalledTimes(3);
        expect(reportAction).toHaveBeenLastCalledWith('section.failure', {
            section: '/app/settings', source: 'control_state', reason: 'invalid_response', outcome: 'failure', status_class: '2xx',
        });
        view.rerender(state({ ...control, demo: true }));
        expect(screen.queryByRole('button', { name: 'Retry loading' })).not.toBeInTheDocument();
        expect(reportAction).toHaveBeenCalledTimes(3);
        expect(trackEvent.mock.calls).toEqual(reportAction.mock.calls);
        expect(JSON.stringify(reportAction.mock.calls)).not.toMatch(/private|Private/);
    });

    it('keeps cancelled reads out of both sinks while preserving retry and a subsequent real denial', async () => {
        let rejectRead;
        pb.send.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRead = reject; }));
        function Controls() {
            const control = useWorkspaceControl('access');
            return <ControlState control={control}><h1>Loaded controls</h1></ControlState>;
        }
        renderWithProviders(<Controls />, { route: '/app/settings' });
        expect(screen.getByRole('status')).toHaveTextContent('Loading workspace controls');
        await act(async () => { rejectRead(Object.assign(new Error('Private cancellation detail'), { name: 'AbortError', status: 0 })); });
        expect(await screen.findByRole('alert')).toHaveTextContent('Workspace controls are unavailable');
        expect(reportAction).not.toHaveBeenCalled();
        expect(trackEvent).not.toHaveBeenCalled();
        pb.send.mockRejectedValueOnce({ status: 403, response: { message: 'Private denial detail' } });
        await setupUser().click(screen.getByRole('button', { name: 'Retry loading' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Private denial detail');
        // Attempt and rendered-state sources are distinct, not duplicate attempts.
        await waitFor(() => expect(reportAction).toHaveBeenCalledTimes(2));
        expect(reportAction.mock.calls).toEqual(['controls', 'control_state'].map((source) => ['section.failure', {
            section: '/app/settings', source, reason: 'forbidden', outcome: 'forbidden', status_class: '4xx',
        }]));
        expect(trackEvent.mock.calls).toEqual(reportAction.mock.calls);
        expect(pb.send).toHaveBeenCalledTimes(2);
    });

    it('deduplicates uncertain-save feedback while pending and re-arms it after recovery', async () => {
        const control = { demo: false, writeError: 'Private save detail', writeReason: 'forbidden', uncertain: true, saving: false, retry: vi.fn() };
        const feedback = (value) => <StrictMode><ControlFeedback control={value} /></StrictMode>;
        const view = renderWithProviders(feedback(control));
        expect(screen.getByRole('alert')).toHaveTextContent('Private save detail');
        expect(reportAction).toHaveBeenCalledTimes(1);
        expect(reportAction).toHaveBeenLastCalledWith('section.failure', {
            section: '/app/settings', source: 'control_feedback', reason: 'uncertain', outcome: 'uncertain', status_class: 'unknown',
        });
        await setupUser().click(screen.getByRole('button', { name: 'Retry previous save' }));
        expect(control.retry).toHaveBeenCalledTimes(1);
        view.rerender(feedback({ ...control, saving: true, writeError: 'Changed private save detail' }));
        expect(screen.getByRole('button', { name: 'Retry previous save' })).toBeDisabled();
        expect(reportAction).toHaveBeenCalledTimes(1);
        view.rerender(feedback({ ...control, writeError: '', uncertain: false }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry previous save' })).not.toBeInTheDocument();
        view.rerender(feedback(control));
        expect(reportAction).toHaveBeenCalledTimes(2);
        expect(trackEvent.mock.calls).toEqual(reportAction.mock.calls);
        expect(JSON.stringify(reportAction.mock.calls)).not.toMatch(/private|Private/);
    });
});
