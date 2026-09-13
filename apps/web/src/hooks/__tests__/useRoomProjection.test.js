// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/useRoomProjection.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/hooks/useRoomProjection.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useRoomProjection.js
// Intent:      Prove the hook reads only the live sidecar route, passes upstream
//              denial reasons through, and never touches the static sample files.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { isNotPublished, useRoomProjection } from '@/hooks/useRoomProjection';

function jsonResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
    };
}

describe('useRoomProjection', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns the cleansed projection on 200 from the live sidecar route', async () => {
        const projection = { projection: 'organization', nodes: [], edges: [], cleansed: true, tenant_id: 'buildanddo' };
        fetchMock.mockResolvedValue(jsonResponse(200, projection));

        const { result } = renderHook(() => useRoomProjection('organization'));
        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.available).toBe(true);
        expect(result.current.projection).toEqual(projection);
        expect(result.current.reason).toBeNull();
        expect(result.current.status).toBe(200);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/rooms/projection/organization');
        expect(init.cache).toBe('no-store');
    });

    it('surfaces a 403 denial reason verbatim and marks the room unavailable', async () => {
        fetchMock.mockResolvedValue(jsonResponse(403, { detail: 'projection_not_implemented' }));

        const { result } = renderHook(() => useRoomProjection('mission'));
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.available).toBe(false);
        expect(result.current.projection).toBeNull();
        expect(result.current.reason).toBe('projection_not_implemented');
        expect(result.current.status).toBe(403);
        expect(isNotPublished(result.current)).toBe(true);
    });

    it('treats a 401 as unavailable with the upstream reason, not as not-published', async () => {
        fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'citadelkey_rejected:bad signature' }));

        const { result } = renderHook(() => useRoomProjection('capability'));
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.available).toBe(false);
        expect(result.current.reason).toBe('citadelkey_rejected:bad signature');
        expect(isNotPublished(result.current)).toBe(false);
    });

    it('never falls back to the static sample files on any failure', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(502, { detail: 'projection_leak_check_failed' }));

        const { result } = renderHook(() => useRoomProjection('development'));
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.available).toBe(false);
        expect(result.current.reason).toBe('projection_leak_check_failed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        for (const [url] of fetchMock.mock.calls) {
            expect(String(url)).not.toContain('/room-projections/');
            expect(String(url)).not.toMatch(/\.json$/);
        }
    });

    it('reports network_error when fetch rejects and still does not retry a sample', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        const { result } = renderHook(() => useRoomProjection('evidence'));
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.available).toBe(false);
        expect(result.current.reason).toBe('network_error');
        expect(result.current.status).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
