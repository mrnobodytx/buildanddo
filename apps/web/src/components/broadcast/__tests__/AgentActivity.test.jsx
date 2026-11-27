// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/__tests__/AgentActivity.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN, C-ONE (seat names)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/broadcast/AgentActivity.jsx, apps/web/src/data/personas.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/broadcast/AgentActivity.jsx; CONSUMES apps/web/src/data/personas.js
// DAG Node:    none
// Intent:      Verify agent activity shows only agent seats, names a guildmaster only from its server-stamped persona, states its connection honestly and never presents a failed read as silence.
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
const event = (overrides) => ({ id: 'e1', name: 'seat.completed', seat: 'kestrel-verify', actorType: 'agent', owner: 'account1', attribution: 'reported', summary: 'Checked the DNS steps against the provider docs',
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
        expect(screen.queryByText(/^verified$/i)).not.toBeInTheDocument();
        expect(screen.getAllByText(/^reported$/i)).toHaveLength(2);
        expect(screen.getByText('Submitting account: account1. Claimed actor: agent.')).toBeVisible();
        expect(screen.getByText(/any other seat label or actor type is unauthenticated and does not identify an agent/)).toBeVisible();
        expect(screen.getByText(/A guildmaster name is stamped by the server from the signed-in guildmaster seat/)).toBeVisible();
    });

    it('says when no one is in the class, and never presents an empty or failed read as proof of no work', async () => {
        comms.recentSeatEvents.mockResolvedValue([]);
        view({ unattended: true });
        expect(await screen.findByText(/Either none has been recorded in this workspace, or your seat cannot read the agent record/)).toBeVisible();
        expect(screen.getByRole('status')).toHaveTextContent('No one is in this class right now');
        expect(screen.getByText(/Guildmasters publish directly; workspace owners and admins can withdraw what they publish/)).toBeVisible();
        expect(screen.queryByText(/Agents propose; people review and publish/)).toBeNull();
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

    it('names a guildmaster from the server-stamped persona, and says the server recorded it as agent activity', async () => {
        // The seat of a guildmaster report is the account id; the persona is what the server stamped.
        comms.recentSeatEvents.mockResolvedValue([
            event({ id: 'g1', seat: 'accountdirector1', persona: 'director-nexus', owner: 'accountdirector1', summary: 'Hosted the weekly class' }),
            event({ id: 'g2', seat: 'gm-builder-forge', persona: 'nobody-in-canon', summary: 'Claimed an unknown persona' }),
            event({ id: 'g3', seat: 'ray-xyz0-0@ocn.buildanddo.invalid', persona: 'not-a-guildmaster', summary: 'Unknown persona on a login seat' }),
            event({ id: 'g4', seat: 'kestrel-verify', persona: 'forge', actorType: 'mixed', summary: 'A mixed report is never a stamped persona' }),
        ]);
        view({});
        expect(await screen.findByText('Hosted the weekly class')).toBeVisible();
        const [director, unknown, login, mixed] = screen.getAllByRole('listitem');
        expect(director).toHaveTextContent('Director Nexus');
        expect(director).toHaveTextContent('Signed in as the Director Nexus guildmaster seat; the server recorded this as agent activity.');
        expect(director).not.toHaveTextContent('accountdirector1');
        expect(director).not.toHaveTextContent('Submitting account');
        // A persona outside the canon names nobody: the seat label stands, as an unauthenticated report.
        expect(unknown).toHaveTextContent('Forge');
        expect(unknown).not.toHaveTextContent('guildmaster seat');
        expect(unknown).toHaveTextContent('Submitting account: account1. Claimed actor: agent.');
        expect(login).toHaveTextContent('Agent');
        expect(login).not.toHaveTextContent('guildmaster seat');
        expect(mixed).toHaveTextContent('kestrel-verify');
        expect(mixed).not.toHaveTextContent('guildmaster seat');
        expect(mixed).toHaveTextContent('Claimed actor: mixed.');
        expect(document.body.textContent).not.toMatch(/@|ray-xyz0-0|buildanddo\.invalid|nobody-in-canon|not-a-guildmaster/);
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
