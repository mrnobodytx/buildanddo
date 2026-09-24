import posthog from 'posthog-js';
import { scrubClassroomProperties } from './navigationIntent';

// VITE_BUILDANDDO_PH is written into apps/web/.env before every build by
// scripts/deploy/ship.py (sourced from workspace.env's BUILDANDDO_PH - a
// public, client-safe PostHog project key, never a secret). No key = no
// telemetry; this must never throw or block rendering.
const KEY = import.meta.env.VITE_BUILDANDDO_PH;

let initialized = false;
let identifiedId = null;

export function initTelemetry() {
	if (initialized || !KEY) return;
	posthog.init(KEY, {
		api_host: 'https://us.i.posthog.com',
		defaults: '2026-05-30',
		person_profiles: 'identified_only',
		// 'history_change' records in-app navigation too. `true` recorded only the
		// first full page load, so /app sections showed 0 pageviews in PostHog.
		capture_pageview: 'history_change',
		capture_pageleave: true,
		before_send: scrubClassroomProperties,
	});
	initialized = true;
}

/**
 * Ties PostHog events to the signed-in account by its opaque id alone: no email,
 * no name, no person properties. Signing out resets the device's id, so the next
 * person on a shared machine starts anonymous.
 *
 * @param {({id?: string}|null)} user Auth record, or null when signed out.
 * @returns {void}
 */
export function identifyAnalyticsUser(user) {
	if (!initialized) return;
	const id = typeof user?.id === 'string' && user.id ? user.id : null;
	if (id === identifiedId) return;
	try {
		// A different account on the same device starts from a fresh anonymous id,
		// so two people's events are never merged into one person.
		if (identifiedId !== null) posthog.reset();
		if (id) posthog.identify(id);
	} catch {
		// Product analytics is best-effort; sign-in must never depend on it.
	}
	identifiedId = id;
}

export function trackEvent(name, properties = {}) {
	if (!initialized) return;
	posthog.capture(name, properties);
}
