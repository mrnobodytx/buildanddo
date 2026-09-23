// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/communityStatus.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/communityStatus.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/communityStatus.js; VALIDATES apps/web/public/community-status.json
// Intent:      Prove that nothing renders UP without a fresh reading that says UP, and that detail text
//              cannot carry a machine name or an address onto a public page.
// ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { COMMUNITY_LINKS, communityLink } from '@/lib/communityLinks';
import {
    COMMUNITY_STATUS_SCHEMA,
    countStates,
    formatAge,
    publicDetail,
    readCommunityStatus,
    readPlatformHealth,
} from '@/lib/communityStatus';

const NOW = Date.parse('2026-09-22T12:00:00Z');
const minutesAgo = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

function reading(surfaces, over = {}) {
    return {
        schema: COMMUNITY_STATUS_SCHEMA,
        generated_at: minutesAgo(10),
        stale_after_seconds: 21600,
        surfaces,
        ...over,
    };
}

const everyUp = () => COMMUNITY_LINKS.map((link) => ({
    id: link.id, label: link.label, url: link.url, state: 'UP', checked_at: minutesAgo(12), detail: 'HTTP 200',
}));

const states = (result) => result.surfaces.map((surface) => surface.state);

describe('a fresh reading is shown as it is', () => {
    it('keeps UP, DEGRADED and DOWN when the reading and the checks are fresh', () => {
        const surfaces = everyUp();
        surfaces[1].state = 'DEGRADED';
        surfaces[2].state = 'DOWN';
        const result = readCommunityStatus(reading(surfaces), NOW);
        expect(result.state).toBe('MEASURED');
        expect(result.age_seconds).toBe(600);
        expect(states(result).slice(0, 3)).toEqual(['UP', 'DEGRADED', 'DOWN']);
        expect(countStates(result.surfaces)).toEqual({
            UP: COMMUNITY_LINKS.length - 2, DEGRADED: 1, DOWN: 1, UNMEASURED: 0,
        });
    });

    it('takes labels and URLs from communityLinks.js, never from the file', () => {
        const surfaces = everyUp();
        surfaces[0].url = 'https://elsewhere.example/phish';
        surfaces[0].label = 'Click me';
        const [first] = readCommunityStatus(reading(surfaces), NOW).surfaces;
        expect(first.url).toBe(COMMUNITY_LINKS[0].url);
        expect(first.label).toBe(COMMUNITY_LINKS[0].label);
    });
});

describe('anything not freshly measured is UNMEASURED, never green', () => {
    it.each([
        ['no file at all', null, 'ABSENT'],
        ['a list instead of a document', [], 'ABSENT'],
        ['another schema', reading(everyUp(), { schema: 'buildanddo.activity-status/v1' }), 'INVALID'],
        ['no measurement time', reading(everyUp(), { generated_at: null }), 'UNMEASURED'],
        ['a reading from the future', reading(everyUp(), { generated_at: minutesAgo(-60) }), 'INVALID'],
        ['a reading older than its window', reading(everyUp(), { generated_at: minutesAgo(7 * 60) }), 'STALE'],
        ['a window stretched to a year', reading(everyUp(), {
            generated_at: minutesAgo(2 * 24 * 60), stale_after_seconds: 365 * 24 * 3600,
        }), 'STALE'],
    ])('%s', (_name, doc, expected) => {
        const result = readCommunityStatus(doc, NOW);
        expect(result.state).toBe(expected);
        expect(result.reason.length).toBeGreaterThan(0);
        expect(states(result)).toEqual(COMMUNITY_LINKS.map(() => 'UNMEASURED'));
        expect(result.surfaces.map((surface) => surface.id)).toEqual(COMMUNITY_LINKS.map((link) => link.id));
    });

    it('marks one surface UNMEASURED when its own check is missing, stale, unknown or absent', () => {
        const surfaces = everyUp();
        surfaces[1].checked_at = null;
        surfaces[2].checked_at = minutesAgo(8 * 60);
        surfaces[3].state = 'GREEN';
        const result = readCommunityStatus(reading(surfaces.filter((_, index) => index !== 4)), NOW);
        expect(result.state).toBe('MEASURED');
        expect(states(result).slice(0, 5)).toEqual(['UP', 'UNMEASURED', 'UNMEASURED', 'UNMEASURED', 'UNMEASURED']);
        expect(result.surfaces[4].detail).toBe('Not in the latest reading.');
        expect(result.surfaces[3].detail).toMatch(/does not recognise/);
    });

    it('reads the published seed file as unmeasured for every surface', () => {
        const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'public/community-status.json'), 'utf8'));
        const result = readCommunityStatus(seed, NOW);
        expect(result.state).toBe('UNMEASURED');
        expect(countStates(result.surfaces).UNMEASURED).toBe(COMMUNITY_LINKS.length);
    });
});

// The machine names and addresses below are invented to match the patterns - the documentation
// ranges 192.0.2.0/24 and 2001:db8::/32 and names no real machine carries. A fixture in this public
// repository must not become the disclosure it exists to prevent.
describe('detail text is public', () => {
    it.each([
        'probe ok from ray-xyz0-0',
        'answered on 192.0.2.10',
        'kvm0_probe says 200',
        'relayed by rig0',
        '2001:db8:0:0:0:0:0:1 responded',
    ])('withholds %s', (detail) => {
        expect(publicDetail(detail)).toBe('Detail withheld: it named internal infrastructure.');
        const surfaces = everyUp();
        surfaces[0].detail = detail;
        expect(readCommunityStatus(reading(surfaces), NOW).surfaces[0].detail)
            .toBe('Detail withheld: it named internal infrastructure.');
    });

    it('keeps ordinary detail, bounded', () => {
        expect(publicDetail('HTTP 200 in 312 ms at 12:30:05')).toBe('HTTP 200 in 312 ms at 12:30:05');
        expect(publicDetail('x'.repeat(500))).toHaveLength(240);
        expect(publicDetail(null)).toBe('');
    });
});

describe('platform health', () => {
    const platforms = [
        { id: 'datadog', label: 'Datadog', state: 'connected', verified: true, detail: 'Agents reporting.' },
        { id: 'hostinger', label: 'Hostinger', state: 'hold', verified: false, detail: 'Bridge on rig0.' },
    ];

    it('is ABSENT when the file was not served', () => {
        expect(readPlatformHealth(null, NOW)).toMatchObject({ state: 'ABSENT', platforms: [] });
        expect(readPlatformHealth({ platforms: 'no' }, NOW).state).toBe('ABSENT');
    });

    it('is STALE once the observation is older than a day, and says how old', () => {
        const result = readPlatformHealth({
            observed_at: '2026-09-11T00:00:00+00:00', generated_at: minutesAgo(5), platforms,
        }, NOW);
        expect(result.state).toBe('STALE');
        expect(formatAge(result.age_seconds)).toBe('11 d');
        expect(result.platforms[0]).toEqual({ id: 'datadog', label: 'Datadog', state: 'connected', verified: true });
    });

    it('never carries the free-text detail onto the public page', () => {
        // A host name in prose has no shape a filter can rely on, so the field is dropped whole.
        const result = readPlatformHealth({
            observed_at: minutesAgo(30),
            platforms: [{ ...platforms[0], detail: 'A runner on some-internal-host.' }, platforms[1]],
        }, NOW);
        expect(JSON.stringify(result)).not.toMatch(/some-internal-host|rig0|detail/);
    });

    it('is MEASURED when observed within the day, and UNMEASURED without an observation time', () => {
        expect(readPlatformHealth({ observed_at: minutesAgo(30), platforms }, NOW).state).toBe('MEASURED');
        expect(readPlatformHealth({ observed_at: 'yesterday', platforms }, NOW).state).toBe('UNMEASURED');
    });

    it('formats ages without rounding a stale reading up to fresh', () => {
        expect(formatAge(Number.NaN)).toBe('unknown age');
        expect(formatAge(30)).toBe('just now');
        expect(formatAge(59 * 60)).toBe('59 min');
        expect(formatAge(47 * 3600)).toBe('47 h');
        expect(formatAge(49 * 3600)).toBe('2 d');
    });
});

describe('the link list and the status reader agree', () => {
    it('reads every canonical surface, including the voice agent', () => {
        const result = readCommunityStatus(reading(everyUp()), NOW);
        expect(result.surfaces.find((surface) => surface.id === 'voice-agent').url)
            .toBe(communityLink('voice-agent').url);
    });
});
