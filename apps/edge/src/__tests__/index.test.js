// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/edge/src/__tests__/index.test.js
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/edge/src/index.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/edge/src/index.js
// DAG Node:    none
// Intent:      Fail if a telemetry origin the site actually calls is missing from the CSP.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi, afterEach } from 'vitest';

import worker, { ALLOW_DATADOG, ALLOW_POSTHOG, contentSecurityPolicy, ENFORCE } from '../index.js';

/** Parse a CSP header into { directive: [source, ...] }. */
const directives = (policy) =>
	Object.fromEntries(
		policy.split(';').map((part) => {
			const [name, ...sources] = part.trim().split(/\s+/);
			return [name, sources];
		}),
	);

const htmlResponse = (headers = {}) =>
	new Response('<!doctype html><html></html>', {
		headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
	});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('content security policy', () => {
	// The defect this file exists to prevent: the policy was correct for a site whose
	// telemetry was dead, and stayed unchanged when the telemetry was switched on. Every
	// origin the app actually posts to has to appear, or enforcing the policy silently
	// severs the data.
	it.each([
		['posthog ingest', 'https://us.i.posthog.com'],
		['posthog assets', 'https://us-assets.i.posthog.com'],
		['datadog rum intake', 'https://browser-intake-us5-datadoghq.com'],
	])('allows connect-src to %s', (_label, origin) => {
		expect(directives(contentSecurityPolicy())['connect-src']).toContain(origin);
	});

	it('allows posthog assets in script-src, because posthog-js lazy-loads modules', () => {
		expect(directives(contentSecurityPolicy())['script-src']).toContain(
			'https://us-assets.i.posthog.com',
		);
	});

	it('does not put the datadog intake in script-src — the SDK is bundled', () => {
		expect(directives(contentSecurityPolicy())['script-src']).not.toContain(ALLOW_DATADOG[0]);
	});

	it('keeps the restrictive directives that are not about telemetry', () => {
		const parsed = directives(contentSecurityPolicy());
		expect(parsed['object-src']).toEqual(["'none'"]);
		expect(parsed['frame-ancestors']).toEqual(["'none'"]);
		expect(parsed['base-uri']).toEqual(["'self'"]);
		expect(parsed['default-src']).toEqual(["'self'"]);
	});

	it('lists every declared allow-list origin somewhere in the policy', () => {
		const policy = contentSecurityPolicy();
		for (const origin of [...ALLOW_POSTHOG, ...ALLOW_DATADOG]) {
			expect(policy).toContain(origin);
		}
	});
});

describe('header application', () => {
	it('sets the report-only header while ENFORCE is false', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => htmlResponse()));
		const response = await worker.fetch(new Request('https://buildanddo.com/'));
		const expected = ENFORCE
			? 'Content-Security-Policy'
			: 'Content-Security-Policy-Report-Only';
		expect(response.headers.get(expected)).toContain('connect-src');
		// Report-only must NOT also emit the enforcing header, or it blocks by accident.
		if (!ENFORCE) expect(response.headers.get('Content-Security-Policy')).toBeNull();
	});

	it('leaves non-HTML responses completely untouched', async () => {
		const asset = new Response('body{}', { headers: { 'Content-Type': 'text/css' } });
		vi.stubGlobal('fetch', vi.fn(async () => asset));
		const response = await worker.fetch(new Request('https://buildanddo.com/a.css'));
		expect(response).toBe(asset);
		expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
	});

	it('does not override an origin that already sets an enforcing policy', async () => {
		vi.stubGlobal('fetch', vi.fn(async () =>
			htmlResponse({ 'Content-Security-Policy': "default-src 'none'" }),
		));
		const response = await worker.fetch(new Request('https://buildanddo.com/'));
		expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'");
		expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
	});

	it('REPLACES an origin report-only policy — the asymmetry that made two live policies', async () => {
		// nginx sends Content-Security-Policy-Report-Only; the guard checks for the ENFORCING
		// name, so it does not see it and overwrites. Pinning this means the next person to
		// read the header diff between apex and staging finds it documented, not surprising.
		vi.stubGlobal('fetch', vi.fn(async () =>
			htmlResponse({ 'Content-Security-Policy-Report-Only': "default-src 'none'" }),
		));
		const response = await worker.fetch(new Request('https://buildanddo.com/'));
		expect(response.headers.get('Content-Security-Policy-Report-Only')).toContain(
			'https://browser-intake-us5-datadoghq.com',
		);
	});

	it('adds referrer and permissions policies without clobbering existing ones', async () => {
		vi.stubGlobal('fetch', vi.fn(async () =>
			htmlResponse({ 'Referrer-Policy': 'no-referrer' }),
		));
		const response = await worker.fetch(new Request('https://buildanddo.com/'));
		expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
		expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
	});

	it('preserves status and body', async () => {
		vi.stubGlobal('fetch', vi.fn(async () =>
			new Response('<!doctype html>gone', {
				status: 404,
				statusText: 'Not Found',
				headers: { 'Content-Type': 'text/html' },
			}),
		));
		const response = await worker.fetch(new Request('https://buildanddo.com/missing'));
		expect(response.status).toBe(404);
		await expect(response.text()).resolves.toContain('gone');
	});
});
