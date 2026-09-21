// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/ocnLogin.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/lib/ocnLogin.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/ocnLogin.js
// Intent:      Prove the browser half of OCN login saves a session ONLY on a 200
//              with a token, turns every refusal into a readable error with the
//              auth store untouched, and never signs anything itself.
// ───────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcnLoginError, ocnApiBase, ocnLogin, ocnRequested, readOcnHeader } from '@/lib/ocnLogin';

const HEADER = 'eyJzZWF0X2lkIjoicmlnMSJ9'; // an opaque runtime-supplied value; never decoded here

function jsonResponse(status, body) {
    return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function fakeClient() {
    return { baseURL: '/hcgi/platform', authStore: { save: vi.fn() } };
}

describe('ocnLogin', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('posts the runtime header to the PocketBase route and saves the session on 200', async () => {
        const client = fakeClient();
        const record = { id: 'seat_rig1', email: 'rig1@ocn.buildanddo.invalid', name: 'OCN seat: rig1' };
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { token: 'tok', record }));

        const got = await ocnLogin({ header: HEADER, fetchImpl, client });

        expect(got).toEqual(record);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('/hcgi/platform/api/ocn/login');
        expect(init.method).toBe('POST');
        expect(init.headers['X-Citadel-Key']).toBe(HEADER);
        expect(init.body).toBeUndefined(); // the envelope travels only as a header
        expect(client.authStore.save).toHaveBeenCalledWith('tok', record);
    });

    it.each([
        [401, { message: 'citadelkey_rejected:bad signature' }, /not accepted \(citadelkey_rejected:bad signature\)/],
        [403, { message: 'seat_not_provisioned' }, /not provisioned on BuildAndDo yet/],
        [503, { message: 'ocn_verifier_unavailable' }, /cannot reach its Citadel verifier/],
        [404, { message: 'Not Found.' }, /no OCN login route yet/],
    ])('turns a %s into a readable error and saves nothing', async (status, body, pattern) => {
        const client = fakeClient();
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(status, body));

        const err = await ocnLogin({ header: HEADER, fetchImpl, client }).catch((e) => e);

        expect(err).toBeInstanceOf(OcnLoginError);
        expect(err.status).toBe(status);
        expect(err.code).toBe(body.message);
        expect(err.message).toMatch(pattern);
        expect(client.authStore.save).not.toHaveBeenCalled();
    });

    it('refuses to store a 200 that carries no token', async () => {
        const client = fakeClient();
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { record: { id: 'x' } }));

        const err = await ocnLogin({ header: HEADER, fetchImpl, client }).catch((e) => e);

        expect(err.code).toBe('malformed_response');
        expect(client.authStore.save).not.toHaveBeenCalled();
    });

    it('reports a network failure without touching the store', async () => {
        const client = fakeClient();
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

        const err = await ocnLogin({ header: HEADER, fetchImpl, client }).catch((e) => e);

        expect(err.code).toBe('network_error');
        expect(client.authStore.save).not.toHaveBeenCalled();
    });

    it('never calls the backend when the runtime supplied no header', async () => {
        const client = fakeClient();
        const fetchImpl = vi.fn();

        const err = await ocnLogin({ header: null, fetchImpl, client }).catch((e) => e);

        expect(err.code).toBe('no_header');
        expect(err.message).toMatch(/__BND_OCN_HEADER__ is absent/);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(client.authStore.save).not.toHaveBeenCalled();
    });

    it('reads the header from the runtime global and gates the affordance on it or ?ocn=1', () => {
        expect(readOcnHeader({})).toBeNull();
        expect(readOcnHeader({ __BND_OCN_HEADER__: '   ' })).toBeNull();
        expect(readOcnHeader({ __BND_OCN_HEADER__: ` ${HEADER} ` })).toBe(HEADER);
        expect(ocnRequested('', {})).toBe(false);
        expect(ocnRequested('?ocn=1', {})).toBe(true);
        expect(ocnRequested('?ocn=0', {})).toBe(false);
        expect(ocnRequested('', { __BND_OCN_HEADER__: HEADER })).toBe(true);
    });

    it('derives the route base from the SDK client and falls back to /hcgi/platform', () => {
        expect(ocnApiBase({ baseURL: 'https://example.test/pb/' })).toBe('https://example.test/pb');
        expect(ocnApiBase({ baseUrl: '/legacy' })).toBe('/legacy');
        expect(ocnApiBase({})).toBe('/hcgi/platform');
    });
});
