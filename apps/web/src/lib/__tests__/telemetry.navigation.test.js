// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/telemetry.navigation.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TELEMETRY-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/telemetry.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/lib/telemetry.js
// DAG Node:    none
// Intent:      Prove, with the real PostHog SDK and every network path stubbed, that in-app
//              navigation is recorded, that identity is the account id alone, and that no
//              classroom room id or reset token survives into any event property.
// ───────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ROOM = 'room7q2kx9private';
const TOKEN = 'resettok4f8e2secret';
const USER = { id: 'usr9a1b2c3', email: 'person@example.test', name: 'Private Person' };

let posthog;
let telemetry;
let shippedBeforeSend;
const captured = [];
const network = [];

// One SDK instance for the whole file: a second posthog-js instance in the same window captures
// nothing, which would make every assertion below pass or fail for the wrong reason.
beforeAll(async () => {
    // Nothing may leave the machine: every transport PostHog can use is replaced with a recorder.
    vi.stubGlobal('fetch', vi.fn((...args) => { network.push(['fetch', String(args[0])]); return new Promise(() => {}); }));
    vi.stubGlobal('XMLHttpRequest', class { open(...a) { network.push(['xhr', String(a[1])]); } setRequestHeader() {} send() {} });
    Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: vi.fn((url) => { network.push(['beacon', String(url)]); return true; }) });
    // The first load lands inside a classroom, so every "initial" property starts out holding a room id.
    window.history.replaceState({}, '', `/app/classrooms/${ROOM}?join=1`);

    vi.stubEnv('VITE_BUILDANDDO_PH', 'phc_test_not_a_real_key');
    posthog = (await import('posthog-js')).default;
    telemetry = await import('@/lib/telemetry');
    telemetry.initTelemetry();

    // Keep the production before_send first, exactly as shipped, and record what it lets through.
    shippedBeforeSend = posthog.config.before_send;
    posthog.set_config({
        before_send: [shippedBeforeSend, (event) => { if (event) captured.push(JSON.parse(JSON.stringify(event))); return null; }],
    });
});

beforeEach(() => { captured.length = 0; });

afterEach(() => {
    telemetry.identifyAnalyticsUser(null);
    vi.restoreAllMocks();
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const pageviews = () => captured.filter((e) => e.event === '$pageview');

describe('PostHog navigation and identity', () => {
    it('ships the classroom scrubber as the first before_send', async () => {
        const { scrubClassroomProperties } = await import('@/lib/navigationIntent');
        expect(shippedBeforeSend).toBe(scrubClassroomProperties);
        expect(posthog.config.capture_pageview).toBe('history_change');
    });

    it('records a pageview for each in-app navigation, named without ids', async () => {
        window.history.pushState({}, '', '/app/dossier');
        await settle();
        window.history.pushState({}, '', `/app/classrooms/${ROOM}`);
        await settle();
        window.history.pushState({}, '', '/docs');
        await settle();

        const paths = pageviews().map((e) => e.properties.$pathname);
        expect(paths).toEqual(expect.arrayContaining(['/app/dossier', '/app/classrooms/:room', '/docs']));
    });

    it('identifies by the account id alone and resets on sign-out', async () => {
        telemetry.identifyAnalyticsUser(USER);
        telemetry.identifyAnalyticsUser(USER);
        await settle();
        const identifies = captured.filter((e) => e.event === '$identify');
        expect(identifies).toHaveLength(1);
        expect(posthog.get_distinct_id()).toBe(USER.id);

        const reset = vi.spyOn(posthog, 'reset');
        telemetry.identifyAnalyticsUser(null);
        expect(reset).toHaveBeenCalledTimes(1);
        expect(posthog.get_distinct_id()).not.toBe(USER.id);
    });

    it('does not reset an anonymous visitor who was never identified', () => {
        const reset = vi.spyOn(posthog, 'reset');
        telemetry.identifyAnalyticsUser(null);
        expect(reset).not.toHaveBeenCalled();
    });

    it('resets before identifying a different account on the same device', () => {
        telemetry.identifyAnalyticsUser(USER);
        const reset = vi.spyOn(posthog, 'reset');
        telemetry.identifyAnalyticsUser({ id: 'usr_other_account' });
        expect(reset).toHaveBeenCalledTimes(1);
        expect(posthog.get_distinct_id()).toBe('usr_other_account');
    });

    it('lets no room id, reset token, email or name reach any event property', async () => {
        window.history.pushState({}, '', `/app/classrooms/${ROOM}`);
        await settle();
        telemetry.identifyAnalyticsUser(USER);
        window.history.pushState({}, '', `/reset-password/${TOKEN}`);
        await settle();
        window.history.pushState({}, '', '/app/overview');
        await settle();
        posthog.capture('$pageleave');
        await settle();

        expect(captured.length).toBeGreaterThan(3);
        const everything = JSON.stringify(captured);
        for (const secret of [ROOM, TOKEN, USER.email, USER.name]) expect(everything).not.toContain(secret);
    });

    it('scrubs a session that began on a reset link, wherever PostHog puts the URL', async () => {
        const { scrubClassroomProperties } = await import('@/lib/navigationIntent');
        const event = scrubClassroomProperties({
            event: '$pageleave',
            properties: {
                $session_entry_url: `https://buildanddo.com/reset-password/${TOKEN}`,
                $session_entry_pathname: `/reset-password/${TOKEN}`,
                $prev_pageview_pathname: `/app/classrooms/${ROOM}`,
                $initial_person_info: { u: `https://buildanddo.com/app/classrooms/${ROOM}?join=1`, r: 'https://www.google.com/search?q=build' },
                $referrer: '$direct',
                title: 'Classroom',
                $prev_pageview_duration: 4.2,
            },
            $set_once: { $initial_pathname: `/reset-password/${TOKEN}` },
        });
        expect(JSON.stringify(event)).not.toContain(TOKEN);
        expect(JSON.stringify(event)).not.toContain(ROOM);
        expect(event.properties.$session_entry_url).toBe('https://buildanddo.com/reset-password/:token');
        expect(event.properties.$prev_pageview_pathname).toBe('/app/classrooms/:room');
        // Values that match no private pattern come back untouched.
        expect(event.properties.$initial_person_info.r).toBe('https://www.google.com/search?q=build');
        expect(event.properties.$referrer).toBe('$direct');
        expect(event.properties.title).toBe('Classroom');
        expect(event.properties.$prev_pageview_duration).toBe(4.2);
    });

    it('sends nothing over the network during the test', async () => {
        window.history.pushState({}, '', '/app/dossier');
        telemetry.identifyAnalyticsUser(USER);
        await settle();
        const toPostHog = network.filter(([, url]) => /posthog/i.test(url) && !/\/(flags|decide|array)\b/.test(url));
        expect(toPostHog.filter(([, url]) => /\/(e|i|batch|capture)\b/.test(url))).toEqual([]);
    });
});
