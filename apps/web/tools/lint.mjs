#!/usr/bin/env node
// Cross-platform replacement for the old inline npm script:
//   "eslint . --quiet; lint_status=$?; eslint \"src/**/*.jsx\" ... ; exit $lint_status"
// That's POSIX shell syntax ($?, exit $var) - it never worked under Windows cmd.exe
// (npm's default script-shell there), only under the .npmrc git-bash override, which
// in turn broke Linux CI (see tools/build.mjs). Same fix: no shell dialect at all.
//
// Intent preserved exactly: run the real lint pass (its exit code is authoritative),
// then ALSO run the unicode-escape formatter pass on JSX (informational, its result
// is intentionally discarded), and exit with the FIRST pass's status.
import { spawnSync } from "node:child_process";

const useShell = process.platform === "win32";

const primary = spawnSync("eslint", [".", "--quiet"], { stdio: "inherit", shell: useShell });

spawnSync(
	"eslint",
	["src/**/*.jsx", "--config", "eslint.config.mjs", "--format", "./eslint.unicode-escapes-formatter.mjs",
		"--no-error-on-unmatched-pattern"],
	{ stdio: "inherit", shell: useShell },
); // informational only - result intentionally discarded

process.exit(primary.status ?? 1);
