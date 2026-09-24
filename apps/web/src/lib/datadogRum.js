// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/datadogRum.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-001, SRS-BUILDANDDO-RUM-002, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/context.js,
//              apps/web/src/lib/observability/network.js,
//              apps/web/src/lib/observability/report.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Adapter
// EnumEdges:   PRODUCES datadog.rum.session; CONSUMES import.meta.env;
//              TRIGGERS apps/web/src/lib/observability/report.js; CONSUMES apps/web/src/lib/navigationIntent.js
// Intent:      Own the Datadog browser SDK configuration for buildanddo.com -
//              sampling, trace propagation into the PocketBase backend, and the
//              scrubbing rules applied before any event leaves the browser.
// ───────────────────────────────────────────────────────────────

import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';
import { BROWSER_TELEMETRY } from '@/lib/observability/config';
import { classroomTelemetryLocation, scrubClassroomProperties, telemetryEndpoint, telemetrySection } from '@/lib/navigationIntent';

import { resolveEnvironment, resolveRelease, resolveSampleRate } from '@/lib/observability/context';
import { networkSummary } from '@/lib/observability/network';
import { enableReporting } from '@/lib/observability/report';

// VITE_DD_APPLICATION_ID and VITE_DD_CLIENT_TOKEN are client-side public
// identifiers (the RUM client token is scoped to intake only and carries no
// read access), supplied by the build environment. The release version is
// injected by tools/build.mjs. No credentials = no RUM; initialisation must never
// throw or block rendering.
const APPLICATION_ID = import.meta.env?.VITE_DD_APPLICATION_ID;
const CLIENT_TOKEN = import.meta.env?.VITE_DD_CLIENT_TOKEN;

const { site: SITE, service: SERVICE } = BROWSER_TELEMETRY;

// Expected backend states, not defects. These are the same conditions
// vite.config.js downgrades to console.info in its fetch wrapper: an
// unconfigured integration or a rejected password is a normal product state,
// and letting them into the error stream makes the error rate meaningless.
const BENIGN_ERROR_PATTERNS = [
	/INTEGRATION_NOT_CONFIGURED/i,
	/Failed to authenticate/i,
	/Insufficient credits/i,
];

let rumInitialized = false;
let logsInitialized = false;

// Only reviewed, literal data-dd-action-name labels may bypass action masking.
const PRIVATE_ACTIONS = new Set(['Private dossier interaction', 'Open dossier source', 'Open private entity',
	'Commercial enquiry form', 'Open commercial email draft']);

function isBenign(message) {
	return typeof message === 'string' && BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function privateError(error, typeKey = 'type') {
	const kind = ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError',
		'AbortError', 'TimeoutError', 'NetworkError', 'ChunkLoadError'].includes(error[typeKey]) ? error[typeKey] : 'Error';
	// Messages, function names and nested causes can contain record content.
	// Preserve source locations/line numbers for debugging the tagged release.
	const stack = typeof error.stack === 'string' ? error.stack.split('\n').slice(0, 40).flatMap((line) => {
		const match = line.match(/(https?:\/\/[^\s)]+?)(:\d+(?::\d+)?)\)?$/);
		return match ? [`at ${classroomTelemetryLocation(match[1])}${match[2]}`] : [];
	}).join('\n') : '';
	return {
		...(error.id ? { id: error.id } : {}),
		...(error.source ? { source: error.source } : {}),
		...(error.handling ? { handling: error.handling } : {}),
		...(error.origin ? { origin: error.origin } : {}),
		...(error.resource ? { resource: { ...error.resource, url: classroomTelemetryLocation(error.resource.url) } } : {}),
		[typeKey]: kind,
		message: kind,
		...(stack ? { stack } : {}),
	};
}

function beforeSendRumEvent(event) {
	try {
		if (event.type === 'resource') {
			const url = new URL(event.resource.url, window.location.origin);
			// This also excludes unknown same-origin analytics proxies, not just
			// the SDK's own intake hosts.
			if (url.origin !== window.location.origin || classroomTelemetryLocation(url.pathname) === '/unknown') return false;
		}
		if (event.view) event.view.name = telemetrySection(event.view.url || event.view.name);
		if (event.view?.url) event.view.url = classroomTelemetryLocation(event.view.url);
		if (event.view?.referrer) event.view.referrer = classroomTelemetryLocation(event.view.referrer);
		if (event.resource?.url) event.resource.url = classroomTelemetryLocation(event.resource.url);
		if (event.usr) event.usr = event.usr.id ? { id: event.usr.id } : {};
		if (event.context) {
			const scrubbed = scrubClassroomProperties({ properties: event.context });
			if (!scrubbed) return false;
			event.context = scrubbed.properties;
		}
		if (event.action?.target && event.action.type !== 'custom' && !PRIVATE_ACTIONS.has(event.action.target.name)) {
			event.action.target.name = ['click', 'tap', 'scroll', 'swipe'].includes(event.action.type) ? event.action.type : 'interaction';
		}

		if (event.type === 'error') {
			if (isBenign(event.error?.message)) return false;
			if (event.error) event.error = privateError(event.error);
			// Errors are far easier to triage next to the session's API health.
			event.context = { ...event.context, api_health: networkSummary() };
		}
		return true;
	} catch { return false; }
}

function beforeSendLog(log) {
	try {
		if (isBenign(log.message)) return false;
		const error = log.error ? privateError(log.error, 'kind') : null;
		const message = ['session telemetry flush', 'browser went offline', 'release changed, delta baselines reset'].includes(log.message)
			? log.message : error ? 'Browser error' : 'Browser log';
		const scrubbed = scrubClassroomProperties({ properties: log });
		if (!scrubbed) return false;
		for (const key of Object.keys(log)) delete log[key];
		Object.assign(log, scrubbed.properties);
		log.message = message;
		if (error) log.error = error;
		if (log.usr) log.usr = log.usr.id ? { id: log.usr.id } : {};
		return true;
	} catch { return false; }
}

// Propagate trace headers to our own origin only. A cross-origin endpoint
// would have to allow the x-datadog-* and traceparent headers explicitly, and
// a preflight it does not allow fails the request outright - correlation is
// not worth breaking an API call for. In the shipped configuration PocketBase
// is served from this origin under /hcgi/platform, so it is covered.
function isSameOriginUrl(url) {
	if (typeof url !== 'string') return false;
	try {
		const parsed = new URL(url, window.location.origin);
		return parsed.origin === window.location.origin && telemetryEndpoint(parsed.href) !== null;
	} catch { return false; }
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
	if ((rumInitialized && logsInitialized) || !APPLICATION_ID || !CLIENT_TOKEN || typeof window === 'undefined' || import.meta.env?.MODE === 'test') return;

	let env, version, sessionSampleRate;
	try {
		env = resolveEnvironment();
		version = resolveRelease();
		sessionSampleRate = resolveSampleRate('VITE_DD_SESSION_SAMPLE_RATE', BROWSER_TELEMETRY.sessionSampleRate);
	} catch { return; }

	if (!rumInitialized) try {
		const existing = datadogRum.getInitConfiguration();
		if (!existing) datadogRum.init({
			applicationId: APPLICATION_ID,
			clientToken: CLIENT_TOKEN,
			site: SITE,
			service: SERVICE,
			env,
			version,
			sessionSampleRate,
			sessionReplaySampleRate: resolveSampleRate('VITE_DD_REPLAY_SAMPLE_RATE', BROWSER_TELEMETRY.sessionReplaySampleRate),
			traceSampleRate: resolveSampleRate('VITE_DD_TRACE_SAMPLE_RATE', BROWSER_TELEMETRY.traceSampleRate),
			trackUserInteractions: true,
			trackResources: true,
			trackLongTasks: true,
			trackBfcacheViews: true,
			defaultPrivacyLevel: 'mask',
			enablePrivacyForActionName: true,
			// Auth owns identity; do not restore a previous release's profile fields.
			storeContextsAcrossPages: false,
			allowedTracingUrls: [{ match: isSameOriginUrl, propagatorTypes: ['tracecontext', 'datadog'] }],
			beforeSend: beforeSendRumEvent,
		});
		const configured = datadogRum.getInitConfiguration();
		rumInitialized = configured?.applicationId === APPLICATION_ID && configured?.clientToken === CLIENT_TOKEN;
	} catch { /* Logs must still initialize if RUM is blocked. */ }

	if (!logsInitialized) try {
		const existing = datadogLogs.getInitConfiguration();
		if (!existing) datadogLogs.init({
			clientToken: CLIENT_TOKEN,
			site: SITE,
			service: SERVICE,
			env,
			version,
			sessionSampleRate,
			forwardErrorsToLogs: true,
			// Browser-enforced problems that never reach application code.
			forwardReports: ['csp_violation', 'intervention', 'deprecation'],
			storeContextsAcrossPages: false,
			beforeSend: beforeSendLog,
		});
		logsInitialized = datadogLogs.getInitConfiguration()?.clientToken === CLIENT_TOKEN;
	} catch { /* RUM remains usable without browser logs. */ }

	if (rumInitialized || logsInitialized) try { enableReporting(); } catch { /* Fail soft. */ }
}

/**
 * Attaches the signed-in PocketBase user to the current RUM session.
 *
 * @param {{ id: string }} user PocketBase auth record; only its ID leaves the browser.
 * @returns {void}
 */
export function identifyRumUser(user) {
	if (typeof user?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(user.id)) return;
	if (rumInitialized) try { datadogRum.setUser({ id: user.id }); } catch { /* Identity cannot block auth. */ }
	if (logsInitialized) try { datadogLogs.setUser({ id: user.id }); } catch { /* Independent sink. */ }
}

/**
 * Clears the RUM user on sign-out.
 *
 * @returns {void}
 */
export function clearRumUser() {
	if (rumInitialized) try { datadogRum.clearUser(); } catch { /* Sign-out still succeeds. */ }
	if (logsInitialized) try { datadogLogs.clearUser(); } catch { /* Independent sink. */ }
}
