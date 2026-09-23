// CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/edge/src/public-api.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-002
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/public-api.pb.js
// EnumType:    Service
// EnumEdges:   PROXIES /api/v1/public/* TO /hcgi/platform/api/v1/public/*; CALLED_BY apps/edge/src/index.js
// DAG Node:    none
// Intent:      Put the voice agent's tool URLs in front of the backend routes that answer them, and never let the
//              site shell answer in their place.
// ───────────────────────────────────────────────────────────────

/**
 * The public voice agent's tools call https://buildanddo.com/api/v1/public/... . The backend that
 * answers them is PocketBase, mounted at /hcgi/platform. Before this module every one of those URLs
 * fell through to the origin's single-page-app fallback and came back `200 text/html` - a web page a
 * status check reads as success. This forwards the path to the backend, preserving the method, the
 * query string, the body and every header (the x-conversation-id, x-trace-id and x-campaign-id the
 * tools send, the x-buddi-tool-secret the write tools need, and any Authorization), so the tool URLs
 * stay exactly as they were designed.
 *
 * Three refusals happen here, without contacting the origin:
 *   - a path segment outside [A-Za-z0-9_-] (that covers dots, percent-escapes and empty segments,
 *     so an encoded traversal is refused here rather than decoded by nginx behind us);
 *   - a method other than GET or POST;
 *   - and, after the fact, any answer that is not JSON. If the backend route is missing, the origin
 *     serves the HTML shell with a 200, and that must reach the agent as a failure, not as data.
 *
 * Only paths under /api/v1/public/ are touched. /api/webhooks/* in particular is left alone: that path
 * is reserved for the private control plane's post-call receiver.
 */

const PREFIX = '/api/v1/public/';
const ORIGIN_PREFIX = '/hcgi/platform/api/v1/public/';
const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_SEGMENTS = 4;
const METHODS = ['GET', 'POST'];

function refuse(status, state, reason, headers = {}) {
	return Response.json(
		{ schema: 'buildanddo.public-api/v1', authority: 'A0', source: 'buildanddo-edge', as_of: new Date().toISOString(), state, reason },
		{ status, headers: { 'Cache-Control': 'no-store', ...headers } },
	);
}

/** @returns {Promise<Response|null>} The proxied answer, a refusal, or null when the path is not ours. */
export async function handlePublicApi(request) {
	const url = new URL(request.url);
	if (!url.pathname.startsWith(PREFIX)) return null;
	const segments = url.pathname.slice(PREFIX.length).split('/');
	if (segments.length > MAX_SEGMENTS || !segments.every((segment) => SEGMENT.test(segment))) {
		return refuse(404, 'UNKNOWN', 'No public API route has that path.');
	}
	if (!METHODS.includes(request.method)) {
		return refuse(405, 'INVALID', 'Use GET or POST.', { Allow: METHODS.join(', ') });
	}
	const target = new URL(ORIGIN_PREFIX + segments.join('/') + url.search, url.origin);
	let response;
	try {
		// new Request(target, request) carries over the method, the headers and the body stream.
		response = await fetch(new Request(target, request));
	} catch {
		return refuse(502, 'UNAVAILABLE', 'The platform backend could not be reached.');
	}
	const contentType = response.headers.get('Content-Type') || '';
	if (!contentType.includes('application/json')) {
		return refuse(502, 'UNAVAILABLE', 'The platform backend did not answer with JSON.');
	}
	return response;
}

// Exported for tests. Not part of the Worker contract.
export { PREFIX, ORIGIN_PREFIX };
