// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/datadogRum.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-001, SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/context.js,
//              apps/web/src/lib/observability/network.js,
//              apps/web/src/lib/observability/report.js
// EnumType:    Adapter
// EnumEdges:   PRODUCES datadog.rum.session; CONSUMES import.meta.env;
//              TRIGGERS apps/web/src/lib/observability/report.js
// Intent:      Own the Datadog browser SDK configuration for buildanddo.tech -
//              sampling, trace propagation into the PocketBase backend, and the
//              scrubbing rules applied before any event leaves the browser.
// ───────────────────────────────────────────────────────────────

import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';

import { resolveEnvironment, resolveRelease, resolveSampleRate } from '@/lib/observability/context';
import { networkSummary } from '@/lib/observability/network';
import { enableReporting } from '@/lib/observability/report';

// VITE_DD_APPLICATION_ID and VITE_DD_CLIENT_TOKEN are client-side public
// identifiers (the RUM client token is scoped to intake only and carries no
// read access), written into apps/web/.env before every build by
// scripts/deploy/ship.py. No credentials = no RUM; initialisation must never
// throw or block rendering.
const APPLICATION_ID = import.meta.env.VITE_DD_APPLICATION_ID;
const CLIENT_TOKEN = import.meta.env.VITE_DD_CLIENT_TOKEN;

const SITE = 'us5.datadoghq.com';
const SERVICE = 'buildanddo-web';

// Query parameters that must never reach Datadog. Password-reset and
// verification links put single-use tokens in the URL, and RUM records the URL
// of every view and resource.
const SENSITIVE_PARAMS = ['token', 'email', 'password', 'otp', 'code', 'secret', 'key', 'apikey'];

// Expected backend states, not defects. These are the same conditions
// vite.config.js downgrades to console.info in its fetch wrapper: an
// unconfigured integration or a rejected password is a normal product state,
// and letting them into the error stream makes the error rate meaningless.
const BENIGN_ERROR_PATTERNS = [
	/INTEGRATION_NOT_CONFIGURED/i,
	/Failed to authenticate/i,
	/Insufficient credits/i,
];

let initialized = false;

function scrubUrl(url) {
	if (typeof url !== 'string' || !url) return url;
	try {
		const parsed = new URL(url, window.location.origin);
		let touched = false;
		for (const param of SENSITIVE_PARAMS) {
			if (parsed.searchParams.has(param)) {
				parsed.searchParams.set(param, 'redacted');
				touched = true;
			}
		}
		return touched ? parsed.toString() : url;
	} catch {
		return url;
	}
}

function isBenign(message) {
	return typeof message === 'string' && BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function beforeSendRumEvent(event) {
	if (event.view && event.view.url) event.view.url = scrubUrl(event.view.url);
	if (event.view && event.view.referrer) event.view.referrer = scrubUrl(event.view.referrer);
	if (event.resource && event.resource.url) event.resource.url = scrubUrl(event.resource.url);

	if (event.type === 'error') {
		const message = event.error ? event.error.message : '';
		if (isBenign(message)) return false;
		if (event.error && event.error.resource && event.error.resource.url) {
			event.error.resource.url = scrubUrl(event.error.resource.url);
		}
		// Errors are far easier to triage next to the session's API health.
		event.context = { ...event.context, api_health: networkSummary() };
	}

	return true;
}

function beforeSendLog(log) {
	if (isBenign(log.message)) return false;
	if (log.http && log.http.url) log.http.url = scrubUrl(log.http.url);
	return true;
}

// Propagate trace headers to our own origin only. A cross-origin endpoint
// would have to allow the x-datadog-* and traceparent headers explicitly, and
// a preflight it does not allow fails the request outright - correlation is
// not worth breaking an API call for. In the shipped configuration PocketBase
// is served from this origin under /hcgi/platform, so it is covered.
function isSameOriginUrl(url) {
	if (typeof url !== 'string') return false;
	if (url.startsWith('/')) return true;
	return url.startsWith(`${window.location.origin}/`);
}

/**
 * Starts Datadog RUM and browser log collection.
 *
 * Safe to call more than once; subsequent calls are ignored. A missing
 * application id or client token disables collection silently.
 *
 * @returns {void}
 */
export function initDatadogRum() {
	if (initialized || !APPLICATION_ID || !CLIENT_TOKEN) return;

	const env = resolveEnvironment();
	const version = resolveRelease();
	const sessionSampleRate = resolveSampleRate('VITE_DD_SESSION_SAMPLE_RATE', 100);

	datadogRum.init({
		applicationId: APPLICATION_ID,
		clientToken: CLIENT_TOKEN,
		site: SITE,
		service: SERVICE,
		env,
		version,
		sessionSampleRate,
		sessionReplaySampleRate: resolveSampleRate('VITE_DD_REPLAY_SAMPLE_RATE', 20),
		traceSampleRate: resolveSampleRate('VITE_DD_TRACE_SAMPLE_RATE', 20),
		trackUserInteractions: true,
		trackResources: true,
		trackLongTasks: true,
		trackBfcacheViews: true,
		defaultPrivacyLevel: 'mask-user-input',
		// Keeps global context (release, route, runtime facets) attached across
		// full page loads inside one session.
		storeContextsAcrossPages: true,
		allowedTracingUrls: [{ match: isSameOriginUrl, propagatorTypes: ['tracecontext', 'datadog'] }],
		beforeSend: beforeSendRumEvent,
	});

	datadogLogs.init({
		clientToken: CLIENT_TOKEN,
		site: SITE,
		service: SERVICE,
		env,
		version,
		sessionSampleRate,
		forwardErrorsToLogs: true,
		// Browser-enforced problems that never reach application code.
		forwardReports: ['csp_violation', 'intervention', 'deprecation'],
		storeContextsAcrossPages: true,
		beforeSend: beforeSendLog,
	});

	initialized = true;
	enableReporting();
}

/**
 * Attaches the signed-in PocketBase user to the current RUM session.
 *
 * @param {{ id: string, email?: string, name?: string }} user PocketBase auth record.
 * @returns {void}
 */
export function identifyRumUser(user) {
	if (!initialized || !user || !user.id) return;
	datadogRum.setUser({ id: user.id, email: user.email, name: user.name });
	datadogLogs.setUser({ id: user.id, email: user.email, name: user.name });
}

/**
 * Clears the RUM user on sign-out.
 *
 * @returns {void}
 */
export function clearRumUser() {
	if (!initialized) return;
	datadogRum.clearUser();
	datadogLogs.clearUser();
}
