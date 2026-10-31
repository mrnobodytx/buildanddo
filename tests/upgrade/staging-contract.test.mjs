// ─── CGRF Header ──────────────────────────────
// File:        tests/upgrade/staging-contract.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-BUDDI-003, SRS-BUILDANDDO-HEADERS-001,
//              SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-BUDDI-003, VCC-BUILDANDDO-HEADERS-001,
//              VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
// Seat:        BITS-CODEGEN, C-ONE (the microphone policy; security headers on every location)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/Dockerfile, docker-compose.staging.yml, scripts/deploy/staging-readback.sh, apps/web/nginx.conf
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/Dockerfile; VALIDATES docker-compose.staging.yml; VALIDATES scripts/deploy/staging-readback.sh; VALIDATES apps/web/nginx.conf
// DAG Node:    buildanddo.staging.contract-test
// Intent:      Prove the staging definition builds production output and rejects incomplete HTTP readback,
//              including a full-mode backend whose lessons cannot all be graded from private keys.
// ───────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const MICROPHONE_POLICY = 'camera=(), microphone=(self), geolocation=()';
const KEYS_HEALTH = '/api/buildanddo/learning/keys-health';
// The keys-health body of a backend whose every lesson grades from a private key file.
const PRIVATE_KEYS = Object.freeze({ schema_version: 1, keys: 'PRIVATE', lessons: 3, gradable: 3, unavailable: 0 });

/**
 * nginx.conf as a tree of blocks, each with its head (`server`, `location /assets/`), its own directives and
 * its child blocks. Comments are dropped first; this file quotes no `#`, `{`, `}` or `;`.
 * @param {string} text
 * @returns {{head: string, directives: string[], blocks: object[]}}
 */
function nginxBlocks(text) {
    const root = { head: '', directives: [], blocks: [] };
    const stack = [root];
    let token = '';
    for (const char of text.replace(/#.*$/gm, '')) {
        if (char === '{') {
            const block = { head: token.trim().replace(/\s+/g, ' '), directives: [], blocks: [] };
            stack.at(-1).blocks.push(block);
            stack.push(block);
            token = '';
        } else if (char === '}') {
            stack.pop();
            token = '';
        } else if (char === ';') {
            stack.at(-1).directives.push(token.trim().replace(/\s+/g, ' '));
            token = '';
        } else {
            token += char;
        }
    }
    return root;
}

/** The `add_header` directives a block declares itself, as lower-case name and unquoted value. */
function headersOf(block) {
    return block.directives.filter((directive) => directive.startsWith('add_header ')).map((directive) => {
        const [, name, value] = directive.match(/^add_header (\S+) (.*?)(?: always)?$/);
        return { name: name.toLowerCase(), value: value.replace(/^"(.*)"$/, '$1') };
    });
}

async function stagingServer() {
    const http = nginxBlocks(await readFile('apps/web/nginx.conf', 'utf8')).blocks.find((block) => block.head === 'http');
    const server = http?.blocks.find((block) => block.head === 'server');
    assert.ok(server, 'nginx.conf has an http server block');
    assert.ok(server.blocks.some((block) => block.head === 'location /'), 'the parser found the document location');
    return server;
}

/**
 * A staging origin double. `keysHealth` is the keys-health body: an object is sent as JSON, a string verbatim,
 * and null answers 404 as hooks without the route would. `server.requested` lists every path asked for.
 */
async function fixtureServer(apiCode = 200, keysHealth = PRIVATE_KEYS) {
    const requested = [];
    const server = createServer((request, response) => {
        requested.push(request.url);
        if (request.url === '/') {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end(
                '<!doctype html><title>BuildAndDo — staging</title>' +
                    '<script type="module" src="/assets/application.js"></script>' +
                    '<div id="root"></div>',
            );
            return;
        }
        if (request.url === '/assets/application.js') {
            response.writeHead(200, { 'content-type': 'text/javascript' });
            response.end('globalThis.__buildanddoStaging = true;');
            return;
        }
        if (request.url === '/api/health') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ code: apiCode }));
            return;
        }
        if (request.url === KEYS_HEALTH && keysHealth !== null) {
            response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            response.end(typeof keysHealth === 'string' ? keysHealth : JSON.stringify(keysHealth));
            return;
        }
        response.writeHead(404);
        response.end();
    });
    server.requested = requested;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server;
}

/** Run the readback against a fixture origin; resolves with its output or rejects with the failed process. */
function readback(server, mode) {
    return run('sh', ['scripts/deploy/staging-readback.sh', `http://127.0.0.1:${server.address().port}`, mode]);
}

test('staging images use the locked Node 22 production build and same-origin API', async () => {
    const [dockerfile, compose, nginx, buildTool] = await Promise.all([
        readFile('apps/web/Dockerfile', 'utf8'),
        readFile('docker-compose.staging.yml', 'utf8'),
        readFile('apps/web/nginx.conf', 'utf8'),
        readFile('apps/web/tools/build.mjs', 'utf8'),
    ]);

    assert.match(dockerfile, /FROM node:22-alpine AS build/);
    assert.match(dockerfile, /RUN npm ci --no-audit --no-fund/);
    assert.match(dockerfile, /RUN npm run build --prefix apps\/web/);
    assert.match(dockerfile, /FROM nginx:1\.27-alpine AS runtime/);
    assert.match(compose, /STAGING_WEB_PORT:-3500/);
    assert.match(compose, /VITE_POCKETBASE_API_URL: \//);
    assert.match(compose, /STRIPE_TEST_MODE: "1"/);
    assert.doesNotMatch(compose.match(/  pocketbase:\n[\s\S]*?\n  web:/)?.[0] ?? '', /\n    ports:/);
    assert.match(nginx, /proxy_pass http:\/\/pocketbase:8090/);
    assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
    assert.match(buildTool, /resolveBuildRelease\(\{ commitSha: process\.env\.BUILD_SHA \}\)/);
});

test('staging lets the page use the microphone for itself and nothing else', async () => {
    const nginx = await readFile('apps/web/nginx.conf', 'utf8');
    const server = await stagingServer();
    assert.deepEqual(headersOf(server).filter((header) => header.name === 'permissions-policy').map((header) => header.value),
        [MICROPHONE_POLICY]);
    // A level that sets its own headers repeats the policy (see the next test); every copy is the same policy.
    const policies = [...nginx.matchAll(/add_header Permissions-Policy "([^"]*)" always;/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(policies)], [MICROPHONE_POLICY]);
    // nginx drops every server-level add_header in a location that declares its own, so the document
    // location must declare none or the page is served with no policy at all.
    const documentLocation = server.blocks.find((block) => block.head === 'location /');
    assert.deepEqual(headersOf(documentLocation), []);
});

// nginx inherits add_header into a level only when that level declares none of its own. A location that sets
// even one header, such as a cache policy, sends none of the server's headers unless it repeats them.
// Measured 2026-09-23: /assets/ did exactly that, so every built script and stylesheet lost nosniff.
test('every location that sets its own headers still sends the server\'s security headers', async () => {
    const server = await stagingServer();
    const required = headersOf(server);
    assert.ok(required.some((header) => header.name === 'x-content-type-options' && header.value === 'nosniff'),
        'the server level sends nosniff');
    const missing = [];
    const visit = (block) => {
        for (const child of block.blocks) {
            const own = headersOf(child);
            if (own.length) {
                for (const header of required) {
                    if (!own.some((item) => item.name === header.name && item.value === header.value))
                        missing.push(`${child.head} drops ${header.name}: ${header.value}`);
                }
            }
            visit(child);
        }
    };
    visit(server);
    assert.deepEqual(missing, []);
});

test('staging readback accepts the application, built asset and API together', async (t) => {
    const server = await fixtureServer();
    t.after(() => server.close());
    const address = server.address();
    const result = await run('sh', [
        'scripts/deploy/staging-readback.sh',
        `http://127.0.0.1:${address.port}`,
        'full',
    ]);
    assert.match(result.stdout, /^PASS staging readback:/);
});

test('staging readback rejects a backend that does not report healthy', async (t) => {
    const server = await fixtureServer(503);
    t.after(() => server.close());
    const address = server.address();
    await assert.rejects(
        run('sh', [
            'scripts/deploy/staging-readback.sh',
            `http://127.0.0.1:${address.port}`,
            'full',
        ]),
        (error) => {
            assert.match(error.stderr, /PocketBase did not report code 200/);
            return true;
        },
    );
});

test('staging health uses the full readback, so the stack is healthy only when lesson keys are installed', async () => {
    const [dockerfile, compose] = await Promise.all([
        readFile('apps/web/Dockerfile', 'utf8'),
        readFile('docker-compose.staging.yml', 'utf8'),
    ]);
    // The image's own healthcheck stays web-only; the staging stack, which has the backend, reads it in full.
    assert.match(dockerfile, /CMD \["\/usr\/local\/bin\/staging-readback\.sh", "http:\/\/127\.0\.0\.1", "web-only"\]/);
    assert.match(compose, /test: \["CMD", "\/usr\/local\/bin\/staging-readback\.sh", "http:\/\/127\.0\.0\.1", "full"\]/);
    const script = await readFile('scripts/deploy/staging-readback.sh', 'utf8');
    assert.ok(script.includes(`"$base_url${KEYS_HEALTH}"`), 'full mode reads keys-health from the same origin');
});

test('full readback accepts private keys whatever the whitespace, and reads keys-health once', async (t) => {
    const pretty = await fixtureServer(200, `${JSON.stringify(PRIVATE_KEYS, null, 2)}\n`);
    t.after(() => pretty.close());
    const result = await readback(pretty, 'full');
    assert.match(result.stdout, /^PASS staging readback:/);
    assert.equal(pretty.requested.filter((path) => path === KEYS_HEALTH).length, 1);
});

test('full readback fails closed unless the lesson keys are PRIVATE and every lesson can be graded', async (t) => {
    const marker = 'response-text-that-must-not-be-logged';
    const cases = [
        ['an absent key file', { ...PRIVATE_KEYS, keys: 'ABSENT', gradable: 0, unavailable: 3 }, /lesson grading keys are not installed as PRIVATE/],
        ['an absent key file with nothing stored', { ...PRIVATE_KEYS, keys: 'ABSENT', lessons: 0, gradable: 0 }, /lesson grading keys are not installed as PRIVATE/],
        ['synthetic keys', { ...PRIVATE_KEYS, keys: 'SYNTHETIC' }, /lesson grading keys are not installed as PRIVATE/],
        ['an unusable key file', { ...PRIVATE_KEYS, keys: 'INVALID' }, /lesson grading keys are not installed as PRIVATE/],
        ['a lowercase state', { ...PRIVATE_KEYS, keys: 'private' }, /lesson grading keys are not installed as PRIVATE/],
        ['private keys with lessons left ungradable', { ...PRIVATE_KEYS, gradable: 1, unavailable: 2 }, /some lessons cannot be graded/],
        ['private keys with ten ungradable lessons', { ...PRIVATE_KEYS, lessons: 10, gradable: 0, unavailable: 10 }, /some lessons cannot be graded/],
        ['an unavailable count that is not a number', { ...PRIVATE_KEYS, unavailable: '0' }, /some lessons cannot be graded/],
        ['an unavailable count that only starts with 0', '{"keys":"PRIVATE","lessons":3,"unavailable":0.5}', /some lessons cannot be graded/],
        ['a body without the counts', { schema_version: 1, keys: 'PRIVATE' }, /some lessons cannot be graded/],
        ['a repeated key state', `{"keys":"ABSENT","keys":"PRIVATE","unavailable":0,"note":"${marker}"}`, /lesson keys health is ambiguous/],
        ['a repeated count', `{"keys":"PRIVATE","unavailable":4,"unavailable":0,"note":"${marker}"}`, /lesson keys health is ambiguous/],
        ['a response that is not JSON', `<html>${marker}</html>`, /lesson grading keys are not installed as PRIVATE/],
        ['hooks without the keys-health route', null, /lesson keys health endpoint is unavailable/],
    ];
    for (const [label, body, message] of cases) {
        const server = await fixtureServer(200, body);
        t.after(() => server.close());
        await assert.rejects(readback(server, 'full'), (error) => {
            assert.match(error.stderr, message, label);
            assert.equal(error.stdout, '', `${label}: nothing is reported as passing`);
            assert.equal(`${error.stdout}${error.stderr}`.includes(marker), false, `${label}: the response is never echoed`);
            return true;
        }, label);
    }
});

test('web-only readback reads neither the backend nor the lesson key state', async (t) => {
    const server = await fixtureServer(503, { ...PRIVATE_KEYS, keys: 'ABSENT', unavailable: 3 });
    t.after(() => server.close());
    const result = await readback(server, 'web-only');
    assert.match(result.stdout, /^PASS staging readback: application \(web-only\)/);
    assert.deepEqual(server.requested.filter((path) => path.startsWith('/api/')), []);
});
