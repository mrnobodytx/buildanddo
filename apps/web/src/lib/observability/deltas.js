// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/deltas.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     none
// EnumType:    Adapter
// EnumEdges:   PRODUCES datadog.rum.metric.delta; VALIDATES apps/web/tools/observability-smoke.mjs
// Intent:      Turn point-in-time browser measurements into first/previous/baseline
//              deltas so a regression is visible from a single event, without
//              needing a dashboard comparison window.
// ───────────────────────────────────────────────────────────────

// Pure module: no browser or bundler globals at import time, so the delta maths
// can be exercised directly by tools/observability-smoke.mjs under plain Node.

const BASELINE_STORE_KEY = 'buildanddo.obs.baselines.v1';

// Exponential weighting for the cross-session baseline. 0.3 keeps roughly the
// last handful of sessions meaningful while still moving after a real shift.
const BASELINE_ALPHA = 0.3;

// A baseline needs history before a deviation means anything.
const MIN_BASELINE_SAMPLES = 3;

// Relative change that counts as a regression, and the absolute floor below
// which relative change is noise (sub-millisecond timings, single counts).
const REGRESSION_PCT = 20;
const NOISE_FLOOR = 1;

// Coalescing window for baseline persistence.
const BASELINE_WRITE_INTERVAL_MS = 2000;

const LOWER_IS_BETTER = 'lower_is_better';
const HIGHER_IS_BETTER = 'higher_is_better';

const metrics = new Map();

let pendingWrite = null;
let lastWriteAt = 0;

let config = {
	release: 'unknown',
	environment: 'unknown',
	storage: null,
	loaded: false,
	baselines: {},
};

function memoryStorage() {
	const backing = new Map();
	return {
		getItem: (key) => (backing.has(key) ? backing.get(key) : null),
		setItem: (key, value) => backing.set(key, value),
		removeItem: (key) => backing.delete(key),
	};
}

function defaultStorage() {
	try {
		if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
	} catch {
		// Storage access throws in some privacy modes and inside sandboxed frames.
	}
	return memoryStorage();
}

function readBaselines() {
	if (config.loaded) return config.baselines;
	config.loaded = true;
	config.baselines = {};
	try {
		const raw = config.storage.getItem(BASELINE_STORE_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && typeof parsed === 'object' && parsed.metrics && typeof parsed.metrics === 'object') {
			config.baselines = parsed.metrics;
			config.previousRelease = typeof parsed.release === 'string' ? parsed.release : null;
		}
	} catch {
		// Corrupt or unreadable baselines are simply rebuilt from this session on.
	}
	return config.baselines;
}

function writeBaselines() {
	pendingWrite = null;
	lastWriteAt = Date.now();
	try {
		config.storage.setItem(
			BASELINE_STORE_KEY,
			JSON.stringify({ release: config.release, environment: config.environment, metrics: config.baselines }),
		);
	} catch {
		// A full or blocked quota must never break instrumentation.
	}
}

// Metrics like api.latency are recorded on every request. Persisting the
// baseline synchronously each time would put a JSON serialisation and a
// storage write on the main thread in the request path, so writes are
// coalesced and flushed explicitly when the page is going away.
function scheduleBaselineWrite() {
	const elapsed = Date.now() - lastWriteAt;
	if (elapsed >= BASELINE_WRITE_INTERVAL_MS) {
		writeBaselines();
		return;
	}
	if (pendingWrite !== null) return;
	pendingWrite = setTimeout(writeBaselines, BASELINE_WRITE_INTERVAL_MS - elapsed);
	if (typeof pendingWrite === 'object' && pendingWrite && typeof pendingWrite.unref === 'function') {
		pendingWrite.unref();
	}
}

/**
 * Persists coalesced baseline updates immediately.
 *
 * Called when the page is hidden or unloading, and at session boundaries.
 *
 * @returns {void}
 */
export function flushBaselines() {
	if (pendingWrite !== null) clearTimeout(pendingWrite);
	writeBaselines();
}

function round(value, places = 3) {
	if (!Number.isFinite(value)) return null;
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

function percentChange(from, to) {
	if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
	if (Math.abs(from) < Number.EPSILON) return to === 0 ? 0 : null;
	return round(((to - from) / Math.abs(from)) * 100, 2);
}

function classifyTrend(delta) {
	if (delta === null || Math.abs(delta) < Number.EPSILON) return 'flat';
	return delta > 0 ? 'up' : 'down';
}

/**
 * Binds the delta engine to a release, environment and storage backend.
 *
 * Baselines recorded under a different release are discarded, so a deploy
 * starts a clean comparison rather than reporting the deploy itself as a
 * regression on every metric.
 *
 * @param {{release?: string, environment?: string, storage?: object}} options Engine configuration.
 * @returns {{changed: boolean, previous: (string|null), current: string}} Release transition detected on load.
 */
export function configureDeltas({ release = 'unknown', environment = 'unknown', storage } = {}) {
	config = {
		release,
		environment,
		storage: storage || defaultStorage(),
		loaded: false,
		baselines: {},
		previousRelease: null,
	};
	metrics.clear();
	readBaselines();

	const previous = config.previousRelease || null;
	const changed = Boolean(previous) && previous !== release;

	if (changed) {
		config.baselines = {};
		flushBaselines();
	}

	return { changed, previous, current: release };
}

/**
 * Records a measurement and returns its deltas.
 *
 * Three comparisons are produced: against the first value seen this session,
 * against the previous value, and against the persisted cross-session
 * baseline. `regression` is true only when the baseline has enough history,
 * the value clears the noise floor, and the change exceeds the threshold in
 * the unfavourable direction.
 *
 * @param {string} name Metric name, for example `web.vital.lcp`.
 * @param {number} value Measured value.
 * @param {{unit?: string, direction?: string, regressionPct?: number, noiseFloor?: number, tags?: object}} [options] Metric semantics.
 * @returns {(object|null)} Flat, tag-friendly delta record, or null for a non-finite value.
 */
export function recordMetric(name, value, options = {}) {
	if (!Number.isFinite(value)) return null;

	const {
		unit = 'count',
		direction = LOWER_IS_BETTER,
		regressionPct = REGRESSION_PCT,
		noiseFloor = NOISE_FLOOR,
		tags = {},
	} = options;

	const baselines = readBaselines();
	const existing = metrics.get(name);

	const state = existing || { first: value, samples: 0, sum: 0, min: value, max: value };
	const previous = existing ? existing.last : null;

	state.samples += 1;
	state.sum += value;
	state.last = value;
	state.min = Math.min(state.min, value);
	state.max = Math.max(state.max, value);
	metrics.set(name, state);

	const baseline = baselines[name];
	const baselineValue = baseline && baseline.samples >= MIN_BASELINE_SAMPLES ? baseline.ewma : null;

	const delta = previous === null ? null : round(value - previous);
	const baselineDelta = baselineValue === null ? null : round(value - baselineValue);
	const baselinePct = percentChange(baselineValue, value);

	const unfavourable =
		baselinePct === null
			? false
			: direction === HIGHER_IS_BETTER
				? baselinePct <= -regressionPct
				: baselinePct >= regressionPct;

	const record = {
		metric: name,
		value: round(value),
		unit,
		direction,
		samples: state.samples,
		session_first: round(state.first),
		session_previous: previous === null ? null : round(previous),
		session_delta: delta,
		session_pct_change: percentChange(previous, value),
		session_min: round(state.min),
		session_max: round(state.max),
		session_mean: round(state.sum / state.samples),
		baseline: baselineValue === null ? null : round(baselineValue),
		baseline_samples: baseline ? baseline.samples : 0,
		baseline_delta: baselineDelta,
		baseline_pct_change: baselinePct,
		trend: classifyTrend(delta),
		regression: Boolean(unfavourable && Math.abs(value) >= noiseFloor),
		release: config.release,
		env: config.environment,
		...tags,
	};

	baselines[name] = {
		ewma: baseline ? baseline.ewma + BASELINE_ALPHA * (value - baseline.ewma) : value,
		samples: (baseline ? baseline.samples : 0) + 1,
	};
	scheduleBaselineWrite();

	return record;
}

/**
 * Returns the current session aggregate for every recorded metric.
 *
 * Used for the periodic and page-unload flush, where one event carrying the
 * whole session is cheaper than replaying every sample.
 *
 * @returns {object} Metric name to `{value, samples, min, max, mean}`.
 */
export function metricSnapshot() {
	const snapshot = {};
	for (const [name, state] of metrics.entries()) {
		snapshot[name] = {
			value: round(state.last),
			samples: state.samples,
			min: round(state.min),
			max: round(state.max),
			mean: round(state.sum / state.samples),
			session_delta: state.samples > 1 ? round(state.last - state.first) : null,
		};
	}
	return snapshot;
}

/**
 * Increments a monotonic session counter and returns its delta record.
 *
 * @param {string} name Counter name.
 * @param {object} [tags] Extra attributes to merge into the record.
 * @returns {(object|null)} Delta record for the new total.
 */
export function incrementCounter(name, tags = {}) {
	const state = metrics.get(name);
	const next = (state ? state.last : 0) + 1;
	return recordMetric(name, next, { unit: 'count', tags });
}

/**
 * Discards session metrics and persisted baselines.
 *
 * @returns {void}
 */
export function resetDeltas() {
	metrics.clear();
	config.baselines = {};
	flushBaselines();
}

export const DELTA_CONSTANTS = {
	BASELINE_STORE_KEY,
	BASELINE_ALPHA,
	MIN_BASELINE_SAMPLES,
	REGRESSION_PCT,
	LOWER_IS_BETTER,
	HIGHER_IS_BETTER,
};
