#!/usr/bin/env node
// Cross-platform replacement for the old inline npm script:
//   "node tools/generate-llms.js || true && vite build --outDir ../../dist/apps/web"
// That relied on shell "||"/"&&" chaining, which is NOT portable: Windows cmd.exe parses
// "A || B && C" as "A || (B && C)", so a SUCCESSFUL generate-llms.js run skipped vite
// entirely (measured 2026-09-07 - real builds silently produced zero output for weeks).
// The follow-up fix (.npmrc script-shell=git-bash) then broke this same script on Linux
// CI runners, which have no such path. A plain Node script has no shell-dialect
// dependence at all - the correct, durable fix, not another shell-specific patch.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBuildRelease } from '../../../scripts/ci/release.mjs';
import { generatePublicAssets, generatePageHeads } from './generate-seo.mjs';
import { generateCommunityCatalogue } from './generate-community.mjs';
import { findLessonAnswers } from './check-public-lessons.mjs';

// Container build contexts deliberately exclude .git. The staging image passes
// the exact candidate SHA instead, keeping the release stamped into RUM and the
// generated catalogue tied to the source that produced the image.
const release = resolveBuildRelease({ commitSha: process.env.BUILD_SHA });
const output = fileURLToPath(new URL('../../../dist/apps/web', import.meta.url));

generatePublicAssets(fileURLToPath(new URL('../public', import.meta.url)));

// public/fleet-status.json + public/platform-health.json - vite copies public/
// verbatim into dist, so the Fleet and Platform Health pages read a file that
// this build produced. Best-effort like generate-llms.js above: a report
// generator must never be able to fail the build it only describes. When it
// does not run, both pages say the projection is missing rather than drawing
// stale or invented numbers.
for (const python of ['python3', 'python']) {
    const result = spawnSync(python, ['../../scripts/ci/fleet_report.py'], { stdio: 'inherit' });
    if (result.status === 0) break;
}

// An explicit environment is honored; otherwise the existing browser hostname
// resolver chooses production/staging/preview instead of stamping CI into RUM.
const buildEnvironment = {
    ...process.env,
    VITE_DD_VERSION: release.version,
    VITE_BUILD_SHA: release.commit_sha,
    VITE_DD_ENV: process.env.VITE_DD_ENV || '',
};
const vite = spawnSync('vite', ['build', '--outDir', '../../dist/apps/web'], {
    stdio: 'inherit',
    env: buildEnvironment,
    shell: process.platform === 'win32', // Windows needs shell:true to resolve vite.cmd; POSIX doesn't
});
if (vite.error) console.error('Unable to start Vite:', vite.error.message);
if (vite.status !== 0) process.exit(vite.status ?? 1);
// Interactive lessons are graded on the server; a shipped explanation would give the answer away.
const leaks = findLessonAnswers(output);
if (leaks.length) {
    for (const leak of leaks) console.error(`Lesson ${leak.slug} explanation is in assets/${leak.file}; import curricula with ?public-lessons.`);
    process.exit(1);
}
generatePageHeads(output, release);
generateCommunityCatalogue(output, release);
