// CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/edge/src/__tests__/public-api.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-002
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/edge/src/public-api.js, apps/edge/src/index.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/edge/src/public-api.js; VALIDATES apps/edge/src/index.js
// DAG Node:    none
// Intent:      Fail if a tool URL stops reaching its backend route intact, or if anything but JSON can answer it.
// ───────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from '../index.js';
import { handlePublicApi } from '../public-api.js';

const json = (body, init = {}) =>
	new Response(JSON.stringify(body), { status: 200, ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });

/** Stub the origin and keep every request the worker sends it. */
function origin(answer = () => json({ state: 'OK' })) {
	const seen = [];
	vi.stubGlobal('fetch', vi.fn(async (request) => {
		seen.push({ url: request.url, method: request.method, headers: new Headers(request.headers),
			body: ['GET', 'HEAD'].includes(request.method) ? '' : await request.text() });
		return answer(request);
	}));
	return seen;
}

const TOOL_HEADERS = {
	'x-conversation-id': 'conv_01abc',
	'x-trace-id': 'trace-42',
	'x-campaign-id': 'launch',
	'x-buddi-tool-secret': 'fixture-only-value',
	authorization: 'Bearer fixture',
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the public API proxy', () => {
	it('forwards a read to the backend path with its query and every tool header', async () => {
		const seen = origin();
		const response = await worker.fetch(new Request(
			'https://buildanddo.com/api/v1/public/challenges/demo?business_type=dental&limit=3', { headers: TOOL_HEADERS }));
		expect(response.status).toBe(200);
		expect(seen).toHaveLength(1);
		expect(seen[0].url).toBe('https://buildanddo.com/hcgi/platform/api/v1/public/challenges/demo?business_type=dental&limit=3');
		expect(seen[0].method).toBe('GET');
		for (const [name, value] of Object.entries(TOOL_HEADERS)) expect(seen[0].headers.get(name)).toBe(value);
	});

	it('forwards a write with its method and exact body, and returns the backend answer untouched', async () => {
		const receipt = json({ state: 'RECEIVED', receipt_id: 'abc123def456ghi' }, { status: 201 });
		const seen = origin(() => receipt);
		const body = JSON.stringify({ feedback_type: 'gap', summary: 'Café — naïve 🙂 text', rating: 4 });
		const response = await worker.fetch(new Request('https://www.buildanddo.com/api/v1/public/feedback', {
			method: 'POST', body, headers: { ...TOOL_HEADERS, 'Content-Type': 'application/json' } }));
		expect(response).toBe(receipt);
		expect(response.status).toBe(201);
		expect(seen[0]).toMatchObject({ method: 'POST', body, url: 'https://www.buildanddo.com/hcgi/platform/api/v1/public/feedback' });
		expect(seen[0].headers.get('content-type')).toBe('application/json');
		expect(seen[0].headers.get('x-buddi-tool-secret')).toBe('fixture-only-value');
	});

	it.each([
		['state with a path id', '/api/v1/public/challenges/release-with-evidence/state?mission_id=m1'],
		['replay', '/api/v1/public/replay/release-with-evidence'],
		['evidence', '/api/v1/public/evidence?challenge_id=x&evidence_type=claim'],
		['product context', '/api/v1/public/product-context?section=capabilities'],
		['handoff', '/api/v1/public/support/handoff'],
	])('maps %s one-to-one', async (_label, path) => {
		const seen = origin();
		await worker.fetch(new Request(`https://buildanddo.com${path}`));
		expect(seen[0].url).toBe(`https://buildanddo.com/hcgi/platform${path}`);
	});

	it('passes backend refusals through with their status and body', async () => {
		origin(() => json({ state: 'UNAUTHORIZED' }, { status: 401 }));
		const response = await worker.fetch(new Request('https://buildanddo.com/api/v1/public/feedback', { method: 'POST', body: '{}' }));
		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ state: 'UNAUTHORIZED' });
	});

	it('never lets the site shell answer an API path: HTML from the origin becomes a JSON 502', async () => {
		origin(() => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
		const response = await worker.fetch(new Request('https://buildanddo.com/api/v1/public/product-context'));
		expect(response.status).toBe(502);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
		await expect(response.json()).resolves.toMatchObject({ state: 'UNAVAILABLE', authority: 'A0' });
	});

	it('answers an unreachable origin with a JSON 502 instead of throwing', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
		const response = await worker.fetch(new Request('https://buildanddo.com/api/v1/public/evidence'));
		expect(response.status).toBe(502);
	});

	it.each([
		['an encoded slash', '/api/v1/public/challenges/..%2F..%2Fcollections%2Fusers%2Frecords/state'],
		['an encoded dot segment inside an id', '/api/v1/public/replay/%2e%2e%2fcollections'],
		['a dotted segment', '/api/v1/public/evidence.json'],
		['an empty segment', '/api/v1/public/challenges//state'],
		['a trailing slash', '/api/v1/public/feedback/'],
		['the bare prefix', '/api/v1/public/'],
		['too many segments', '/api/v1/public/a/b/c/d/e'],
	])('refuses %s without contacting the origin', async (_label, path) => {
		const seen = origin();
		const response = await worker.fetch(new Request(`https://buildanddo.com${path}`));
		expect(response.status).toBe(404);
		expect(seen).toHaveLength(0);
		await expect(response.json()).resolves.toMatchObject({ state: 'UNKNOWN' });
	});

	it('refuses methods the tools never use', async () => {
		const seen = origin();
		for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
			const response = await worker.fetch(new Request('https://buildanddo.com/api/v1/public/feedback', { method }));
			expect(response.status).toBe(405);
			expect(response.headers.get('Allow')).toBe('GET, POST');
		}
		expect(seen).toHaveLength(0);
	});

	it('leaves /api/webhooks/* alone for the post-call receiver it is reserved for', async () => {
		const receiver = new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });
		const seen = origin(() => receiver);
		const request = new Request('https://buildanddo.com/api/webhooks/elevenlabs/post-call', { method: 'POST', body: '{"type":"x"}' });
		expect(await handlePublicApi(request)).toBeNull();
		const response = await worker.fetch(new Request('https://buildanddo.com/api/webhooks/elevenlabs/post-call', { method: 'POST', body: '{}' }));
		expect(response).toBe(receiver);
		expect(seen[0].url).toBe('https://buildanddo.com/api/webhooks/elevenlabs/post-call');
	});

	it.each([
		'/api/v1/publicity',
		'/api/v1/public',
		'/api/graph/match',
		'/hcgi/platform/api/v1/public/feedback',
		'/app/missions',
	])('does not claim %s', async (path) => {
		expect(await handlePublicApi(new Request(`https://buildanddo.com${path}`))).toBeNull();
	});
});
