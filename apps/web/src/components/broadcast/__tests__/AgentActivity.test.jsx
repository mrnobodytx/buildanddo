// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/__tests__/AgentActivity.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
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

    it('links only https evidence', async () => {
        comms.recentSeatEvents.mockResolvedValue([event({ prUrl: 'javascript:alert(1)' }), event({ id: 'e4', prUrl: 'https://github.com/o/r/pull/1', summary: 'Opened a pull request' })]);
        view({});
        expect(await screen.findByText('Opened a pull request')).toBeVisible();
        const links = screen.getAllByRole('link', { name: 'Evidence link' });
        expect(links).toHaveLength(1);
        expect(links[0]).toHaveAttribute('href', 'https://github.com/o/r/pull/1');
    });

    it.each([
        ['string', 'Measured the inbound packets.', ['Measured the inbound packets.']],
        ['object', { phase: 'BR-2', packets: 12, verified: false }, ['BR-2', 'packets', '12', 'false']],
        ['array', ['Checked', { command: 'node --test' }, null], ['Checked', 'node --test', 'null']],
        ['null', null, []],
    ])('renders %s detail as text, including the real structured seat-event contract', async (_kind, detail, expected) => {
        comms.recentSeatEvents.mockResolvedValue([event({ detail })]);
        view({});
        await screen.findByText('Checked the DNS steps against the provider docs');
        const paragraph = screen.getByRole('listitem').querySelector('p.whitespace-pre-wrap');
        if (detail === null) expect(paragraph).toBeNull();
        else for (const text of expected) expect(paragraph).toHaveTextContent(text);
    });

    it.each(['string', 'object', 'array'])('never interprets markup in %s detail', async (kind) => {
        const markup = '<img src=x onerror=alert(1)><script>alert(1)</script>';
        const detail = kind === 'string' ? markup : kind === 'object' ? { note: markup } : [markup];
        comms.recentSeatEvents.mockResolvedValue([event({ detail })]);
        view({});
        await screen.findByText('Checked the DNS steps against the provider docs');
        const item = screen.getByRole('listitem');
        expect(item).toHaveTextContent(markup);
        expect(item.querySelector('img, script, iframe')).toBeNull();
    });

    it('bounds string output and does not traverse arbitrarily deep, wide or circular details', async () => {
        let deep = { hidden: 'past the depth limit' };
        for (let index = 0; index < 10000; index++) deep = { nested: deep };
        const circular = { note: 'Circular input' }; circular.self = circular;
        const wide = Array.from({ length: 10000 }, (_, index) => `entry-${index}`);
        comms.recentSeatEvents.mockResolvedValue([
            event({ id: 'long', detail: 'x'.repeat(20000) }), event({ id: 'deep', detail: deep }),
            event({ id: 'circular', detail: circular }), event({ id: 'wide', detail: wide }),
        ]);
        view({});
        await screen.findAllByText('Checked the DNS steps against the provider docs');
        for (const item of screen.getAllByRole('listitem')) {
            const detail = item.querySelector('p.whitespace-pre-wrap').textContent;
            expect(detail.length).toBeLessThanOrEqual(1200);
            expect(detail).toContain('...');
            expect(detail).not.toContain('past the depth limit');
            expect(detail).not.toContain('entry-9999');
        }
    });

    it('does not invoke arbitrary getters or toJSON methods while projecting detail', async () => {
        const getter = vi.fn(() => { throw new Error('Not a JSON value'); });
        const toJSON = vi.fn(() => { throw new Error('Do not serialize the original object'); });
        const detail = { note: 'Retain the readable part', toJSON };
        Object.defineProperty(detail, 'bad', { enumerable: true, get: getter });
        comms.recentSeatEvents.mockResolvedValue([event({ detail })]);
        view({});
        await screen.findByText('Checked the DNS steps against the provider docs');
        expect(screen.getByRole('listitem')).toHaveTextContent('Retain the readable part');
        expect(getter).not.toHaveBeenCalled();
        expect(toJSON).not.toHaveBeenCalled();
    });
});
