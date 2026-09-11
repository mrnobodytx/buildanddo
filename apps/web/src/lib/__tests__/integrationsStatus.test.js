// CGRF: SRS=SRS-BUILDANDDO-PUBLIC-RECORD-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/integrationsStatus.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-PUBLIC-RECORD-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/lib/integrationsStatus.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/integrationsStatus.js
// Intent:      The projection reader must succeed on a good file, fail soft
//              on 404 / malformed bodies, flag a stale file, and never turn an
//              unmeasured section into a number.
// ───────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
    INTEGRATIONS_STATUS_SCHEMA,
    INTEGRATIONS_STATUS_URL,
    STALE_AFTER_MS,
    channelOf,
    fetchIntegrationsStatus,
    integrationsStateOf,
    isIntegrationsStale,
    tutorialsOf,
    useIntegrationsStatus,
} from '@/lib/integrationsStatus';

const fixture = (overrides = {}) => ({
    schema: INTEGRATIONS_STATUS_SCHEMA,
    generated_at: new Date().toISOString(),
    state: 'MEASURED',
    sections: {
        deliveries: { state: 'MEASURED', reason: null },
        outbox: { state: 'MEASURED', reason: null },
        tutorials: { state: 'MEASURED', reason: null },
        validity: { state: 'MEASURED', reason: null },
    },
    channels: {
        wiki: { state: 'MEASURED', published: 3, queued: 1, held: 2, latest: [], recent: [], validity: null },
        forum: { state: 'UNMEASURED', reason: 'deliveries=FILE_ABSENT;outbox=DIR_ABSENT' },
        discord: { state: 'MEASURED', published: 5, queued: 0, held: 0, recent: [], validity: null },
        reddit: { state: 'MEASURED', published: 0, queued: 4, held: 1, recent: [], validity: null },
    },
    tutorials: [{ lesson_id: 'LES-ERR-1', error_class: 'X', severity: 'P1', env: 'staging', channels: ['wiki'], wiki_url: null }],
    validity: [],
    ...overrides,
});

const mockFetch = (impl) => {
    globalThis.fetch = vi.fn(impl);
};

afterEach(() => {
    delete globalThis.fetch;
});

describe('fetchIntegrationsStatus', () => {
    it('resolves the parsed file on 2xx and reads it uncached', async () => {
        const body = fixture();
        mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));

        await expect(fetchIntegrationsStatus()).resolves.toEqual(body);
        expect(globalThis.fetch).toHaveBeenCalledWith(INTEGRATIONS_STATUS_URL, { cache: 'no-store' });
    });

    it('rejects on 404', async () => {
        mockFetch(() => Promise.resolve({ ok: false, status: 404 }));

        await expect(fetchIntegrationsStatus()).rejects.toThrow('status 404');
    });

    it('rejects when the body is not JSON', async () => {
        mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('bad json')) }));

        await expect(fetchIntegrationsStatus()).rejects.toThrow('bad json');
    });
});

describe('useIntegrationsStatus', () => {
    it('exposes the status once the fetch resolves', async () => {
        const body = fixture();
        mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));

        const { result } = renderHook(() => useIntegrationsStatus());
        expect(result.current).toEqual({ status: null, error: false });
        await waitFor(() => expect(result.current.status).toEqual(body));
        expect(result.current.error).toBe(false);
    });

    it('reports error and keeps status null on 404', async () => {
        mockFetch(() => Promise.resolve({ ok: false, status: 404 }));

        const { result } = renderHook(() => useIntegrationsStatus());
        await waitFor(() => expect(result.current.error).toBe(true));
        expect(result.current.status).toBeNull();
    });
});

describe('integrationsStateOf', () => {
    it('is MEASURED only for the expected schema with channels', () => {
        expect(integrationsStateOf(fixture())).toBe('MEASURED');
        expect(integrationsStateOf(null)).toBe('UNMEASURED');
        expect(integrationsStateOf({ state: 'MEASURED', channels: {} })).toBe('UNMEASURED');
        expect(integrationsStateOf(fixture({ state: 'UNMEASURED' }))).toBe('UNMEASURED');
        expect(integrationsStateOf(fixture({ channels: 'nope' }))).toBe('UNMEASURED');
        expect(integrationsStateOf({ error: 'projection_failed', state: 'UNMEASURED' })).toBe('UNMEASURED');
    });
});

describe('isIntegrationsStale', () => {
    it('flags a file older than the stale window and nothing else', () => {
        const now = Date.parse('2026-09-11T12:00:00Z');
        const old = new Date(now - STALE_AFTER_MS - 1000).toISOString();
        const fresh = new Date(now - 60 * 1000).toISOString();

        expect(isIntegrationsStale(fixture({ generated_at: old }), now)).toBe(true);
        expect(isIntegrationsStale(fixture({ generated_at: fresh }), now)).toBe(false);
        expect(isIntegrationsStale(fixture({ generated_at: 'not a date' }), now)).toBe(false);
        expect(isIntegrationsStale(null, now)).toBe(false);
    });
});

describe('channelOf / tutorialsOf', () => {
    it('returns measured channels and null for unmeasured ones', () => {
        const status = fixture();
        expect(channelOf(status, 'wiki')).toMatchObject({ published: 3, queued: 1, held: 2 });
        expect(channelOf(status, 'forum')).toBeNull();
        expect(channelOf(status, 'nope')).toBeNull();
        expect(channelOf(null, 'wiki')).toBeNull();
    });

    it('returns tutorials only when that section is measured', () => {
        expect(tutorialsOf(fixture())).toHaveLength(1);
        expect(tutorialsOf(fixture({ sections: { tutorials: { state: 'UNMEASURED', reason: 'FILE_ABSENT' } } }))).toBeNull();
        expect(tutorialsOf({ schema: 'other', sections: { tutorials: { state: 'MEASURED' } }, tutorials: [] })).toBeNull();
        expect(tutorialsOf(null)).toBeNull();
    });
});
