// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/runtime.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/datadogRum.js,
//              apps/web/src/lib/observability/context.js,
//              apps/web/src/lib/observability/deltas.js,
//              apps/web/src/lib/observability/network.js,
//              apps/web/src/lib/observability/report.js,
//              apps/web/src/lib/observability/vitals.js
// EnumType:    Adapter
// EnumEdges:   TRIGGERS apps/web/src/lib/observability/vitals.js;
//              TRIGGERS apps/web/src/lib/observability/network.js;
//              CONSUMES apps/web/src/lib/datadogRum.js
// Intent:      Single public entry point for browser observability: one init call
//              from main.jsx, and the small set of trackers the React tree uses.
// ───────────────────────────────────────────────────────────────

import { identifyRumUser, clearRumUser, initDatadogRum } from '@/lib/datadogRum';

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
let identifiedUserId = null;

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
	if (!isReporting()) return;

	incrementCounter('route.changes', { route: to });

	reportAction('route.change', {
		from_route: from,
		route: to,
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
	if (!isReporting()) return;

	incrementCounter('app.render_errors', { route: window.location.pathname });
	reportError(error, {
		error_source: 'react_render',
		route: window.location.pathname,
		component_stack: info.componentStack,
		api_health: networkSummary(),
	});
}

/**
 * Attaches or clears the signed-in user on the session, and reports the
 * transition once.
 *
 * @param {({id: string, email?: string, name?: string, verified?: boolean, created?: string}|null)} user PocketBase auth record, or null when signed out.
 * @returns {void}
 */
export function trackAuthIdentity(user) {
	if (!isReporting()) return;

	if (user && user.id) {
		if (identifiedUserId === user.id) return;
		identifiedUserId = user.id;
		identifyRumUser(user);
		setGlobalProperty('authenticated', true);
		reportAction('auth.identified', { verified: Boolean(user.verified), account_created: user.created });
		return;
	}

	if (identifiedUserId === null) return;
	identifiedUserId = null;
	clearRumUser();
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
