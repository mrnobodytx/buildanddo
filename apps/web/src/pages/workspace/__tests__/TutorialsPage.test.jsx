// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/TutorialsPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/workspace/TutorialsPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/TutorialsPage.jsx
// DAG Node:    none
// Intent:      Hold the Field Manual to the audience it names, so a contributor-only surface cannot reappear beside the lessons.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import curriculum from '../../../../../pocketbase/pb_migrations/data/starter-tutorials.json';
import TutorialsPage from '@/pages/workspace/TutorialsPage';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { renderWithProviders, screen } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn(), trackAuthIdentity: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));

// Nothing on this page is stubbed out: the assertion below has to see the real
// page's real tabs. The Component Catalog tab it guards against was removed, and
// ComponentCatalog.jsx went with it (SRS-BUILDANDDO-HYGIENE-001).

beforeEach(() => {
    pb.__reset();
    setDemoMode(false);
    pb.__setRecords('tutorials', curriculum.lessons);
});

describe('Field Manual audience', () => {
    it('offers learners only learner-facing tabs', () => {
        renderWithProviders(<TutorialsPage />, { route: '/app/tutorials' });
        const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
        expect(tabs).toEqual(['Lessons', 'Build a mission']);
    });

    it('does not offer the repository component catalogue to learners', () => {
        renderWithProviders(<TutorialsPage />, { route: '/app/tutorials' });
        // The catalogue documents this repo's own components/ui directory and tells
        // the reader to run the web lint script - engineering documentation for people
        // working ON BuildAndDo, not for people learning on it.
        expect(screen.queryByRole('tab', { name: /catalogue/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /component/i })).not.toBeInTheDocument();
    });
});
