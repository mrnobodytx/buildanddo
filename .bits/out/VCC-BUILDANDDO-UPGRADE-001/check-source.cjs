// ─── CGRF Header ───────────────────────────────────────────────
// File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src
// DAG Node:    none
// Intent:      Make the limited offline source checks reproducible without presenting them as repository lint or component tests.
// ───────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
let eslintPath;
try {
    eslintPath = webRequire.resolve('eslint');
} catch {
    // npm root only inspects the local installation; it never installs or fetches.
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    eslintPath = require.resolve(path.join(globalRoot, 'eslint'));
}
const { Linter } = require(eslintPath);
const globals = createRequire(eslintPath)('globals');
const linter = new Linter();
let failures = 0;
let checked = 0;

function checkDirectory(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            checkDirectory(filename);
            continue;
        }
        if (!/\.(jsx?|mjs)$/.test(filename)) continue;
        checked += 1;
        const messages = linter.verify(fs.readFileSync(filename, 'utf8'), [{
            files: ['**/*.{js,jsx,mjs}'],
            languageOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                parserOptions: { ecmaFeatures: { jsx: true } },
                globals: {
                    ...globals.browser,
                    ...globals.node,
                    ...Object.fromEntries(['vi', 'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].map((name) => [name, 'readonly'])),
                },
            },
            rules: { 'no-undef': 'error', 'no-dupe-keys': 'error' },
        }], { filename: path.relative(root, filename), allowInlineConfig: false });
        for (const message of messages.filter((item) => item.severity === 2)) {
            failures += 1;
            process.stderr.write(`${path.relative(root, filename)}:${message.line}:${message.column} ${message.message}\n`);
        }
    }
}

checkDirectory(path.join(root, 'apps/web/src'));
process.stdout.write(`${failures ? 'FAIL' : 'PASS'}: ${checked} modules parsed; ${failures} static errors. This does not run repository lint or UI tests.\n`);
process.exitCode = Number(failures > 0);
