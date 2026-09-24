// CGRF: SRS=SRS-BUILDANDDO-UPGRADE-001,SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/edge/src/index.js
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-BUDDI-002
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/edge/src/graph.js, apps/edge/src/public-api.js
// EnumType:    Service
// EnumEdges:   FRONTS apps/web; PROXIES /api/v1/public/* VIA apps/edge/src/public-api.js
// DAG Node:    none
// Intent:      Set the response security headers for buildanddo.com and www at the edge.
// ───────────────────────────────────────────────────────────────

/**
 * The Cloudflare Worker that fronts buildanddo.com and www.buildanddo.com.
 *
 * WHY THIS FILE EXISTS AT ALL. Until 2026-09-22 this worker had no source in any
 * repository: no wrangler config, no `ALLOW_POSTHOG` anywhere in the tree. It was deployed
 * from the dashboard on 2026-09-13 and the only copy of it was the built bundle living in
 * Cloudflare. That is a single edit away from being unrecoverable, and it hides the edge
 * from anyone reading the repo — the visible `buildanddo` Worker has a failing build, no
 * routes and zero invocations, so the obvious conclusion from the dashboard is that the
 * apex has no edge logic. It does. This one.
 *
 * This file was reconstructed from the deployed bundle (esbuild output, `__name` wrappers
 * and sourcemap comment stripped) and is byte-equivalent in behaviour. Verify a
 * reconstruction against production before trusting it:
 *
 *     curl -sSI https://buildanddo.com/ | grep -i content-security-policy
 *
 * DEPLOY: `npm run deploy` from apps/edge (tools/deploy.mjs), with CLOUDFLARE_ACCOUNT_ID set.
 * Needs a Cloudflare API token with Workers Scripts Write and D1 read — the previous one
 * (BND_WORKER_ONE) was rolled. No Cloudflare id is stored in this repository.
 */

import { handleGraphMatch } from './graph.js';
import { handlePublicApi } from './public-api.js';

const ALLOW_POSTHOG = ['https://us.i.posthog.com', 'https://us-assets.i.posthog.com'];

// Datadog RUM posts session, view, action and error events here, plus browser logs on a
// sibling path. It is CONNECT-ONLY on purpose: unlike posthog-js, which lazy-loads
// web-vitals / surveys / dead-clicks as separate scripts from us-assets, the Datadog SDK
// is bundled into the app, so script-src does not need it.
//
// Measured 2026-09-22: shipping the RUM credentials produced 15 `csp_violation` events in
// the first batch, every one naming this origin. The policy was not wrong when it was
// written — its own comment says it was "built from measured usage", and at that time
// PostHog and Datadog were both silently disabled by a missing build key, so the
// measurement recorded a site whose telemetry was dead.
const ALLOW_DATADOG = ['https://browser-intake-us5-datadoghq.com'];

const ALLOW_FONTS_CSS = ['https://fonts.googleapis.com'];
const ALLOW_FONTS_FILE = ['https://fonts.gstatic.com'];

// Report-Only until the violation stream is clean. Flipping this to true starts BLOCKING,
// so check the RUM error stream for `csp_violation` first — that is the signal this exists
// to collect, and it is the reason the Datadog origin above had to be added before anyone
// could honestly enforce.
const ENFORCE = false;

function contentSecurityPolicy() {
	const join = (...groups) => groups.flat().join(' ');
	return [
		"default-src 'self'",
		// The page carries 5 inline <script> blocks (measured). Removing 'unsafe-inline'
		// requires a nonce pipeline in the site build; until that exists, claiming to have
		// removed it would be a lie the header tells on every request.
		`script-src 'self' 'unsafe-inline' ${join(ALLOW_POSTHOG)}`,
		`style-src 'self' 'unsafe-inline' ${join(ALLOW_FONTS_CSS)}`,
		`font-src 'self' data: ${join(ALLOW_FONTS_FILE)}`,
		`connect-src 'self' ${join(ALLOW_POSTHOG, ALLOW_DATADOG)}`,
		"img-src 'self' data: blob: https:",
		"media-src 'self' blob: https:",
		"worker-src 'self' blob:",
		"base-uri 'self'",
		"object-src 'none'",
		"frame-ancestors 'none'",
	].join('; ');
}

export default {
	async fetch(request, env) {
		// One bounded route this worker OWNS, answered before anything is fetched from the origin.
		// It returns null for every other request, so the header path below is unchanged — and a
		// graph read never pays for a round trip to an origin that would 404 it anyway.
		const graph = await handleGraphMatch(request, env);
		if (graph) return graph;

		// The voice agent's tool URLs, forwarded to the backend routes that answer them. Also null
		// for everything else - /api/webhooks/* included - and its answers are JSON, which the
		// document-only header path below would leave untouched anyway.
		const publicApi = await handlePublicApi(request);
		if (publicApi) return publicApi;

		const response = await fetch(request);
		const contentType = response.headers.get('Content-Type') || '';
		// Only documents carry a CSP. Returning assets untouched also keeps this worker off
		// the hot path for the hashed bundle, which is the bulk of the requests.
		if (!contentType.includes('text/html')) return response;

		const headers = new Headers(response.headers);
		const headerName = ENFORCE
			? 'Content-Security-Policy'
			: 'Content-Security-Policy-Report-Only';
		// Each header is only set if ABSENT, so an origin that has its own opinion keeps it.
		// Note the asymmetry that caused real confusion: this checks for the ENFORCING header
		// while writing the report-only one, so nginx's `Content-Security-Policy-Report-Only`
		// does not count as present and is replaced. That is why one origin config yielded two
		// different live policies — staging has no worker route and keeps nginx's, apex and www
		// get this one.
		if (!headers.get('Content-Security-Policy')) {
			headers.set(headerName, contentSecurityPolicy());
		}
		if (!headers.get('Referrer-Policy')) {
			headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
		}
		if (!headers.get('Permissions-Policy')) {
			headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
		}
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	},
};

// Exported for tests. Not part of the Worker contract.
export { contentSecurityPolicy, ALLOW_POSTHOG, ALLOW_DATADOG, ENFORCE };
