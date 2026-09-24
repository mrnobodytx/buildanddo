// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/mutation-telemetry-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/observability/mutations.js, apps/web/src/lib/observability/config.js, apps/web/src/lib/navigationIntent.js, tests/upgrade/admin-fixture.mjs
// EnumType:    Test
// EnumEdges:   CONSUMES apps/web/src/lib/observability/mutations.js; CONSUMES apps/web/src/lib/observability/config.js; CONSUMES apps/web/src/lib/navigationIntent.js; CONSUMES tests/upgrade/admin-fixture.mjs
// Intent:      Exercise the real mutation observer with isolated sinks in connected client and publisher recovery tests.
// ----------------------------------------------------------------

import vm from 'node:vm';
import { MUTATION_ACTIONS } from '../../apps/web/src/lib/observability/config.js';
import { telemetrySection } from '../../apps/web/src/lib/navigationIntent.js';
import { plain, source } from './admin-fixture.mjs';

/** @param {object} sinks Optional failure/clock doubles. @returns {object} Observer and independently recorded sink calls. */
export function mutationTelemetry(sinks = {}) {
    const actions = [], events = [], metrics = [], module = { exports: {} };
    const window = { location: { pathname: '/app/missions' } };
    let time = 100;
    const code = source('apps/web/src/lib/observability/mutations.js').replace(/^import .+;$/gm, '').replace(/\bexport /g, '');
    vm.runInNewContext(`${code}\nmodule.exports = { observeMutation };`, {
        module, MUTATION_ACTIONS, window, performance: { now: () => { if (sinks.clock) return sinks.clock(); time += 10; return time; } },
        telemetrySection,
        reportAction: (name, context) => { actions.push([name, plain(context)]); return sinks.action?.(name, context); },
        trackEvent: (name, context) => { events.push([name, plain(context)]); return sinks.event?.(name, context); },
        reportMetric: (name, value, options) => { metrics.push([name, value, plain(options)]); return sinks.metric?.(name, value, options); },
    }, { filename: 'apps/web/src/lib/observability/mutations.js' });
    return { observe: module.exports.observeMutation, actions, events, metrics, window, advance: (ms) => { time += ms; } };
}
