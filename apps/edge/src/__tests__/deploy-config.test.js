// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/edge/src/__tests__/deploy-config.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-CF-IDS-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CF-IDS-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/edge/tools/deploy.mjs, apps/edge/wrangler.toml
// EnumType:    Test
// EnumEdges:   VALIDATES apps/edge/tools/deploy.mjs; VALIDATES apps/edge/wrangler.toml
// DAG Node:    none
// Intent:      Fail if a Cloudflare account or resource id is committed again, or if the deploy
//              resolver would bind anything but the one database with the configured name.
// ───────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PLACEHOLDER, d1Binding, pickDatabase, resolveConfig } from '../../tools/deploy.mjs';

const TOML = readFileSync(fileURLToPath(new URL('../../wrangler.toml', import.meta.url)), 'utf8');
// Made-up ids with the real shapes: a 32-hex account id and a D1 uuid.
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const DB = '00000000-1111-4222-8333-444444444444';
const listed = (rows) => `${JSON.stringify(rows, null, 2)}\n`;

describe('the committed wrangler.toml', () => {
	it('carries no account id and no resource id', () => {
		const settings = TOML.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
		expect(settings).not.toMatch(/^\s*account_id\s*=/m);
		expect(TOML).not.toMatch(/[0-9a-f]{32}/i);
		expect(TOML).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
	});

	it('names its one D1 database and leaves the id to the deploy', () => {
		expect(d1Binding(TOML)).toEqual({ name: 'cni-edge-graph', id: PLACEHOLDER });
	});

	it('control: the check above catches a planted account id', () => {
		const planted = TOML.replace('main = "src/index.js"', `main = "src/index.js"\naccount_id = "${ACCOUNT}"`);
		expect(planted).toMatch(/[0-9a-f]{32}/i);
		expect(planted.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n')).toMatch(/^\s*account_id\s*=/m);
	});
});

describe('resolving the database at deploy time', () => {
	it('picks the one database with the configured name, past any banner text', () => {
		const out = `wrangler 4.x\n${listed([{ uuid: DB, name: 'cni-edge-graph' }, { uuid: DB.replace('0000', '9999'), name: 'other' }])}`;
		expect(pickDatabase(out, 'cni-edge-graph')).toBe(DB);
	});

	it('refuses a missing or duplicated name rather than guessing', () => {
		expect(() => pickDatabase(listed([{ uuid: DB, name: 'other' }]), 'cni-edge-graph')).toThrow(/found 0/);
		expect(() => pickDatabase(listed([{ uuid: DB, name: 'cni-edge-graph' }, { uuid: DB, name: 'cni-edge-graph' }]), 'cni-edge-graph')).toThrow(/found 2/);
		expect(() => pickDatabase('not json', 'cni-edge-graph')).toThrow(/no JSON array/);
		expect(() => pickDatabase(listed([{ uuid: 'nope', name: 'cni-edge-graph' }]), 'cni-edge-graph')).toThrow(/no valid uuid/);
	});

	it('replaces exactly the placeholder and nothing else', () => {
		const resolved = resolveConfig(TOML, DB);
		expect(d1Binding(resolved)).toEqual({ name: 'cni-edge-graph', id: DB });
		expect(resolved.replace(DB, PLACEHOLDER)).toBe(TOML);
	});

	it('refuses a config without the placeholder, or an id that is not a uuid', () => {
		expect(() => resolveConfig(TOML.replace(PLACEHOLDER, DB), DB)).toThrow(/exactly one/);
		expect(() => resolveConfig(TOML, 'x"; account_id = "y')).toThrow(/not a uuid/);
	});
});
