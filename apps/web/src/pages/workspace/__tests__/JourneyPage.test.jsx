// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/JourneyPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-JOURNEY-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-JOURNEY-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/workspace/JourneyPage.jsx, apps/web/src/components/workspace/WorkspaceLayout.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/JourneyPage.jsx; VALIDATES apps/web/src/components/workspace/WorkspaceLayout.jsx
// DAG Node:    none
// Intent:      Prove the journey compiles and saves only a proposed draft, hands answers to the assistant unsent, and that navigation opens only the current category.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';
import JourneyPage, { ASSISTANT_DRAFT_EVENT } from '@/pages/workspace/JourneyPage';
import { renderWithProviders, screen, setupUser, within } from '@/test/utils';

const records = { create: vi.fn(async (data) => ({ ok: true, record: { id: 'm1', ...data } })), demo: false, degraded: false, loading: false };
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: () => records }));

async function answer(user) {
    for (const name of ['I want to do', 'Software and delivery', 'I have done some', 'A day', 'Someone else will review it'])
        await user.click(screen.getByRole('button', { name: new RegExp(name) }));
}

describe('journey', () => {
    it('compiles one lesson and saves a proposed draft that still needs a baseline and target', async () => {
        const user = setupUser(); renderWithProviders(<JourneyPage />);
        expect(screen.getByText('Question 1 of 5')).toBeVisible();
        await answer(user);
        expect(screen.getByRole('link', { name: 'Open the lesson' })).toHaveAttribute('href', '/app/tutorials?lesson=designing-tevv');
        expect(screen.getByText('Baseline')).toBeVisible();
        expect(screen.getByText('Success criterion')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Save mission draft' }));
        const saved = records.create.mock.calls[0][0];
        expect(saved.status).toBe('proposed');
        expect(saved.mission_plan).toMatchObject({ baseline: '', target: '', independent_review: true });
        expect(await screen.findByRole('link', { name: 'Finish the plan on the Challenge Desk' })).toHaveAttribute('href', '/app/missions?mission=m1');
    });

    it('hands the answers to the assistant without sending them', async () => {
        const user = setupUser(); const heard = vi.fn();
        window.addEventListener(ASSISTANT_DRAFT_EVENT, heard);
        renderWithProviders(<JourneyPage />); await answer(user);
        await user.click(screen.getByRole('button', { name: 'Talk it through with the Guildmaster' }));
        expect(heard.mock.calls[0][0].detail.message).toMatch(/baseline I can measure/);
        window.removeEventListener(ASSISTANT_DRAFT_EVENT, heard);
    });
});

describe('Build and Do navigation', () => {
    it('opens only the category holding the current page and keeps the journey pinned', async () => {
        const user = setupUser();
        renderWithProviders(<Routes><Route path="/app" element={<WorkspaceLayout />}><Route path="missions" element={<h1>Desk</h1>} /></Route></Routes>,
            { route: '/app/missions' });
        const nav = within(screen.getByRole('navigation', { name: 'Workspace' }));
        expect(nav.getByRole('link', { name: 'Start a journey' })).toHaveAttribute('href', '/app/journey');
        expect(nav.getByRole('link', { name: 'Challenge Desk' })).toBeVisible();
        expect(nav.queryByRole('link', { name: 'Field Manual' })).not.toBeInTheDocument();
        await user.click(nav.getByRole('button', { name: /Build/ }));
        expect(nav.getByRole('link', { name: 'Field Manual' })).toBeVisible();
    });
});
