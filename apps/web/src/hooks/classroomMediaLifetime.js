// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/hooks/classroomMediaLifetime.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     none
// EnumType:    Adapter
// EnumEdges:   VERIFIED_BY tests/upgrade/classroom-media-lifetime.test.mjs
// DAG Node:    none
// Intent:      Own one explicit media join and dispose late resources without reviving a cancelled scope.
// ----------------------------------------------------------------

function closeMedia(handle) {
    if (!handle) return;
    const tracks = new Set();
    for (const stream of [handle.stream, handle.remoteStream]) {
        try { for (const track of stream?.getTracks() || []) tracks.add(track); } catch { /* Keep closing other resources. */ }
    }
    try { handle.close(); } catch { /* Still stop tracks if transport cleanup failed. */ }
    for (const track of tracks) {
        try { if (track.readyState !== 'ended') track.stop(); } catch { /* One failed track must not retain the rest. */ }
    }
    try { if (handle.pc?.connectionState !== 'closed') handle.pc?.close(); } catch { /* Best effort after track cleanup. */ }
}

/** Own one pending or connected join without depending on a React render.
 * @returns {object} Explicit claim, cancellation and the current attempt.
 */
export function createMediaLifetime() {
    let active = null;
    return {
        get active() { return active; },
        begin(isCurrent) {
            if (active && !active.current()) active.cancel();
            if (active || !isCurrent()) return null;
            let handle = null;
            const cleanups = new Set();
            const attempt = {
                get handle() { return handle; },
                current: () => active === attempt && isCurrent(),
                accept(next) {
                    if (!attempt.current()) {
                        attempt.cancel(); closeMedia(next);
                        return false;
                    }
                    handle = next;
                    return true;
                },
                addCleanup(cleanup) {
                    const dispose = () => {
                        if (!cleanups.delete(dispose)) return;
                        try { cleanup(); } catch { /* Cancellation must run every disposer. */ }
                    };
                    cleanups.add(dispose);
                    if (!attempt.current()) dispose();
                    return dispose;
                },
                cancel() {
                    // Invalidate first: closing a transport can itself fire callbacks.
                    if (active === attempt) active = null;
                    const closing = handle; handle = null;
                    for (const dispose of cleanups) dispose();
                    closeMedia(closing);
                },
            };
            active = attempt;
            return attempt;
        },
        cancel() { active?.cancel(); },
    };
}
