// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/missions/__tests__/MissionFlow.test.jsx
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/web/src/components/workspace/missions/MissionBuilder.jsx, apps/web/src/components/workspace/missions/MissionReview.jsx, apps/web/src/components/workspace/missions/MissionLearning.jsx, apps/web/src/components/workspace/missions/MissionGuide.jsx
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/web/src/components/workspace/missions/MissionBuilder.jsx; DEPENDS_ON apps/web/src/components/workspace/missions/MissionReview.jsx; DEPENDS_ON apps/web/src/components/workspace/missions/MissionLearning.jsx; DEPENDS_ON apps/web/src/components/workspace/missions/MissionGuide.jsx
// DAG Node:     none
// Intent:       Test draft recovery, explicit TEVV review, real evidence writes and saved educational rewards through user interactions.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MissionBuilder from '@/components/workspace/missions/MissionBuilder';
import MissionGuide from '@/components/workspace/missions/MissionGuide';
import MissionLearning from '@/components/workspace/missions/MissionLearning';
import MissionReview from '@/components/workspace/missions/MissionReview';
import { LESSONS, PLAN_FIELDS, TEVV, emptyPlan, emptyReview } from '@/lib/missionLearning';
import { act, fireEvent, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

const currentAccess = vi.hoisted(() => ({ data: { can_write: true } }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => currentAccess }));
beforeEach(() => { currentAccess.data = { can_write: true }; });

const fullPlan = () => ({
    ...emptyPlan(),
    ...Object.fromEntries(PLAN_FIELDS.map(({ id }) => [id, `A bounded method for ${id}.`])),
});
const savedMission = (data = {}) => ({
    id: 'mission1',
    workspace: 'workspace1',
    owner: 'user1',
    title: 'Reminder experiment',
    status: 'running',
    mission_plan: fullPlan(),
    mission_approved_by: 'user1',
    mission_approved_at: '2026-09-15T01:00:00Z',
    ...data,
});
const receipt = {
    id: 'receipt1',
    workspace: 'workspace1',
    mission: 'mission1',
    source: 'Test log',
    title: 'Local observations',
    content: 'Measured failure and recovery cases.',
};
const savedReview = () => ({
    ...Object.fromEntries(
        TEVV.map(({ id }) => [
            id,
            { outcome: 'pass', observation: `Measured ${id}.`, evidence: receipt.id },
        ]),
    ),
    reflection: 'Keep the failure test for the next attempt.',
});
const reviewProps = (overrides = {}) => ({
    mission: savedMission(),
    evidence: [receipt],
    onSave: vi.fn().mockResolvedValue({ ok: true }),
    onEvidence: vi.fn().mockResolvedValue({ ok: true, record: receipt }),
    onRefreshEvidence: vi.fn(),
    ...overrides,
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('guided mission planning', () => {
    it('creates a reviewable government submission draft with no implied approval', async () => {
        const user = setupUser(); const save = vi.fn().mockResolvedValue({ ok: true });
        renderWithProviders(<MissionBuilder onSave={save} onCancel={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: 'Use government submission starter' }));
        expect(screen.getByLabelText('Goal')).toHaveValue('Prepare an evidence-backed government solution brief');
        await user.click(screen.getByRole('button', { name: 'Save draft' }));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const draft = save.mock.calls[0][0]; expect(draft.status).toBe('proposed'); expect(draft.mission_plan.risk).toBe('A2');
        expect(draft.mission_plan.baseline).toMatch(/no measurement is claimed/); expect(draft.mission_approved_by).toBeUndefined();
    });

    it('keeps incomplete drafts and saved approval as distinct actions', async () => {
        const user = setupUser();
        const save = vi.fn().mockResolvedValue({ ok: true });
        renderWithProviders(<MissionBuilder onSave={save} onCancel={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: 'Save draft' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Give the mission a clear goal');
        expect(save).not.toHaveBeenCalled();
        await user.type(screen.getByLabelText('Goal'), '  Test reminders  ');
        await user.type(
            screen.getByLabelText('Why this mission matters'),
            'Operators need reliable reminders.',
        );
        await user.click(screen.getByRole('button', { name: 'Next: Safety' }));
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Safety' })).toHaveFocus());
        await user.type(
            screen.getByLabelText('Authorization boundary'),
            'Local test records only.',
        );
        await user.selectOptions(screen.getByLabelText('Risk tier'), 'A0');
        await user.click(screen.getByRole('button', { name: 'Next: TEVV' }));
        await user.type(
            screen.getByLabelText('Testing method'),
            'Replay normal, boundary and failure inputs.',
        );
        await user.click(screen.getByRole('button', { name: 'Next: Review draft' }));
        expect(screen.getByText(/plan items still need an answer/)).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Priority'), 'high');
        await user.type(screen.getByLabelText('Due date (optional)'), '2026-10-15');
        await user.click(screen.getByRole('button', { name: 'Save draft' }));
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Test reminders',
                status: 'proposed',
                priority: 'high',
                mission_plan: expect.objectContaining({
                    version: 1,
                    risk: 'A0',
                    purpose: 'Operators need reliable reminders.',
                    test: 'Replay normal, boundary and failure inputs.',
                }),
            }),
        );
        expect(screen.queryByRole('button', { name: 'Record approval' })).not.toBeInTheDocument();
    });
    it('preserves answers after a denied save and sends a revision back to proposal', async () => {
        const user = setupUser();
        const save = vi
            .fn()
            .mockResolvedValueOnce({ ok: false, error: 'Write denied' })
            .mockResolvedValue({ ok: true });
        const cancel = vi.fn();
        renderWithProviders(
            <MissionBuilder
                mission={savedMission({ status: 'approved' })}
                onSave={save}
                onCancel={cancel}
            />,
        );
        await user.clear(screen.getByLabelText('Success criterion'));
        await user.type(
            screen.getByLabelText('Success criterion'),
            'A revised measured threshold.',
        );
        await user.click(screen.getByRole('button', { name: 'Save draft' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Write denied');
        expect(screen.getByLabelText('Success criterion')).toHaveValue(
            'A revised measured threshold.',
        );
        await user.click(screen.getByRole('button', { name: '4. Review draft' }));
        expect(screen.getByText(/All plan sections are filled/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Back' }));
        await user.click(screen.getByRole('button', { name: 'Save draft' }));
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'proposed' }));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(cancel).toHaveBeenCalledOnce();
    });
    it('blocks double submission while a draft is being persisted', async () => {
        let resolve;
        const save = vi.fn(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        renderWithProviders(
            <MissionBuilder mission={savedMission()} onSave={save} onCancel={vi.fn()} />,
        );
        const form = screen.getByRole('form', { name: 'Mission plan' });
        fireEvent.submit(form);
        fireEvent.submit(form);
        expect(save).toHaveBeenCalledOnce();
        await act(async () => resolve({ ok: true }));
    });
});

describe('TEVV evidence review', () => {
    it('requires observed outcomes, readable mission evidence and an explicit review before verifying', async () => {
        const user = setupUser();
        const props = reviewProps({
            evidence: [
                receipt,
                { ...receipt, id: 'foreign', title: 'Other workspace', workspace: 'other' },
            ],
        });
        renderWithProviders(<MissionReview {...props} />);
        expect(screen.getByRole('button', { name: 'Verify with evidence' })).toBeDisabled();
        expect(screen.queryByRole('option', { name: /Other workspace/ })).not.toBeInTheDocument();
        for (const step of TEVV) {
            await user.selectOptions(screen.getByLabelText(`${step.label} outcome`), 'pass');
            await user.selectOptions(screen.getByLabelText(`${step.label} evidence`), receipt.id);
            await user.type(
                screen.getByLabelText(`${step.label} observation`),
                `Observed ${step.label} result.`,
            );
        }
        await user.type(
            screen.getByLabelText('What you learned and the next step'),
            'The failure paths are covered. Keep checking with operators.',
        );
        await user.click(screen.getByRole('button', { name: 'Save review' }));
        expect(props.onSave).toHaveBeenLastCalledWith(
            expect.not.objectContaining({ status: 'verified' }),
        );
        expect(screen.getByRole('button', { name: 'Verify with evidence' })).toBeDisabled();
        await user.click(screen.getByRole('checkbox', { name: /I reviewed the linked evidence/ }));
        await user.click(screen.getByRole('button', { name: 'Verify with evidence' }));
        expect(props.onSave).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: 'verified',
                mission_review: expect.objectContaining({
                    test: expect.objectContaining({ evidence: receipt.id, outcome: 'pass' }),
                }),
            }),
        );
        expect(screen.getByRole('status')).toHaveTextContent('Verification recorded');
    });
    it('keeps a failed evidence submission editable and shows the actual persistence outcome', async () => {
        const user = setupUser();
        const props = reviewProps({
            evidence: [],
            onEvidence: vi
                .fn()
                .mockResolvedValueOnce({ ok: false, error: 'Evidence denied' })
                .mockResolvedValue({ ok: true, record: receipt }),
        });
        renderWithProviders(<MissionReview {...props} />);
        await user.click(screen.getByText('Add evidence to this mission', { selector: 'summary' }));
        await user.click(screen.getByRole('button', { name: 'Save evidence' }));
        expect(screen.getByRole('alert')).toHaveTextContent('source and the actual observation');
        await user.type(screen.getByLabelText('Evidence source'), 'Run log');
        await user.type(
            screen.getByLabelText('Actual observation'),
            'The recovery case timed out.',
        );
        await user.click(screen.getByRole('button', { name: 'Save evidence' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Evidence denied');
        expect(screen.getByLabelText('Actual observation')).toHaveValue(
            'The recovery case timed out.',
        );
        expect(props.onSave).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Save evidence' }));
        expect(props.onEvidence).toHaveBeenLastCalledWith(
            expect.objectContaining({
                mission: 'mission1',
                type: 'observed',
                source: 'Run log',
                content: 'The recovery case timed out.',
            }),
        );
        expect(screen.getByLabelText('Actual observation')).toHaveValue('');
        expect(screen.getByRole('status')).toHaveTextContent('Evidence saved');
    });
    it('does not interpret an evidence outage as an empty successful review', async () => {
        const user = setupUser();
        const props = reviewProps({
            mission: savedMission({ mission_review: savedReview() }),
            evidenceDegraded: true,
        });
        renderWithProviders(<MissionReview {...props} />);
        expect(screen.getByRole('button', { name: 'Verify with evidence' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Retry evidence' }));
        expect(props.onRefreshEvidence).toHaveBeenCalledOnce();
        expect(props.onSave).not.toHaveBeenCalled();
    });
    it('saves failures honestly and preserves rejected review text', async () => {
        const user = setupUser();
        const props = reviewProps({
            onSave: vi
                .fn()
                .mockResolvedValueOnce({ ok: false, error: 'Review denied' })
                .mockResolvedValue({ ok: true }),
        });
        renderWithProviders(<MissionReview {...props} />);
        await user.click(screen.getByRole('button', { name: 'Record failed outcome' }));
        expect(props.onSave).not.toHaveBeenCalled();
        await user.selectOptions(screen.getByLabelText('Testing outcome'), 'fail');
        await user.type(
            screen.getByLabelText('What you learned and the next step'),
            'The environment failed before validation. Repair it before another attempt.',
        );
        await user.click(screen.getByRole('button', { name: 'Record failed outcome' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Review denied');
        expect(screen.getByLabelText('What you learned and the next step')).toHaveValue(
            'The environment failed before validation. Repair it before another attempt.',
        );
        await user.click(screen.getByRole('button', { name: 'Record failed outcome' }));
        expect(props.onSave).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: 'failed',
                mission_review: expect.objectContaining({
                    test: expect.objectContaining({ outcome: 'fail' }),
                }),
            }),
        );
        expect(screen.getByRole('status')).toHaveTextContent('Failed outcome recorded');
    });
    it('keeps finished reviews read-only and identifies missing referenced evidence', async () => {
        const user = setupUser();
        renderWithProviders(
            <MissionReview
                {...reviewProps({
                    mission: savedMission({
                        status: 'verified',
                        progress: 100,
                        mission_review: savedReview(),
                        mission_reviewed_at: '2026-09-15T01:00:00Z',
                        mission_reviewed_by: 'user1',
                    }),
                    evidence: [],
                })}
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'Verify with evidence' }),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText('Testing observation')).toBeDisabled();
        expect(screen.getByLabelText('Self-reported work progress (%)')).toHaveValue(100);
        await user.click(
            screen.getAllByText('Inspect selected evidence', { selector: 'summary' })[0],
        );
        expect(
            screen.getAllByText(/reference is missing or no longer readable/).length,
        ).toBeGreaterThan(0);
    });
});

function LearningHarness({ initial = savedMission({ mission_plan: emptyPlan() }), save }) {
    const [record, setRecord] = useState(initial);
    return (
        <MissionLearning
            mission={record}
            evidence={[receipt]}
            onSave={async (mission_learning) => {
                const result = await save(mission_learning);
                if (result.ok) setRecord((current) => ({ ...current, mission_learning }));
                return result;
            }}
        />
    );
}

describe('educational rewards', () => {
    it('shows why and how guidance with primary references and an unsigned-record explanation', async () => {
        const user = setupUser();
        renderWithProviders(<MissionGuide />);
        await user.click(
            screen.getByText('How to build your first mission', { selector: 'summary' }),
        );
        expect(screen.getByRole('link', { name: 'Open the mission builder' })).toHaveAttribute(
            'href',
            '/app/missions',
        );
        await user.click(
            screen.getByText('Standards, trust and the limits of a badge', { selector: 'summary' }),
        );
        expect(screen.getByRole('link', { name: 'NIST AI RMF 1.0' })).toHaveAttribute(
            'href',
            'https://www.nist.gov/itl/ai-risk-management-framework',
        );
        expect(screen.getByRole('link', { name: 'OWASP ASVS' })).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'W3C Verifiable Credentials 2.0' }),
        ).toBeInTheDocument();
        expect(screen.getByText(/downloadable learning record is unsigned/)).toBeInTheDocument();
    });
    it('awards no credit for a rejected answer save, then persists one correct answer only once', async () => {
        const user = setupUser();
        const save = vi
            .fn()
            .mockResolvedValueOnce({ ok: false, error: 'Save unavailable' })
            .mockResolvedValue({ ok: true });
        renderWithProviders(<LearningHarness save={save} />);
        await user.click(
            screen.getByText(/Start with a falsifiable goal/, { selector: 'summary' }),
        );
        await user.click(screen.getByRole('radio', { name: LESSONS[0].choices[1].text }));
        await user.click(screen.getByRole('button', { name: 'Check and save answer' }));
        expect(screen.getByText('Save unavailable')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
        expect(screen.queryByText(/Unlocked: a reminder/)).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Check and save answer' }));
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '15');
        expect(screen.getByRole('button', { name: 'Check and save answer' })).toBeDisabled();
        expect(save).toHaveBeenCalledTimes(2);
    });
    it('explains an incorrect answer and lets the learner retry without losing access to guidance', async () => {
        const user = setupUser();
        const save = vi.fn().mockResolvedValue({ ok: true });
        renderWithProviders(<LearningHarness save={save} />);
        await user.click(
            screen.getByText(/Start with a falsifiable goal/, { selector: 'summary' }),
        );
        await user.click(screen.getByRole('radio', { name: LESSONS[0].choices[0].text }));
        await user.click(screen.getByRole('button', { name: 'Check and save answer' }));
        expect(screen.getByText(/Try another answer/)).toHaveTextContent(LESSONS[0].explanation);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
        await user.click(screen.getByRole('radio', { name: LESSONS[0].choices[1].text }));
        await user.click(screen.getByRole('button', { name: 'Check and save answer' }));
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '15');
    });
    it('unlocks useful examples and a review coach from saved progress', async () => {
        const user = setupUser();
        const initial = savedMission({
            mission_learning: Object.fromEntries(
                LESSONS.map((lesson) => [lesson.id, lesson.answer]),
            ),
            mission_review: savedReview(),
        });
        renderWithProviders(<LearningHarness initial={initial} save={vi.fn()} />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
        await user.click(screen.getByText(/Unlocked: a reminder/, { selector: 'summary' }));
        expect(screen.getByText(/Illustrative methods, not performed work/)).toBeInTheDocument();
        await user.click(screen.getByText(/Unlocked: five questions/, { selector: 'summary' }));
        expect(screen.getByText('Was the target fixed before measuring?')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Record approval' })).not.toBeInTheDocument();
    });
    it('downloads a local unsigned record and releases its object URL', () => {
        vi.useFakeTimers();
        const createObjectURL = vi.fn().mockReturnValue('blob:learning');
        const revokeObjectURL = vi.fn();
        const OriginalURL = URL;
        vi.stubGlobal(
            'URL',
            class extends OriginalURL {
                static createObjectURL = createObjectURL;
                static revokeObjectURL = revokeObjectURL;
            },
        );
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        renderWithProviders(<LearningHarness save={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Download unsigned learning record' }));
        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(click).toHaveBeenCalledOnce();
        act(() => vi.runOnlyPendingTimers());
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:learning');
    });
});
