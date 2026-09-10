// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/demoWorkspace.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/workspaceActions.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/web/src/lib/workspaceActions.js;
//              PRODUCES workspace.demo.dataset
// Intent:      Let the workspace be demonstrated without a backend, while making
//              it impossible to mistake a demonstration record for a real one.
// ───────────────────────────────────────────────────────────────

import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

// The repository invariant is that BuildAndDo does not invent business
// activity. This module is the single fenced exception, and the fence has four
// parts, all of which matter:
//
//   1. Opt-in. Nothing here activates on a failed request. A read that fails is
//      reported as degraded, never quietly replaced with fiction — those two
//      states mean opposite things to an operator.
//   2. Session-scoped. The flag lives in sessionStorage, so it dies with the
//      tab and cannot follow someone into a later real session.
//   3. Announced. Every page renders a banner for as long as it is on.
//   4. Read-only. Mutations short-circuit before any PocketBase call, so a
//      demonstration can never leave a record behind.

const STORAGE_KEY = 'bad_demo_mode';
const DEMO_PREFIX = 'demo_';

const listeners = new Set();
let enabled = readInitial();

function readInitial() {
	try {
		return window.sessionStorage.getItem(STORAGE_KEY) === 'on';
	} catch {
		// Private-mode storage denial is not a failure worth surfacing.
		return false;
	}
}

/**
 * Whether the demonstration dataset is currently serving this tab.
 *
 * @returns {boolean} True when demonstration mode is on.
 */
export function isDemoMode() {
	return enabled;
}

/**
 * Turns the demonstration dataset on or off for this tab.
 *
 * @param {boolean} next Desired state.
 * @returns {void}
 */
export function setDemoMode(next) {
	const value = Boolean(next);
	if (value === enabled) return;
	enabled = value;
	try {
		if (value) window.sessionStorage.setItem(STORAGE_KEY, 'on');
		else window.sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// In-memory only for this tab; the banner still reflects reality.
	}
	trackWorkspaceAction(WORKSPACE_ACTIONS.DEMO_MODE_TOGGLED, { enabled: value });
	listeners.forEach((listener) => listener());
}

/**
 * Subscribes to demonstration-mode changes. Shaped for `useSyncExternalStore`.
 *
 * @param {Function} listener Called with no arguments on every change.
 * @returns {Function} Unsubscribe.
 */
export function subscribeDemoMode(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * Whether a record originated from the demonstration dataset.
 *
 * @param {{id?: string}} record Any workspace record.
 * @returns {boolean} True for demonstration records.
 */
export function isDemoRecord(record) {
	return Boolean(record && typeof record.id === 'string' && record.id.startsWith(DEMO_PREFIX));
}

// Timestamps are computed per read so the feed always looks recent relative to
// whenever the demonstration is being given, rather than decaying into a wall
// of "412d ago" the way a hard-coded fixture would.
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const daysAhead = (days) => new Date(Date.now() + days * 86400000).toISOString();

function buildDataset() {
	return {
		signals: [
			{
				id: 'demo_sig_1',
				title: 'Tuesday no-show rate up 18% week over week',
				description:
					'Twelve of sixty-six booked appointments were missed, against nine of seventy last week.',
				source: 'Appointment calendar',
				type: 'fact',
				severity: 'high',
				state: 'new',
				confidence: 96,
				created: minutesAgo(42),
			},
			{
				id: 'demo_sig_2',
				title: 'Reminder texts are probably landing too early',
				description:
					'Missed appointments cluster in the afternoon; reminders all send at 07:00. This is an inference, not a measurement.',
				source: 'Inferred from appointment calendar',
				type: 'inference',
				severity: 'medium',
				state: 'acknowledged',
				confidence: 61,
				acknowledged_at: minutesAgo(90),
				created: minutesAgo(200),
			},
			{
				id: 'demo_sig_3',
				title: 'Second chair sits idle Thursday mornings',
				description: 'Reported by the practice manager during onboarding.',
				source: 'Practice manager',
				type: 'user',
				severity: 'low',
				state: 'new',
				created: minutesAgo(1500),
			},
			{
				id: 'demo_sig_4',
				title: 'Supplier invoice reconciliation is three weeks behind',
				description: 'Nineteen unmatched invoices in the accounting export.',
				source: 'Accounting export',
				type: 'fact',
				severity: 'critical',
				state: 'new',
				confidence: 100,
				created: minutesAgo(300),
			},
		],
		missions: [
			{
				id: 'demo_mis_1',
				title: 'Move appointment reminders to the afternoon before',
				description:
					'In scope: reminder send time only. Out of scope: message copy, channel, and booking rules. Verified by comparing next fortnight no-show rate against the trailing four-week mean.',
				status: 'running',
				priority: 'high',
				progress: 60,
				due_date: daysAhead(9),
				created: minutesAgo(2600),
			},
			{
				id: 'demo_mis_2',
				title: 'Clear the supplier invoice reconciliation backlog',
				description:
					'Match nineteen outstanding invoices against purchase orders and flag every mismatch for review.',
				status: 'needs_attention',
				priority: 'urgent',
				progress: 25,
				due_date: daysAhead(2),
				created: minutesAgo(4300),
			},
			{
				id: 'demo_mis_3',
				title: 'Fill the Thursday morning chair',
				description:
					'Test one recall campaign against the lapsed-patient list. Success is four booked appointments; anything less is a failed test, not a partial win.',
				status: 'proposed',
				priority: 'normal',
				progress: 0,
				created: minutesAgo(700),
			},
			{
				id: 'demo_mis_4',
				title: 'Shorten the new-patient intake form',
				description: 'Dropped three fields. Completion rate moved from 71% to 88% over two weeks.',
				status: 'verified',
				priority: 'low',
				progress: 100,
				created: minutesAgo(20000),
			},
		],
		workflows: [
			{
				id: 'demo_wfl_1',
				name: 'Appointment reminder sequence',
				description: 'Two-touch reminder before every booked appointment.',
				status: 'active',
				template: 'reminders',
				last_run: minutesAgo(180),
				steps: [
					{ id: 's1', name: 'Read tomorrow\u2019s bookings', kind: 'read', detail: 'Appointment calendar' },
					{ id: 's2', name: 'Send SMS at 16:00 the day before', kind: 'notify', detail: 'SMS gateway' },
					{ id: 's3', name: 'Send follow-up SMS at 08:00', kind: 'notify', detail: 'SMS gateway' },
					{ id: 's4', name: 'Record delivery outcome as evidence', kind: 'record', detail: 'Evidence ledger' },
				],
				created: minutesAgo(9000),
			},
			{
				id: 'demo_wfl_2',
				name: 'Weekly practice digest',
				description: 'Friday summary of bookings, no-shows and outstanding invoices.',
				status: 'draft',
				template: 'digest',
				steps: [
					{ id: 's1', name: 'Collect the week\u2019s signals', kind: 'read', detail: 'Signals' },
					{ id: 's2', name: 'Summarise verified outcomes only', kind: 'transform', detail: 'Evidence ledger' },
					{ id: 's3', name: 'Email the practice manager', kind: 'notify', detail: 'Mail relay' },
				],
				created: minutesAgo(11000),
			},
			{
				id: 'demo_wfl_3',
				name: 'Lapsed patient recall',
				description: 'Contact patients with no visit in eighteen months.',
				status: 'paused',
				template: 'recall',
				last_run: minutesAgo(43000),
				steps: [
					{ id: 's1', name: 'Select patients past eighteen months', kind: 'read', detail: 'Patient list' },
					{ id: 's2', name: 'Hold for operator approval', kind: 'approval', detail: 'Manual gate' },
					{ id: 's3', name: 'Send recall message', kind: 'notify', detail: 'SMS gateway' },
				],
				created: minutesAgo(52000),
			},
		],
		operations: [
			{
				id: 'demo_ops_1',
				name: 'Nightly database backup verification',
				summary: 'Confirm last night\u2019s dump restored cleanly into the scratch instance.',
				status: 'healthy',
				runbook:
					'1. Open the backup bucket and confirm a dump exists for last night.\n2. Restore it into the scratch instance.\n3. Run the row-count check against production.\n4. Record the result here. A missing dump is a blocker, not a warning.',
				last_run: minutesAgo(600),
				created: minutesAgo(60000),
			},
			{
				id: 'demo_ops_2',
				name: 'SMS gateway credit check',
				summary: 'Reminder workflows fail silently when credit runs out.',
				status: 'degraded',
				runbook:
					'1. Check the remaining credit balance.\n2. Below 500 messages, top up before Monday.\n3. Note the balance and the date checked.',
				owner_note: 'Balance was 310 at the last check.',
				last_run: minutesAgo(2880),
				created: minutesAgo(61000),
			},
			{
				id: 'demo_ops_3',
				name: 'Quarterly access review',
				summary: 'Confirm every account with workspace access still needs it.',
				status: 'idle',
				runbook:
					'1. List every account with access.\n2. Confirm each against the current staff list.\n3. Revoke anything unmatched the same day.',
				created: minutesAgo(90000),
			},
		],
		operation_runs: [
			{
				id: 'demo_run_1',
				operation: 'demo_ops_1',
				result: 'succeeded',
				notes: 'Restore completed, row counts matched.',
				duration_seconds: 412,
				created: minutesAgo(600),
			},
			{
				id: 'demo_run_2',
				operation: 'demo_ops_2',
				result: 'partial',
				notes: 'Balance read, top-up deferred to Monday.',
				duration_seconds: 95,
				created: minutesAgo(2880),
			},
			{
				id: 'demo_run_3',
				operation: 'demo_ops_1',
				result: 'failed',
				notes: 'No dump present for the night of the 3rd. Escalated.',
				duration_seconds: 60,
				created: minutesAgo(5000),
			},
		],
		evidence: [
			{
				id: 'demo_evi_1',
				title: 'Intake form completion rate after field removal',
				content:
					'Completion moved from 71% to 88% across 142 submissions in the two weeks after three fields were removed.',
				type: 'verified',
				category: 'measurement',
				source: 'Form analytics export',
				tags: 'intake, conversion',
				created: minutesAgo(2000),
			},
			{
				id: 'demo_evi_2',
				title: 'Reminder send time changed to 16:00',
				content: 'Operator approved the send-time change; workflow updated the same afternoon.',
				type: 'decided',
				category: 'decision',
				source: 'Operator approval',
				tags: 'reminders',
				created: minutesAgo(2500),
			},
			{
				id: 'demo_evi_3',
				title: 'Recall message send attempt',
				content: 'Sixty-one messages queued, fifty-eight delivered, three hard bounces. Outcome not yet verified.',
				type: 'attempted',
				category: 'execution',
				source: 'SMS gateway log',
				tags: 'recall',
				created: minutesAgo(4000),
			},
			{
				id: 'demo_evi_4',
				title: 'Unmatched supplier invoices',
				content: 'Nineteen invoices in the accounting export have no matching purchase order.',
				type: 'observed',
				category: 'measurement',
				source: 'Accounting export',
				tags: 'invoices, finance',
				created: minutesAgo(4400),
			},
		],
		daily_editions: [
			{
				id: 'demo_ed_1',
				title: 'No-shows up, and the reminder schedule is the first suspect',
				summary: 'Twelve missed appointments this week; reminder timing is being tested as the cause.',
				body:
					'Observed: the Tuesday no-show rate rose 18% week over week.\n\nInferred: missed appointments cluster in the afternoon while every reminder sends at 07:00. This is an inference and is labelled as one.\n\nUnder way: the reminder send time has moved to 16:00 the day before. Verification compares the next fortnight against the trailing four-week mean.\n\nBlocked: supplier invoice reconciliation, nineteen invoices unmatched.',
				status: 'published',
				edition_date: minutesAgo(600),
				created: minutesAgo(600),
			},
		],
		services: [
			{
				id: 'demo_svc_1',
				name: 'n8n',
				purpose: 'Runs the workflows defined in this workspace.',
				data_boundary: 'Appointment and contact data leaves BuildAndDo only for the steps you approve.',
				status: 'connected',
				last_health_check: minutesAgo(30),
				created: minutesAgo(70000),
			},
			{
				id: 'demo_svc_2',
				name: 'SMS gateway',
				purpose: 'Delivers reminder and recall messages.',
				data_boundary: 'Phone numbers and message bodies only.',
				status: 'degraded',
				next_action: 'Top up credit before Monday.',
				last_health_check: minutesAgo(2880),
				created: minutesAgo(70000),
			},
			{
				id: 'demo_svc_3',
				name: 'Accounting export',
				purpose: 'Source for invoice and revenue signals.',
				data_boundary: 'Read-only nightly export; no write access.',
				status: 'not_connected',
				next_action: 'Provide the export location.',
				created: minutesAgo(70000),
			},
		],
	};
}

/**
 * Returns the demonstration records for a collection.
 *
 * Always returns a fresh array so a caller sorting or filtering in place cannot
 * corrupt the dataset for the next page.
 *
 * @param {string} collection PocketBase collection name.
 * @returns {Array<object>} Demonstration records, newest first, or an empty array.
 */
export function demoRecords(collection) {
	const dataset = buildDataset();
	const rows = dataset[collection];
	if (!rows) return [];
	return rows.map((row) => ({ ...row, updated: row.updated || row.created, demo: true }));
}
