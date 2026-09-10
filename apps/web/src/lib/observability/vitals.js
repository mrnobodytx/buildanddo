// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/vitals.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/report.js,
//              apps/web/src/lib/observability/context.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES PerformanceObserver; PRODUCES datadog.rum.vital
// Intent:      Collect page-load, responsiveness, stability, resource and heap
//              measurements from the platform performance APIs and emit each one
//              with its deltas.
// ───────────────────────────────────────────────────────────────

import { navigationType } from './context';
import { metricSnapshot } from './deltas';
import { reportAction, reportLog, reportMetric } from './report';

const MS = 'millisecond';
const BYTES = 'byte';

// A task over this length is worth an individual event, not just a counter.
const LONG_TASK_ALERT_MS = 200;

// Interactions are only interesting once they are past the frame budget.
const INTERACTION_THRESHOLD_MS = 40;

const FLUSH_INTERVAL_MS = 60_000;

const observers = [];
let flushTimer = null;
let started = false;

const state = {
	cls: 0,
	clsEntries: 0,
	worstInteractionMs: 0,
	worstInteractionTarget: null,
	longTasks: 0,
	longTaskMs: 0,
	resources: 0,
	resourceBytes: 0,
	resourceCached: 0,
	slowestResourceMs: 0,
	slowestResourceUrl: null,
};

function supports(entryType) {
	return (
		typeof PerformanceObserver !== 'undefined' &&
		Array.isArray(PerformanceObserver.supportedEntryTypes) &&
		PerformanceObserver.supportedEntryTypes.includes(entryType)
	);
}

function observe(entryType, handler, extraOptions = {}) {
	if (!supports(entryType)) return;
	try {
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				try {
					handler(entry);
				} catch {
					// One malformed entry must not tear down the observer.
				}
			}
		});
		observer.observe({ type: entryType, buffered: true, ...extraOptions });
		observers.push(observer);
	} catch {
		// Unsupported option combinations reject on some engines.
	}
}

function pathOf(url) {
	try {
		return new URL(url, window.location.origin).pathname;
	} catch {
		return null;
	}
}

function observePaint() {
	observe('paint', (entry) => {
		if (entry.name !== 'first-contentful-paint') return;
		reportMetric('web.vital.fcp', entry.startTime, { unit: MS, tags: { nav_type: navigationType() } });
	});
}

function observeLcp() {
	// Every candidate is reported; the last one before user input is the real
	// LCP, and Datadog keeps the maximum per view.
	observe('largest-contentful-paint', (entry) => {
		reportMetric('web.vital.lcp', entry.startTime, {
			unit: MS,
			tags: {
				element: entry.element ? entry.element.tagName : undefined,
				resource_path: entry.url ? pathOf(entry.url) : undefined,
				nav_type: navigationType(),
			},
		});
	});
}

function observeLayoutShift() {
	observe('layout-shift', (entry) => {
		if (entry.hadRecentInput) return;
		state.cls += entry.value;
		state.clsEntries += 1;
	});
}

function observeInteractions() {
	// Approximates INP as the worst interaction latency observed. It is not the
	// spec's high-percentile INP, and is reported under its own name to avoid
	// being read as one.
	observe(
		'event',
		(entry) => {
			if (!entry.interactionId || entry.duration <= state.worstInteractionMs) return;
			state.worstInteractionMs = entry.duration;
			state.worstInteractionTarget = entry.name;
		},
		{ durationThreshold: INTERACTION_THRESHOLD_MS },
	);
}

function observeLongTasks() {
	observe('longtask', (entry) => {
		state.longTasks += 1;
		state.longTaskMs += entry.duration;

		if (entry.duration >= LONG_TASK_ALERT_MS) {
			const attribution = Array.isArray(entry.attribution) ? entry.attribution[0] : null;
			reportMetric('browser.long_task', entry.duration, {
				unit: MS,
				tags: {
					container_type: attribution ? attribution.containerType : undefined,
					container_name: attribution ? attribution.containerName : undefined,
					route: window.location.pathname,
				},
			});
		}
	});
}

function observeResources() {
	observe('resource', (entry) => {
		state.resources += 1;
		state.resourceBytes += entry.transferSize || 0;

		if (entry.transferSize === 0 && entry.decodedBodySize > 0) state.resourceCached += 1;

		if (entry.duration > state.slowestResourceMs) {
			state.slowestResourceMs = entry.duration;
			state.slowestResourceUrl = pathOf(entry.name);
		}
	});
}

function reportNavigationTiming() {
	if (typeof performance === 'undefined' || !performance.getEntriesByType) return;
	const [nav] = performance.getEntriesByType('navigation');
	if (!nav) return;

	reportMetric('web.vital.ttfb', nav.responseStart, { unit: MS, tags: { nav_type: nav.type } });
	reportMetric('browser.page_load', nav.loadEventEnd || nav.duration, { unit: MS, tags: { nav_type: nav.type } });

	reportAction('browser.navigation', {
		nav_type: nav.type,
		protocol: nav.nextHopProtocol,
		redirect_count: nav.redirectCount,
		redirect_ms: round(nav.redirectEnd - nav.redirectStart),
		dns_ms: round(nav.domainLookupEnd - nav.domainLookupStart),
		tcp_ms: round(nav.connectEnd - nav.connectStart),
		tls_ms: nav.secureConnectionStart ? round(nav.connectEnd - nav.secureConnectionStart) : 0,
		request_ms: round(nav.responseStart - nav.requestStart),
		response_ms: round(nav.responseEnd - nav.responseStart),
		dom_interactive_ms: round(nav.domInteractive),
		dom_content_loaded_ms: round(nav.domContentLoadedEventEnd),
		load_event_ms: round(nav.loadEventEnd),
		transfer_bytes: nav.transferSize,
		decoded_bytes: nav.decodedBodySize,
		compression_ratio:
			nav.decodedBodySize && nav.transferSize ? round(nav.decodedBodySize / nav.transferSize, 2) : null,
	});
}

function sampleHeap() {
	// Chromium-only; absent elsewhere and simply skipped.
	const memory = typeof performance !== 'undefined' ? performance.memory : null;
	if (!memory || !memory.usedJSHeapSize) return;

	reportMetric('browser.heap_used', memory.usedJSHeapSize, {
		unit: BYTES,
		noiseFloor: 1024 * 1024,
		tags: {
			heap_limit_bytes: memory.jsHeapSizeLimit,
			heap_utilisation_pct: memory.jsHeapSizeLimit
				? round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100, 2)
				: null,
		},
	});
}

function round(value, places = 2) {
	if (!Number.isFinite(value)) return null;
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

/**
 * Emits the accumulated stability, responsiveness and resource aggregates.
 *
 * Called periodically and once more when the page is hidden, so a session that
 * never unloads cleanly still reports.
 *
 * @param {string} reason Why the flush happened, for example `interval` or `hidden`.
 * @returns {void}
 */
export function flushVitals(reason) {
	if (state.clsEntries > 0) {
		reportMetric('web.vital.cls', state.cls, {
			unit: 'score',
			noiseFloor: 0.01,
			tags: { shift_count: state.clsEntries, reason },
		});
	}

	if (state.worstInteractionMs > 0) {
		reportMetric('web.interaction.worst', state.worstInteractionMs, {
			unit: MS,
			tags: { interaction: state.worstInteractionTarget, reason },
		});
	}

	if (state.longTasks > 0) {
		reportMetric('browser.long_task.total_time', state.longTaskMs, {
			unit: MS,
			tags: { long_task_count: state.longTasks, reason },
		});
	}

	if (state.resources > 0) {
		reportMetric('browser.resource.transfer_bytes', state.resourceBytes, {
			unit: BYTES,
			noiseFloor: 1024,
			tags: {
				resource_count: state.resources,
				cache_hit_pct: round((state.resourceCached / state.resources) * 100, 1),
				slowest_ms: round(state.slowestResourceMs),
				slowest_path: state.slowestResourceUrl,
				reason,
			},
		});
	}

	sampleHeap();

	reportLog('info', 'session telemetry flush', { reason, metrics: metricSnapshot() });
}

/**
 * Starts platform performance collection.
 *
 * Safe to call more than once; subsequent calls are ignored.
 *
 * @returns {void}
 */
export function startVitals() {
	if (started || typeof window === 'undefined') return;
	started = true;

	observePaint();
	observeLcp();
	observeLayoutShift();
	observeInteractions();
	observeLongTasks();
	observeResources();

	if (document.readyState === 'complete') {
		reportNavigationTiming();
	} else {
		window.addEventListener('load', () => reportNavigationTiming(), { once: true });
	}

	flushTimer = window.setInterval(() => flushVitals('interval'), FLUSH_INTERVAL_MS);

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flushVitals('hidden');
	});

	window.addEventListener('pagehide', () => flushVitals('pagehide'));
}

/**
 * Disconnects observers and timers. Exposed for teardown in tests.
 *
 * @returns {void}
 */
export function stopVitals() {
	for (const observer of observers) {
		try {
			observer.disconnect();
		} catch {
			// Already disconnected.
		}
	}
	observers.length = 0;
	if (flushTimer !== null) window.clearInterval(flushTimer);
	flushTimer = null;
	started = false;
}
