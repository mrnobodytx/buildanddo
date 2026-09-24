// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/communityLinks.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/communityLinks.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/communityLinks.js; VALIDATES apps/web/src/components/site/Footer.jsx;
//              VALIDATES apps/web/src/components/Seo.jsx; VALIDATES apps/web/public/community-status.json
// Intent:      Enforce the single-source rule for community URLs, and pin the values that must not drift.
// ───────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import Footer from '@/components/site/Footer';
import ContactPage from '@/pages/ContactPage';
import {
    COMMUNITY_LINKS,
    GUILD_PATH,
    SAME_AS,
    STATUS_PATH,
    communityLink,
} from '@/lib/communityLinks';
import { SITE_ORIGIN } from '@/lib/publicPages';
import { renderWithProviders, screen, waitFor } from '@/test/utils';

// vitest runs from apps/web; jsdom gives import.meta.url an http scheme, so paths are resolved
// from the working directory, as RoadmapPage.planMirror.test.jsx does.
const WEB = process.cwd();
const SOURCE = 'src/lib/communityLinks.js';
const SCANNED_ROOTS = ['src', 'tools'];
const TEXT = /\.(?:js|jsx|mjs|cjs|ts|tsx|json|html|css|md)$/;

// The URL shapes only communityLinks.js may spell out. Written as patterns with escaped dots, so
// this file does not itself contain what it forbids.
const HARD_CODED = [
    { name: 'Discord invite', pattern: /discord\.gg\/[A-Za-z0-9]/i },
    { name: 'Discord invite', pattern: /discord(?:app)?\.com\/invite\//i },
    { name: 'forum', pattern: /forum\.buildanddo\.com/i },
    { name: 'wiki', pattern: /wiki\.buildanddo\.com/i },
    { name: 'subreddit', pattern: /reddit\.com\/r\/buildanddo/i },
];

function textFiles(directory) {
    const out = [];
    for (const name of readdirSync(directory)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const path = join(directory, name);
        if (statSync(path).isDirectory()) out.push(...textFiles(path));
        else if (TEXT.test(name)) out.push(path);
    }
    return out;
}

/** Every hard-coded community URL in `text`, as the names of the rules it breaks. */
function hardCodedIn(text) {
    return HARD_CODED.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
}

describe('one source for community links', () => {
    it('the scan is not vacuous: it catches a planted URL and reads the real tree', () => {
        // The control runs first. A scan that matches nothing would pass the real check below
        // for the wrong reason, so it has to be seen catching each shape.
        expect(hardCodedIn('href="https://discord' + '.gg/abc123"')).toEqual(['Discord invite']);
        expect(hardCodedIn('https://forum' + '.buildanddo.com/u/x')).toEqual(['forum']);
        expect(hardCodedIn('https://wiki' + '.buildanddo.com')).toEqual(['wiki']);
        expect(hardCodedIn('https://www.reddit' + '.com/r/buildanddo')).toEqual(['subreddit']);
        expect(hardCodedIn('nothing to see')).toEqual([]);
        const files = SCANNED_ROOTS.flatMap((root) => textFiles(resolve(WEB, root)));
        expect(files.length).toBeGreaterThan(200);
        expect(hardCodedIn(readFileSync(resolve(WEB, SOURCE), 'utf8')).length).toBeGreaterThan(0);
    });

    it('no file under src/ or tools/ other than communityLinks.js spells out a community URL', () => {
        const offenders = SCANNED_ROOTS
            .flatMap((root) => textFiles(resolve(WEB, root)))
            .map((path) => relative(WEB, path).split('\\').join('/'))
            .filter((path) => path !== SOURCE)
            .flatMap((path) => hardCodedIn(readFileSync(resolve(WEB, path), 'utf8'))
                .map((rule) => `${path}: ${rule}`));
        expect(offenders, 'import the URL from src/lib/communityLinks.js instead').toEqual([]);
    });
});

describe('the canonical values', () => {
    it('has unique ids and only https URLs', () => {
        const ids = COMMUNITY_LINKS.map((link) => link.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const link of COMMUNITY_LINKS) {
            expect(new URL(link.url).protocol, link.id).toBe('https:');
            expect(link.label.length, link.id).toBeGreaterThan(0);
            expect(link.summary.length, link.id).toBeGreaterThan(0);
        }
    });

    it('publishes exactly one Discord invite, the public one', () => {
        const discord = COMMUNITY_LINKS.filter((link) => /discord/i.test(link.url));
        expect(discord).toHaveLength(1);
        expect(new URL(discord[0].url).pathname).toBe('/vTDZxmpHHC');
    });

    it('keeps the values that are easy to get wrong', () => {
        expect(communityLink('website').url).toBe(SITE_ORIGIN);
        expect(new URL(communityLink('forum').url).host).toMatch(/^forum\.buildanddo\.com$/);
        expect(new URL(communityLink('wiki').url).host).toMatch(/^wiki\.buildanddo\.com$/);
        expect(new URL(communityLink('reddit').url).pathname).toBe('/r/buildanddo');
        // The handle has no "a". The corrected spelling is somebody else's channel.
        expect(new URL(communityLink('youtube').url).pathname).toBe('/@buildndo');
        expect(new URL(communityLink('github').url).pathname).toBe('/mrnobodytx/buildanddo');
        const agent = new URL(communityLink('voice-agent').url);
        expect(communityLink('voice-agent').label).toBe('Talk to our agent');
        expect(agent.searchParams.get('agent_id')).toBe('agent_7801m2nrs2cney49mz2jgc5cc1yz');
    });

    it('lists the six public profiles in sameAs, and not the site itself or the voice agent', () => {
        const profiles = COMMUNITY_LINKS.filter((link) => SAME_AS.includes(link.url)).map((link) => link.id);
        expect(profiles.sort()).toEqual(['discord', 'forum', 'github', 'reddit', 'wiki', 'youtube']);
    });

    it('fails loudly on an unknown id instead of rendering a link to nowhere', () => {
        expect(() => communityLink('myspace')).toThrow(/Unknown community link/);
    });

    it('the published status file names exactly the canonical surfaces', () => {
        const status = JSON.parse(readFileSync(resolve(WEB, 'public/community-status.json'), 'utf8'));
        expect(status.surfaces.map((surface) => [surface.id, surface.url]))
            .toEqual(COMMUNITY_LINKS.map((link) => [link.id, link.url]));
    });
});

describe('where the links are used', () => {
    it('the footer links every community surface, the guild directory and the status page', () => {
        renderWithProviders(<Footer />, { auth: { isAuthed: false, user: null } });
        const hrefs = [...document.querySelectorAll('footer a')].map((node) => node.getAttribute('href'));
        for (const link of COMMUNITY_LINKS.filter((entry) => entry.id !== 'website')) {
            expect(hrefs, link.id).toContain(link.url);
        }
        expect(hrefs).toContain(GUILD_PATH);
        expect(hrefs).toContain(STATUS_PATH);
        expect(hrefs.some((href) => /citadel-nexus\.com\/status/.test(href || ''))).toBe(false);
        expect(screen.getByRole('link', { name: 'Service status' })).toHaveAttribute('href', STATUS_PATH);
    });

    it('the contact page uses the one Discord invite, and every page carries sameAs', async () => {
        renderWithProviders(<ContactPage />, { route: '/contact', auth: { isAuthed: false, user: null } });
        expect(screen.getByRole('link', { name: 'Join the Discord conversation' }))
            .toHaveAttribute('href', communityLink('discord').url);
        expect(screen.getByRole('link', { name: 'Open the issue tracker' }))
            .toHaveAttribute('href', `${communityLink('github').url}/issues`);
        await waitFor(() => expect(document.getElementById('page-schema')).not.toBeNull());
        const schema = JSON.parse(document.getElementById('page-schema').textContent);
        expect(schema[0].isPartOf.sameAs).toEqual([...SAME_AS]);
    });
});
