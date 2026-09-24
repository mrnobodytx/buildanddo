// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/runtime.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/datadogRum.js,
//              apps/web/src/lib/observability/context.js,
//              apps/web/src/lib/observability/deltas.js,
//              apps/web/src/lib/observability/network.js,
//              apps/web/src/lib/observability/report.js,
//              apps/web/src/lib/observability/vitals.js, apps/web/src/lib/telemetry.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Adapter
// EnumEdges:   TRIGGERS apps/web/src/lib/observability/vitals.js;
//              TRIGGERS apps/web/src/lib/observability/network.js;
//              CONSUMES apps/web/src/lib/datadogRum.js; CONSUMES apps/web/src/lib/telemetry.js; CONSUMES apps/web/src/lib/navigationIntent.js
// Intent:      Single public entry point for browser observability: one init call
//              from main.jsx, and the small set of trackers the React tree uses.
// ───────────────────────────────────────────────────────────────

import { identifyRumUser, clearRumUser, initDatadogRum } from '@/lib/datadogRum';
import { classroomTelemetryLocation, telemetrySection } from '@/lib/navigationIntent';
import { identifyTelemetryUser, clearTelemetryUser, trackEvent } from '@/lib/telemetry';

import { describeRuntime, navigationType, resolveEnvironment, resolveRelease } from './context';
import { configureDeltas, flushBaselines, incrementCounter, metricSnapshot } from './deltas';
import { networkSummary, startNetworkTelemetry } from './network';
import {
	isReporting,
	reportAction,
	reportError,
	reportFeatureFlag,
	reportLog,
	reportMetric,
	setGlobalProperty,
} from './report';
import { flushVitals, startVitals } from './vitals';

let initialized = false;
let identifiedUserId;

const FAILURE_SOURCES = new Set(['records', 'controls', 'knowledge', 'operator', 'estate', 'room_projection',
	'tutorial_catalog', 'roadmap_feed', 'practice', 'status_feed', 'dossier', 'assistant', 'classroom_media',
	'capability_passport', 'workspace_gate', 'render', 'access', 'degraded_notice', 'write_notice', 'control_state', 'control_feedback']);
const FAILURE_REASONS = new Set(['unavailable', 'invalid_response', 'invalid_receipt', 'degraded', 'unmeasured',
	'forbidden', 'conflict', 'uncertain', 'rate_limited', 'network', 'server_error', 'disabled', 'render_error']);

/** Emit independently: one unavailable collector must not suppress the other. */
function sectionAction(name, context) {
	try { Promise.resolve(reportAction(name, { ...context })).catch(() => {}); } catch { /* Best effort. */ }
	try { Promise.resolve(trackEvent(name, { ...context })).catch(() => {}); } catch { /* Best effort. */ }
}

/** Report a bounded failure, never an exception message, record, query or identifier.
 * @param {string} section Route captured before the failing operation, or current route for a rendered notice.
 * @param {string} source Closed source category.
 * @param {string} [reason] Closed application failure reason.
 * @param {number} [status] Observed HTTP status; omitted when not known.
 * @returns {void}
 */
export function readFailed(section, source, reason = 'unavailable', status) {
	try {
		if (reason === 'scope_changed' || reason === 'cancelled') return;
		const code = Number.isInteger(status) && (status === 0 || status >= 100 && status < 600) ? status : undefined;
		const classified = [401, 403].includes(code) ? 'forbidden' : code === 409 ? 'conflict' : code === 429 ? 'rate_limited' :
			code === 0 ? 'network' : code >= 500 ? 'server_error' : FAILURE_REASONS.has(reason) ? reason : 'unavailable';
		sectionAction('section.failure', {
			section: telemetrySection(section || globalThis.window?.location?.pathname),
			source: FAILURE_SOURCES.has(source) ? source : 'records', reason: classified,
			outcome: ['forbidden', 'conflict', 'uncertain'].includes(classified) ? classified : 'failure',
			status_class: code === undefined ? 'unknown' : code === 0 ? 'network' : `${Math.floor(code / 100)}xx`,
		});
	} catch { /* Instrumentation cannot turn an unavailable view into a crash. */ }
}

/** @returns {void} Record an unknown route without retaining the attempted URL. */
export function trackUnknownRoute() {
	sectionAction('route.not_found', { section: '/unknown', outcome: 'failure', reason: 'not_found' });
}

/**
 * Boots browser observability.
 *
 * Order matters: the SDKs come up first so nothing is emitted into a void, then
 * the delta engine is bound to the release, then collection starts. A release
 * change resets baselines and is reported once, so the deploy itself is not
 * read as a regression on every metric.
 *
 * @returns {void}
 */
export function initObservability() {
	if (initialized || typeof window === 'undefined') return;
	initialized = true;

	initDatadogRum();

	const environment = resolveEnvironment();
	const release = resolveRelease();
	const transition = configureDeltas({ release, environment });

	if (!isReporting()) return;

	setGlobalProperty('release', release);
	setGlobalProperty('nav_type', navigationType());
	setGlobalProperty('runtime', describeRuntime());

	if (transition.changed) {
		reportAction('release.changed', { previous_release: transition.previous, release });
		reportLog('info', 'release changed, delta baselines reset', {
			previous_release: transition.previous,
			release,
		});
	}

	startVitals();
	startNetworkTelemetry();

	// Cost of getting the app to the point where it can measure itself.
	reportMetric('app.boot', performance.now(), { unit: 'millisecond', tags: { nav_type: navigationType() } });

	window.addEventListener('pagehide', () => {
		flushBaselines();
		reportAction('session.summary', {
			...networkSummary(),
			release,
			env: environment,
			session_duration_ms: Math.round(performance.now()),
			metrics: metricSnapshot(),
		});
	});
}

/**
 * Records a client-side route transition and the time spent on the route
 * being left.
 *
 * @param {{from: (string|null), to: string, dwellMs: (number|null), search?: string}} transition Route change.
 * @returns {void}
 */
export function trackRouteChange({ from, to, dwellMs, search }) {
	from = from === null ? null : telemetrySection(from);
	to = telemetrySection(to);

	incrementCounter('route.changes', { route: to });

	sectionAction('route.change', {
		from_route: from,
		route: to,
		section: to,
		has_query: Boolean(search),
		entry: from === null,
	});

	setGlobalProperty('route', to);

	if (Number.isFinite(dwellMs) && from) {
		reportMetric('route.dwell', dwellMs, { unit: 'millisecond', direction: 'higher_is_better', tags: { route: from } });
	}
}

/**
 * Records how long a route took to settle after its transition.
 *
 * Measured to the second animation frame after the location change, which is
 * the first frame where the new route's committed DOM has been painted.
 *
 * @param {string} route Route path.
 * @param {number} durationMs Time from location change to painted frame.
 * @returns {void}
 */
export function trackRouteRender(route, durationMs) {
	if (!isReporting()) return;
	route = classroomTelemetryLocation(route);
	reportMetric('route.render', durationMs, { unit: 'millisecond', tags: { route } });
}

/**
 * Records a React render failure caught by the telemetry boundary.
 *
 * @param {Error} error Thrown error.
 * @param {{componentStack?: string}} [info] React error info.
 * @returns {void}
 */
export function trackRenderError(error, info = {}) {
	const section = telemetrySection(info.section || globalThis.window?.location?.pathname);
	const page = info.page === 'Workspace shell' ? 'workspace_shell' : section;
	const context = { error_source: 'react_render', page, section, route: section, outcome: 'failure', reason: 'render_error' };
	sectionAction('section.render_error', context);
	try { incrementCounter('app.render_errors', { route: section }); } catch { /* Best effort. */ }
	try { reportError(error, { ...context, api_health: networkSummary() }); } catch { /* SDK redacts diagnostic prose. */ }
}

/**
 * Attaches or clears the signed-in user on the session, and reports the
 * transition once.
 *
 * @param {({id: string, email?: string, name?: string, verified?: boolean, created?: string}|null)} user PocketBase auth record, or null when signed out.
 * @returns {void}
 */
export function trackAuthIdentity(user) {
	if (user && user.id) {
		try { identifyTelemetryUser(user); } catch { /* Product identity is independent of RUM. */ }
		try { identifyRumUser(user); } catch { /* Auth must still succeed. */ }
		if (identifiedUserId === user.id) return;
		identifiedUserId = user.id;
		setGlobalProperty('authenticated', true);
		reportAction('auth.identified', { verified: Boolean(user.verified) });
		return;
	}

	if (identifiedUserId === null) return;
	identifiedUserId = null;
	try { clearTelemetryUser(); } catch { /* Clear persisted product identity on first unauthenticated render too. */ }
	try { clearRumUser(); } catch { /* Auth must still clear. */ }
	setGlobalProperty('authenticated', false);
	reportAction('auth.cleared', {});
}

/**
 * Records a feature flag evaluation against the active view.
 *
 * @param {string} key Flag key.
 * @param {*} value Evaluated value.
 * @returns {void}
 */
export function trackFeatureFlag(key, value) {
	reportFeatureFlag(key, value);
}

/**
 * Forces the periodic aggregate flush. Exposed for the workspace shell, which
 * can outlive a page-load by hours.
 *
 * @param {string} [reason] Flush reason tag.
 * @returns {void}
 */
export function flushTelemetry(reason = 'manual') {
	flushVitals(reason);
}

export { reportAction, reportError, reportLog, reportMetric, networkSummary, metricSnapshot };
