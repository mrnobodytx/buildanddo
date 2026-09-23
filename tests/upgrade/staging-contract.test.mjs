// ─── CGRF Header ──────────────────────────────
// File:        tests/upgrade/staging-contract.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-BUDDI-003
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-BUDDI-003
// Seat:        BITS-CODEGEN, C-ONE (the microphone policy)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/Dockerfile, docker-compose.staging.yml, scripts/deploy/staging-readback.sh, apps/web/nginx.conf
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/Dockerfile; VALIDATES docker-compose.staging.yml; VALIDATES scripts/deploy/staging-readback.sh; VALIDATES apps/web/nginx.conf
// DAG Node:    buildanddo.staging.contract-test
// Intent:      Prove the staging definition builds production output and rejects incomplete HTTP readback.
// ───────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);

async function fixtureServer(apiCode = 200) {
    const server = createServer((request, response) => {
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
        response.writeHead(404);
        response.end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server;
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
    const policies = [...nginx.matchAll(/add_header Permissions-Policy "([^"]*)" always;/g)].map((match) => match[1]);
    assert.deepEqual(policies, ['camera=(), microphone=(self), geolocation=()']);
    // nginx drops every server-level add_header in a location that declares its own, so the document
    // location must declare none or the page is served with no policy at all.
    const documentLocation = nginx.match(/location \/ \{[\s\S]*?\}/)?.[0];
    assert.ok(documentLocation, 'the document location exists');
    assert.doesNotMatch(documentLocation, /add_header/);
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
