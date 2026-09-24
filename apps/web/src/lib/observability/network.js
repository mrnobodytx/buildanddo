// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/network.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/report.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES window.fetch; PRODUCES datadog.rum.action;
//              VALIDATES apps/web/src/lib/pocketbaseClient.js; CONSUMES apps/web/src/lib/navigationIntent.js
// Intent:      Measure PocketBase and platform API calls per normalised endpoint
//              so latency drift, error-class shifts and failure streaks are
//              visible without reading raw resource timings.
// ───────────────────────────────────────────────────────────────

import { incrementCounter } from './deltas';
import { reportAction, reportLog, reportMetric } from './report';
import { telemetryEndpoint } from '../navigationIntent';

const SLOW_REQUEST_MS = 1500;

// Consecutive failures against the same endpoint that suggest the backend, not
// the individual request, is the problem.
const OUTAGE_STREAK = 3;

const INSTRUMENTED = '__buildanddoObservabilityFetch';

const state = {
	total: 0,
	failures: 0,
	streaks: new Map(),
	offlineEvents: 0,
};

let teardown = null;

function statusClass(status) {
	if (!status) return 'network_error';
	return `${Math.floor(status / 100)}xx`;
}

function requestUrl(input) {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	if (input && typeof input.url === 'string') return input.url;
	return null;
}

function requestMethod(input, init) {
	const method = (init?.method || input?.method || 'GET').toUpperCase();
	return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method) ? method : 'OTHER';
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

function observeRequest({ endpoint, method, status, durationMs, failed, errorName, bytes, classification }) {
	state.total += 1;
	if (failed) state.failures += 1;

	const streak = classification === 'aborted' ? 0 : trackStreak(endpoint, failed);
	const tags = {
		endpoint,
		method,
		status: status || 0,
		status_class: classification || statusClass(status),
		cross_origin: false,
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

	if (streak === OUTAGE_STREAK) {
		reportAction('api.outage_suspected', { ...tags, consecutive_failures: streak });
		reportLog('error', `${endpoint} failed ${streak} times in a row`, { ...tags, consecutive_failures: streak });
	}

	if (durationMs >= SLOW_REQUEST_MS) {
		reportLog('warn', `slow API request to ${endpoint}`, { ...tags, duration_ms: durationMs });
	}
}

/**
 * Wraps `window.fetch` to time only known, same-origin app JSON requests.
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
	if (teardown || window.fetch[INSTRUMENTED]) return;

	const target = window;
	const originalFetch = target.fetch;
	let active = true;

	const instrumented = function observedFetch(input, init) {
		let endpoint, method, signal, started;
		try {
			const rawUrl = requestUrl(input);
			const url = rawUrl && new URL(rawUrl, target.location.origin);
			endpoint = active && url && url.origin === target.location.origin && telemetryEndpoint(url.href);
			if (endpoint) {
				method = requestMethod(input, init);
				signal = init?.signal === undefined ? input?.signal : init.signal;
				started = performance.now();
			}
		} catch {
			// Inspection, including a broken clock or input getter, cannot prevent
			// the original fetch from deciding its own response or exception.
			endpoint = null;
		}
		if (!endpoint) {
			return originalFetch.apply(this, arguments);
		}

		return originalFetch.apply(this, arguments).then(
			(response) => {
				try {
					if (!active) return response;
					const length = Number.parseInt(response.headers.get('content-length') || '', 10);
					const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
					// Inspect headers only. Reading/cloning the body changes stream and
					// abort behavior; JSON syntax/receipt validation belongs to callers.
					const invalid = response.ok && method !== 'HEAD' && ![204, 205].includes(response.status) &&
						Boolean(contentType) && !/^application\/(?:[\w.+-]+\+)?json$/.test(contentType);
					observeRequest({
						endpoint,
						method,
						status: response.status,
						durationMs: Math.max(0, performance.now() - started),
						failed: !response.ok || invalid,
						classification: invalid ? 'invalid_response' : undefined,
						bytes: Number.isFinite(length) ? length : undefined,
					});
				} catch {
					// Never let measurement change the response path.
				}
				return response;
			},
			(error) => {
				try {
					const aborted = error?.name === 'AbortError' || (signal?.aborted && error === signal.reason);
					if (active) observeRequest({
						endpoint,
						method,
						status: 0,
						durationMs: Math.max(0, performance.now() - started),
						failed: !aborted,
						classification: aborted ? 'aborted' : 'network_error',
						errorName: aborted ? 'AbortError' : ['TypeError', 'TimeoutError', 'NetworkError'].includes(error?.name) ? error.name : 'FetchError',
					});
				} catch {
					// See above.
				}
				throw error;
			},
		);
	};

	instrumented[INSTRUMENTED] = true;
	target.fetch = instrumented;
	const offline = () => {
		if (!active) return;
		try {
			state.offlineEvents += 1;
			reportAction('browser.connectivity', { online: false, offline_events: state.offlineEvents });
			reportLog('warn', 'browser went offline', { offline_events: state.offlineEvents });
		} catch { /* Connectivity cannot depend on telemetry. */ }
	};
	const online = () => {
		if (active) try { reportAction('browser.connectivity', { online: true, offline_events: state.offlineEvents }); } catch { /* Fail soft. */ }
	};
	target.addEventListener('offline', offline);
	target.addEventListener('online', online);
	teardown = () => {
		active = false;
		// A later SDK may have wrapped ours. Do not remove its instrumentation.
		if (target.fetch === instrumented) target.fetch = originalFetch;
		target.removeEventListener('offline', offline);
		target.removeEventListener('online', online);
	};
}

/**
 * Restores the original `window.fetch`. Exposed for teardown in tests.
 *
 * @returns {void}
 */
export function stopNetworkTelemetry() {
	teardown?.();
	teardown = null;
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
