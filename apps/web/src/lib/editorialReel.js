// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/editorialReel.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/motion/runtime.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/web/src/lib/motion/runtime.js
// DAG Node:    none
// Intent:      Keep rotating story windows bounded and cancel their independent clocks when reading or motion policy pauses them.
// ───────────────────────────────────────────────────────────────

/** Resolve a vertical window; the extra rows are visual-only transition buffers.
 * @param {Array<object>} items Current cards with unique IDs.
 * @param {string|null} activeId First visible ID.
 * @param {number} count Requested visible cards.
 * @returns {object} Current index, window and rotation availability.
 */
export function reelWindow(items, activeId, count = 1) {
    const requested = Number.isFinite(count) ? Math.max(1, Math.min(3, Math.floor(count))) : 1;
    const visibleCount = Math.min(requested, items.length);
    const index = Math.max(0, items.findIndex((item) => item.id === activeId));
    const rotating = items.length > visibleCount;
    const rows = rotating ? Array.from({ length: visibleCount + 2 }, (_, row) => {
        const position = (index + row - 1 + items.length) % items.length;
        return { item: items[position], position, hidden: row === 0 || row === visibleCount + 1 };
    }) : items.map((item, position) => ({ item, position, hidden: false }));
    return { index, visibleCount, rotating, rows };
}

/** Advance relative to a stable current ID, including after the list changes.
 * @param {Array<object>} items Current cards.
 * @param {string|null} activeId Current ID.
 * @param {number} direction Previous or next.
 * @returns {string|null} The next visible card ID.
 */
export function advanceReel(items, activeId, direction = 1) {
    if (!items.length) return null;
    const index = Math.max(0, items.findIndex((item) => item.id === activeId));
    return items[(index + (direction < 0 ? -1 : 1) + items.length) % items.length].id;
}

/** Schedule one independent reel clock and invalidate queued ticks on cleanup.
 * @param {Function} advance Advance the current reel.
 * @param {number} interval Requested milliseconds between stories.
 * @param {object} clock Browser-compatible timer host.
 * @returns {Function} Idempotent cancellation.
 */
export function scheduleReel(advance, interval = 9000, clock = globalThis) {
    const delay = Number.isFinite(interval) ? Math.min(60000, Math.max(6000, interval)) : 9000;
    let disposed = false;
    const timer = clock.setInterval(() => { if (!disposed) advance(); }, delay);
    return () => { disposed = true; clock.clearInterval(timer); };
}
