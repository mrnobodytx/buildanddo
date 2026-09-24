// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/__tests__/LiveBroadcast.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN, C-ONE (broadcaster names and profile links)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/broadcast/LiveBroadcast.jsx, apps/web/src/hooks/useClassroomMedia.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/broadcast/LiveBroadcast.jsx; VALIDATES apps/web/src/hooks/useClassroomMedia.js
// DAG Node:    none
// Intent:      Verify the live classroom never claims media it has not measured and joins only on an explicit action.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveBroadcast from '@/components/broadcast/LiveBroadcast';
import { receiveState } from '@/hooks/useClassroomMedia';
import * as realtime from '@/lib/classroomRealtime';
import { WITHHELD } from '@/lib/seatDisplay';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'seat1' }, isAuthed: true, sessionEpoch: 1, isSessionCurrent: (epoch) => epoch === 1 }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ active: { id: 'ws1' } }) }));
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { token: 'tok', record: { id: 'seat1' } } } }));
vi.mock('@/lib/classroomRealtime', () => ({
    PRESENCE_POLL_MS: 5000,
    classroomHealth: vi.fn(),
    joinClassroom: vi.fn(),
    createPresenceTracker: vi.fn(),
    startPresenceHeartbeat: vi.fn(),
    inboundAudioStats: vi.fn(),
}));

const live = { id: 'room1', status: 'live', host_name: 'Mara Quinn', can_manage: false };
const member = { id: 'm1', revision: 1, active: true };
let tracker, onChange;

function handle(overrides = {}) {
    return { sessionId: 'sess-self', role: 'watch', mayPublish: false, pc: {}, stream: null, remoteStream: null,
        published: [], iceComplete: true, close: vi.fn(), ...overrides };
}

beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
    realtime.joinClassroom.mockReset();
    realtime.classroomHealth.mockResolvedValue({ ok: true, publishers_configured: 1 });
    realtime.inboundAudioStats.mockResolvedValue({ supported: true, packets: 0, bytes: 0, streams: 0 });
    tracker = { start: vi.fn(), stop: vi.fn(), pull: vi.fn(() => Promise.resolve()) };
    realtime.createPresenceTracker.mockImplementation((options) => { onChange = options.onChange; return tracker; });
    realtime.startPresenceHeartbeat.mockReturnValue({ stop: vi.fn() });
});
afterEach(() => { vi.clearAllMocks(); });

describe('receive state', () => {
    it('reports receiving only from measured packets', () => {
        expect(receiveState({ supported: false, packets: 9, streams: 1 })).toBe('unmeasured');
        expect(receiveState({ supported: true, packets: 0, streams: 0 })).toBe('measuring');
        expect(receiveState({ supported: true, packets: 0, streams: 1 })).toBe('silent');
        expect(receiveState({ supported: true, packets: 12, streams: 1 })).toBe('receiving');
    });
});

describe('live broadcast in the classroom', () => {
    it('says media is not set up and never contacts the service when the server does not offer it', () => {
        render(<LiveBroadcast room={live} membership={member} media={{ available: false, reason: 'not configured on this server' }} />);
        expect(screen.getByText(/Voice and video are not set up for this workspace \(not configured on this server\)/)).toBeVisible();
        expect(realtime.classroomHealth).not.toHaveBeenCalled();
        expect(realtime.joinClassroom).not.toHaveBeenCalled();
    });

    it('renders nothing for a room that is not live and asks non-attendees to join the class first', () => {
        const { container, rerender } = render(<LiveBroadcast room={{ ...live, status: 'scheduled' }} membership={member} media={{ available: false }} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<LiveBroadcast room={live} membership={{ ...member, active: false }} media={{ available: true }} />);
        expect(screen.getByText('Join the class to see and hear the broadcast.')).toBeVisible();
        expect(realtime.joinClassroom).not.toHaveBeenCalled();
    });

    it('joins as a listener only on request, then lists broadcasters and pulls one when asked', async () => {
        realtime.joinClassroom.mockResolvedValue(handle());
        const user = userEvent.setup();
        render(<LiveBroadcast room={live} membership={member} media={{ available: true }} />);
        expect(screen.getByText('Join the broadcast to see and hear the host.')).toBeVisible();
        expect(realtime.joinClassroom).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Join broadcast' }));
        expect(realtime.joinClassroom).toHaveBeenCalledWith(expect.objectContaining({ room: 'room1', role: 'watch', authToken: 'tok', seatId: 'seat1' }));
        await waitFor(() => expect(tracker.start).toHaveBeenCalledWith(5000));
        expect(realtime.startPresenceHeartbeat).not.toHaveBeenCalled();
        act(() => onChange({ live: [
            { id: 'p1', session_id: 'sess-host', display_name: 'Mara Quinn', state: 'LIVE', tracks: [] },
            { id: 'p2', session_id: 'sess-agent', persona_id: 'Scholar', state: 'LIVE', tracks: [] },
        ], pulled: [{ id: 'p2' }], unreadable: [] }));
        expect(screen.getByText('Guildmaster agent')).toBeVisible();
        expect(screen.getByText('Pulled · no frames yet')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Listen' }));
        expect(tracker.pull).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
        expect(await screen.findByText('Listening. The host broadcasts.')).toBeVisible();
    });

    it('names a broadcasting guildmaster by persona and never shows a login or a machine name', async () => {
        // Names that follow a machine family but that no machine carries, as in tests/upgrade/test_public_redaction.py.
        realtime.joinClassroom.mockResolvedValue(handle());
        const user = userEvent.setup();
        render(<LiveBroadcast room={live} membership={member} media={{ available: true }} />);
        await user.click(screen.getByRole('button', { name: 'Join broadcast' }));
        await waitFor(() => expect(tracker.start).toHaveBeenCalledWith(5000));
        act(() => onChange({ live: [
            { id: 'p1', session_id: 'sess-a', persona_id: 'gm:forge', state: 'LIVE', tracks: [] },
            { id: 'p2', session_id: 'sess-b', persona_id: 'ray-xyz0-0', state: 'LIVE', tracks: [] },
            { id: 'p3', session_id: 'sess-c', display_name: 'OCN seat: rig0', state: 'LIVE', tracks: [] },
        ], pulled: [], unreadable: [] }));
        expect(screen.getByText('Forge')).toBeVisible();
        expect(screen.getByText('Guildmaster')).toBeVisible();
        expect(screen.getByText(`OCN seat: ${WITHHELD}`)).toBeVisible();
        expect(document.body.textContent).not.toMatch(/gm:forge|ray-xyz0-0|rig0/);
    });

    it('links a known guildmaster to its profile in a new tab and still names one the canon does not know', async () => {
        realtime.joinClassroom.mockResolvedValue(handle());
        const user = userEvent.setup();
        render(<LiveBroadcast room={live} membership={member} media={{ available: true }} />);
        await user.click(screen.getByRole('button', { name: 'Join broadcast' }));
        await waitFor(() => expect(tracker.start).toHaveBeenCalledWith(5000));
        act(() => onChange({ live: [
            { id: 'p1', session_id: 'sess-a', persona_id: 'gm-forge', state: 'LIVE', tracks: [] },
            { id: 'p2', session_id: 'sess-b', persona_id: 'gm-zeta', state: 'LIVE', tracks: [] },
        ], pulled: [], unreadable: [] }));
        const forge = screen.getByRole('link', { name: 'Forge (opens in a new tab)' });
        expect(forge).toHaveAttribute('href', '/guild/forge');
        expect(forge).toHaveAttribute('target', '_blank');
        expect(forge).toHaveAttribute('rel', 'noopener noreferrer');
        expect(screen.getByText('Zeta')).toBeVisible();
        expect(screen.getAllByRole('link')).toHaveLength(1);
        expect(document.body.textContent).not.toMatch(/gm-forge|gm-zeta/);
    });

    it('shows receiving only after packets are measured', async () => {
        realtime.joinClassroom.mockResolvedValue(handle());
        realtime.inboundAudioStats.mockResolvedValue({ supported: true, packets: 0, bytes: 0, streams: 1 });
        const user = userEvent.setup();
        render(<LiveBroadcast room={live} membership={member} media={{ available: true }} />);
        await user.click(screen.getByRole('button', { name: 'Join broadcast' }));
        expect(await screen.findByText('Connected · no frames')).toBeVisible();
        expect(screen.queryByText('Receiving')).toBeNull();
    });

    it('lets a host broadcast, advertises its tracks and switches the real tracks off and on', async () => {
        const audio = { enabled: true }, video = { enabled: true, readyState: 'live' };
        const stream = { getAudioTracks: () => [audio], getVideoTracks: () => [video], getTracks: () => [audio, video] };
        realtime.joinClassroom.mockResolvedValue(handle({ role: 'teach', mayPublish: true, stream, published: [{ trackName: 'seat:seat1/mic', kind: 'audio' }] }));
        const user = userEvent.setup();
        render(<LiveBroadcast room={{ ...live, can_manage: true }} membership={member} media={{ available: true }} />);
        await user.click(await screen.findByRole('button', { name: 'Start broadcasting' }));
        expect(realtime.joinClassroom).toHaveBeenCalledWith(expect.objectContaining({ role: 'teach' }));
        await waitFor(() => expect(realtime.startPresenceHeartbeat).toHaveBeenCalledWith(expect.objectContaining({ room: 'room1', sessionId: 'sess-self' })));
        expect(screen.getByText('Broadcasting')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Mute' }));
        expect(audio.enabled).toBe(false);
        expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
        await user.click(screen.getByRole('button', { name: 'Stop camera' }));
        expect(video.enabled).toBe(false);
        expect(screen.getByText('The camera is off.')).toBeVisible();
    });

    it('tells a host who is not on the broadcaster list that nothing is being sent', async () => {
        realtime.joinClassroom.mockResolvedValue(handle({ role: 'teach', mayPublish: false }));
        const user = userEvent.setup();
        render(<LiveBroadcast room={{ ...live, can_manage: true }} membership={member} media={{ available: true }} />);
        await user.click(await screen.findByRole('button', { name: 'Start broadcasting' }));
        expect(await screen.findByText(/not on this workspace's broadcaster list/)).toBeVisible();
        expect(realtime.startPresenceHeartbeat).not.toHaveBeenCalled();
    });

    it('reports a failed join and an unready service in words', async () => {
        realtime.classroomHealth.mockResolvedValue({ ok: false, reason: 'realtime_not_configured' });
        realtime.joinClassroom.mockRejectedValue(new Error('SFU returned no answer'));
        const user = userEvent.setup();
        render(<LiveBroadcast room={live} membership={member} media={{ available: true }} />);
        expect(await screen.findByText(/The broadcast service is not ready: realtime_not_configured/)).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Join broadcast' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not join the broadcast: SFU returned no answer');
    });

    it('closes the session when the class stops being live for this member', async () => {
        const session = handle();
        realtime.joinClassroom.mockResolvedValue(session);
        const user = userEvent.setup();
        const { rerender } = render(<LiveBroadcast room={live} membership={member} media={{ available: true }} />);
        await user.click(screen.getByRole('button', { name: 'Join broadcast' }));
        await waitFor(() => expect(tracker.start).toHaveBeenCalled());
        rerender(<LiveBroadcast room={live} membership={{ ...member, active: false }} media={{ available: true }} />);
        await waitFor(() => expect(session.close).toHaveBeenCalled());
    });

    it('offers cancellation while connecting and never attaches a late session', async () => {
        let resolve;
        realtime.joinClassroom.mockReturnValue(new Promise((done) => { resolve = done; }));
        const user = userEvent.setup();
        render(<LiveBroadcast room={live} membership={member} media={{ available: true }} />);
        await user.click(screen.getByRole('button', { name: 'Join broadcast' }));
        expect(screen.getByRole('button', { name: 'Connecting\u2026' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Cancel connection' }));
        expect(screen.getByRole('button', { name: 'Join broadcast' })).toBeEnabled();
        const late = handle();
        await act(async () => { resolve(late); });
        expect(late.close).toHaveBeenCalledTimes(1);
        expect(realtime.createPresenceTracker).not.toHaveBeenCalled();
        expect(screen.queryByText('Receiving')).toBeNull();
    });
});
