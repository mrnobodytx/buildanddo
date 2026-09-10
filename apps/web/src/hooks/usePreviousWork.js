// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/usePreviousWork.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/workHistory.js, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/workHistory.js
// Intent:      Load previous-work summaries for a whole list in one read instead of one per row.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { lookupPreviousWorkBatch } from '@/lib/workHistory';

/**
 * Loads previous-work summaries for a list of subjects in the active workspace.
 *
 * List pages call this once with every visible record id rather than firing a
 * lookup per row. `subjects` is joined into a stable key so passing a freshly
 * built array on each render does not re-trigger the read.
 *
 * @param {string} subjectType `mission`, `workflow`, `page`, `issue`, `pull_request`, `other`.
 * @param {string[]} subjects Record ids to look up.
 * @returns {{ history: Record<string, object>, loading: boolean, refresh: () => void }}
 */
export function usePreviousWork(subjectType, subjects) {
    const { active } = useWorkspace();
    const [history, setHistory] = useState({});
    const [loading, setLoading] = useState(false);
    const key = (subjects || []).filter(Boolean).join(',');

    const load = useCallback(async () => {
        if (!active || !subjectType || !key) {
            setHistory({});
            setLoading(false);
            return;
        }
        setLoading(true);
        const result = await lookupPreviousWorkBatch({
            workspaceId: active.id,
            subjectType,
            subjects: key.split(','),
        });
        setHistory(result);
        setLoading(false);
    }, [active, subjectType, key]);

    useEffect(() => {
        load();
    }, [load]);

    return { history, loading, refresh: load };
}

export default usePreviousWork;
