// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useSectionFailure.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TELEMETRY-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/observability/sectionFailure.js
// EnumType:    Hook
// EnumEdges:   CONSUMES apps/web/src/lib/observability/sectionFailure.js
// DAG Node:    none
// Intent:      Let the shared failure notices report the failure they render, so every
//              section that uses them sends a failure event without per-page code.
// ───────────────────────────────────────────────────────────────

import { useEffect } from 'react';

import { trackSectionFailure } from '@/lib/observability/sectionFailure';

/**
 * Reports a failure state when it appears, and again when it changes.
 *
 * @param {boolean} active Whether the failure is on screen.
 * @param {string} source Component rendering it; one of SECTION_FAILURE_SOURCES.
 * @param {string} reason One of SECTION_FAILURE_REASONS.
 * @param {*} [identity] Changes when a different failure replaces the current
 *   one (the message text, for example). Used only to re-fire, never sent.
 * @returns {void}
 */
export function useSectionFailure(active, source, reason, identity) {
    useEffect(() => {
        if (active) trackSectionFailure(source, reason);
    }, [active, source, reason, identity]);
}
