// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/network.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/report.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES window.fetch; PRODUCES datadog.rum.action;
//              VALIDATES apps/web/src/lib/pocketbaseClient.js
// Intent:      Measure PocketBase and platform API calls per normalised endpoint
//              so latency drift, error-class shifts and failure streaks are
//              visible without reading raw resource timings.
// ───────────────────────────────────────────────────────────────

import { incrementCounter } from './deltas';
import { reportAction, reportLog, reportMetric } from './report';

const SLOW_REQUEST_MS = 1500;

// Consecutive failures against the same endpoint that suggest the backend, not
// the individual request, is the problem.
const OUTAGE_STREAK = 3;

// PocketBase record ids are 15 lowercase alphanumerics; also collapse UUIDs and
// long opaque segments so one endpoint does not become thousands of labels.
const ID_PATTERNS = [
	/^[a-z0-9]{15}$/,
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
	/^[A-Za-z0-9_-]{24,}$/,
	/^\d+$/,
];

const INSTRUMENTED = '__buildanddoObservabilityFetch';

const state = {
	total: 0,
	failures: 0,
	streaks: new Map(),
	offlineEvents: 0,
};

let originalFetch = null;

function normalisePath(rawUrl) {
	let url;
	try {
		url = new URL(rawUrl, window.location.origin);
	} catch {
		return { path: 'unparseable', origin: 'unknown', crossOrigin: false };
	}

	const path = url.pathname
		.split('/')
		.map((segment) => (ID_PATTERNS.some((pattern) => pattern.test(segment)) ? ':id' : segment))
		.join('/');

	return { path, origin: url.origin, crossOrigin: url.origin !== window.location.origin };
}

function statusClass(status) {
	if (!status) return 'network_error';
	return `${Math.floor(status / 100)}xx`;
}

function requestUrl(input) {
	if (typeof input === 'string') return input;
	if (input instanceof Request) return input.url;
	if (input && typeof input.url === 'string') return input.url;
	return String(input);
}

function requestMethod(input, init) {
	if (init && init.method) return init.method.toUpperCase();
	if (input instanceof Request) return input.method.toUpperCase();
	return 'GET';
}

function trackStreak(endpoint, failed) {
	if (!failed) {
		state.streaks.delete(endpoint);
		return 0;
	}
	const next = (state.streaks.get(endpoint) || 0) + 1;
	state.streaks.set(endpoint, next);
	return next;
}

function observeRequest({ endpoint, method, status, durationMs, crossOrigin, failed, errorName, bytes }) {
	state.total += 1;
	if (failed) state.failures += 1;

	const streak = trackStreak(endpoint, failed);
	const tags = {
		endpoint,
		method,
		status: status || 0,
		status_class: statusClass(status),
		cross_origin: crossOrigin,
		error_name: errorName,
	};

	reportMetric('api.latency', durationMs, { unit: 'millisecond', tags });

	if (Number.isFinite(bytes)) {
		reportMetric('api.response_bytes', bytes, { unit: 'byte', noiseFloor: 1024, silent: true, tags });
	}

	if (failed) {
		incrementCounter('api.failures', tags);
		reportMetric('api.error_rate', (state.failures / state.total) * 100, {
			unit: 'percent',
			noiseFloor: 1,
			tags: { ...tags, requests: state.total, failures: state.failures },
		});
	}

	if (streak >= OUTAGE_STREAK) {
		reportAction('api.outage_suspected', { ...tags, consecutive_failures: streak });
		reportLog('error', `${endpoint} failed ${streak} times in a row`, { ...tags, consecutive_failures: streak });
	}

	if (durationMs >= SLOW_REQUEST_MS) {
		reportLog('warn', `slow API request to ${endpoint}`, { ...tags, duration_ms: durationMs });
	}
}

function trackConnectivity() {
	window.addEventListener('offline', () => {
		state.offlineEvents += 1;
		reportAction('browser.connectivity', { online: false, offline_events: state.offlineEvents });
		reportLog('warn', 'browser went offline', { offline_events: state.offlineEvents });
	});

	window.addEventListener('online', () => {
		reportAction('browser.connectivity', { online: true, offline_events: state.offlineEvents });
	});
}

/**
 * Wraps `window.fetch` to time and classify every request.
 *
 * The wrapper is transparent: the original response or rejection is always
 * returned unchanged, and any instrumentation failure is swallowed. Aborted
 * requests are recorded but not counted as failures, since a cancelled
 * in-flight request is normal during navigation.
 *
 * @returns {void}
 */
export function startNetworkTelemetry() {
	if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
	if (window.fetch[INSTRUMENTED]) return;

	originalFetch = window.fetch;

	const instrumented = function observedFetch(input, init) {
		const started = performance.now();
		const url = requestUrl(input);

		// WebSocket upgrades and data URLs carry no useful request telemetry.
		if (url.startsWith('ws:') || url.startsWith('wss:') || url.startsWith('data:')) {
			return originalFetch.apply(this, arguments);
		}

		const { path, crossOrigin } = normalisePath(url);
		const method = requestMethod(input, init);

		return originalFetch.apply(this, arguments).then(
			(response) => {
				try {
					const length = Number.parseInt(response.headers.get('content-length') || '', 10);
					observeRequest({
						endpoint: path,
						method,
						status: response.status,
						durationMs: performance.now() - started,
						crossOrigin,
						failed: !response.ok,
						bytes: Number.isFinite(length) ? length : undefined,
					});
				} catch {
					// Never let measurement change the response path.
				}
				return response;
			},
			(error) => {
				try {
					const aborted = error && error.name === 'AbortError';
					observeRequest({
						endpoint: path,
						method,
						status: 0,
						durationMs: performance.now() - started,
						crossOrigin,
						failed: !aborted,
						errorName: error && error.name ? error.name : 'FetchError',
					});
				} catch {
					// See above.
				}
				throw error;
			},
		);
	};

	instrumented[INSTRUMENTED] = true;
	window.fetch = instrumented;

	trackConnectivity();
}

/**
 * Restores the original `window.fetch`. Exposed for teardown in tests.
 *
 * @returns {void}
 */
export function stopNetworkTelemetry() {
	if (originalFetch) window.fetch = originalFetch;
	originalFetch = null;
	state.streaks.clear();
}

/**
 * @returns {{requests: number, failures: number, error_rate_pct: number, offline_events: number}} Session API health summary.
 */
export function networkSummary() {
	return {
		requests: state.total,
		failures: state.failures,
		error_rate_pct: state.total ? Math.round((state.failures / state.total) * 1000) / 10 : 0,
		offline_events: state.offlineEvents,
	};
}
