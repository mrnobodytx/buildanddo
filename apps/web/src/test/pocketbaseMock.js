// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/test/pocketbaseMock.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/pocketbaseClient.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/pocketbaseClient.js;
//              USES_TEMPLATE apps/web/src/test/utils.jsx
// Intent:      One in-memory stand-in for the PocketBase SDK so component and
//              hook tests exercise real component code without a live backend.
// ───────────────────────────────────────────────────────────────

import { vi } from 'vitest';

/**
 * Builds an error shaped like PocketBase's `ClientResponseError`.
 *
 * Pages read `err?.response?.message` to decide what to show the user, so a
 * plain `Error` would silently take the generic-fallback branch and the test
 * would prove nothing about the server-message path.
 *
 * @param {string} message Server-supplied message.
 * @param {number} [status] HTTP status to report.
 * @returns {Error & {status: number, response: {message: string}}} The error.
 */
export function mockPocketBaseError(message, status = 400) {
    return Object.assign(new Error(message), {
        status,
        response: { message, code: status, data: {} },
        isAbort: false,
    });
}

const DEFAULT_AUTH_RECORD = {
    id: 'user_test',
    collectionName: 'users',
    email: 'owner@example.com',
    name: 'Test Owner',
};

/**
 * Creates a mock PocketBase client backed by an in-memory record store.
 *
 * Every collection method is a `vi.fn`, so a test can both seed data
 * (`__setRecords`) and assert on the write it expected
 * (`__collection('missions').create`).
 *
 * Intended to be returned from a `vi.mock('@/lib/pocketbaseClient', ...)`
 * factory:
 *
 * ```js
 * vi.mock('@/lib/pocketbaseClient', async () => {
 *     const { createMockPocketBase } = await import('@/test/pocketbaseMock');
 *     const client = createMockPocketBase();
 *     return { default: client, pocketbaseClient: client };
 * });
 * ```
 *
 * @param {{authRecord?: object|null, isValid?: boolean}} [options] Auth seed.
 * @returns {object} The mock client, plus `__`-prefixed test-only helpers.
 */
export function createMockPocketBase(options = {}) {
    const initialAuth = {
        record:
            options.authRecord === undefined
                ? { ...DEFAULT_AUTH_RECORD }
                : options.authRecord,
        isValid: options.isValid === undefined ? true : options.isValid,
    };

    const state = {
        records: new Map(),
        errors: new Map(),
        auth: { ...initialAuth },
        sequence: 0,
    };

    const collections = new Map();

    const nextId = (collection) => {
        state.sequence += 1;
        return `${collection}_${state.sequence}`;
    };

    const listOf = (collection) => state.records.get(collection) || [];

    const rejectIfFailing = (collection) => {
        const error = state.errors.get(collection);
        if (error) return Promise.reject(error);
        return null;
    };

    const buildCollection = (collection) => ({
        getFullList: vi.fn(
            () =>
                rejectIfFailing(collection) ||
                Promise.resolve(listOf(collection).map((r) => ({ ...r }))),
        ),
        getList: vi.fn((page = 1, perPage = 30) => {
            const failing = rejectIfFailing(collection);
            if (failing) return failing;
            const items = listOf(collection).map((r) => ({ ...r }));
            const start = (page - 1) * perPage;
            return Promise.resolve({
                page,
                perPage,
                totalItems: items.length,
                totalPages: Math.max(1, Math.ceil(items.length / perPage)),
                items: items.slice(start, start + perPage),
            });
        }),
        getOne: vi.fn((id) => {
            const failing = rejectIfFailing(collection);
            if (failing) return failing;
            const found = listOf(collection).find((r) => r.id === id);
            return found
                ? Promise.resolve({ ...found })
                : Promise.reject(mockPocketBaseError('The requested resource wasn\u2019t found.', 404));
        }),
        create: vi.fn((data = {}) => {
            const failing = rejectIfFailing(collection);
            if (failing) return failing;
            const record = {
                id: nextId(collection),
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                ...data,
            };
            state.records.set(collection, [record, ...listOf(collection)]);
            return Promise.resolve({ ...record });
        }),
        update: vi.fn((id, data = {}) => {
            const failing = rejectIfFailing(collection);
            if (failing) return failing;
            const items = listOf(collection);
            const index = items.findIndex((r) => r.id === id);
            if (index === -1) {
                return Promise.reject(mockPocketBaseError('The requested resource wasn\u2019t found.', 404));
            }
            const record = { ...items[index], ...data, updated: new Date().toISOString() };
            const next = [...items];
            next[index] = record;
            state.records.set(collection, next);
            return Promise.resolve({ ...record });
        }),
        delete: vi.fn((id) => {
            const failing = rejectIfFailing(collection);
            if (failing) return failing;
            state.records.set(
                collection,
                listOf(collection).filter((r) => r.id !== id),
            );
            return Promise.resolve(true);
        }),
        authWithPassword: vi.fn((email) => {
            const failing = rejectIfFailing(collection);
            if (failing) return failing;
            const record = state.auth.record || { ...DEFAULT_AUTH_RECORD, email };
            state.auth = { record, isValid: true };
            return Promise.resolve({ token: 'test-token', record: { ...record } });
        }),
        requestPasswordReset: vi.fn(() => rejectIfFailing(collection) || Promise.resolve(true)),
        subscribe: vi.fn(() => Promise.resolve(() => {})),
        unsubscribe: vi.fn(() => Promise.resolve()),
    });

    const collectionOf = (collection) => {
        if (!collections.has(collection)) {
            collections.set(collection, buildCollection(collection));
        }
        return collections.get(collection);
    };

    return {
        collection: vi.fn(collectionOf),

        // Mirrors `pb.filter()`: substitutes `{:name}` placeholders. The real
        // SDK escapes values; the shape is what the hooks assert on.
        filter: vi.fn((expression, params = {}) =>
            String(expression).replace(/\{:(\w+)\}/g, (_match, key) =>
                params[key] === undefined ? 'null' : JSON.stringify(params[key]),
            ),
        ),

        authStore: {
            get record() {
                return state.auth.record;
            },
            get isValid() {
                return state.auth.isValid;
            },
            get token() {
                return state.auth.isValid ? 'test-token' : '';
            },
            onChange: vi.fn(() => () => {}),
            clear: vi.fn(() => {
                state.auth = { record: null, isValid: false };
            }),
            save: vi.fn((_token, record) => {
                state.auth = { record, isValid: true };
            }),
        },

        /** Seeds the records `getFullList` will resolve for a collection. */
        __setRecords(collection, records) {
            state.records.set(collection, records.map((r) => ({ ...r })));
            collectionOf(collection);
            return this;
        },

        /** Makes every request against a collection reject with `error`. */
        __setError(collection, error = mockPocketBaseError('Request failed', 500)) {
            state.errors.set(collection, error);
            collectionOf(collection);
            return this;
        },

        /** Clears a previously installed collection failure. */
        __clearError(collection) {
            state.errors.delete(collection);
            return this;
        },

        /** The `vi.fn` bundle for a collection, for call assertions. */
        __collection(collection) {
            return collectionOf(collection);
        },

        /** Overrides the auth store record and validity. */
        __setAuth({ record, isValid } = {}) {
            state.auth = {
                record: record === undefined ? state.auth.record : record,
                isValid: isValid === undefined ? state.auth.isValid : isValid,
            };
            return this;
        },

        /** Drops all seeded data, failures and collection stubs. */
        __reset() {
            state.records.clear();
            state.errors.clear();
            state.auth = { ...initialAuth };
            state.sequence = 0;
            collections.clear();
            return this;
        },
    };
}

export default createMockPocketBase;
