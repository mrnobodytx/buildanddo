// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/__tests__/sectionFailure.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TELEMETRY-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/observability/sectionFailure.js,
//              apps/web/src/components/workspace/WorkspaceNotices.jsx,
//              apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/lib/observability/sectionFailure.js
// DAG Node:    none
// Intent:      Every shared failure state sends one event naming its section to both tools,
//              carrying no message text and no id, with both vendor SDKs stubbed.
// ───────────────────────────────────────────────────────────────

import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlFeedback, ControlState } from '@/components/workspace/ControlPrimitives';
import { DegradedNotice, WriteErrorNotice } from '@/components/workspace/WorkspaceNotices';
import { reportAction } from '@/lib/observability/report';
import { sectionOf, trackSectionFailure } from '@/lib/observability/sectionFailure';
import { trackEvent } from '@/lib/telemetry';

vi.mock('@/lib/observability/report', async (importOriginal) => ({ ...(await importOriginal()), reportAction: vi.fn() }));
vi.mock('@/lib/telemetry', async (importOriginal) => ({ ...(await importOriginal()), trackEvent: vi.fn() }));

const PRIVATE = 'Record 8812 for Dana Private could not be saved';
let clock = Date.UTC(2026, 8, 24, 16, 0, 0);

beforeEach(() => {
    // The repeat guard is keyed on time; each test starts a minute after the last.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(clock += 60_000);
    window.history.replaceState({}, '', '/app/classrooms/room7q2kx9private');
});
afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
});

const sent = () => ({ datadog: reportAction.mock.calls, posthog: trackEvent.mock.calls });
const expectOne = (context) => {
    expect(reportAction.mock.calls).toEqual([['section.failure', context]]);
    expect(trackEvent.mock.calls).toEqual([['section.failure', context]]);
};

describe('sectionOf', () => {
    it.each([
        ['/app/classrooms/room7q2kx9private', 'app/classrooms'],
        ['/app/dossier', 'app/dossier'],
        ['/app', 'app'],
        ['/guild/some-guild', 'guild'],
        ['/reset-password/tok123', 'reset-password'],
        ['/pricing?plan=pro#faq', 'pricing'],
        ['/', 'home'],
        ['', 'home'],
    ])('names %s as %s', (path, section) => {
        expect(sectionOf(path)).toBe(section);
    });
});

describe('section failure events', () => {
    it('a degraded list sends one event per tool, naming the section and not the room', () => {
        render(<DegradedNotice message={PRIVATE} />);
        expectOne({ section: 'app/classrooms', source: 'degraded_notice', reason: 'read_failed' });
        expect(JSON.stringify(sent())).not.toMatch(/room7q2kx9private|Dana|8812/);
    });

    it('several failed cards in one section are one event, not one each', () => {
        render(<><DegradedNotice /><DegradedNotice /><DegradedNotice /></>);
        expect(reportAction).toHaveBeenCalledTimes(1);
        expect(trackEvent).toHaveBeenCalledTimes(1);
    });

    it('the same failure is sent again once the repeat window has passed', () => {
        const first = render(<DegradedNotice />);
        first.unmount();
        vi.setSystemTime(clock += 11_000);
        render(<DegradedNotice />);
        expect(reportAction).toHaveBeenCalledTimes(2);
    });

    it('a write error notice sends only while it shows a message', () => {
        const view = render(<WriteErrorNotice message="" />);
        expect(reportAction).not.toHaveBeenCalled();
        view.rerender(<WriteErrorNotice message={PRIVATE} />);
        expectOne({ section: 'app/classrooms', source: 'write_error_notice', reason: 'write_failed' });
        expect(JSON.stringify(sent())).not.toContain('Dana');
    });

    it('an uncertain save is reported as uncertain, not as a failure', () => {
        render(<ControlFeedback control={{ writeError: PRIVATE, uncertain: true, saving: false }} />);
        expectOne({ section: 'app/classrooms', source: 'control_feedback', reason: 'write_uncertain' });
    });

    it('a rejected save is reported as a failed write', () => {
        render(<ControlFeedback control={{ writeError: 'Rejected', uncertain: false, saving: false }} />);
        expectOne({ section: 'app/classrooms', source: 'control_feedback', reason: 'write_failed' });
    });

    it('a successful save sends nothing', () => {
        render(<ControlFeedback control={{ writeError: '', uncertain: false, saved: { action: 'missions.update' } }} />);
        expect(reportAction).not.toHaveBeenCalled();
        expect(trackEvent).not.toHaveBeenCalled();
    });

    it('controls that fail to load are reported; loading and loaded controls are not', () => {
        const loading = render(<MemoryRouter><ControlState control={{ loading: true }}>ok</ControlState></MemoryRouter>);
        loading.unmount();
        const loaded = render(<MemoryRouter><ControlState control={{ loading: false, data: {} }}>ok</ControlState></MemoryRouter>);
        loaded.unmount();
        expect(reportAction).not.toHaveBeenCalled();
        render(<MemoryRouter><ControlState control={{ loading: false, error: 'Unavailable', refresh: () => {} }}>ok</ControlState></MemoryRouter>);
        expectOne({ section: 'app/classrooms', source: 'control_state', reason: 'read_failed' });
    });

    it('refuses sources and reasons outside the closed vocabulary', () => {
        trackSectionFailure('some_new_widget', 'read_failed');
        trackSectionFailure('degraded_notice', 'anything goes');
        expect(reportAction).not.toHaveBeenCalled();
        expect(trackEvent).not.toHaveBeenCalled();
    });

    it('carries an HTTP status when the caller knows one', () => {
        trackSectionFailure('degraded_notice', 'read_failed', { status: 503 });
        expectOne({ section: 'app/classrooms', source: 'degraded_notice', reason: 'read_failed', status: 503 });
    });
});
