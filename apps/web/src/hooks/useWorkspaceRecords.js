// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useWorkspaceRecords.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/pocketbaseClient.js,
//              apps/web/src/contexts/WorkspaceContext.jsx,
//              apps/web/src/lib/demoWorkspace.js,
//              apps/web/src/lib/workspaceActions.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/pocketbaseClient.js;
//              CONSUMES apps/web/src/lib/demoWorkspace.js;
//              PRODUCES workspace.record.write_failed
// Intent:      One read/write path for workspace collections, so every page
//              reports failure the same way and none of them can confuse an
//              empty collection with an unreachable one.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { demoRecords } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

const READ_FAILED = 'Could not load this data right now. What you see may be incomplete.';
const DEMO_READ_ONLY = 'Demonstration mode is on. Turn it off to save real records.';

/**
 * Extracts a message an operator can act on from a PocketBase rejection.
 *
 * PocketBase reports per-field validation under `response.data`, which is the
 * part that says *why* a write was refused; the top-level message is usually
 * only "Failed to create record".
 *
 * @param {*} err Rejection value.
 * @param {string} fallback Message to use when nothing better is available.
 * @returns {string} Human-readable message.
 */
export function describeWriteError(err, fallback) {
	const data = err && err.response && err.response.data;
	if (data && typeof data === 'object') {
		const firstField = Object.keys(data)[0];
		const detail = firstField && data[firstField] && data[firstField].message;
		if (detail) return `${firstField}: ${detail}`;
	}
	const message = err && err.response && err.response.message;
	return message || fallback;
}

/**
 * Loads and mutates owner-scoped records for the active workspace.
 *
 * The listRule on each collection already filters to the caller's records; the
 * `workspace` filter narrows further so a user with several workspaces only
 * sees the active one.
 *
 * Returns `degraded: true` only after a rejected read. An empty collection and
 * an unreachable backend both produce zero records, and a page that renders the
 * same empty state for both tells the operator something false.
 *
 * @param {string} collection PocketBase collection name.
 * @param {{sort?: string, expand?: string, enabled?: boolean, extraFilter?: string}} [options] Query options.
 * @returns {{records: Array<object>, loading: boolean, error: string, degraded: boolean,
 *   demo: boolean, refresh: Function, create: Function, update: Function, remove: Function,
 *   saving: boolean, writeError: string, clearWriteError: Function}} Records and operations.
 */
export function useWorkspaceRecords(collection, options = {}) {
	const { active } = useWorkspace();
	const { demo } = useDemoMode();
	const { sort, expand, enabled = true, extraFilter } = options;

	const [records, setRecords] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [degraded, setDegraded] = useState(false);
	const [saving, setSaving] = useState(false);
	const [writeError, setWriteError] = useState('');

	// A slow response for a workspace the user has already navigated away from
	// must not overwrite the records now on screen.
	const requestRef = useRef(0);

	const load = useCallback(async () => {
		const request = requestRef.current + 1;
		requestRef.current = request;

		if (demo) {
			setRecords(demoRecords(collection));
			setError('');
			setDegraded(false);
			setLoading(false);
			return;
		}

		if (!enabled || !active) {
			setRecords([]);
			setDegraded(false);
			setLoading(false);
			return;
		}

		setLoading(true);
		try {
			const base = pb.filter('workspace = {:ws}', { ws: active.id });
			const filter = extraFilter ? `${base} && ${extraFilter}` : base;
			const list = await pb.collection(collection).getFullList({
				sort: sort || '-created',
				expand,
				filter,
			});
			if (requestRef.current !== request) return;
			setRecords(list);
			setError('');
			setDegraded(false);
		} catch (err) {
			if (requestRef.current !== request) return;
			console.error(`load ${collection} failed`, err);
			setError(READ_FAILED);
			setDegraded(true);
			setRecords([]);
		}
		if (requestRef.current === request) setLoading(false);
	}, [collection, active, enabled, sort, expand, extraFilter, demo]);

	useEffect(() => {
		load();
	}, [load]);

	// Demonstration mode short-circuits before any PocketBase call, so a
	// demonstration can never leave a record behind.
	const guardDemo = useCallback(() => {
		if (!demo) return null;
		setWriteError(DEMO_READ_ONLY);
		return { ok: false, reason: 'demo_mode_read_only', error: DEMO_READ_ONLY };
	}, [demo]);

	const runWrite = useCallback(
		async (operation, fallbackMessage, context) => {
			setSaving(true);
			setWriteError('');
			try {
				const record = await operation();
				await load();
				setSaving(false);
				return { ok: true, record };
			} catch (err) {
				const message = describeWriteError(err, fallbackMessage);
				console.error(`${context.op} ${collection} failed`, err);
				setWriteError(message);
				trackWorkspaceAction(WORKSPACE_ACTIONS.RECORD_WRITE_FAILED, {
					collection,
					operation: context.op,
				});
				setSaving(false);
				return { ok: false, reason: 'write_failed', error: message };
			}
		},
		[collection, load],
	);

	const create = useCallback(
		(data) => {
			const blocked = guardDemo();
			if (blocked) return Promise.resolve(blocked);
			if (!active) {
				return Promise.resolve({ ok: false, reason: 'no_workspace', error: 'No active workspace.' });
			}
			const ownerId = pb.authStore.record && pb.authStore.record.id;
			return runWrite(
				() => pb.collection(collection).create({ ...data, workspace: active.id, owner: ownerId }),
				'Could not save that. Nothing was written.',
				{ op: 'create' },
			);
		},
		[active, collection, guardDemo, runWrite],
	);

	const update = useCallback(
		(id, data) => {
			const blocked = guardDemo();
			if (blocked) return Promise.resolve(blocked);
			return runWrite(
				() => pb.collection(collection).update(id, data),
				'Could not save that change. The record is unchanged.',
				{ op: 'update' },
			);
		},
		[collection, guardDemo, runWrite],
	);

	const remove = useCallback(
		(id) => {
			const blocked = guardDemo();
			if (blocked) return Promise.resolve(blocked);
			return runWrite(
				() => pb.collection(collection).delete(id),
				'Could not delete that record.',
				{ op: 'delete' },
			);
		},
		[collection, guardDemo, runWrite],
	);

	const clearWriteError = useCallback(() => setWriteError(''), []);

	return {
		records,
		loading,
		error,
		degraded,
		demo,
		refresh: load,
		create,
		update,
		remove,
		saving,
		writeError,
		clearWriteError,
	};
}

/**
 * Loads records that are not workspace-scoped, such as the shared tutorials
 * catalog. Respects the collection's own listRule.
 *
 * @param {string} collection PocketBase collection name.
 * @param {{sort?: string, expand?: string, enabled?: boolean}} [options] Query options.
 * @returns {{records: Array<object>, loading: boolean, error: string, degraded: boolean, refresh: Function}} Records and state.
 */
export function useRecords(collection, options = {}) {
	const { enabled = true, sort, expand } = options;
	const [records, setRecords] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [degraded, setDegraded] = useState(false);

	const load = useCallback(async () => {
		if (!enabled) {
			setRecords([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const list = await pb.collection(collection).getFullList({
				sort: sort || '-created',
				expand,
			});
			setRecords(list);
			setError('');
			setDegraded(false);
		} catch (err) {
			console.error(`load ${collection} failed`, err);
			setError(READ_FAILED);
			setDegraded(true);
			setRecords([]);
		}
		setLoading(false);
	}, [collection, enabled, sort, expand]);

	useEffect(() => {
		load();
	}, [load]);

	return { records, loading, error, degraded, refresh: load };
}

/**
 * Filters, searches and sorts a record list in memory.
 *
 * In memory rather than server-side on purpose: a workspace holds hundreds of
 * records, not millions, the full list is already loaded, and a round trip per
 * keystroke would make the filter feel worse than the wall it replaces.
 *
 * @param {Array<object>} records Loaded records.
 * @param {{query?: string, searchFields?: Array<string>, filters?: object, sort?: Function}} config Shaping rules.
 * @returns {Array<object>} A new, shaped array.
 */
export function useShapedRecords(records, config) {
	const { query = '', searchFields = [], filters = {}, sort } = config;
	const filterKey = JSON.stringify(filters);

	return useMemo(() => {
		const needle = query.trim().toLowerCase();
		let shaped = records;

		const active = Object.entries(filters).filter(([, value]) => value && value !== 'all');
		if (active.length) {
			shaped = shaped.filter((record) =>
				active.every(([field, value]) => (record[field] || '') === value),
			);
		}

		if (needle) {
			shaped = shaped.filter((record) =>
				searchFields.some((field) => String(record[field] || '').toLowerCase().includes(needle)),
			);
		}

		return sort ? [...shaped].sort(sort) : shaped;
		// filterKey stands in for `filters`, which is a fresh object literal on
		// every render and would otherwise defeat the memo entirely.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [records, query, filterKey, sort, searchFields.join(',')]);
}
