// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/suite/__tests__/SuiteForms.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/components/workspace/suite/SuiteForms.jsx, apps/web/src/components/workspace/suite/SuiteResult.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/suite/SuiteForms.jsx; VALIDATES apps/web/src/components/workspace/suite/SuiteResult.jsx
// DAG Node:    none
// Intent:      Exercise source permissions, local PDF selection, requirement editing and explicit human review through rendered controls.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { MaritimeForm, SubmissionForm, SuiteConfiguration } from '@/components/workspace/suite/SuiteForms';
import SuiteResult from '@/components/workspace/suite/SuiteResult';
import { fingerprintPdf } from '@/lib/missionSuite';
vi.mock('@/lib/missionSuite', async (original) => ({ ...await original(), fingerprintPdf: vi.fn() }));

const config = { enabled: false, rights: [], parameters: { gap_seconds: 900, max_speed_knots: 45, position_tolerance_m: 5000, stale_seconds: 3600 } };
const pdf = (name = 'review.pdf') => new File(['%PDF-1.7\nSynthetic form-selection fixture'], name, { type: 'application/pdf' });
const metadata = { name: 'review.pdf', sha256: 'a'.repeat(64) };
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => { fingerprintPdf.mockReset(); fingerprintPdf.mockResolvedValue(metadata); });

it('requires explicit source permissions and saves operator-entered detection thresholds', async () => {
    const onSave = vi.fn(); const user = setupUser(); renderWithProviders(<SuiteConfiguration config={config} disabled={false} onSave={onSave} />);
    await user.click(screen.getByText('Mission settings and source rights'));
    await user.click(screen.getByRole('button', { name: 'Add source rights' }));
    expect(screen.getByLabelText('The referenced rights permit processing in this workspace')).not.toBeChecked();
    for (const [label, value] of [['Source identifier', 'feed-1'], ['Rights record identifier', 'rights-1'], ['License or permission reference', 'Reviewed source license'],
        ['Upstream source group', 'provider-1'], ['Rights expire at (UTC)', '2099-01-01T00:00:00Z']]) await user.type(screen.getByLabelText(label), value);
    await user.selectOptions(screen.getByLabelText('Classification'), 'COMMERCIAL');
    expect(screen.queryByRole('option', { name: 'CUI' })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('The referenced rights permit processing in this workspace'));
    await user.click(screen.getByLabelText('The referenced rights permit export (no export service is enabled here)'));
    await user.click(screen.getByText('Detection thresholds'));
    await user.clear(screen.getByLabelText('Observation gap (seconds)')); await user.type(screen.getByLabelText('Observation gap (seconds)'), '1800');
    await user.click(screen.getByRole('button', { name: 'Add source rights' })); await user.click(screen.getByRole('button', { name: 'Remove source 2' }));
    await user.click(screen.getByLabelText('Enable suite analysis for this mission'));
    await user.click(screen.getByRole('button', { name: 'Save mission settings' }));
    expect(onSave).toHaveBeenCalledOnce(); const saved = onSave.mock.calls[0][0];
    expect(saved.enabled).toBe(true); expect(saved.rights).toHaveLength(1); expect(saved.rights[0].processing_allowed).toBe(true); expect(saved.parameters.gap_seconds).toBe(1800);
    expect(config.rights).toEqual([]);
});

it('preserves rejected observations and clears fields only after the save is confirmed', async () => {
    const onRun = vi.fn().mockResolvedValue({ ok: false }); const user = setupUser();
    renderWithProviders(<MaritimeForm rights={[{ source_id: 'denied', processing_allowed: false }, { source_id: 'allowed', processing_allowed: true }]} disabled={false} onRun={onRun} />);
    fireEvent.submit(screen.getByRole('form', { name: 'Analyze maritime observation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a permitted source'); expect(onRun).not.toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: 'denied' })).not.toBeInTheDocument(); await user.selectOptions(screen.getByLabelText('Source'), 'allowed');
    for (const [label, value] of [['Observation identifier', 'obs-1'], ['Source record identifier', 'source-1'], ['Claimed vessel identifier', 'vessel-1'],
        ['Observation time (UTC)', '2026-01-01T00:00:00Z'], ['Latitude (WGS84)', '0'], ['Longitude (WGS84)', '0']]) await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole('button', { name: 'Queue observation analysis' }));
    expect(screen.getByLabelText('Observation identifier')).toHaveValue('obs-1'); expect(onRun.mock.calls[0][0].observations[0].latitude).toBe(0);
    onRun.mockResolvedValue({ ok: true }); await user.click(screen.getByRole('button', { name: 'Queue observation analysis' }));
    await waitFor(() => expect(screen.getByLabelText('Observation identifier')).toHaveValue(''));
});

it('queues the selected document metadata and declared requirements without uploading PDF bytes', async () => {
    const onRun = vi.fn(); const user = setupUser();
    renderWithProviders(<SubmissionForm evidence={[{ id: 'proof1', title: 'Accepted test evidence', type: 'verified' }]} evidenceAvailable disabled={false} onRun={onRun} />);
    await user.upload(screen.getByLabelText(/Rendered PDF/), pdf()); await screen.findByText(/SHA-256/);
    await user.selectOptions(screen.getByLabelText('Permitted format'), 'deck');
    for (const [label, value] of [['Measured page or slide count', '12'], ['Limit in the current notice', '15'], ['Official format rule URL', 'https://www.diu.mil/'],
        ['Rule amendment or revision', 'Example amendment'], ['Submission deadline converted to UTC', '2099-01-01T00:00:00Z'],
        ['Required outcome or criterion', 'Provide capability evidence'], ['Official requirement URL', 'https://www.diu.mil/'],
        ['Requirement amendment or revision', 'Example rule'], ['Non-applicability explanation or reviewer note', 'Review the actual referenced result.']]) await user.type(screen.getByLabelText(label), value);
    await user.selectOptions(screen.getByLabelText('Requirement status'), 'satisfied'); await user.selectOptions(screen.getByLabelText('Supporting mission evidence'), 'proof1');
    await user.click(screen.getByRole('button', { name: 'Add requirement' })); await user.click(screen.getByRole('button', { name: 'Remove requirement 2' }));
    await user.click(screen.getByRole('button', { name: 'Queue readiness review' }));
    expect(onRun).toHaveBeenCalledOnce(); const input = onRun.mock.calls[0][0];
    expect(input.document).toMatchObject({ ...metadata, pages: 12, max_pages: 15, format: 'deck' });
    expect(input.requirements[0].evidence_ids).toEqual(['proof1']); expect(JSON.stringify(input)).not.toContain('%PDF-');
});

it('reports absent or invalid documents without claiming readiness', async () => {
    const onRun = vi.fn(); const user = setupUser(); fingerprintPdf.mockRejectedValue(new Error('invalid PDF'));
    renderWithProviders(<SubmissionForm evidence={[]} evidenceAvailable disabled={false} onRun={onRun} />);
    fireEvent.submit(screen.getByRole('form', { name: 'Check government submission' })); expect(await screen.findByRole('alert')).toHaveTextContent('Select the rendered PDF');
    await user.upload(screen.getByLabelText(/Rendered PDF/), pdf()); expect(await screen.findByRole('alert')).toHaveTextContent('Could not fingerprint'); expect(onRun).not.toHaveBeenCalled();
});

it('ignores a late PDF fingerprint after the user selects another document', async () => {
    const first = deferred(); const second = deferred(); const user = setupUser();
    fingerprintPdf.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    renderWithProviders(<SubmissionForm evidence={[]} evidenceAvailable disabled={false} onRun={vi.fn()} />);
    await user.upload(screen.getByLabelText(/Rendered PDF/), pdf('first.pdf')); expect(screen.getByRole('button', { name: 'Queue readiness review' })).toBeDisabled();
    await user.upload(screen.getByLabelText(/Rendered PDF/), pdf('second.pdf'));
    await act(async () => second.resolve({ ...metadata, name: 'second.pdf' })); expect(await screen.findByText(/second.pdf · SHA/)).toBeVisible();
    await act(async () => first.resolve({ name: 'first.pdf', sha256: 'b'.repeat(64) })); expect(screen.queryByText(/first.pdf · SHA/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Rendered PDF/), { target: { files: [] } }); expect(screen.queryByText(/SHA-256/)).not.toBeInTheDocument();
});

it('disables writes and unavailable evidence selection while leaving the explanation readable', () => {
    renderWithProviders(<SubmissionForm evidence={[]} evidenceAvailable={false} disabled onRun={vi.fn()} />);
    expect(screen.getByLabelText('Supporting mission evidence')).toBeDisabled(); expect(screen.getByLabelText(/Rendered PDF/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Queue readiness review' })).toBeDisabled(); expect(screen.getByText(/Mission evidence is unavailable/)).toBeVisible();
});

it('shows submission gaps, enforces review notes and keeps receipt and release claims separate', async () => {
    const onAction = vi.fn(); const user = setupUser();
    const record = { id: 'run1', suite: 'submission', status: 'ready', created: '', processed_at: '', failure: '', evidence: '', attempt: 1,
        result: { input_sha256: 'a'.repeat(64), source_sha256: 'b'.repeat(64), proof: { root_digest: 'c'.repeat(64) }, analysis: {
            state: 'NEEDS_EVIDENCE', summary: { referenced: 0, requirements: 1 }, document_issues: ['Current page limit is missing'],
            checks: [{ id: 'requirement-1', issues: ['Verified evidence is missing'] }, { id: 'requirement-2', issues: [] }], limits: ['Human review remains required'],
        } } };
    renderWithProviders(<SuiteResult record={record} disabled={false} onAction={onAction} />);
    expect(screen.getByText('Evidence gaps need review')).toBeVisible(); expect(screen.getByText(/No government submission has been made/)).toBeVisible();
    fireEvent.submit(screen.getByRole('form', { name: 'Review suite evidence' })); expect(await screen.findByRole('alert')).toHaveTextContent('Record what you reviewed');
    await user.type(screen.getByLabelText('Human review note'), 'Recorded the unresolved gaps.'); await user.click(screen.getByRole('button', { name: 'Attach reviewed result to mission' }));
    expect(onAction).toHaveBeenCalledWith('attach', { note: 'Recorded the unresolved gaps.' });
    await user.click(screen.getByText('Reproducibility and limits')); expect(screen.getByText('Human review remains required')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Submit to government|Admit cue/i })).not.toBeInTheDocument();
});

it('keeps blocked and failed runs actionable and respects the bounded retry limit', async () => {
    const onAction = vi.fn(); const user = setupUser(); const record = { id: 'run1', suite: 'maritime', status: 'blocked', attempt: 0, failure: 'worker_unbound' };
    const view = renderWithProviders(<SuiteResult record={record} disabled={false} onAction={onAction} />);
    expect(screen.getByText(/operator must connect the worker/)).toBeVisible(); await user.click(screen.getByRole('button', { name: 'Retry run' })); expect(onAction).toHaveBeenCalledWith('retry');
    await user.click(screen.getByRole('button', { name: 'Cancel run' })); expect(onAction).toHaveBeenCalledWith('cancel');
    view.rerender(<SuiteResult record={{ ...record, status: 'failed', attempt: 3, failure: 'invalid_data' }} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Retry run' })).toBeDisabled(); expect(screen.getByText(/Recorded processing failure: invalid_data/)).toBeVisible();
});
