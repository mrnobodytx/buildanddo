// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/sectionFailure.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TELEMETRY-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/observability/report.js, apps/web/src/lib/telemetry.js
// EnumType:    Adapter
// EnumEdges:   PRODUCES datadog.rum.action; PRODUCES posthog.event;
//              CONSUMES apps/web/src/lib/observability/report.js
// DAG Node:    none
// Intent:      One failure event per section, sent to both tools from the shared failure
//              notices. Its own module, so tests that stub the runtime keep working.
// ───────────────────────────────────────────────────────────────

import { trackEvent } from '@/lib/telemetry';

import { reportAction } from './report';

// Closed on purpose, like WORKSPACE_ACTIONS: a dashboard grouped by these
// values must not drift when a page is edited.
export const SECTION_FAILURE_SOURCES = Object.freeze(['degraded_notice', 'write_error_notice', 'control_state', 'control_feedback']);
export const SECTION_FAILURE_REASONS = Object.freeze(['read_failed', 'write_failed', 'write_uncertain']);
const FAILURE_REPEAT_MS = 10_000;
const lastFailureAt = new Map();

/**
 * Names the section a path belongs to: its first segment, or `app/<segment>`
 * inside the workspace. Every id-bearing route (classroom rooms, guild pages,
 * reset tokens) puts the id deeper than that, so no id reaches telemetry.
 *
 * @param {string} pathname Location path.
 * @returns {string} Section name, for example `app/dossier` or `pricing`.
 */
export function sectionOf(pathname) {
	const parts = String(pathname || '').split(/[?#]/)[0].split('/').filter(Boolean);
	if (parts[0] === 'app') return parts[1] ? `app/${parts[1]}` : 'app';
	return parts[0] || 'home';
}

/**
 * Records that a section showed its user a failure state, in Datadog and
 * PostHog both. Carries the section, the component that rendered the failure
 * and the reason, never the message text, which can hold record content.
 * The same failure in the same section is sent at most once per ten seconds,
 * so a list of failed cards is one event, not one per card.
 *
 * @param {string} source One of {@link SECTION_FAILURE_SOURCES}.
 * @param {string} reason One of {@link SECTION_FAILURE_REASONS}.
 * @param {{status?: number}} [detail] HTTP status, when the caller knows it.
 * @returns {void}
 */
export function trackSectionFailure(source, reason, { status } = {}) {
	if (typeof window === 'undefined') return;
	if (!SECTION_FAILURE_SOURCES.includes(source) || !SECTION_FAILURE_REASONS.includes(reason)) return;
	const section = sectionOf(window.location.pathname);
	const key = `${section}|${source}|${reason}`;
	const now = Date.now();
	if (now - (lastFailureAt.get(key) ?? -Infinity) < FAILURE_REPEAT_MS) return;
	lastFailureAt.set(key, now);

	const context = { section, source, reason };
	if (Number.isInteger(status)) context.status = status;
	try {
		reportAction('section.failure', context);
	} catch {
		// Telemetry never breaks the failure state it reports.
	}
	try {
		trackEvent('section.failure', context);
	} catch {
		// Product analytics is best-effort too.
	}
}
