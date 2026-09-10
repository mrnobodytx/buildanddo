#!/usr/bin/env node
// ─── CGRF Header ───────────────────────────────────────────────
// File:        scripts/dev-seed.mjs
// Stage:       06_PLAN
// SRS:         SRS-BUILDANDDO-DEVENV-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     docker-compose.yml, apps/pocketbase/pb_migrations
// EnumType:    Workflow
// EnumEdges:   CONSUMES http://localhost:8090; PRODUCES demo workspace records
// Intent:      Give a local contributor a signed-in-looking workspace to click
//              through, created over the public API under the demo user's own
//              identity rather than written into the database by hand.
// ───────────────────────────────────────────────────────────────
//
// Usage:
//   node scripts/dev-seed.mjs
//   PB_URL=http://localhost:8090 node scripts/dev-seed.mjs
//   ./scripts/dev-setup.sh --seed
//
// Idempotent: every record is keyed on a stable title/name and skipped if it
// already exists, so re-running after a schema change adds only what is new.
//
// Demo data only. It writes to whatever PB_URL points at, so it refuses to run
// against anything that is not a local address.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Reads KEY=VALUE lines from .env without adding a dotenv dependency. */
function readDotEnv() {
	const path = join(REPO_ROOT, '.env');
	if (!existsSync(path)) return {};
	const out = {};
	for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#') || !line.includes('=')) continue;
		const index = line.indexOf('=');
		out[line.slice(0, index).trim()] = line.slice(index + 1).trim();
	}
	return out;
}

const fileEnv = readDotEnv();
const env = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;

const PB_URL = (env('PB_URL', 'http://localhost:8090')).replace(/\/+$/, '');
const SUPERUSER_EMAIL = env('PB_SUPERUSER_EMAIL', 'admin@buildanddo.local');
const SUPERUSER_PASSWORD = env('PB_SUPERUSER_PASSWORD', 'localdev-change-me');
const DEMO_EMAIL = env('DEMO_USER_EMAIL', 'demo@buildanddo.local');
const DEMO_PASSWORD = env('DEMO_USER_PASSWORD', 'demo-localdev-1234');

// A seeder that can point at production is a loaded gun. Local hosts only, and
// the loopback check is on the hostname, not the string, so
// http://localhost.evil.example cannot slip through.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'pocketbase', 'host.docker.internal']);
const parsedUrl = new URL(PB_URL);
if (!LOCAL_HOSTS.has(parsedUrl.hostname)) {
	console.error(`refusing to seed a non-local PocketBase: ${PB_URL}`);
	console.error(`allowed hosts: ${[...LOCAL_HOSTS].join(', ')}`);
	process.exit(2);
}

let created = 0;
let skipped = 0;

class SeedError extends Error {
	constructor(message, status, body) {
		super(message);
		this.name = 'SeedError';
		this.status = status;
		this.body = body;
	}
}

async function api(path, { method = 'GET', token = null, body = null } = {}) {
	const headers = { 'Content-Type': 'application/json' };
	if (token) headers.Authorization = token;
	const response = await fetch(`${PB_URL}${path}`, {
		method,
		headers,
		body: body === null ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	let parsed = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = { raw: text };
	}
	if (!response.ok) {
		throw new SeedError(`${method} ${path} -> ${response.status}`, response.status, parsed);
	}
	return parsed;
}

async function authenticate(collection, identity, password) {
	const result = await api(`/api/collections/${collection}/auth-with-password`, {
		method: 'POST',
		body: { identity, password },
	});
	return { token: result.token, record: result.record };
}

/** Creates a record only when the filter matches nothing. */
async function ensure(collection, filter, payload, token, label) {
	const query = new URLSearchParams({ filter, perPage: '1' }).toString();
	const existing = await api(`/api/collections/${collection}/records?${query}`, { token });
	if (existing.items && existing.items.length > 0) {
		skipped += 1;
		console.log(`  = ${label}`);
		return existing.items[0];
	}
	const record = await api(`/api/collections/${collection}/records`, {
		method: 'POST',
		token,
		body: payload,
	});
	created += 1;
	console.log(`  + ${label}`);
	return record;
}

/** PocketBase filter string escaping: single quotes are the only delimiter. */
const quote = (value) => `'${String(value).replace(/'/g, "\\'")}'`;

async function main() {
	console.log(`Seeding demo data into ${PB_URL}`);

	const health = await api('/api/health');
	if (health?.code !== 200) {
		throw new SeedError('PocketBase /api/health did not report 200', health?.code ?? 0, health);
	}

	const admin = await authenticate('_superusers', SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
	console.log('  authenticated as superuser');

	// ---- demo user ---------------------------------------------------------
	// Created with the superuser token so it can be marked verified; every
	// record below is then created by the demo user itself, which is what the
	// owner-scoped API rules actually require.
	console.log('users');
	await ensure(
		'users',
		`email = ${quote(DEMO_EMAIL)}`,
		{
			email: DEMO_EMAIL,
			password: DEMO_PASSWORD,
			passwordConfirm: DEMO_PASSWORD,
			emailVisibility: false,
			verified: true,
			name: 'Demo Contributor',
		},
		admin.token,
		`user ${DEMO_EMAIL}`,
	);

	const demo = await authenticate('users', DEMO_EMAIL, DEMO_PASSWORD);
	const owner = demo.record.id;
	const token = demo.token;

	// ---- domain + workspace -------------------------------------------------
	console.log('workspace');
	const domain = await ensure(
		'domains',
		`domain = ${quote('demo.buildanddo.local')} && owner = ${quote(owner)}`,
		{ domain: 'demo.buildanddo.local', status: 'verified', has_website: true, owner },
		token,
		'domain demo.buildanddo.local',
	);

	const workspace = await ensure(
		'workspaces',
		`name = ${quote('Demo Workspace')} && owner = ${quote(owner)}`,
		{ name: 'Demo Workspace', domain: domain.id, owner },
		token,
		'workspace Demo Workspace',
	);

	const ws = workspace.id;
	const scoped = (title) => `title = ${quote(title)} && workspace = ${quote(ws)}`;
	const scopedName = (name) => `name = ${quote(name)} && workspace = ${quote(ws)}`;

	// ---- signals (facts, inferences and user input, kept distinguishable) ---
	console.log('signals');
	const signals = [
		{
			title: 'Local stack reachable',
			description: 'PocketBase answered /api/health with 200 from the seed script.',
			source: 'scripts/dev-seed.mjs',
			type: 'fact',
			confidence: 100,
		},
		{
			title: 'Contributor is evaluating the workspace model',
			description: 'Inferred from a fresh local install with demo seeding enabled.',
			source: 'local-inference',
			type: 'inference',
			confidence: 55,
		},
		{
			title: 'Wants a bounded first mission',
			description: 'Stated intent of the demo scenario: one small verifiable step.',
			source: 'demo-scenario',
			type: 'user',
			confidence: 80,
		},
	];
	for (const signal of signals) {
		await ensure('signals', scoped(signal.title), { ...signal, workspace: ws, owner }, token, `signal ${signal.title}`);
	}

	// ---- missions and their evidence ---------------------------------------
	console.log('missions');
	const missionSeeds = [
		{
			title: 'Verify the local environment end to end',
			description: 'Bring up web plus PocketBase, sign in, and confirm the workspace loads real records.',
			status: 'verified',
			evidence: [
				{ content: 'Both containers reported healthy and /api/health returned 200.', type: 'observed', source: 'docker compose' },
				{ content: 'Seeded records were created through the public API as the demo user.', type: 'verified', source: 'scripts/dev-seed.mjs' },
			],
		},
		{
			title: 'Draft the first contribution',
			description: 'Pick one bounded change, write down what evidence would prove it works.',
			status: 'proposed',
			evidence: [
				{ content: 'Scope not agreed yet; nothing has been attempted.', type: 'decided', source: 'demo-scenario' },
			],
		},
	];
	for (const mission of missionSeeds) {
		const record = await ensure(
			'missions',
			scoped(mission.title),
			{ title: mission.title, description: mission.description, status: mission.status, workspace: ws, owner },
			token,
			`mission ${mission.title}`,
		);
		for (const item of mission.evidence) {
			await ensure(
				'evidence',
				`content = ${quote(item.content)} && workspace = ${quote(ws)}`,
				{ ...item, mission: record.id, workspace: ws, owner },
				token,
				`evidence ${item.type}`,
			);
		}
	}

	// ---- workflows and operations ------------------------------------------
	console.log('workflows');
	await ensure(
		'workflows',
		scopedName('Daily local check'),
		{
			name: 'Daily local check',
			description: 'Bring the stack up, run lint and the boundary scan, review open missions.',
			status: 'draft',
			workspace: ws,
			owner,
		},
		token,
		'workflow Daily local check',
	);

	console.log('services');
	const serviceSeeds = [
		{
			name: 'PocketBase (local)',
			purpose: 'Application database and auth for local development.',
			data_boundary: 'Local container volume only; never production data.',
			status: 'connected',
			next_action: 'None - running from docker compose.',
		},
		{
			name: 'Datadog RUM',
			purpose: 'Browser telemetry for deployed environments.',
			data_boundary: 'Disabled locally: no client token is configured.',
			status: 'not_connected',
			next_action: 'Leave unset unless you are debugging RUM itself.',
		},
	];
	for (const service of serviceSeeds) {
		await ensure('services', scopedName(service.name), { ...service, workspace: ws, owner }, token, `service ${service.name}`);
	}

	// ---- roadmap ------------------------------------------------------------
	console.log('roadmap_items');
	await ensure(
		'roadmap_items',
		scoped('Run the stack locally'),
		{
			title: 'Run the stack locally',
			description: 'Demo roadmap row so the roadmap surface is not empty on a fresh install.',
			status: 'verified',
			owner_role: 'contributor',
			evidence_ref: 'docs/api/README.md',
			next_action: 'Open http://localhost:3000 and sign in as the demo user.',
			workspace: ws,
			owner,
		},
		token,
		'roadmap item Run the stack locally',
	);

	console.log(`\nSeed complete: ${created} created, ${skipped} already present.`);
	console.log(`Sign in at http://localhost:3000 with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((error) => {
	if (error instanceof SeedError) {
		console.error(`\nseed failed: ${error.message}`);
		if (error.body) console.error(JSON.stringify(error.body, null, 2));
		if (error.status === 400 || error.status === 401) {
			console.error('\nCheck PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD in .env - they must match');
			console.error('the values the pocketbase-migrate service used when it created the superuser.');
			console.error('If you changed them after first boot, run: docker compose down -v && ./scripts/dev-setup.sh');
		}
	} else if (error instanceof TypeError) {
		console.error(`\nseed failed: cannot reach ${PB_URL} - is the stack running? (docker compose ps)`);
	} else {
		console.error(`\nseed failed: ${error.message}`);
	}
	process.exit(1);
});
