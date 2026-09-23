// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/__tests__/AgentActivity.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN, C-ONE (seat names)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/broadcast/AgentActivity.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/broadcast/AgentActivity.jsx
// DAG Node:    none
// Intent:      Verify agent activity shows only agent seats, states its connection honestly and never presents a failed read as silence.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import AgentActivity from '@/components/broadcast/AgentActivity';
import * as comms from '@/lib/seatComms';
import { WITHHELD } from '@/lib/seatDisplay';

vi.mock('@/lib/seatComms', () => ({
    recentSeatEvents: vi.fn(), subscribeSeatEvents: vi.fn(() => () => {}), connectSeatComms: vi.fn(async () => () => {}),
    disconnectSeatComms: vi.fn(async () => {}), isSeatCommsConnected: vi.fn(() => false),
}));
const view = (props) => render(<WorkspaceContext.Provider value={{ active: { id: 'ws1' } }}><AgentActivity {...props} /></WorkspaceContext.Provider>);
const event = (overrides) => ({ id: 'e1', name: 'seat.completed', seat: 'kestrel-verify', actorType: 'agent', summary: 'Checked the DNS steps against the provider docs',
    detail: null, subject: 'lesson-3', subjectType: 'mission', prUrl: null, handoffTo: null, createdAt: '2026-09-23 03:12:00.000Z', ...overrides });

beforeEach(() => { comms.recentSeatEvents.mockReset(); comms.isSeatCommsConnected.mockReturnValue(false); });

describe('agent activity', () => {
    it('lists agent and mixed seats only, newest first, and says the feed is history only when realtime is not connected', async () => {
        comms.recentSeatEvents.mockResolvedValue([event(), event({ id: 'e2', actorType: 'human', summary: 'A person posted' }),
            event({ id: 'e3', name: 'seat.blocked', actorType: 'mixed', seat: 'lesson-editor', summary: 'Cited page no longer resolves' })]);
        view({});
        expect(await screen.findByText('Checked the DNS steps against the provider docs')).toBeVisible();
        expect(screen.getByText('Cited page no longer resolves')).toBeVisible();
        expect(screen.queryByText('A person posted')).toBeNull();
        expect(screen.getByText('History only · live updates not connected')).toBeVisible();
        expect(screen.getAllByText('mission: lesson-3')).toHaveLength(2);
        expect(comms.recentSeatEvents).toHaveBeenCalledWith('ws1', { limit: 12 });
    });

    it('says when no one is in the class, and never presents an empty or failed read as proof of no work', async () => {
        comms.recentSeatEvents.mockResolvedValue([]);
        view({ unattended: true });
        expect(await screen.findByText(/Either none has been recorded in this workspace, or your seat cannot read the agent record/)).toBeVisible();
        expect(screen.getByRole('status')).toHaveTextContent('No one is in this class right now');
        expect(screen.getByText(/Agents propose; people review and publish/)).toBeVisible();
    });

    it('names seats without showing a login or a machine, and withholds machine names in what they wrote', async () => {
        // Names that follow a machine family but that no machine carries, as in tests/upgrade/test_public_redaction.py.
        comms.recentSeatEvents.mockResolvedValue([
            event({ id: 'e5', seat: 'ray-xyz0-0@ocn.buildanddo.invalid', summary: 'Signed the lesson record' }),
            event({ id: 'e6', seat: 'gm-builder-forge', summary: 'Moved the lesson to review', handoffTo: 'member@example.com' }),
            event({ id: 'e7', seat: 'gm-builder-rig0', summary: 'Rebuilt on rig0', detail: 'Logs from codegen-rig0-build' }),
        ]);
        view({});
        expect(await screen.findByText('Signed the lesson record')).toBeVisible();
        expect(screen.getByText('Forge')).toBeVisible();
        expect(screen.getByText('to another seat')).toBeVisible();
        expect(screen.getAllByText('Agent')).toHaveLength(2);
        expect(screen.getByText(`Rebuilt on ${WITHHELD}`)).toBeVisible();
        expect(screen.getByText(`Logs from codegen-${WITHHELD}-build`)).toBeVisible();
        expect(document.body.textContent).not.toMatch(/ray-xyz0-0|rig0|member@example\.com|buildanddo\.invalid/);
    });

    it('links only https evidence', async () => {
        comms.recentSeatEvents.mockResolvedValue([event({ prUrl: 'javascript:alert(1)' }), event({ id: 'e4', prUrl: 'https://github.com/o/r/pull/1', summary: 'Opened a pull request' })]);
        view({});
        expect(await screen.findByText('Opened a pull request')).toBeVisible();
        const links = screen.getAllByRole('link', { name: 'Evidence link' });
        expect(links).toHaveLength(1);
        expect(links[0]).toHaveAttribute('href', 'https://github.com/o/r/pull/1');
    });
});
