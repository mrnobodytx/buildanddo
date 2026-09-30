#!/usr/bin/env node
// --- CGRF Header ------------------------------------------------
// File:        apps/web/tools/build.mjs
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/tools/release-telemetry.mjs, apps/web/tools/public-delivery.mjs
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/tools/release-telemetry.mjs; CONSUMES apps/web/tools/public-delivery.mjs
// Intent:      Keep offline builds usable while binding designated release telemetry to the actual build.
// ----------------------------------------------------------------
// Cross-platform replacement for the old inline npm script:
//   "node tools/generate-llms.js || true && vite build --outDir ../../dist/apps/web"
// That relied on shell "||"/"&&" chaining, which is NOT portable: Windows cmd.exe parses
// "A || B && C" as "A || (B && C)", so a SUCCESSFUL generate-llms.js run skipped vite
// entirely (measured 2026-09-07 - real builds silently produced zero output for weeks).
// The follow-up fix (.npmrc script-shell=git-bash) then broke this same script on Linux
// CI runners, which have no such path. A plain Node script has no shell-dialect
// dependence at all - the correct, durable fix, not another shell-specific patch.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBuildRelease } from '../../../scripts/ci/release.mjs';
import { generatePublicAssets, generatePageHeads } from './generate-seo.mjs';
import { generateCommunityCatalogue } from './generate-community.mjs';
import { findLessonAnswers } from './check-public-lessons.mjs';
import { releaseTelemetryContract, releaseTelemetryPlugin, TELEMETRY_MANIFEST } from './release-telemetry.mjs';
import { copyPublicAssets, assertPublicDelivery } from './public-delivery.mjs';

// Container build contexts deliberately exclude .git. The staging image passes
// the exact candidate SHA instead, keeping the release stamped into RUM and the
// generated catalogue tied to the source that produced the image.
const output = fileURLToPath(new URL('../../../dist/apps/web', import.meta.url));
// A failed or ordinary build must not retain a previous release's certificate.
rmSync(`${output}/${TELEMETRY_MANIFEST}`, { force: true });
const release = resolveBuildRelease({ commitSha: process.env.BUILD_SHA });
const contract = releaseTelemetryContract(process.env, release);
const telemetry = contract ? releaseTelemetryPlugin(contract) : null;

const publicSource = fileURLToPath(new URL('../public', import.meta.url));
generatePublicAssets(publicSource);

// An explicit environment is honored; otherwise the existing browser hostname
// resolver chooses production/staging/preview instead of stamping CI into RUM.
const buildEnvironment = {
    ...process.env,
    VITE_DD_VERSION: release.version,
    VITE_BUILD_SHA: release.commit_sha,
    VITE_DD_ENV: process.env.VITE_DD_ENV || '',
    ...contract?.publicConfig,
};
// The output sits outside the app root, so Vite keeps old bundles unless told to
// empty it; a stale chunk could still carry lesson answers. Vite writes first.
Object.assign(process.env, buildEnvironment);
// Inject the measuring plugin without taking ownership of the shared Vite config.
// Release inputs are explicit; a forgotten .env file cannot silently enable a sink.
const { build } = await import('vite');
const publicAssets = mkdtempSync(join(tmpdir(), 'buildanddo-public-assets-'));
// The Vite API rejects on failure; there is no spawned process status to read any more. The two
// lines that still read one threw a ReferenceError after every successful build, so page heads,
// the community catalogue and the lesson-answer scan below never ran.
try {
    copyPublicAssets(publicSource, publicAssets);
    await build({
        publicDir: publicAssets,
        ...(contract ? { envFile: false } : {}),
        plugins: telemetry ? [telemetry.plugin] : [],
        build: { outDir: output, emptyOutDir: true },
    });
} catch (error) {
    console.error('Vite build failed:', error?.message || error);
    throw error;
} finally {
    rmSync(publicAssets, { recursive: true, force: true });
}
generatePageHeads(output, release);
generateCommunityCatalogue(output, release);
assertPublicDelivery(output);
// Interactive lessons are graded on the server; a shipped answer or explanation would give it away.
// Scanned last so generated feeds such as community-catalog.json are covered too.
const leaks = findLessonAnswers(output);
if (leaks.length) {
    for (const leak of leaks) console.error(`Lesson ${leak.slug} answer is in ${leak.file}; import curricula with ?public-lessons and keep checks answer-free.`);
    process.exit(1);
}
telemetry?.finish(output);
