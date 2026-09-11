#!/usr/bin/env node
// Cross-platform replacement for the old inline npm script:
//   "node tools/generate-llms.js || true && vite build --outDir ../../dist/apps/web"
// That relied on shell "||"/"&&" chaining, which is NOT portable: Windows cmd.exe parses
// "A || B && C" as "A || (B && C)", so a SUCCESSFUL generate-llms.js run skipped vite
// entirely (measured 2026-09-07 - real builds silently produced zero output for weeks).
// The follow-up fix (.npmrc script-shell=git-bash) then broke this same script on Linux
// CI runners, which have no such path. A plain Node script has no shell-dialect
// dependence at all - the correct, durable fix, not another shell-specific patch.
import { spawnSync } from "node:child_process";

spawnSync(process.execPath, ["tools/generate-llms.js"], { stdio: "inherit" }); // best-effort, ignore result

// public/fleet-status.json + public/platform-health.json - vite copies public/
// verbatim into dist, so the Fleet and Platform Health pages read a file that
// this build produced. Best-effort like generate-llms.js above: a report
// generator must never be able to fail the build it only describes. When it
// does not run, both pages say the projection is missing rather than drawing
// stale or invented numbers.
for (const python of ["python3", "python"]) {
	const result = spawnSync(python, ["../../scripts/ci/fleet_report.py"], { stdio: "inherit" });
	if (result.status === 0) break;
}

const vite = spawnSync("vite", ["build", "--outDir", "../../dist/apps/web"], {
	stdio: "inherit",
	shell: process.platform === "win32", // Windows needs shell:true to resolve vite.cmd; POSIX doesn't
});
process.exit(vite.status ?? 1);
