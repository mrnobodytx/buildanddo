// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/TutorialReader.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/components/workspace/TutorialReader.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/TutorialReader.jsx
// DAG Node:    none
// Intent:      Keep the read-only lesson reader honest about effort, sign-in and guided completion.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import curriculum from '../../../../../pocketbase/pb_migrations/data/starter-tutorials.json';
import TutorialReader from '@/components/workspace/TutorialReader';
import { publicLesson } from '@/lib/tutorialCurriculum';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

const authored = curriculum.lessons[0];
const tutorial = { ...authored, lesson: publicLesson(authored.lesson) };

describe('tutorial reader', () => {
    it('estimates ten minutes when a lesson has no recorded effort and asks anonymous readers to sign in', () => {
        renderWithProviders(<TutorialReader tutorial={{ ...tutorial, effort_minutes: 0 }} completed={false} onClose={vi.fn()} opener={null} />);
        const dialog = within(screen.getByRole('dialog'));
        expect(dialog.getByText(`${tutorial.category} · about 10 minutes`)).toBeVisible();
        expect(dialog.getByText('Sign in and open the interactive tutorial to answer this knowledge check.')).toBeVisible();
        expect(dialog.queryByRole('button', { name: 'Start interactive tutorial' })).not.toBeInTheDocument();
        expect(dialog.queryByText(/Guided tutorial completed/)).not.toBeInTheDocument();
    });

    it('offers the guided tutorial to a signed-in reader and reports saved completion separately', async () => {
        const onGuided = vi.fn(); const onClose = vi.fn(); const user = setupUser();
        renderWithProviders(<TutorialReader tutorial={tutorial} completed onGuided={onGuided} onClose={onClose} opener={null} />);
        const dialog = within(screen.getByRole('dialog'));
        expect(dialog.getByText(`${tutorial.category} · about ${tutorial.effort_minutes} minutes`)).toBeVisible();
        expect(dialog.getByText('Answer this knowledge check in the interactive tutorial.')).toBeVisible();
        expect(dialog.getByText(/Guided tutorial completed/)).toBeVisible();
        await user.click(dialog.getByRole('button', { name: 'Start interactive tutorial' }));
        expect(onGuided).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement));
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('withholds guided completion when the lesson body is unreadable', () => {
        renderWithProviders(<TutorialReader tutorial={{ ...tutorial, lesson: { schema_version: 2 } }} completed={false} onGuided={vi.fn()} onClose={vi.fn()} opener={null} />);
        const dialog = within(screen.getByRole('dialog'));
        expect(dialog.getByRole('status')).toHaveTextContent('completion is unavailable');
        expect(dialog.getByText(tutorial.summary)).toBeVisible();
        expect(dialog.queryByRole('button', { name: 'Start interactive tutorial' })).not.toBeInTheDocument();
    });
});
