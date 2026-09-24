// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/brand/Wordmark.jsx
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     design/brand/Main.dc.html
// EnumType:    Component
// EnumEdges:   IMPLEMENTS design/brand/Main.dc.html
// Intent:      The wordmark as the brand sheet sets it, so "And" carries the editorial red.
// ───────────────────────────────────────────────────────────────

/**
 * The BuildAndDo wordmark. From the lockups in design/brand/Main.dc.html.
 *
 * Newsreader 600 at -0.025em, with `And` set italic in editorial red. The italic red joint is the
 * whole point: it is what separates the wordmark from the word, and it is what the header was
 * missing while it rendered the name in plain sans.
 *
 * `And` is not a separate readable word here - a screen reader should hear one name - so the parts
 * are wrapped in a single element and the visual split is presentational only.
 */

/** @param {{className?: string}} props */
export default function Wordmark({ className = '' }) {
    return (
        <span className={`font-display font-semibold tracking-[-0.025em] ${className}`}>
            Build<span className="font-medium italic text-primary">And</span>Do
        </span>
    );
}
