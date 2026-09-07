import posthog from 'posthog-js';

// VITE_BUILDANDDO_PH is written into apps/web/.env before every build by
// scripts/deploy/ship.py (sourced from workspace.env's BUILDANDDO_PH - a
// public, client-safe PostHog project key, never a secret). No key = no
// telemetry; this must never throw or block rendering.
const KEY = import.meta.env.VITE_BUILDANDDO_PH;

let initialized = false;

export function initTelemetry() {
	if (initialized || !KEY) return;
	posthog.init(KEY, {
		api_host: 'https://us.posthog.com',
		person_profiles: 'identified_only',
		capture_pageview: true,
		capture_pageleave: true,
	});
	initialized = true;
}

export function trackEvent(name, properties = {}) {
	if (!initialized) return;
	posthog.capture(name, properties);
}
