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

// Core no-undef does not inspect JSX tag names. Missing component imports can
// pass a syntax-only check and still crash as soon as the route renders.
const jsxBindings = {
    meta: { type: 'problem', schema: [] },
    create(context) {
        return {
            JSXOpeningElement(node) {
                let root = node.name;
                while (root.type === 'JSXMemberExpression') root = root.object;
                if (root.type !== 'JSXIdentifier' || root.name === 'this' ||
                    (root === node.name && !/^[A-Z_$]/.test(root.name))) return;
                let scope = context.sourceCode.getScope(node);
                while (scope) {
                    if (scope.variables.some((variable) => variable.name === root.name)) return;
                    scope = scope.upper;
                }
                context.report({ node: root, message: `JSX component '${root.name}' is not defined.` });
            },
        };
    },
};

function inspectSource(source, filename) {
    return linter.verify(source, [{
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
        plugins: { integration: { rules: { 'jsx-bindings': jsxBindings } } },
        rules: { 'no-undef': 'error', 'no-dupe-keys': 'error', 'integration/jsx-bindings': 'error' },
    }], { filename, allowInlineConfig: false }).filter((item) => item.severity === 2);
}

function checkDirectory(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            checkDirectory(filename);
            continue;
        }
        if (!/\.(jsx?|mjs)$/.test(filename)) continue;
        checked += 1;
        const messages = inspectSource(fs.readFileSync(filename, 'utf8'), path.relative(root, filename));
        for (const message of messages) {
            failures += 1;
            process.stderr.write(`${path.relative(root, filename)}:${message.line}:${message.column} ${message.message}\n`);
        }
    }
}

if (require.main === module) {
    checkDirectory(path.join(root, 'apps/web/src'));
    process.stdout.write(`${failures ? 'FAIL' : 'PASS'}: ${checked} modules parsed; ${failures} static errors. This does not run repository lint or UI tests.\n`);
    process.exitCode = Number(failures > 0);
}

module.exports = { inspectSource };
