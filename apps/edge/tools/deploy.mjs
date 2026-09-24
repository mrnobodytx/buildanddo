// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/edge/tools/deploy.mjs
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CF-IDS-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CF-IDS-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/edge/wrangler.toml
// EnumType:    Tool
// EnumEdges:   DEPLOYS apps/edge/src/index.js; READS apps/edge/wrangler.toml
// DAG Node:    none
// Intent:      Deploy the edge worker without any Cloudflare id stored in the public repository:
//              the account comes from the environment and the D1 id is looked up by name.
// ───────────────────────────────────────────────────────────────

/**
 * `npm run deploy` from apps/edge. Needs CLOUDFLARE_ACCOUNT_ID and a Cloudflare API token (or a
 * `wrangler login`) in the environment. Extra arguments go to `wrangler deploy` unchanged.
 *
 * It never prints an id. It writes a resolved copy of wrangler.toml next to the original
 * (gitignored, so relative paths still resolve), deploys from it, and deletes it whatever happens.
 *
 * Why not wrangler's automatic provisioning: when its lookup misses it can create a new, empty
 * database, and the worker would then serve an empty graph. This fails instead.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLACEHOLDER = 'resolved-at-deploy';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The one D1 binding in the config: its database name, and whether its id is the placeholder. */
export function d1Binding(toml) {
	const blocks = toml.split(/^\[\[d1_databases\]\]\s*$/m).slice(1);
	if (blocks.length !== 1) throw new Error(`expected exactly one [[d1_databases]] block, found ${blocks.length}`);
	const field = (key) => blocks[0].match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
	return { name: field('database_name'), id: field('database_id') };
}

/** The uuid of the one database named `name` in `wrangler d1 list --json` output. */
export function pickDatabase(listOutput, name) {
	const start = listOutput.indexOf('[');
	const end = listOutput.lastIndexOf(']');
	if (start < 0 || end < start) throw new Error('wrangler d1 list returned no JSON array');
	const matches = JSON.parse(listOutput.slice(start, end + 1)).filter((db) => db?.name === name);
	if (matches.length !== 1) throw new Error(`expected exactly one D1 database named ${name}, found ${matches.length}`);
	if (!UUID.test(String(matches[0].uuid))) throw new Error(`the D1 database named ${name} has no valid uuid`);
	return matches[0].uuid;
}

/** The config with the placeholder replaced; refuses anything but exactly one placeholder. */
export function resolveConfig(toml, id) {
	const line = `database_id = "${PLACEHOLDER}"`;
	if (toml.split(line).length !== 2) throw new Error(`expected exactly one ${line} in wrangler.toml`);
	if (!UUID.test(id)) throw new Error('refusing to write a database id that is not a uuid');
	return toml.replace(line, `database_id = "${id}"`);
}

function wrangler(args, options) {
	// npx is a .cmd shim on Windows, which Node only runs through a shell. No argument here comes
	// from outside this script except the operator's own extra deploy flags.
	return spawnSync('npx', ['--yes', 'wrangler', ...args], { shell: process.platform === 'win32', ...options });
}

function main(argv) {
	const here = dirname(dirname(fileURLToPath(import.meta.url)));
	const config = join(here, 'wrangler.toml');
	const resolved = join(here, '.wrangler.deploy.toml');
	if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
		console.error('deploy: set CLOUDFLARE_ACCOUNT_ID; the account id is not stored in this repository');
		return 2;
	}
	const toml = readFileSync(config, 'utf8');
	const binding = d1Binding(toml);
	if (binding.id !== PLACEHOLDER) {
		console.error(`deploy: wrangler.toml must carry database_id = "${PLACEHOLDER}", not a real id`);
		return 2;
	}
	const list = wrangler(['d1', 'list', '--json'], { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
	if (list.status !== 0) {
		console.error('deploy: wrangler d1 list failed; check the API token and CLOUDFLARE_ACCOUNT_ID');
		return list.status || 1;
	}
	try {
		writeFileSync(resolved, resolveConfig(toml, pickDatabase(list.stdout, binding.name)));
		console.log(`deploy: resolved the D1 binding for ${binding.name} by name`);
		return wrangler(['deploy', '--config', resolved, ...argv], { cwd: here, stdio: 'inherit' }).status ?? 1;
	} finally {
		rmSync(resolved, { force: true });
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (error) {
		console.error(`deploy: ${error.message}`);
		process.exitCode = 1;
	}
}
