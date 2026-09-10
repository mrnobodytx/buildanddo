// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useDemoMode.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/demoWorkspace.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/demoWorkspace.js
// Intent:      Subscribe the React tree to demonstration mode so every page
//              banner and every data read agree within the same render.
// ───────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';

import { isDemoMode, setDemoMode, subscribeDemoMode } from '@/lib/demoWorkspace';

/**
 * Reads demonstration mode and returns a setter for it.
 *
 * @returns {{demo: boolean, setDemo: (next: boolean) => void}} Current state and setter.
 */
export function useDemoMode() {
	const demo = useSyncExternalStore(subscribeDemoMode, isDemoMode, () => false);
	return { demo, setDemo: setDemoMode };
}

export default useDemoMode;
