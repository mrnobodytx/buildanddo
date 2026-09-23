// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/GuildPages.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/pages/GuildPage.jsx, apps/web/src/pages/PersonaProfilePage.jsx,
//              apps/web/src/data/personas.js, apps/web/src/pages/workspace/ClassroomPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/GuildPage.jsx; VALIDATES apps/web/src/pages/PersonaProfilePage.jsx;
//              VALIDATES apps/web/src/data/personas.js; VALIDATES apps/web/src/pages/workspace/ClassroomPage.jsx
// Intent:      Prove the guild routes render, each profile says it is an automated agent, and no fleet
//              machine name or address reaches the persona data or either page.
// ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/App';
import {
    ACCOUNT_FIELDS,
    PERSONAS,
    PERSONA_FIELDS,
    PERSONA_PAGES,
    personaForPresence,
    personaPath,
} from '@/data/personas';
import { communityLink } from '@/lib/communityLinks';
import pb from '@/lib/pocketbaseClient';
import { SITE_ORIGIN } from '@/lib/publicPages';
import ClassroomPage from '@/pages/workspace/ClassroomPage';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

// ClassroomPage talks to the SFU through this module. The double hands back one live presence
// list the moment the tracker starts, which is all the persona link needs.
const presenceRows = [];
vi.mock('@/lib/classroomRealtime', () => ({
    PRESENCE_POLL_MS: 5000,
    classroomHealth: () => Promise.resolve({ ok: true, publishers_configured: 1 }),
    presenceHealth: () => Promise.resolve({ ok: true }),
    joinClassroom: () => Promise.resolve({
        sessionId: 'sess-self', role: 'watch', mayPublish: false, published: [], close: () => {},
    }),
    createPresenceTracker: ({ onChange }) => ({
        start: () => onChange({ live: presenceRows, pulled: [], unreadable: [] }),
        stop: () => {},
        pull: () => Promise.resolve(),
    }),
    startPresenceHeartbeat: () => ({ stop: () => {} }),
    inboundAudioStats: () => Promise.resolve({ supported: false, packets: 0, bytes: 0, streams: 0 }),
}));

beforeEach(() => {
    pb.__reset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
});
afterEach(() => vi.unstubAllGlobals());

// The operator rule of 2026-09-22 as a pattern: fleet machine names (the dispatch's own regex)
// and IPv4 addresses. Applied to the data, to the source of both pages and to what they render.
const MACHINE_NAME = /\b(ray-[a-z]{3}\d+-\d+|mesh-[a-z]+|kvm\d+|rig\d+)\b/i;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const LAZY = 20000;
const SOURCES = ['src/data/personas.js', 'src/pages/GuildPage.jsx', 'src/pages/PersonaProfilePage.jsx'];

function leaksIn(text) {
    return [MACHINE_NAME, IPV4].filter((pattern) => pattern.test(text)).map(String);
}

async function renderRoute(route) {
    renderWithProviders(<AppRoutes />, { route, auth: { isAuthed: false, user: null } });
    return screen.findByRole('heading', { level: 1 }, { timeout: LAZY });
}

describe('the persona data', () => {
    it('names the eight guildmasters of the canon, each once', () => {
        expect(PERSONAS.map((persona) => [persona.name, persona.guild])).toEqual([
            ['Oracle', 'intelligence'], ['Scholar', 'research'], ['Forge', 'builder'],
            ['Sterling', 'finance'], ['Alex', 'commerce'], ['Muse', 'creator'],
            ['Director Nexus', 'entertainment'], ['Quill', 'writers'],
        ]);
        expect(new Set(PERSONAS.map((persona) => persona.slug)).size).toBe(8);
    });

    it('carries no field that could hold a machine, box, host or address', () => {
        for (const persona of PERSONAS) {
            expect(Object.keys(persona).sort(), persona.slug).toEqual([...PERSONA_FIELDS].sort());
            for (const account of persona.accounts) {
                expect(Object.keys(account).sort(), persona.slug).toEqual([...ACCOUNT_FIELDS].sort());
            }
        }
    });

    it('links each persona to its forum profile and its wiki page, from communityLinks.js', () => {
        const forum = communityLink('forum').url;
        const wiki = communityLink('wiki').url;
        const director = PERSONAS.find((persona) => persona.slug === 'director-nexus');
        expect(director.accounts).toEqual([
            { platform: 'forum', handle: 'Director-Nexus', url: `${forum}/u/Director-Nexus` },
            { platform: 'wiki', handle: 'agents/director-nexus', url: `${wiki}/agents/director-nexus` },
        ]);
        for (const persona of PERSONAS) {
            expect(persona.accounts.map((account) => account.platform), persona.slug).toEqual(['forum', 'wiki']);
        }
    });

    it('contains no fleet machine name or IP address, in the values or in the source', () => {
        expect(leaksIn(JSON.stringify([PERSONAS, PERSONA_PAGES]))).toEqual([]);
        for (const path of SOURCES) {
            expect(leaksIn(readFileSync(resolve(process.cwd(), path), 'utf8')), path).toEqual([]);
        }
    });

    it('the leak check fails when a machine name is planted', () => {
        // The control. Without it a pattern that matched nothing would pass every check above.
        const planted = JSON.parse(JSON.stringify(PERSONAS));
        planted[0].role = `${planted[0].role} Runs on ray-xyz0-0.`;
        expect(leaksIn(JSON.stringify(planted))).toEqual([String(MACHINE_NAME)]);
        expect(leaksIn('reachable at 192.0.2.10')).toEqual([String(IPV4)]);
    });

    it('resolves the spellings a classroom presence id uses', () => {
        expect(personaForPresence('gm-forge').slug).toBe('forge');
        expect(personaForPresence('gm:forge').slug).toBe('forge');
        expect(personaForPresence('gm-builder-forge').slug).toBe('forge');
        expect(personaForPresence('GM-Quill').slug).toBe('quill');
        expect(personaForPresence('gm-ent-director').slug).toBe('director-nexus');
        expect(personaForPresence('gm-director-nexus').slug).toBe('director-nexus');
        expect(personaForPresence('gm-zeta')).toBeNull();
        expect(personaForPresence('')).toBeNull();
        expect(personaForPresence(undefined)).toBeNull();
    });
});

describe('the guild routes', () => {
    it('/guild lists every guildmaster as an automated agent', async () => {
        expect(await renderRoute('/guild')).toHaveTextContent('Eight guilds, eight automated agents.');
        const list = within(screen.getByRole('list', { name: 'Guildmasters' }));
        for (const persona of PERSONAS) {
            expect(list.getByRole('link', { name: persona.name })).toHaveAttribute('href', personaPath(persona));
        }
        expect(list.getAllByText('Automated agent')).toHaveLength(8);
        await waitFor(() => expect(document.title).toBe('The guildmasters | BuildAndDo'));
        expect(leaksIn(document.documentElement.innerHTML)).toEqual([]);
    }, LAZY);

    it.each(PERSONAS.map((persona) => [persona.slug, persona]))(
        '/guild/%s says it is an automated agent and links only its public accounts',
        async (slug, persona) => {
            expect(await renderRoute(`/guild/${slug}`)).toHaveTextContent(persona.name);
            expect(screen.getByRole('heading', { level: 2, name: `${persona.name} is an automated agent, not a person.` }))
                .toBeVisible();
            expect(screen.getByRole('link', { name: 'Forum profile' })).toHaveAttribute('href', persona.accounts[0].url);
            expect(screen.getByRole('link', { name: 'Wiki page' })).toHaveAttribute('href', persona.accounts[1].url);
            const route = PERSONA_PAGES.find((page) => page.path === `/guild/${slug}`);
            await waitFor(() => expect(document.title).toBe(route.title));
            expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_ORIGIN}/guild/${slug}`);
            const schema = JSON.parse(document.getElementById('page-schema').textContent);
            expect(schema[0]['@type']).toBe('ProfilePage');
            expect(schema.at(-1)).toMatchObject({ '@type': 'SoftwareApplication', name: persona.name });
            expect(leaksIn(document.documentElement.innerHTML)).toEqual([]);
        },
        LAZY,
    );

    it('an unknown slug says so and points back to the directory', async () => {
        expect(await renderRoute('/guild/nobody')).toHaveTextContent('No guildmaster answers to that name.');
        expect(screen.getByRole('link', { name: 'See every guildmaster' })).toHaveAttribute('href', '/guild');
    }, LAZY);
});

describe('classroom presence', () => {
    it('links a guildmaster row to its profile and still shows an id the canon does not know', async () => {
        presenceRows.splice(0, presenceRows.length,
            { id: 'row-1', persona_id: 'gm-forge', session_id: 'sess-forge', state: 'LIVE', tracks: [{ trackName: 'voice' }] },
            { id: 'row-2', persona_id: 'gm-zeta', session_id: 'sess-zeta', state: 'LIVE', tracks: [{ trackName: 'voice' }] },
        );
        renderWithProviders(
            <Routes><Route path="/app/classrooms/:roomId" element={<ClassroomPage />} /></Routes>,
            { route: '/app/classrooms/room1' },
        );
        const join = screen.getByRole('button', { name: 'Join as student' });
        await waitFor(() => expect(join).toBeEnabled());
        await setupUser().click(join);
        expect(await screen.findByRole('link', { name: 'Forge' })).toHaveAttribute('href', '/guild/forge');
        expect(screen.getByText('gm-zeta (guildmaster)')).toBeInTheDocument();
        expect(screen.queryByText('gm-forge (guildmaster)')).not.toBeInTheDocument();
    });
});
