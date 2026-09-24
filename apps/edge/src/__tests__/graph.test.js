// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/edge/src/__tests__/graph.test.js
// Stage:       11_COMMIT
// SRS:         SRS-CN-ENTITY-CATALOGUE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// EnumType:    Test
// EnumEdges:   VALIDATES apps/edge/src/graph.js
// DAG Node:    none
// Intent:      Fail if a caller can read a gated graph without a signed principal.
// ───────────────────────────────────────────────────────────────

import { createHash, createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { compileAndQuery, entitled, handleGraphMatch, verifyPrincipal } from '../graph.js';

// A real SQLite behind a D1-shaped shim rather than a hand-written fake. A fake would answer
// whatever the test expected, including for SQL that is invalid — and the whole point of
// compileAndQuery is the SQL it generates.
function d1(db) {
	return {
		prepare(sql) {
			// D1 uses ?1/?2 numbered placeholders, bound in order, so positional ? is equivalent.
			const stmt = db.prepare(sql.replace(/\?\d+/g, '?'));
			let binds = [];
			return {
				bind(...args) {
					binds = args;
					return this;
				},
				first() {
					return stmt.get(...binds) ?? null;
				},
				all() {
					return { results: stmt.all(...binds) };
				},
			};
		},
	};
}

const SECRET = 'test-secret-not-a-real-key';
const PUBLIC_GRAPH = 'cni:graph:organization';
const GATED_GRAPH = 'cni:graph:organization.staffing';

/** term_id is content-derived in CSEG — a HASH, not a prefix. A hex prefix collided here:
 *  'cni:graph:organization' and 'cni:graph:organization.staffing' share their first 12 bytes,
 *  so the public and gated graphs were handed the same id and the fixture would not even load. */
const tid = (v) => createHash('sha256').update(v).digest('hex').slice(0, 24);

function fixture() {
	const db = new DatabaseSync(':memory:');
	db.exec(`
		CREATE TABLE terms (term_id TEXT PRIMARY KEY, value TEXT NOT NULL, kind TEXT NOT NULL,
			datatype TEXT, lang TEXT, canonical TEXT NOT NULL UNIQUE) WITHOUT ROWID;
		CREATE TABLE quads (s TEXT NOT NULL, p TEXT NOT NULL, o TEXT NOT NULL, g TEXT NOT NULL,
			source_ref TEXT, evidence_state TEXT NOT NULL DEFAULT 'OBSERVED', confidence REAL,
			observed_at REAL NOT NULL, expires_at REAL, PRIMARY KEY (s,p,o,g)) WITHOUT ROWID;
		CREATE TABLE graph_projection (graph_id TEXT PRIMARY KEY, graph_term TEXT NOT NULL UNIQUE,
			source_system TEXT NOT NULL, source_ref TEXT, source_digest TEXT, projected_at REAL NOT NULL,
			expires_at REAL, state TEXT NOT NULL DEFAULT 'OBSERVED', region TEXT,
			required_tp INTEGER NOT NULL DEFAULT 0, required_authority TEXT NOT NULL DEFAULT 'A0',
			allowed_platforms TEXT NOT NULL DEFAULT '[]', allowed_roles TEXT NOT NULL DEFAULT '[]',
			public_read INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
	`);
	const term = db.prepare('INSERT INTO terms VALUES (?,?,?,?,?,?)');
	const quad = db.prepare('INSERT INTO quads VALUES (?,?,?,?,?,?,?,?,?)');
	const proj = db.prepare(
		'INSERT INTO graph_projection VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
	);
	const values = [
		PUBLIC_GRAPH,
		GATED_GRAPH,
		'cni:org:cni',
		'cni:label',
		'cni:education',
		'cni:ASSIGNED_AGENT',
		'CNI · Citadel Nexus Inc.',
		'WHAT THIS IS — The company itself: the legal entity that employs people.',
		'cni:agent:forge',
	];
	for (const v of values) term.run(tid(v), v, 'IRI', null, null, JSON.stringify({ value: v }));

	// The public teaching surface: a node with a label and one education line.
	quad.run(tid('cni:org:cni'), tid('cni:label'), tid('CNI · Citadel Nexus Inc.'),
		tid(PUBLIC_GRAPH), 'atlas_canonical.json', 'OBSERVED', null, 1, null);
	quad.run(tid('cni:org:cni'), tid('cni:education'),
		tid('WHAT THIS IS — The company itself: the legal entity that employs people.'),
		tid(PUBLIC_GRAPH), 'atlas_canonical.json', 'OBSERVED', null, 1, null);
	// The staffing graph: exactly the data that must never answer without a signed principal.
	quad.run(tid('cni:org:cni'), tid('cni:ASSIGNED_AGENT'), tid('cni:agent:forge'),
		tid(GATED_GRAPH), 'atlas_canonical.json', 'OBSERVED', null, 1, null);

	proj.run('gpub', tid(PUBLIC_GRAPH), 'CNI_ORGANIZATION_MAP', 'atlas_canonical.json', 'd', 1,
		null, 'OBSERVED', null, 0, 'A0', '["cnwb","buildanddo"]', '[]', 1);
	proj.run('gstaff', tid(GATED_GRAPH), 'CNI_ORGANIZATION_MAP', 'atlas_canonical.json', 'd', 1,
		null, 'OBSERVED', null, 70, 'A2', '["cnwb"]', '[]', 0);
	return { CNI_GRAPH: d1(db), CSEG_PRINCIPAL_SECRET: SECRET };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function mint(claims, { secret = SECRET, alg = 'HS256' } = {}) {
	const header = b64({ alg, typ: 'JWT' });
	const payload = b64(claims);
	if (alg === 'none') return `${header}.${payload}.`;
	const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
	return `${header}.${payload}.${sig}`;
}

const soon = () => Math.floor(Date.now() / 1000) + 300;
const STAFFER = { iss: 'buildanddo', sub: 'user:42', authority: 'A2', trust_points: 90,
	platforms: ['cnwb'], roles: [], regions: [] };

const post = (body, auth, path = '/api/graph/match') =>
	new Request(`https://buildanddo.com${path}`, {
		method: 'POST',
		headers: auth ? { Authorization: auth, 'Content-Type': 'application/json' } : {},
		body: JSON.stringify(body),
	});

const ask = (graph) => ({ patterns: [{ s: 'cni:org:cni', p: 'cni:education', o: '?line', g: graph }] });
const askStaffing = () => ({
	patterns: [{ s: 'cni:org:cni', p: 'cni:ASSIGNED_AGENT', o: '?agent', g: GATED_GRAPH }],
});

describe('routing', () => {
	it('returns null for anything that is not this route, so the CSP path is untouched', async () => {
		const env = fixture();
		expect(await handleGraphMatch(new Request('https://buildanddo.com/'), env)).toBeNull();
		expect(await handleGraphMatch(new Request('https://buildanddo.com/index.html'), env)).toBeNull();
	});

	it('rejects a GET on the route rather than falling through to the origin', async () => {
		const res = await handleGraphMatch(
			new Request('https://buildanddo.com/api/graph/match'), fixture());
		expect(res.status).toBe(405);
	});

	it('says the binding is missing rather than answering as an empty graph', async () => {
		// A 503 naming the cause is the difference between "not wired up" and "no such data",
		// which otherwise look identical to a caller.
		const res = await handleGraphMatch(post(ask(PUBLIC_GRAPH)), { CSEG_PRINCIPAL_SECRET: SECRET });
		expect(res.status).toBe(503);
		expect((await res.json()).reason).toBe('no_graph_binding');
	});

	it('refuses a pattern with no graph, which would read across every projection', async () => {
		const res = await handleGraphMatch(
			post({ patterns: [{ s: 'cni:org:cni', p: 'cni:education', o: '?l' }] }), fixture());
		expect(res.status).toBe(400);
		expect((await res.json()).reason).toBe('graph_required');
	});

	it('refuses empty patterns and invalid JSON', async () => {
		expect((await handleGraphMatch(post({ patterns: [] }), fixture())).status).toBe(400);
		const bad = new Request('https://buildanddo.com/api/graph/match',
			{ method: 'POST', body: 'not json' });
		expect((await handleGraphMatch(bad, fixture())).status).toBe(400);
	});
});

describe('the public teaching surface', () => {
	it('answers an anonymous caller', async () => {
		const res = await handleGraphMatch(post(ask(PUBLIC_GRAPH)), fixture());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.state).toBe('PASS');
		expect(body.rows).toEqual([{ line: 'WHAT THIS IS — The company itself: the legal entity that employs people.' }]);
	});

	it('returns no rows, not an error, for a term the graph has never seen', async () => {
		const res = await handleGraphMatch(
			post({ patterns: [{ s: 'cni:org:nonexistent', p: 'cni:education', o: '?l', g: PUBLIC_GRAPH }] }),
			fixture());
		expect(res.status).toBe(200);
		expect((await res.json()).rows).toEqual([]);
	});
});

describe('the gated graph', () => {
	it('THE ORIGINAL DEFECT: a self-declared principal in the body reads nothing', async () => {
		// This exact request read the staffing graph in the reference worker, which took the
		// principal from the body. It must now be indistinguishable from an anonymous caller.
		const res = await handleGraphMatch(
			post({ ...askStaffing(),
				principal: { authority: 'A5', trust_points: 9999, platforms: ['cnwb'], roles: [], regions: [] } }),
			fixture());
		expect(res.status).toBe(403);
		expect((await res.json()).denied[0].reasons).toEqual(['authentication_required']);
	});

	it('denies an anonymous caller', async () => {
		const res = await handleGraphMatch(post(askStaffing()), fixture());
		expect(res.status).toBe(403);
	});

	it('answers a caller holding a validly signed A2 token', async () => {
		const res = await handleGraphMatch(
			post(askStaffing(), `Bearer ${mint({ ...STAFFER, exp: soon() })}`), fixture());
		expect(res.status).toBe(200);
		expect((await res.json()).rows).toEqual([{ agent: 'cni:agent:forge' }]);
	});

	it('refuses a token signed with the wrong secret', async () => {
		const t = mint({ ...STAFFER, exp: soon() }, { secret: 'attacker' });
		const res = await handleGraphMatch(post(askStaffing(), `Bearer ${t}`), fixture());
		expect(res.status).toBe(403);
	});

	it('refuses an expired token', async () => {
		const t = mint({ ...STAFFER, exp: Math.floor(Date.now() / 1000) - 5 });
		expect((await handleGraphMatch(post(askStaffing(), `Bearer ${t}`), fixture())).status).toBe(403);
	});

	it('refuses a validly signed token that declares another algorithm', async () => {
		// Isolates the alg check: alg:none cannot, because its empty signature fails HMAC anyway.
		const header = Buffer.from(JSON.stringify({ alg: 'hs256', typ: 'JWT' })).toString('base64url');
		const payload = b64({ ...STAFFER, exp: soon() });
		const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
		const res = await handleGraphMatch(
			post(askStaffing(), `Bearer ${header}.${payload}.${sig}`), fixture());
		expect(res.status).toBe(403);
	});

	it('trust cannot manufacture authority even on a valid token', async () => {
		const t = mint({ ...STAFFER, authority: 'A0', trust_points: 9999, exp: soon() });
		const res = await handleGraphMatch(post(askStaffing(), `Bearer ${t}`), fixture());
		expect(res.status).toBe(403);
		expect((await res.json()).denied[0].reasons).toContain('authority<A2');
	});

	it('fails closed when no secret is configured', async () => {
		const env = fixture();
		delete env.CSEG_PRINCIPAL_SECRET;
		const t = mint({ ...STAFFER, exp: soon() });
		expect(await verifyPrincipal(post(askStaffing(), `Bearer ${t}`), env)).toBeNull();
	});
});

describe('the query compiler', () => {
	it('answers a two-hop question in ONE statement', async () => {
		// The shape the edge exists for: find the node by label, return its education, joined.
		const env = fixture();
		const rows = await compileAndQuery(env.CNI_GRAPH, [
			{ s: '?n', p: 'cni:label', o: 'CNI · Citadel Nexus Inc.', g: PUBLIC_GRAPH },
			{ s: '?n', p: 'cni:education', o: '?line', g: PUBLIC_GRAPH },
		]);
		expect(rows).toEqual([
			{ n: 'cni:org:cni', line: 'WHAT THIS IS — The company itself: the legal entity that employs people.' },
		]);
	});

	it('bounds the pattern count so one request cannot join the table to itself forever', async () => {
		const env = fixture();
		const many = Array.from({ length: 9 }, () => ({ s: '?a', p: 'cni:label', o: '?b', g: PUBLIC_GRAPH }));
		await expect(compileAndQuery(env.CNI_GRAPH, many)).rejects.toThrow('too_many_patterns');
	});

	it('an unregistered graph is refused, not silently treated as public', async () => {
		expect(entitled(null, null)).toEqual({ ok: false, reasons: ['projection_unregistered'] });
	});
});
