// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useWorkspaceRecords.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/pocketbaseClient.js, apps/web/src/contexts/WorkspaceContext.jsx, apps/web/src/lib/demoWorkspace.js, apps/web/src/lib/workspaceActions.js, apps/web/src/lib/workspaceRecords.js, apps/web/src/contexts/AuthContext.jsx
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/pocketbaseClient.js; CONSUMES apps/web/src/lib/demoWorkspace.js; PRODUCES workspace.record.write_failed; CONSUMES apps/web/src/lib/workspaceRecords.js; CONSUMES apps/web/src/contexts/AuthContext.jsx
// Intent:      One read/write path for workspace collections, so every page reports failure the same way and none of them can confuse an empty collection with an unreachable one.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { createWorkspaceRecordClient } from '@/lib/workspaceRecords';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { observeMutation } from '@/lib/observability/mutations';
import { useDemoMode } from '@/hooks/useDemoMode';
import { demoRecords } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';

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
    const auth = useAuth();
    const { demo } = useDemoMode();
    const { sort, expand, enabled = true, extraFilter } = options;
    const accountId = auth ? (auth.isAuthed ? auth.user?.id : '') : pb.authStore.record?.id;
    const workspaceId = active?.id || '';
    const scope = `${accountId || ''}:${workspaceId}:${demo}:${collection}:${enabled}`;
    const key = `${scope}:${enabled}:${sort || ''}:${expand || ''}:${extraFilter || ''}`;
    const live = useRef({ scope, key, mounted: true });
    live.current.scope = scope; live.current.key = key;
    const request = useRef(0);
    const [snapshot, setSnapshot] = useState({ key: '', records: [], loading: true, error: '' });
    const [write, setWrite] = useState({ scope: '', saving: false, error: '' });
    const api = useMemo(() => createWorkspaceRecordClient({ client: pb, collection, accountId, workspaceId,
        isCurrent: () => live.current.mounted && live.current.scope === scope && !demo && enabled,
        observe: observeMutation }), [collection, accountId, workspaceId, scope, demo, enabled]);
    const load = useCallback(async () => {
        const attempt = ++request.current;
        if (!enabled || !workspaceId || !accountId || demo) {
            setSnapshot({ key, records: enabled && demo ? demoRecords(collection) : [], loading: false, error: '' });
            return;
        }
        setSnapshot({ key, records: [], loading: true, error: '' });
        const result = await api.read({ sort, expand, extraFilter });
        if (!live.current.mounted || live.current.key !== key || attempt !== request.current || result.stale) return;
        setSnapshot({ key, records: result.ok ? result.records : [], loading: false, error: result.error || '' });
    }, [api, key, enabled, workspaceId, accountId, demo, collection, sort, expand, extraFilter]);
    const reload = useRef(load); reload.current = load;
    useEffect(() => { live.current.mounted = true; load(); return () => { live.current.mounted = false; request.current++; }; }, [load]);
    const perform = useCallback(async (operation, id, data, version) => {
        if (live.current.scope !== scope || !live.current.mounted) return { ok: false, stale: true };
        if (demo) { setWrite({ scope, saving: false, error: DEMO_READ_ONLY }); return { ok: false, reason: 'demo_mode_read_only', error: DEMO_READ_ONLY }; }
        if (!enabled || !accountId || !workspaceId) {
            const error = 'Select an available workspace before saving.';
            setWrite({ scope, saving: false, error }); return { ok: false, reason: 'unavailable', error };
        }
        setWrite((before) => ({ scope, saving: true, error: '', uncertain: before.scope === scope && before.uncertain === true }));
        const result = operation === 'retry' ? await api.retry() : await api.write(operation, id, data, version);
        if (live.current.scope !== scope || !live.current.mounted || result.stale) return { ok: false, stale: true };
        if (result.reason === 'busy') return result;
        setWrite({ scope, saving: false, error: result.error || '', uncertain: result.reason === 'uncertain' || result.uncertain === true });
        if (result.ok) await reload.current();
        return result;
    }, [api, scope, demo, enabled, accountId, workspaceId]);
    const current = snapshot.key === key;
    const writing = write.scope === scope ? write : { saving: false, error: '' };
    return { scope, records: current ? snapshot.records : [], loading: !current || snapshot.loading,
        error: current ? snapshot.error : '', degraded: current && Boolean(snapshot.error), demo,
        refresh: load, create: (data) => perform('create', '', data), update: (id, data, version) => perform('update', id, data, version),
        remove: (id) => perform('delete', id), saving: writing.saving, writeError: writing.error,
        uncertain: writing.uncertain === true, retry: () => perform('retry'),
        clearWriteError: () => setWrite((before) => ({ ...before, error: '' })) };
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
	const requestRef = useRef(0);

	const load = useCallback(async () => {
		const request = ++requestRef.current;
		if (!enabled) {
			setRecords([]);
			setError('');
			setDegraded(false);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const list = await pb.collection(collection).getFullList({
				sort: sort || '-created',
				expand,
				requestKey: null,
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
		setLoading(false);
	}, [collection, enabled, sort, expand]);

	useEffect(() => {
		load();
		return () => { requestRef.current += 1; };
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
