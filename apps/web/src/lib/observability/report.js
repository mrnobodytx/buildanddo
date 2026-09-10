// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/report.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/deltas.js
// EnumType:    Adapter
// EnumEdges:   PRODUCES datadog.rum.action; PRODUCES datadog.logs.message;
//              CONSUMES apps/web/src/lib/observability/deltas.js
// Intent:      Single fail-soft emit path to Datadog, so instrumentation modules
//              never touch the SDK directly and a missing SDK feature or a
//              disabled install degrades to a no-op instead of an exception.
// ───────────────────────────────────────────────────────────────

import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';

import { recordMetric } from './deltas';

let reporting = false;

/**
 * Marks the SDKs as initialised. Called once by the RUM bootstrap.
 *
 * @returns {void}
 */
export function enableReporting() {
	reporting = true;
}

/**
 * @returns {boolean} Whether telemetry is being emitted.
 */
export function isReporting() {
	return reporting;
}

// Telemetry is never allowed to surface an exception into application code, and
// never allowed to log about its own failure in a loop.
function safely(operation) {
	if (!reporting) return;
	try {
		operation();
	} catch {
		// Intentionally silent.
	}
}

/**
 * Emits a custom RUM action.
 *
 * @param {string} name Action name, for example `route.change`.
 * @param {object} [context] Flat attribute bag.
 * @returns {void}
 */
export function reportAction(name, context = {}) {
	safely(() => datadogRum.addAction(name, context));
}

/**
 * Emits a RUM error with structured context.
 *
 * @param {(Error|string)} error Error instance or message.
 * @param {object} [context] Flat attribute bag.
 * @returns {void}
 */
export function reportError(error, context = {}) {
	safely(() => datadogRum.addError(error, context));
}

/**
 * Emits a duration vital, falling back to a timing and an action on SDK
 * versions that do not expose custom vitals.
 *
 * @param {string} name Vital name, for example `route.render`.
 * @param {number} duration Duration in milliseconds.
 * @param {object} [context] Flat attribute bag.
 * @returns {void}
 */
export function reportVital(name, duration, context = {}) {
	if (!Number.isFinite(duration)) return;
	safely(() => {
		if (typeof datadogRum.addDurationVital === 'function') {
			datadogRum.addDurationVital(name, { startTime: Date.now() - duration, duration, context });
			return;
		}
		if (typeof datadogRum.addTiming === 'function') {
			datadogRum.addTiming(name.replace(/[^a-z0-9_]/gi, '_'));
		}
		datadogRum.addAction(name, { ...context, duration_ms: duration });
	});
}

/**
 * Emits a browser log line.
 *
 * @param {string} level One of `debug`, `info`, `warn` or `error`.
 * @param {string} message Log message.
 * @param {object} [context] Flat attribute bag.
 * @returns {void}
 */
export function reportLog(level, message, context = {}) {
	safely(() => {
		const logger = datadogLogs.logger;
		if (typeof logger[level] === 'function') logger[level](message, context);
	});
}

/**
 * Sets a persistent global context property shared by RUM and Logs.
 *
 * @param {string} key Property name.
 * @param {*} value Property value.
 * @returns {void}
 */
export function setGlobalProperty(key, value) {
	safely(() => {
		datadogRum.setGlobalContextProperty(key, value);
		datadogLogs.setGlobalContextProperty(key, value);
	});
}

/**
 * Records a feature flag evaluation against the active RUM view.
 *
 * @param {string} key Flag key.
 * @param {*} value Evaluated value.
 * @returns {void}
 */
export function reportFeatureFlag(key, value) {
	safely(() => {
		if (typeof datadogRum.addFeatureFlagEvaluation === 'function') {
			datadogRum.addFeatureFlagEvaluation(key, value);
		}
	});
}

/**
 * Records a measurement and emits it with its deltas attached.
 *
 * This is the primary entry point for instrumentation: one call produces the
 * metric, its session and baseline deltas, a duration vital when the unit is
 * milliseconds, and a warning log when the value has regressed against the
 * cross-session baseline.
 *
 * @param {string} name Metric name.
 * @param {number} value Measured value.
 * @param {{unit?: string, direction?: string, regressionPct?: number, noiseFloor?: number, tags?: object, silent?: boolean}} [options] Metric semantics.
 * @returns {(object|null)} The delta record, or null when the value was not finite.
 */
export function reportMetric(name, value, options = {}) {
	const record = recordMetric(name, value, options);
	if (!record) return null;

	if (options.silent) return record;

	reportAction(name, record);

	if (record.unit === 'millisecond') {
		reportVital(name, record.value, { metric: name, regression: record.regression });
	}

	if (record.regression) {
		reportLog('warn', `${name} regressed against baseline`, record);
	}

	return record;
}
