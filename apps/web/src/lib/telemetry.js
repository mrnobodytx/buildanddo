// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/lib/telemetry.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/navigationIntent.js, apps/web/src/lib/observability/context.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/navigationIntent.js; CONSUMES apps/web/src/lib/observability/context.js; PRODUCES posthog.event
// Intent:      Collect bounded SPA events and ID-only identities without DOM content or telemetry failures affecting the application.
// ----------------------------------------------------------------

import posthog from 'posthog-js';
import { scrubClassroomProperties, telemetrySection } from './navigationIntent';
import { resolveEnvironment, resolveRelease } from './observability/context';

// The release build receives VITE_BUILDANDDO_PH from its authorized environment.
// It is a public, intake-only project key, not a read credential. Ordinary local
// builds need no key; missing analytics must never block rendering.
const KEY = import.meta.env?.VITE_BUILDANDDO_PH;

// Read once for this document, not on SPA navigation. This is a caller's
// declaration for filtering, never authenticated synthetic or human identity.
const declaredSynthetic = (() => {
	try {
		const values = new URL(window.location.href).searchParams.getAll('telemetry_test');
		return values.length === 1 && values[0] === 'heartbeat';
	} catch { return false; }
})();

let initialized = false;
let identifiedUserId = null;
let identityBlocked = false;

function beforeSend(event) {
	try {
		if (identityBlocked) return null;
		// No DOM snapshots, autocapture payloads or unfiltered exception text,
		// even if a remote project setting tries to enable another collector.
		if (event?.event?.startsWith('$') && !['$pageview', '$pageleave', '$identify', '$set', '$feature_flag_called'].includes(event.event)) return null;
		const scrubbed = scrubClassroomProperties(event);
		if (!scrubbed?.properties) return scrubbed;
		const properties = scrubbed.properties;
		// PostHog routes this envelope by its public project key. Never restore
		// an application-supplied token or make tokens safe in the shared scrubber.
		properties.token = KEY;
		properties.env = resolveEnvironment();
		properties.release = resolveRelease();
		properties.declared_synthetic = declaredSynthetic;
		delete properties.telemetry_test;
		properties.section = telemetrySection(properties.section || properties.$current_url || window.location.pathname);
		const type = typeof performance !== 'undefined' ? performance.getEntriesByType?.('navigation')?.[0]?.type : null;
		properties.nav_type = ['navigate', 'reload', 'back_forward', 'prerender'].includes(type) ? type : 'unknown';
		// This is an observed browser signal, not an assertion that other visits
		// are human or that a particular synthetic test or agent is authenticated.
		properties.browser_automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
		return scrubbed;
	} catch { return null; }
}

/** @returns {void} Initialize product analytics only when configured outside tests. */
export function initTelemetry() {
	if (initialized || !KEY || typeof window === 'undefined' || import.meta.env?.MODE === 'test') return;
	const config = {
		api_host: 'https://us.i.posthog.com',
		defaults: '2026-05-30',
		person_profiles: 'identified_only',
		// Start each document anonymously before the SDK's initial pageview.
		// Only native auth may identify it; cross-page anonymous continuity is
		// deliberately lost. SDK opt-out storage remains separately configured.
		persistence: 'memory',
		capture_pageview: 'history_change',
		capture_pageleave: true,
		autocapture: false,
		disable_session_recording: true,
		capture_exceptions: false,
		respect_dnt: true,
		before_send: beforeSend,
	};
	try {
		const existingKey = posthog.get_config('token');
		if (existingKey && existingKey !== KEY) return;
		if (existingKey) posthog.set_config(config);
		else posthog.init(KEY, config);
		initialized = posthog.get_config('token') === KEY && posthog.get_config('before_send') === beforeSend;
	} catch { /* Missing or blocked analytics must not block rendering. */ }
}

/** @param {string} name Static event name. @param {object} properties Bounded metadata, never record content. @returns {void} */
export function trackEvent(name, properties = {}) {
	if (!initialized || identityBlocked) return;
	try {
		if (posthog.has_opted_out_capturing() || typeof name !== 'string' || !/^[a-z][a-z0-9_.]{0,79}$/.test(name)) return;
		const event = scrubClassroomProperties({ event: name, properties });
		if (event) posthog.capture(name, event.properties);
	} catch { /* Product measurement never changes an application outcome. */ }
}

/** @param {{id: string}|null} user Native auth record; no profile fields are sent. @returns {void} */
export function identifyTelemetryUser(user) {
	if (!initialized) return;
	try {
		if (typeof user?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(user.id) || posthog.has_opted_out_capturing()) return;
		if (!identityBlocked && identifiedUserId === user.id) return;
		identityBlocked = true;
		const previousId = identifiedUserId || posthog.get_property('$user_id');
		if (previousId && previousId !== user.id) {
			posthog.reset();
			identifiedUserId = null;
		}
		// identify emits its own ID-only event synchronously through before_send.
		identityBlocked = false;
		posthog.identify(user.id);
		identifiedUserId = user.id;
	} catch { identityBlocked = true; }
}

/** @returns {void} Clear analytics identity without changing collection consent. */
export function clearTelemetryUser() {
	if (!initialized) return;
	try {
		// The first native null must not orphan the anonymous initial pageview
		// by rotating its ID before a validated identify can link it.
		if (!identityBlocked && identifiedUserId === null && !posthog.get_property('$user_id')) return;
		identityBlocked = true;
		posthog.reset();
		identifiedUserId = null;
		identityBlocked = false;
	} catch { identityBlocked = true; }
}
