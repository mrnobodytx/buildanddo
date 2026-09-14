// ─── CGRF Header ───────────────────────────────────────────────
// File:        scripts/ci/release.mjs
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     .version
// EnumType:    Service
// EnumEdges:   DEPENDS_ON .version
// DAG Node:    none
// Intent:      Join browser, CI and deployment evidence with one version derived from the checked-out source.
// ───────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Resolve the same checked-out version for the web build, CI and DORA. */
export function resolveBuildRelease({ root = ROOT, commitSha } = {}) {
    const base = readFileSync(resolve(root, '.version'), 'utf8').trim();
    if (!/^[0-9]+(?:\.[0-9]+){0,2}(?:-[a-zA-Z0-9.-]+)?$/.test(base)) {
        throw new Error('The release file must contain a numeric version.');
    }
    const sha =
        commitSha ||
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40,64}$/i.test(sha)) throw new Error('A full commit SHA is required.');
    return { version: `${base}+${sha.slice(0, 7)}`, commit_sha: sha, base_version: base };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const release = resolveBuildRelease();
    if (process.argv.includes('--github-env')) {
        if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required for this output.');
        appendFileSync(process.env.GITHUB_ENV, `RELEASE_VERSION=${release.version}\n`);
    } else {
        process.stdout.write(
            process.argv.includes('--json')
                ? `${JSON.stringify(release)}\n`
                : `${release.version}\n`,
        );
    }
}
