// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/context.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     none
// EnumType:    Adapter
// EnumEdges:   CONSUMES import.meta.env; PRODUCES datadog.rum.global_context
// Intent:      Resolve the environment, release and device facets that every
//              telemetry event is tagged with, in one place.
// ───────────────────────────────────────────────────────────────

export const PRODUCTION_HOSTS = ['buildanddo.tech', 'buildanddo.com'];

// scripts/deploy/ship.py serves staging from staging.buildanddo.com, a
// subdomain of a production apex - so non-production subdomains are matched
// before the apex check, or every staging session would be tagged production.
const NON_PRODUCTION_PREFIXES = ['staging.', 'preview.', 'dev.', 'test.'];

const PREVIEW_HOST_FRAGMENTS = ['app-preview.com', 'app-preview.io', 'pages.dev'];

/**
 * Resolves the Datadog environment tag.
 *
 * An explicit `VITE_DD_ENV` wins. Otherwise the hostname decides, so a
 * production bundle served from a staging or preview URL is not mixed into
 * production dashboards.
 *
 * @returns {string} One of `production`, `staging`, `preview` or `development`.
 */
export function resolveEnvironment() {
	const explicit = import.meta.env.VITE_DD_ENV;
	if (explicit) return explicit;

	const hostname = typeof window === 'undefined' ? '' : window.location.hostname;

	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || !hostname) {
		return 'development';
	}

	if (NON_PRODUCTION_PREFIXES.some((prefix) => hostname.startsWith(prefix))) {
		return 'staging';
	}

	if (PRODUCTION_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
		return 'production';
	}

	if (PREVIEW_HOST_FRAGMENTS.some((fragment) => hostname.endsWith(fragment))) {
		return 'preview';
	}

	return 'staging';
}

/**
 * Resolves the release identifier used for version tagging and delta baselines.
 *
 * @returns {string} Release version, or `unversioned` when the build did not supply one.
 */
export function resolveRelease() {
	return import.meta.env.VITE_DD_VERSION || import.meta.env.VITE_BUILD_SHA || 'unversioned';
}

/**
 * Reads a percentage sample rate from the environment.
 *
 * @param {string} name Variable name, for example `VITE_DD_SESSION_SAMPLE_RATE`.
 * @param {number} fallback Value used when unset or out of range.
 * @returns {number} Sample rate between 0 and 100.
 */
export function resolveSampleRate(name, fallback) {
	const parsed = Number.parseFloat(import.meta.env[name]);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return fallback;
	return parsed;
}

/**
 * Describes the device, network and display facets of the current session.
 *
 * Every field is optional at runtime: the Network Information and Device
 * Memory APIs are Chromium-only, and missing values are omitted rather than
 * reported as nulls.
 *
 * @returns {object} Flat attribute bag for the RUM global context.
 */
export function describeRuntime() {
	if (typeof window === 'undefined') return {};

	const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
	const runtime = {
		viewport_width: window.innerWidth,
		viewport_height: window.innerHeight,
		screen_width: window.screen ? window.screen.width : undefined,
		screen_height: window.screen ? window.screen.height : undefined,
		device_pixel_ratio: window.devicePixelRatio,
		language: navigator.language,
		languages_count: Array.isArray(navigator.languages) ? navigator.languages.length : undefined,
		cpu_cores: navigator.hardwareConcurrency,
		device_memory_gb: navigator.deviceMemory,
		touch_points: navigator.maxTouchPoints,
		online: navigator.onLine,
		embedded: window.self !== window.top,
		standalone: matchMediaFlag('(display-mode: standalone)'),
		prefers_reduced_motion: matchMediaFlag('(prefers-reduced-motion: reduce)'),
		prefers_dark: matchMediaFlag('(prefers-color-scheme: dark)'),
		timezone: resolveTimezone(),
		referrer_host: resolveReferrerHost(),
	};

	if (connection) {
		runtime.connection_type = connection.effectiveType;
		runtime.downlink_mbps = connection.downlink;
		runtime.rtt_ms = connection.rtt;
		runtime.save_data = connection.saveData;
	}

	return stripUndefined(runtime);
}

/**
 * Reports whether the page was restored from the back/forward cache or
 * reloaded, which changes how load timings should be read.
 *
 * @returns {string} Navigation type reported by the Navigation Timing API.
 */
export function navigationType() {
	if (typeof performance === 'undefined' || !performance.getEntriesByType) return 'unknown';
	const [entry] = performance.getEntriesByType('navigation');
	return entry && entry.type ? entry.type : 'unknown';
}

function matchMediaFlag(query) {
	try {
		return window.matchMedia ? window.matchMedia(query).matches : undefined;
	} catch {
		return undefined;
	}
}

function resolveTimezone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return undefined;
	}
}

function resolveReferrerHost() {
	try {
		return document.referrer ? new URL(document.referrer).hostname : undefined;
	} catch {
		return undefined;
	}
}

function stripUndefined(source) {
	const result = {};
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined) result[key] = value;
	}
	return result;
}
