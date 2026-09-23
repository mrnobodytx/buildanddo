// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/edge/src/graph.js
// Stage:       11_COMMIT
// SRS:         SRS-CN-ENTITY-CATALOGUE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/edge/wrangler.toml (CNI_GRAPH binding)
// EnumType:    Service
// EnumEdges:   READS cni-edge-graph (D1)
// DAG Node:    none
// Intent:      Serve bounded CSEG graph reads from the worker that already fronts the domain.
// ───────────────────────────────────────────────────────────────

/**
 * Citadel Semantic Edge Graph reads, served from buildanddo-edge.
 *
 * WHY HERE AND NOT IN A WORKER OF ITS OWN. The CSEG package ships a standalone reference worker.
 * Deploying it would have meant a 24th worker with its own route, its own secret and its own
 * observability, to answer requests for a site this worker already fronts. Co-locating costs one
 * early-return and buys three things that matter:
 *
 *   - Same origin. This worker's CSP already sets `connect-src 'self'`, so the SPA can call
 *     /api/graph/match with no policy change and no CORS preflight. A separate worker on another
 *     hostname would have needed both.
 *   - One deploy, one config, one place to look when it misbehaves.
 *   - The route is in git next to the CSP it shares a response path with.
 *
 * Everything that is not POST /api/graph/match falls straight through, so the header behaviour
 * this worker existed for is untouched.
 *
 * AUTHORITY. Canonical truth stays in NXC/DKG/Supabase; D1 holds a bounded read projection. This
 * module never writes. The principal comes ONLY from a signed bearer token — the reference worker
 * read `body.principal`, which let a caller state their own authority: measured against the Atlas
 * staffing graph's real gates (tp70 / A2 / cnwb), an honest A0 caller was denied and a caller who
 * typed {"authority":"A5","trust_points":9999} read it. Without a token the caller is anonymous
 * and only public_read graphs answer, which is the correct default for the teaching surface.
 */

const AUTHORITY_ORDER = { A0: 0, A1: 1, A2: 2, A3: 3, A4: 4, A5: 5 };
const MAX_PATTERNS = 8;
const MAX_LIMIT = 1000;

function b64url(s) {
	const pad = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * The principal, or null. Fails closed on every ambiguous case: no token, no secret configured,
 * bad signature, wrong algorithm, missing or passed expiry, wrong issuer, unknown authority.
 */
export async function verifyPrincipal(request, env) {
	const m = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') || '');
	if (!m || !env || !env.CSEG_PRINCIPAL_SECRET) return null;
	const [h, pl, sig] = m[1].split('.');
	if (!h || !pl || !sig) return null;
	try {
		const header = JSON.parse(new TextDecoder().decode(b64url(h)));
		// Reject alg:none and algorithm confusion before the signature is considered.
		if (header.alg !== 'HS256') return null;
		if (header.typ && header.typ !== 'JWT') return null;
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(env.CSEG_PRINCIPAL_SECRET),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['verify'],
		);
		const ok = await crypto.subtle.verify(
			'HMAC',
			key,
			b64url(sig),
			new TextEncoder().encode(`${h}.${pl}`),
		);
		if (!ok) return null;
		const c = JSON.parse(new TextDecoder().decode(b64url(pl)));
		if (c.iss !== 'buildanddo') return null;
		// An unexpiring principal token is a permanent credential in a URL-safe string.
		if (typeof c.exp !== 'number' || c.exp <= Math.floor(Date.now() / 1000)) return null;
		if (!Object.prototype.hasOwnProperty.call(AUTHORITY_ORDER, String(c.authority))) return null;
		return {
			principal_id: String(c.sub || 'unknown'),
			authority: c.authority,
			trust_points: Number(c.trust_points || 0),
			platforms: Array.isArray(c.platforms) ? c.platforms.map(String) : [],
			roles: Array.isArray(c.roles) ? c.roles.map(String) : [],
			regions: Array.isArray(c.regions) ? c.regions.map(String) : [],
		};
	} catch {
		return null;
	}
}

/** Trust may unlock disclosure. It never manufactures authority. */
export function entitled(meta, principal) {
	if (!meta) return { ok: false, reasons: ['projection_unregistered'] };
	if (meta.public_read) return { ok: true, reasons: [] };
	if (!principal) return { ok: false, reasons: ['authentication_required'] };
	const reasons = [];
	if (principal.trust_points < Number(meta.required_tp || 0)) {
		reasons.push(`tp<${meta.required_tp}`);
	}
	const have = AUTHORITY_ORDER[principal.authority];
	const need = AUTHORITY_ORDER[meta.required_authority];
	if ((have === undefined ? -1 : have) < (need === undefined ? 99 : need)) {
		reasons.push(`authority<${meta.required_authority}`);
	}
	const platforms = JSON.parse(meta.allowed_platforms || '[]');
	if (platforms.length && !platforms.some((x) => principal.platforms.includes(x))) {
		reasons.push('platform_not_entitled');
	}
	const roles = JSON.parse(meta.allowed_roles || '[]');
	if (roles.length && !roles.some((x) => principal.roles.includes(x))) {
		reasons.push('role_not_entitled');
	}
	if (meta.region && principal.regions.length && !principal.regions.includes(meta.region)) {
		reasons.push('region_not_entitled');
	}
	return { ok: reasons.length === 0, reasons };
}

async function projection(db, graphValue) {
	return db
		.prepare(
			'SELECT gp.* FROM graph_projection gp JOIN terms t ON t.term_id=gp.graph_term WHERE t.value=?1 LIMIT 1',
		)
		.bind(graphValue)
		.first();
}

async function termId(db, value) {
	const row = await db
		.prepare('SELECT term_id FROM terms WHERE value=?1 LIMIT 1')
		.bind(value)
		.first();
	return row ? row.term_id : null;
}

/**
 * Compile every pattern into ONE statement. Patterns are joined, never issued as N queries, so a
 * two-hop question costs one round trip at the edge. Only column names and aliases this function
 * generates reach the SQL string; every caller-supplied value is a bound parameter.
 */
export async function compileAndQuery(db, patterns, limit = 250) {
	if (!patterns.length) throw new Error('patterns_required');
	if (patterns.length > MAX_PATTERNS) throw new Error('too_many_patterns');
	const variables = new Map();
	const selectVars = [];
	const joins = [];
	const where = [];
	const binds = [];
	const now = Date.now() / 1000;

	for (let i = 0; i < patterns.length; i++) {
		const a = `q${i}`;
		joins.push(i === 0 ? `quads ${a}` : `CROSS JOIN quads ${a}`);
		const entries = [
			['s', patterns[i].s],
			['p', patterns[i].p],
			['o', patterns[i].o],
			['g', patterns[i].g],
		];
		for (const [col, value] of entries) {
			if (!value) continue;
			if (String(value).startsWith('?')) {
				const prior = variables.get(value);
				if (prior) {
					where.push(`${a}.${col}=${prior.a}.${prior.c}`);
				} else {
					variables.set(value, { a, c: col });
					selectVars.push(value);
				}
			} else {
				const id = await termId(db, String(value));
				// An unknown term cannot match anything; saying so is not the same as an error.
				if (!id) return [];
				where.push(`${a}.${col}=?${binds.length + 1}`);
				binds.push(id);
			}
		}
		where.push(`(${a}.expires_at IS NULL OR ${a}.expires_at>?${binds.length + 1})`);
		binds.push(now);
	}

	const select = selectVars.length
		? selectVars
				.map((v, i) => {
					const x = variables.get(v);
					return `${x.a}.${x.c} AS v${i}`;
				})
				.join(',')
		: '1 AS matched';
	const bounded = Math.min(Math.max(Number(limit) || 250, 1), MAX_LIMIT);
	const sql = `SELECT DISTINCT ${select} FROM ${joins.join(' ')} WHERE ${where.join(' AND ')} LIMIT ${bounded}`;
	const result = await db
		.prepare(sql)
		.bind(...binds)
		.all();
	if (!selectVars.length) return result.results;

	const ids = [
		...new Set(result.results.flatMap((r) => selectVars.map((_, i) => r[`v${i}`]))),
	];
	if (!ids.length) return [];
	const placeholders = ids.map((_, i) => `?${i + 1}`).join(',');
	const terms = await db
		.prepare(`SELECT term_id,value FROM terms WHERE term_id IN (${placeholders})`)
		.bind(...ids)
		.all();
	const map = new Map(terms.results.map((r) => [r.term_id, r.value]));
	return result.results.map((r) =>
		Object.fromEntries(selectVars.map((v, i) => [v.slice(1), map.get(r[`v${i}`])])),
	);
}

/** POST /api/graph/match. Returns null when this request is not ours, so the caller falls through. */
export async function handleGraphMatch(request, env) {
	const url = new URL(request.url);
	if (url.pathname !== '/api/graph/match') return null;
	if (request.method !== 'POST') {
		return Response.json({ state: 'DENIED', reason: 'method_not_allowed' }, { status: 405 });
	}
	if (!env || !env.CNI_GRAPH) {
		// The binding is absent rather than the data — say which, or this reads as an empty graph.
		return Response.json({ state: 'UNAVAILABLE', reason: 'no_graph_binding' }, { status: 503 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ state: 'DENIED', reason: 'invalid_json' }, { status: 400 });
	}
	const patterns = Array.isArray(body && body.patterns) ? body.patterns : [];
	if (!patterns.length) {
		return Response.json({ state: 'DENIED', reason: 'patterns_required' }, { status: 400 });
	}
	// body.principal is deliberately NOT read. See verifyPrincipal.
	const principal = await verifyPrincipal(request, env);

	const graphs = [
		...new Set(patterns.map((p) => p.g).filter((g) => !!g && !String(g).startsWith('?'))),
	];
	if (!graphs.length) {
		// An unqualified pattern would read across every projection in the database, gates and all.
		return Response.json({ state: 'DENIED', reason: 'graph_required' }, { status: 400 });
	}
	const denied = [];
	for (const g of graphs) {
		const decision = entitled(await projection(env.CNI_GRAPH, g), principal);
		if (!decision.ok) denied.push({ graph: g, reasons: decision.reasons });
	}
	if (denied.length) return Response.json({ state: 'DENIED', denied }, { status: 403 });

	try {
		const rows = await compileAndQuery(env.CNI_GRAPH, patterns, body.limit || 250);
		return Response.json({ state: 'PASS', rows });
	} catch (err) {
		return Response.json({ state: 'ERROR', reason: String(err.message || err) }, { status: 400 });
	}
}
