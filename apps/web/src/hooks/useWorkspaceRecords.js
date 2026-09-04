import { useCallback, useEffect, useState } from 'react';
import pb from '@/lib/pocketbaseClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';

/**
 * Loads owner-scoped records for the active workspace. The listRule on each
 * collection already filters to the caller's records; we additionally scope
 * by `workspace` so a user with multiple workspaces only sees the active one.
 */
export function useWorkspaceRecords(collection, options = {}) {
    const { active } = useWorkspace();
    const { sort, expand, enabled = true, extraFilter } = options;
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!enabled || !active) {
            setRecords([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const base = pb.filter('workspace = {:ws}', { ws: active.id });
            const filter = extraFilter
                ? `${base} && ${extraFilter}`
                : base;
            const list = await pb.collection(collection).getFullList({
                sort: sort || '-created',
                expand,
                filter,
            });
            setRecords(list);
            setError('');
        } catch (err) {
            console.error(`load ${collection} failed`, err);
            setError('Could not load this data right now.');
            setRecords([]);
        }
        setLoading(false);
    }, [collection, active, enabled, sort, expand, extraFilter]);

    useEffect(() => {
        load();
    }, [load]);

    return { records, loading, error, refresh: load };
}

export function useRecords(collection, options = {}) {
    // Generic records hook (not workspace-scoped) — e.g. the shared tutorials
    // catalog. Respects the collection's own listRule.
    const { enabled = true } = options;
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!enabled) {
            setRecords([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const list = await pb.collection(collection).getFullList({
                sort: options.sort || '-created',
                expand: options.expand,
            });
            setRecords(list);
            setError('');
        } catch (err) {
            console.error(`load ${collection} failed`, err);
            setError('Could not load this data right now.');
            setRecords([]);
        }
        setLoading(false);
    }, [collection, enabled, options.sort, options.expand]);

    useEffect(() => {
        load();
    }, [load]);

    return { records, loading, error, refresh: load };
}
