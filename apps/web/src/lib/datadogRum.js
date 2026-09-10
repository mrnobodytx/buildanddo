// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/datadogRum.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/telemetry.js, apps/web/src/main.jsx
// EnumType:    Adapter
// EnumEdges:   PRODUCES datadog.rum.session; CONSUMES import.meta.env
// Intent:      Report real user monitoring and browser logs for buildanddo.tech
//              into the Citadel Nexus Datadog org (us5) without blocking render.
// ───────────────────────────────────────────────────────────────

import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';

// VITE_DD_APPLICATION_ID and VITE_DD_CLIENT_TOKEN are client-side public
// identifiers (the RUM client token is scoped to intake only and carries no
// read access), written into apps/web/.env before every build by
// scripts/deploy/ship.py. No credentials = no RUM; initialisation must never
// throw or block rendering.
const APPLICATION_ID = import.meta.env.VITE_DD_APPLICATION_ID;
const CLIENT_TOKEN = import.meta.env.VITE_DD_CLIENT_TOKEN;

const SITE = 'us5.datadoghq.com';
const SERVICE = 'buildanddo-web';

const PRODUCTION_HOSTS = ['buildanddo.tech', 'buildanddo.com'];

let initialized = false;

/**
 * Resolves the Datadog environment tag.
 *
 * Vite's build mode is authoritative when it is explicit; otherwise the
 * hostname decides, so a production bundle served from a preview URL is not
 * mixed into production dashboards.
 *
 * @returns {string} One of `production`, `staging` or `development`.
 */
export function resolveEnvironment() {
	const explicit = import.meta.env.VITE_DD_ENV;
	if (explicit) return explicit;

	const hostname = typeof window === 'undefined' ? '' : window.location.hostname;

	if (PRODUCTION_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
		return 'production';
	}

	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || !hostname) {
		return 'development';
	}

	return 'staging';
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
	const version = import.meta.env.VITE_DD_VERSION || undefined;

	datadogRum.init({
		applicationId: APPLICATION_ID,
		clientToken: CLIENT_TOKEN,
		site: SITE,
		service: SERVICE,
		env,
		version,
		sessionSampleRate: 100,
		sessionReplaySampleRate: 20,
		trackUserInteractions: true,
		trackResources: true,
		trackLongTasks: true,
		defaultPrivacyLevel: 'mask-user-input',
	});

	datadogLogs.init({
		clientToken: CLIENT_TOKEN,
		site: SITE,
		service: SERVICE,
		env,
		version,
		sessionSampleRate: 100,
		forwardErrorsToLogs: true,
	});

	initialized = true;
}

/**
 * Attaches the signed-in PocketBase user to the current RUM session.
 *
 * @param {{ id: string, email?: string, name?: string }} user PocketBase auth record.
 * @returns {void}
 */
export function identifyRumUser(user) {
	if (!initialized || !user?.id) return;
	datadogRum.setUser({ id: user.id, email: user.email, name: user.name });
}

/**
 * Clears the RUM user on sign-out.
 *
 * @returns {void}
 */
export function clearRumUser() {
	if (!initialized) return;
	datadogRum.clearUser();
}
