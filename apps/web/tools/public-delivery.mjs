// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/tools/public-delivery.mjs
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     apps/web/src/lib/publicExposure.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/publicExposure.js
// Intent:      Exclude retired operational projections from a fresh public asset copy before Vite can publish stale files.
// ───────────────────────────────────────────────────────────────

import { cpSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { retiredPublicFeed } from '../src/lib/publicExposure.js';

export function copyPublicAssets(source, destination) {
    cpSync(source, destination, { recursive: true, dereference: false,
        filter: (path) => !retiredPublicFeed(relative(source, path).replaceAll('\\', '/')) });
}

export function assertPublicDelivery(directory) {
    const retired = readdirSync(directory).filter((name) => retiredPublicFeed(name));
    if (retired.length) throw new Error(`Retired operational publications are present in build output: ${retired.join(', ')}`);
}
