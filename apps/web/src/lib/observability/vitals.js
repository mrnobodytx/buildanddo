// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/vitals.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/report.js,
//              apps/web/src/lib/observability/context.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES PerformanceObserver; PRODUCES datadog.rum.vital; CONSUMES apps/web/src/lib/navigationIntent.js
// Intent:      Collect page-load, responsiveness, stability, resource and heap
//              measurements from the platform performance APIs and emit each one
//              with its deltas.
// ───────────────────────────────────────────────────────────────

import { navigationType } from './context';
import { metricSnapshot } from './deltas';
import { reportAction, reportLog, reportMetric } from './report';
import { classroomTelemetryLocation, telemetrySection } from '../navigationIntent';

const MS = 'millisecond';
const BYTES = 'byte';

// A task over this length is worth an individual event, not just a counter.
const LONG_TASK_ALERT_MS = 200;

// Interactions are only interesting once they are past the frame budget.
const INTERACTION_THRESHOLD_MS = 40;

const FLUSH_INTERVAL_MS = 60_000;

const observers = [];
const pending = new Set();
let flushTimer = null;
let started = false;
let buffered = true;
let collection = 0;
let navigationReported = false;

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
		const lifetime = collection;
		const consume = (entries) => {
			if (!started || lifetime !== collection) return;
			for (const entry of entries) {
				try {
					handler(entry);
				} catch {
					// One malformed entry must not tear down the observer.
				}
			}
		};
		const observer = new PerformanceObserver((list) => consume(list.getEntries()));
		observer.observe({ type: entryType, buffered, ...extraOptions });
		observers.push({ observer, consume });
	} catch {
		// Unsupported option combinations reject on some engines.
	}
}

function pathOf(url) {
	try {
		const parsed = new URL(url, window.location.origin);
		if (parsed.origin !== window.location.origin) return null;
		const path = classroomTelemetryLocation(parsed.pathname);
		return path === '/unknown' ? null : path;
	} catch {
		return null;
	}
}

function observePaint() {
	observe('paint', (entry) => {
		if (entry.name !== 'first-contentful-paint') return;
		reportMetric('web.vital.fcp', entry.startTime, { unit: MS, tags: { nav_type: navigationType() } });
		pending.add('sample');
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
		pending.add('sample');
	});
}

function observeLayoutShift() {
	observe('layout-shift', (entry) => {
		if (entry.hadRecentInput || !Number.isFinite(entry.value) || entry.value <= 0) return;
		state.cls += entry.value;
		state.clsEntries += 1;
		pending.add('cls');
	});
}

function observeInteractions() {
	// Approximates INP as the worst interaction latency observed. It is not the
	// spec's high-percentile INP, and is reported under its own name to avoid
	// being read as one.
	observe(
		'event',
		(entry) => {
			if (!entry.interactionId || !Number.isFinite(entry.duration) || entry.duration <= state.worstInteractionMs) return;
			state.worstInteractionMs = entry.duration;
			state.worstInteractionTarget = entry.name;
			pending.add('interaction');
		},
		{ durationThreshold: INTERACTION_THRESHOLD_MS },
	);
}

function observeLongTasks() {
	observe('longtask', (entry) => {
		if (!Number.isFinite(entry.duration) || entry.duration <= 0) return;
		state.longTasks += 1;
		state.longTaskMs += entry.duration;
		pending.add('longtask');

		if (entry.duration >= LONG_TASK_ALERT_MS) {
			const attribution = Array.isArray(entry.attribution) ? entry.attribution[0] : null;
			reportMetric('browser.long_task', entry.duration, {
				unit: MS,
				tags: {
					container_type: attribution ? attribution.containerType : undefined,
					route: telemetrySection(window.location.pathname),
				},
			});
		}
	});
}

function observeResources() {
	observe('resource', (entry) => {
		const path = pathOf(entry.name);
		if (!path) return;
		state.resources += 1;
		state.resourceBytes += entry.transferSize || 0;
		pending.add('resource');

		if (entry.transferSize === 0 && entry.decodedBodySize > 0) state.resourceCached += 1;

		if (entry.duration > state.slowestResourceMs) {
			state.slowestResourceMs = entry.duration;
			state.slowestResourceUrl = path;
		}
	});
}

function reportNavigationTiming() {
	if (!started || navigationReported || typeof performance === 'undefined' || !performance.getEntriesByType) return;
	try {
		const [nav] = performance.getEntriesByType('navigation');
		if (!nav) return;
		navigationReported = true;

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
		pending.add('sample');
	} catch { /* A platform or collector failure cannot block page startup. */ }
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
 * Emits only fresh data while visible and on visibility/pagehide final flushes.
 *
 * @param {string} reason Why the flush happened, for example `interval` or `hidden`.
 * @returns {void}
 */
export function flushVitals(reason) {
	if (!started || (reason === 'interval' && document.visibilityState !== 'visible')) return;
	// visibilitychange can precede the observer callback for the final entries.
	for (const { observer, consume } of observers) {
		try { consume(observer.takeRecords()); } catch { /* An observer may already be disconnected. */ }
	}
	if (!pending.size) return;
	const fresh = new Set(pending);
	pending.clear();
	reason = ['interval', 'hidden', 'pagehide', 'manual'].includes(reason) ? reason : 'manual';
	try {
		if (fresh.has('cls')) {
			reportMetric('web.vital.cls', state.cls, {
				unit: 'score',
				noiseFloor: 0.01,
				tags: { shift_count: state.clsEntries, reason },
			});
		}

		if (fresh.has('interaction')) {
			reportMetric('web.interaction.worst', state.worstInteractionMs, {
				unit: MS,
				tags: { interaction: state.worstInteractionTarget, reason },
			});
		}

		if (fresh.has('longtask')) {
			reportMetric('browser.long_task.total_time', state.longTaskMs, {
				unit: MS,
				tags: { long_task_count: state.longTasks, reason },
			});
		}

		if (fresh.has('resource')) {
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
	} catch { /* Failed telemetry is not retried as idle work. */ }
}

function pauseFlushes() {
	if (flushTimer !== null) window.clearInterval(flushTimer);
	flushTimer = null;
}

function resumeFlushes() {
	if (started && document.visibilityState === 'visible' && flushTimer === null) {
		flushTimer = window.setInterval(() => flushVitals('interval'), FLUSH_INTERVAL_MS);
	}
}

function visibilityChanged() {
	if (document.visibilityState === 'hidden') {
		pauseFlushes();
		flushVitals('hidden');
	} else resumeFlushes();
}

function pageHidden() {
	pauseFlushes();
	flushVitals('pagehide');
}

/**
 * Starts platform performance collection.
 *
 * Safe to call more than once; subsequent calls are ignored.
 *
 * @returns {void}
 */
export function startVitals() {
	if (started || typeof window === 'undefined' || typeof document === 'undefined') return;
	started = true;
	collection += 1;

	observePaint();
	observeLcp();
	observeLayoutShift();
	observeInteractions();
	observeLongTasks();
	observeResources();
	buffered = false;

	if (document.readyState === 'complete') {
		reportNavigationTiming();
	} else {
		window.addEventListener('load', reportNavigationTiming, { once: true });
	}

	resumeFlushes();
	document.addEventListener('visibilitychange', visibilityChanged);
	window.addEventListener('pagehide', pageHidden);
	window.addEventListener('pageshow', resumeFlushes);
}

/**
 * Disconnects observers and timers. Exposed for teardown in tests.
 *
 * @returns {void}
 */
export function stopVitals() {
	if (!started) return;
	started = false;
	for (const { observer } of observers) {
		try {
			observer.disconnect();
		} catch {
			// Already disconnected.
		}
	}
	observers.length = 0;
	pauseFlushes();
	pending.clear();
	window.removeEventListener('load', reportNavigationTiming);
	document.removeEventListener('visibilitychange', visibilityChanged);
	window.removeEventListener('pagehide', pageHidden);
	window.removeEventListener('pageshow', resumeFlushes);
}
