#!/usr/bin/env node
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/tools/observability-smoke.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/deltas.js
// EnumType:    Test
// EnumEdges:   VERIFIED_BY apps/web/src/lib/observability/deltas.js
// Intent:      Prove the delta maths - session deltas, cross-session baselines,
//              regression direction and release resets - without a browser, a
//              bundler or a network round trip.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';

import {
	configureDeltas,
	flushBaselines,
	incrementCounter,
	metricSnapshot,
	recordMetric,
	resetDeltas,
	DELTA_CONSTANTS,
} from '../src/lib/observability/deltas.js';

function fakeStorage() {
	const backing = new Map();
	return {
		getItem: (key) => (backing.has(key) ? backing.get(key) : null),
		setItem: (key, value) => backing.set(key, String(value)),
		removeItem: (key) => backing.delete(key),
	};
}

const checks = [];

function check(name, run) {
	try {
		run();
		checks.push({ name, ok: true });
	} catch (error) {
		checks.push({ name, ok: false, reason: error.message });
	}
}

check('first sample has no previous and no baseline', () => {
	configureDeltas({ release: 'r1', environment: 'test', storage: fakeStorage() });
	const first = recordMetric('web.vital.lcp', 1200, { unit: 'millisecond' });

	assert.equal(first.value, 1200);
	assert.equal(first.samples, 1);
	assert.equal(first.session_previous, null);
	assert.equal(first.session_delta, null);
	assert.equal(first.baseline, null);
	assert.equal(first.regression, false);
	assert.equal(first.release, 'r1');
	assert.equal(first.env, 'test');
});

check('second sample reports session delta and percent change', () => {
	configureDeltas({ release: 'r1', environment: 'test', storage: fakeStorage() });
	recordMetric('web.vital.lcp', 1000, { unit: 'millisecond' });
	const second = recordMetric('web.vital.lcp', 1250, { unit: 'millisecond' });

	assert.equal(second.session_previous, 1000);
	assert.equal(second.session_delta, 250);
	assert.equal(second.session_pct_change, 25);
	assert.equal(second.session_first, 1000);
	assert.equal(second.session_min, 1000);
	assert.equal(second.session_max, 1250);
	assert.equal(second.session_mean, 1125);
	assert.equal(second.trend, 'up');
});

check('coalesced writes are flushed on demand', () => {
	const storage = fakeStorage();
	configureDeltas({ release: 'r1', environment: 'test', storage });
	for (let i = 0; i < 5; i += 1) recordMetric('api.latency', 100, { unit: 'millisecond' });

	flushBaselines();
	const persisted = JSON.parse(storage.getItem(DELTA_CONSTANTS.BASELINE_STORE_KEY));
	assert.equal(persisted.release, 'r1');
	assert.equal(persisted.metrics['api.latency'].samples, 5, 'every sample must survive the coalescing window');
});

check(`baseline appears only after ${DELTA_CONSTANTS.MIN_BASELINE_SAMPLES} samples`, () => {
	const storage = fakeStorage();
	configureDeltas({ release: 'r1', environment: 'test', storage });
	for (let i = 0; i < DELTA_CONSTANTS.MIN_BASELINE_SAMPLES; i += 1) {
		const record = recordMetric('api.latency', 100, { unit: 'millisecond' });
		assert.equal(record.baseline, null, 'baseline must stay null while history is thin');
	}
	const fourth = recordMetric('api.latency', 100, { unit: 'millisecond' });
	assert.equal(fourth.baseline, 100);
	assert.equal(fourth.baseline_delta, 0);
	assert.equal(fourth.baseline_pct_change, 0);
	assert.equal(fourth.regression, false);
});

check('baseline survives a new session on the same release', () => {
	const storage = fakeStorage();
	configureDeltas({ release: 'r1', environment: 'test', storage });
	for (let i = 0; i < 4; i += 1) recordMetric('api.latency', 100, { unit: 'millisecond' });
	flushBaselines(); // what runtime.js does on pagehide

	const second = configureDeltas({ release: 'r1', environment: 'test', storage });
	assert.equal(second.changed, false, 'same release is not a transition');

	const record = recordMetric('api.latency', 100, { unit: 'millisecond' });
	assert.equal(record.samples, 1, 'session state is per session');
	assert.equal(record.baseline, 100, 'baseline is cross-session');
});

check('regression fires when a lower-is-better metric degrades', () => {
	const storage = fakeStorage();
	configureDeltas({ release: 'r1', environment: 'test', storage });
	for (let i = 0; i < 4; i += 1) recordMetric('web.vital.lcp', 1000, { unit: 'millisecond' });

	const regressed = recordMetric('web.vital.lcp', 3000, { unit: 'millisecond' });
	assert.equal(regressed.baseline, 1000);
	assert.equal(regressed.baseline_delta, 2000);
	assert.equal(regressed.baseline_pct_change, 200);
	assert.equal(regressed.regression, true);
	assert.equal(regressed.trend, 'up');
});

check('an improvement on a lower-is-better metric is not a regression', () => {
	const storage = fakeStorage();
	configureDeltas({ release: 'r1', environment: 'test', storage });
	for (let i = 0; i < 4; i += 1) recordMetric('web.vital.lcp', 1000, { unit: 'millisecond' });

	const improved = recordMetric('web.vital.lcp', 400, { unit: 'millisecond' });
	assert.equal(improved.baseline_pct_change, -60);
	assert.equal(improved.regression, false);
	assert.equal(improved.trend, 'down');
});

check('direction inverts the regression test for higher-is-better metrics', () => {
	const storage = fakeStorage();
	configureDeltas({ release: 'r1', environment: 'test', storage });
	const options = { unit: 'millisecond', direction: DELTA_CONSTANTS.HIGHER_IS_BETTER };
	for (let i = 0; i < 4; i += 1) recordMetric('route.dwell', 1000, options);

	const dropped = recordMetric('route.dwell', 100, options);
	assert.equal(dropped.regression, true, 'a collapse in dwell time is the bad direction');

	const grown = recordMetric('route.dwell', 5000, options);
	assert.equal(grown.regression, false);
});

check('values under the noise floor never flag a regression', () => {
	const storage = fakeStorage();
	configureDeltas({ release: 'r1', environment: 'test', storage });
	for (let i = 0; i < 4; i += 1) recordMetric('web.vital.cls', 0.01, { unit: 'score' });

	const noisy = recordMetric('web.vital.cls', 0.4, { unit: 'score' });
	assert.ok(noisy.baseline_pct_change > DELTA_CONSTANTS.REGRESSION_PCT);
	assert.equal(noisy.regression, false, 'default noise floor of 1 suppresses sub-unit metrics');

	const withFloor = recordMetric('web.vital.cls', 0.4, { unit: 'score', noiseFloor: 0.01 });
	assert.equal(withFloor.regression, true, 'an explicit floor re-enables the check');
});

check('a release change resets baselines and reports the previous release', () => {
	const storage = fakeStorage();
	configureDeltas({ release: 'r1', environment: 'test', storage });
	for (let i = 0; i < 4; i += 1) recordMetric('api.latency', 100, { unit: 'millisecond' });
	flushBaselines();

	const transition = configureDeltas({ release: 'r2', environment: 'test', storage });
	assert.equal(transition.changed, true);
	assert.equal(transition.previous, 'r1');
	assert.equal(transition.current, 'r2');

	const afterDeploy = recordMetric('api.latency', 100, { unit: 'millisecond' });
	assert.equal(afterDeploy.baseline, null, 'a deploy must not be reported as a regression');
	assert.equal(afterDeploy.baseline_samples, 0);
});

check('counters accumulate across the session', () => {
	configureDeltas({ release: 'r1', environment: 'test', storage: fakeStorage() });
	assert.equal(incrementCounter('route.changes').value, 1);
	assert.equal(incrementCounter('route.changes').value, 2);
	const third = incrementCounter('route.changes', { route: '/app' });
	assert.equal(third.value, 3);
	assert.equal(third.session_delta, 1);
	assert.equal(third.route, '/app');
});

check('snapshot summarises every metric in the session', () => {
	configureDeltas({ release: 'r1', environment: 'test', storage: fakeStorage() });
	recordMetric('api.latency', 100, { unit: 'millisecond' });
	recordMetric('api.latency', 300, { unit: 'millisecond' });
	incrementCounter('api.failures');

	const snapshot = metricSnapshot();
	assert.deepEqual(snapshot['api.latency'], {
		value: 300,
		samples: 2,
		min: 100,
		max: 300,
		mean: 200,
		session_delta: 200,
	});
	assert.equal(snapshot['api.failures'].value, 1);
});

check('non-finite measurements are dropped, not reported as zero', () => {
	configureDeltas({ release: 'r1', environment: 'test', storage: fakeStorage() });
	assert.equal(recordMetric('api.latency', Number.NaN), null);
	assert.equal(recordMetric('api.latency', Number.POSITIVE_INFINITY), null);
	assert.equal(recordMetric('api.latency', undefined), null);
	assert.deepEqual(metricSnapshot(), {});
});

check('unreadable storage degrades to in-memory instead of throwing', () => {
	const hostile = {
		getItem: () => {
			throw new Error('SecurityError');
		},
		setItem: () => {
			throw new Error('QuotaExceededError');
		},
		removeItem: () => {},
	};
	configureDeltas({ release: 'r1', environment: 'test', storage: hostile });
	const record = recordMetric('api.latency', 100, { unit: 'millisecond' });
	assert.equal(record.value, 100);
	assert.equal(record.baseline, null);
	resetDeltas();
});

const failed = checks.filter((entry) => !entry.ok);

for (const entry of checks) {
	console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}${entry.ok ? '' : ` - ${entry.reason}`}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} observability delta checks passed`);

process.exit(failed.length === 0 ? 0 : 1);
