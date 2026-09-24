// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/build.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        BITS-CODEGEN, C-ONE (community links, sameAs and guildmaster profiles)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/tools/generate-seo.mjs, apps/web/tools/release-telemetry.mjs
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/tools/generate-seo.mjs; VALIDATES apps/web/tools/release-telemetry.mjs
// DAG Node:    none
// Intent:      Verify release identity and real generated crawler artifacts without network dependencies.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { resolveBuildRelease } from '../../scripts/ci/release.mjs';
import { generatePublicAssets, generatePageHeads } from '../../apps/web/tools/generate-seo.mjs';
import { PUBLIC_PAGES, SITE_ORIGIN } from '../../apps/web/src/lib/publicPages.js';
import { COMMUNITY_LINKS, SAME_AS, STORE_LINK } from '../../apps/web/src/lib/communityLinks.js';
import { PERSONA_PAGES } from '../../apps/web/src/data/personas.js';
import { ADAPTER_MODULES, checkAdapterConfiguration, releaseTelemetryContract, releaseTelemetryPlugin, verifyTelemetryArtifact, TELEMETRY_MANIFEST } from '../../apps/web/tools/release-telemetry.mjs';

// The crawler resources cover the catalogue AND one profile per guildmaster.
const INDEXED = [...PUBLIC_PAGES, ...PERSONA_PAGES];

function temporary(t) {
    const root = mkdtempSync(join(tmpdir(), 'buildanddo-upgrade-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
}

test('the actual build wrapper scans generated feeds before finalizing release telemetry', async () => {
    const wrapper = readFileSync(new URL('../../apps/web/tools/build.mjs', import.meta.url), 'utf8')
        .replace(/^#!.*\n/, '').replace(/^import .*;$/gm, '')
        .replaceAll('import.meta.url', '__moduleUrl').replace("await import('vite')", '__vite');
    for (const mode of ['release', 'ordinary', 'build_failure', 'answer_leak']) {
        const calls = [], original = new Error('Synthetic bundler failure');
        const contract = mode === 'ordinary' ? null : { publicConfig: {} };
        const release = { commit_sha: 'a'.repeat(40), version: '38+aaaaaaa' };
        const finish = () => { calls.push('telemetry'); };
        const context = {
            URL, fileURLToPath, TELEMETRY_MANIFEST,
            __moduleUrl: new URL('../../apps/web/tools/build.mjs', import.meta.url).href,
            process: { env: {}, exit: (code) => { throw Object.assign(new Error('Build refused'), { exitCode: code }); } },
            console: { error() {} },
            rmSync: () => calls.push('clear_manifest'),
            resolveBuildRelease: () => release,
            releaseTelemetryContract: () => contract,
            releaseTelemetryPlugin: () => ({ plugin: { name: 'synthetic-observer' }, finish }),
            generatePublicAssets: () => calls.push('public_assets'),
            spawnSync: () => { calls.push('projection'); return { status: 0 }; },
            __vite: { build: async (options) => {
                calls.push('build');
                assert.equal(options.build.emptyOutDir, true);
                assert.equal(options.plugins.length, contract ? 1 : 0);
                if (mode === 'build_failure') throw original;
            } },
            generatePageHeads: () => calls.push('page_heads'),
            generateCommunityCatalogue: () => calls.push('community_feed'),
            findLessonAnswers: () => { calls.push('answer_scan'); return mode === 'answer_leak' ? [{ slug: 'synthetic', file: 'community-catalog.json' }] : []; },
        };
        const run = vm.runInNewContext(`(async () => { ${wrapper}\n })()`, context);
        if (mode === 'build_failure') await assert.rejects(run, (error) => error === original);
        else if (mode === 'answer_leak') await assert.rejects(run, (error) => error.exitCode === 1);
        else await run;
        assert.deepEqual(calls, ['clear_manifest', 'public_assets', 'projection', 'build',
            ...(mode === 'build_failure' ? [] : ['page_heads', 'community_feed', 'answer_scan']),
            ...(mode === 'release' ? ['telemetry'] : [])], mode);
    }
});

test('one release is stable across build and CLI consumers', () => {
    const release = resolveBuildRelease();
    assert.deepEqual(
        JSON.parse(
            execFileSync('node', ['scripts/ci/release.mjs', '--json'], { encoding: 'utf8' }),
        ),
        release,
    );
    assert.equal(
        execFileSync('node', ['scripts/ci/release.mjs'], { encoding: 'utf8' }).trim(),
        release.version,
    );
    assert.equal(release.version, `${release.base_version}+${release.commit_sha.slice(0, 7)}`);
});

test('release reads the source version and rejects missing or malformed identity', (t) => {
    const root = temporary(t);
    assert.throws(() => resolveBuildRelease({ root }));
    writeFileSync(join(root, '.version'), '38\n');
    assert.equal(
        resolveBuildRelease({ root, commitSha: 'abc1234' + '0'.repeat(33) }).version,
        '38+abc1234',
    );
    assert.throws(() => resolveBuildRelease({ root, commitSha: 'abc1234' }));
    writeFileSync(join(root, '.version'), 'unknown');
    assert.throws(() => resolveBuildRelease({ root, commitSha: '0'.repeat(40) }));
});

test('crawler resources contain every public route and exclude private pages', (t) => {
    const root = temporary(t);
    generatePublicAssets(root);
    const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
    const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
    const llms = readFileSync(join(root, 'llms.txt'), 'utf8');
    assert.equal((sitemap.match(/<url>/g) || []).length, INDEXED.length);
    for (const page of INDEXED) {
        assert.ok(sitemap.includes(`<loc>${SITE_ORIGIN}${page.path}</loc>`));
        assert.ok(llms.includes(page.description));
    }
    // llms.txt lists every community surface and the store from communityLinks.js, not a hand copy.
    for (const link of [...COMMUNITY_LINKS, STORE_LINK]) {
        assert.ok(llms.includes(`- [${link.label}](${link.url}): ${link.summary}`), link.id);
    }
    assert.ok(llms.includes('Each guildmaster is an automated agent, not a person.'));
    assert.ok(robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
    for (const path of [
        '/app',
        '/login',
        '/signup',
        '/forgot-password',
        '/onboarding',
        '/api/',
        '/hcgi/',
    ]) {
        assert.ok(robots.includes(`Disallow: ${path}`));
        assert.ok(!sitemap.includes(`<loc>${SITE_ORIGIN}${path}</loc>`));
    }
});

test('social crawlers get route-specific metadata without executing the app', (t) => {
    const root = temporary(t);
    writeFileSync(
        join(root, 'index.html'),
        '<!doctype html><html><head><title>Old</title><meta name="description" content="old"><meta property="og:title" content="old"><link rel="canonical" href="https://old.invalid/"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>',
    );
    const release = { version: '38+abc1234', commit_sha: 'abc1234' + '0'.repeat(33) };
    generatePageHeads(root, release);
    for (const page of INDEXED) {
        const html = readFileSync(join(root, page.path, 'index.html'), 'utf8');
        assert.equal((html.match(/<title>/g) || []).length, 1);
        assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
        assert.ok(html.includes(`href="${SITE_ORIGIN}${page.path}"`));
        assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
        assert.ok(html.includes('property="og:image"'));
        assert.ok(html.includes('name="buildanddo:version" content="38+abc1234"'));
        assert.ok(html.includes('src="/assets/app.js"'));
        assert.ok(!html.includes('old.invalid'));
        const schema = JSON.parse(
            html.match(/id="static-page-schema" type="application\/ld\+json">([^<]+)<\/script>/)[1],
        );
        assert.equal(schema['@type'], page.type);
        assert.equal(schema.url, SITE_ORIGIN + page.path);
        assert.equal(schema.publisher.name, 'Citadel Nexus Inc.');
        assert.deepEqual(schema.isPartOf.sameAs, [...SAME_AS]);
    }
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')), release);
    for (const path of ['app', 'login', 'signup', 'forgot-password', 'onboarding']) {
        assert.ok(
            readFileSync(join(root, path, 'index.html'), 'utf8').includes(
                'content="noindex,nofollow"',
            ),
        );
    }
});

test('GitHub export appends the same release without replacing other environment fields', (t) => {
    const directory = temporary(t);
    const destination = join(directory, 'github-env');
    writeFileSync(destination, 'EXISTING=value\n');
    execFileSync('node', ['scripts/ci/release.mjs', '--github-env'], {
        env: { ...process.env, GITHUB_ENV: destination },
    });
    assert.equal(
        readFileSync(destination, 'utf8'),
        `EXISTING=value\nRELEASE_VERSION=${resolveBuildRelease().version}\n`,
    );
    assert.throws(() =>
        execFileSync('node', ['scripts/ci/release.mjs', '--github-env'], {
            env: { ...process.env, GITHUB_ENV: '' },
            stdio: 'pipe',
        }),
    );
});

const SYNTHETIC_RELEASE = { version: '38+aaaaaaa', commit_sha: 'a'.repeat(40) };
const SYNTHETIC_ENV = {
    BUILDANDDO_RELEASE_TARGET: 'staging-production',
    BUILDANDDO_TELEMETRY_BUILD_ID: '11111111-1111-4111-8111-111111111111',
    VITE_BUILDANDDO_PH: 'synthetic-posthog-input',
    VITE_DD_APPLICATION_ID: 'synthetic-datadog-application',
    VITE_DD_CLIENT_TOKEN: 'synthetic-datadog-intake',
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Only Vite's env replacement is simulated here. Adapters AND their dynamic
// configuration helpers are real source. The optional Vite case uses the real compiler.
function adapterSources(input) {
    const environment = JSON.stringify({ MODE: 'production', PROD: true, DEV: false, ...input });
    return Object.fromEntries(ADAPTER_MODULES.map((name) => [name,
        readFileSync(new URL(`../../apps/web/${name}`, import.meta.url), 'utf8').replaceAll('import.meta.env', `(${environment})`),
    ]));
}

// The module graph/file writer is a Rollup double; it cannot establish a real build.
function telemetryFixture(t, environment = SYNTHETIC_ENV) {
    const root = temporary(t);
    mkdirSync(join(root, 'assets'));
    const contract = releaseTelemetryContract(environment, SYNTHETIC_RELEASE);
    const sources = adapterSources(contract.publicConfig);
    const code = 'export const syntheticArtifact = "unit-bundler-double";';
    const chunk = {
        type: 'chunk', fileName: 'assets/app.js', code, isEntry: true, imports: [],
        modules: Object.fromEntries([
            ['/synthetic/app/src/lib/telemetry.js', ['initTelemetry']],
            ['/synthetic/app/src/lib/datadogRum.js', ['initDatadogRum']],
            ...ADAPTER_MODULES.slice(2).map((name) => ['/synthetic/app/' + name, []]),
            ['/synthetic/app/node_modules/posthog-js/index.js', []],
            ['/synthetic/app/node_modules/@datadog/browser-rum/index.js', []],
            ['/synthetic/app/node_modules/@datadog/browser-logs/index.js', []],
        ].map(([id, renderedExports]) => [id, { renderedLength: 100, renderedExports }])),
    };
    const measured = releaseTelemetryPlugin(contract);
    measured.plugin.configResolved({ root: '/synthetic/app', env: contract.publicConfig });
    function render() {
        measured.plugin.generateBundle.handler.call({
            parse() {},
            getModuleInfo(id) { return { code: sources[id.replace('/synthetic/app/', '')] }; },
        }, {}, { [chunk.fileName]: chunk });
    }
    writeFileSync(join(root, chunk.fileName), code);
    writeFileSync(join(root, 'index.html'), '<script type="module" src="/assets/app.js"></script>');
    writeFileSync(join(root, 'version.json'), JSON.stringify(SYNTHETIC_RELEASE));
    return { root, contract, measured, chunk, sources, render };
}

test('ordinary offline builds stay keyless; designated release inputs fail closed without exposing values', () => {
    assert.equal(releaseTelemetryContract({ NODE_ENV: 'production' }, SYNTHETIC_RELEASE), null);
    for (const key of ['VITE_BUILDANDDO_PH', 'VITE_DD_APPLICATION_ID', 'VITE_DD_CLIENT_TOKEN']) {
        for (const value of ['', ' ', 'synthetic\ninvalid']) {
            assert.throws(() => releaseTelemetryContract({ ...SYNTHETIC_ENV, [key]: value }, SYNTHETIC_RELEASE), (error) => {
                assert.ok(error.message.includes(key));
                assert.ok(!error.message.includes('synthetic'));
                return true;
            });
        }
    }
    for (const value of ['0', '0x32', '-1', '101', 'invalid']) {
        assert.throws(() => releaseTelemetryContract({ ...SYNTHETIC_ENV, VITE_DD_SESSION_SAMPLE_RATE: value }, SYNTHETIC_RELEASE));
    }
    assert.throws(() => releaseTelemetryContract({ ...SYNTHETIC_ENV, BUILDANDDO_RELEASE_TARGET: 'preview' }, SYNTHETIC_RELEASE));
    assert.throws(() => releaseTelemetryContract(SYNTHETIC_ENV, { ...SYNTHETIC_RELEASE, version: '38+bbbbbbb' }), /invalid release/);
    assert.throws(() => releaseTelemetryContract({ ...SYNTHETIC_ENV, VITE_DD_ENV: 'production' }, SYNTHETIC_RELEASE));
    assert.throws(() => releaseTelemetryContract({ ...SYNTHETIC_ENV, VITE_DD_ENV: 'staging-production' }, SYNTHETIC_RELEASE));
    assert.throws(() => releaseTelemetryContract({ ...SYNTHETIC_ENV, BUILDANDDO_RELEASE_TARGET: 'production', VITE_DD_ENV: 'staging' }, SYNTHETIC_RELEASE));
    assert.equal(releaseTelemetryContract({ ...SYNTHETIC_ENV, BUILDANDDO_RELEASE_TARGET: 'production', VITE_DD_ENV: 'production' }, SYNTHETIC_RELEASE).target, 'production');
});

test('real adapters and helpers honor both hostnames and nondefault sampling without reporting values', (t) => {
    for (const rates of [{}, { VITE_DD_SESSION_SAMPLE_RATE: '63', VITE_DD_REPLAY_SAMPLE_RATE: '7', VITE_DD_TRACE_SAMPLE_RATE: '11' }]) {
        const fixture = telemetryFixture(t, { ...SYNTHETIC_ENV, ...rates });
        fixture.render();
        const manifest = fixture.measured.finish(fixture.root);
        assert.equal(manifest.files['assets/app.js'].sha256, sha256(fixture.chunk.code));
        assert.deepEqual(Object.keys(manifest.sinks).sort(), ['datadog_logs', 'datadog_rum', 'posthog']);
        assert.equal(manifest.build_id, SYNTHETIC_ENV.BUILDANDDO_TELEMETRY_BUILD_ID);
        assert.equal(manifest.commit_sha, SYNTHETIC_RELEASE.commit_sha);
        const serialized = readFileSync(join(fixture.root, TELEMETRY_MANIFEST), 'utf8');
        for (const name of ['VITE_BUILDANDDO_PH', 'VITE_DD_APPLICATION_ID', 'VITE_DD_CLIENT_TOKEN']) {
            assert.ok(!serialized.includes(SYNTHETIC_ENV[name]));
        }
        assert.deepEqual(manifest.adapter_contract.config_sha256, fixture.contract.sdk_config_sha256);
        assert.deepEqual(Object.keys(manifest.adapter_contract.config_sha256), ['staging', 'production']);
        assert.equal(manifest.adapter_contract.scope, 'offline-sdk-stubs-not-ingestion');
        for (const name of ADAPTER_MODULES) assert.equal(manifest.adapter_contract.source_sha256[name], sha256(fixture.sources[name]));
    }
});

test('configured inputs or SDK bytes alone cannot stand in for an initialized sink', (t) => {
    for (const key of ['VITE_BUILDANDDO_PH', 'VITE_DD_APPLICATION_ID', 'VITE_DD_CLIENT_TOKEN']) {
        const fixture = telemetryFixture(t);
        Object.assign(fixture.sources, adapterSources({ ...fixture.contract.publicConfig, [key]: '' }));
        assert.throws(fixture.render, /SDK configuration contract failed/);
    }
    for (const suffix of ['posthog-js/index.js', '@datadog/browser-rum/index.js', '@datadog/browser-logs/index.js']) {
        const fixture = telemetryFixture(t);
        delete fixture.chunk.modules['/synthetic/app/node_modules/' + suffix];
        assert.throws(fixture.render, /missing rendered/);
    }
    const treeShaken = telemetryFixture(t);
    treeShaken.chunk.modules['/synthetic/app/src/lib/telemetry.js'].renderedExports = [];
    assert.throws(treeShaken.render, /missing rendered/);
});

test('review regression: mutation and ambiguous dependencies cannot be certified from an initializer', (t) => {
    const fixture = telemetryFixture(t);
    const original = fixture.sources['src/lib/telemetry.js'];
    for (const assignment of ['KEY = "";', 'KEY = window.unreviewedKey;', 'KEY = Math.random() ? KEY : "";']) {
        const changed = original.replace('const KEY =', 'let KEY =')
            .replace('export function initTelemetry() {', `export function initTelemetry() { ${assignment}`);
        assert.notEqual(changed, original);
        fixture.sources['src/lib/telemetry.js'] = changed;
        assert.throws(fixture.render, /SDK configuration contract failed/);
    }
    fixture.sources['src/lib/telemetry.js'] = 'import p from "posthog-js"; let key="synthetic-posthog"; key=""; export function initTelemetry(){p.init(key,{api_host:"https://intake.invalid"})}';
    assert.throws(fixture.render, /SDK configuration contract failed/);
});

test('review regression: real adapter calls cannot override sampling, environment or release', (t) => {
    const fixture = telemetryFixture(t);
    const original = fixture.sources['src/lib/datadogRum.js'];
    for (const [field, value] of [['sessionSampleRate', '0'], ['env', '"development"'], ['version', '"stale"']]) {
        const changed = original.replaceAll(new RegExp(`\\n(\\s+)${field},`, 'g'), `\n$1${field}: ${value},`);
        assert.notEqual(changed, original);
        fixture.sources['src/lib/datadogRum.js'] = changed;
        assert.throws(fixture.render, /SDK configuration contract failed/);
    }
    fixture.sources['src/lib/datadogRum.js'] = original;
    const context = fixture.sources['src/lib/observability/context.js'];
    fixture.sources['src/lib/observability/context.js'] = context.replace('return parsed;', 'return 0;');
    assert.notEqual(context, fixture.sources['src/lib/observability/context.js']);
    assert.throws(fixture.render, /SDK configuration contract failed/);
});

test('configuration check refuses missing modules and unresolved build env rather than supplying expected values', (t) => {
    const fixture = telemetryFixture(t);
    assert.throws(() => checkAdapterConfiguration({}, fixture.contract), /SDK configuration contract failed/);
    fixture.sources['src/lib/telemetry.js'] = readFileSync(new URL('../../apps/web/src/lib/telemetry.js', import.meta.url), 'utf8');
    assert.throws(fixture.render, /SDK configuration contract failed/);
});

test('promotion requires the bound SDK check, environment, fresh build ID and unchanged manifest', (t) => {
    const fixture = telemetryFixture(t);
    fixture.render();
    const manifest = fixture.measured.finish(fixture.root);
    const expected = { ...fixture.contract, manifest_sha256: sha256(readFileSync(join(fixture.root, TELEMETRY_MANIFEST))) };
    assert.equal(verifyTelemetryArtifact(fixture.root, expected, 'staging').ok, true);
    assert.equal(verifyTelemetryArtifact(fixture.root, expected, 'production').ok, true);
    assert.throws(() => verifyTelemetryArtifact(fixture.root, { ...expected, build_id: 'stale' }, 'staging'), /identity mismatch/);
    assert.throws(() => verifyTelemetryArtifact(fixture.root, expected, 'development'), /environment mismatch/);
    delete manifest.adapter_contract;
    const raw = JSON.stringify(manifest);
    writeFileSync(join(fixture.root, TELEMETRY_MANIFEST), raw);
    assert.throws(() => verifyTelemetryArtifact(fixture.root, expected, 'staging'), /manifest changed/);
    assert.throws(() => verifyTelemetryArtifact(fixture.root, { ...expected, manifest_sha256: sha256(raw) }, 'staging'), /SDK configuration evidence/);
});

test('a stale, missing or truncated emitted JS file cannot receive a fresh release manifest', (t) => {
    for (const failure of ['missing', 'truncated', 'stale', 'extra', 'wrong-html', 'wrong-version']) {
        const fixture = telemetryFixture(t);
        fixture.render();
        const script = join(fixture.root, 'assets/app.js');
        if (failure === 'missing') rmSync(script);
        if (failure === 'truncated') writeFileSync(script, fixture.chunk.code.slice(0, 10));
        if (failure === 'stale') writeFileSync(script, fixture.chunk.code.replace('unit-bundler', 'past-bundler'));
        if (failure === 'extra') writeFileSync(join(fixture.root, 'assets/stale.js'), 'old()');
        if (failure === 'wrong-html') writeFileSync(join(fixture.root, 'index.html'), '<script src="/assets/other.js"></script>');
        if (failure === 'wrong-version') writeFileSync(join(fixture.root, 'version.json'), '{"commit_sha":"stale"}');
        assert.throws(() => fixture.measured.finish(fixture.root), undefined, failure);
    }
});

test('resolved env overrides, missing graph dependencies and missing bundler evidence are refused', (t) => {
    const fixture = telemetryFixture(t);
    assert.throws(() => fixture.measured.finish(fixture.root), /bundler evidence missing/);
    const config = { root: '/synthetic/app', env: fixture.contract.publicConfig };
    assert.throws(() => fixture.measured.plugin.configResolved({ ...config, env: { ...config.env, VITE_DD_CLIENT_TOKEN: '' } }), /resolved configuration mismatch/);
    assert.throws(() => fixture.measured.plugin.configResolved({ ...config, define: { 'import.meta.env.VITE_DD_CLIENT_TOKEN': '"override"' } }), /resolved configuration mismatch/);
    fixture.chunk.imports = ['assets/missing.js'];
    assert.throws(fixture.render, /missing or external entry import/);
});

test('real Vite builds the REAL adapters with SDK stubs, minification on/off and bad-config controls', async (t) => {
    let vite;
    try { vite = await import('vite'); }
    catch (error) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
        t.skip('Vite is not installed; no download or vendor call is permitted');
        return;
    }
    const root = temporary(t);
    const oldEnv = process.env;
    t.after(() => { process.env = oldEnv; });
    const contract = releaseTelemetryContract({ ...SYNTHETIC_ENV, VITE_DD_SESSION_SAMPLE_RATE: '63',
        VITE_DD_REPLAY_SAMPLE_RATE: '7', VITE_DD_TRACE_SAMPLE_RATE: '11' }, SYNTHETIC_RELEASE);
    process.env = { PATH: oldEnv.PATH, NODE_ENV: 'production', ...contract.publicConfig };
    const sources = {
        'index.html': '<script type="module" src="/main.js"></script>',
        'main.js': 'import {initTelemetry} from "./src/lib/telemetry.js"; import {initDatadogRum} from "./src/lib/datadogRum.js"; initTelemetry(); initDatadogRum();',
        ...Object.fromEntries(ADAPTER_MODULES.map((name) => [name, readFileSync(new URL(`../../apps/web/${name}`, import.meta.url), 'utf8')])),
        'src/lib/observability/network.js': 'export const networkSummary=()=>({});',
        'src/lib/observability/report.js': 'export const enableReporting=()=>{};',
        'node_modules/posthog-js/index.js': 'export default {config:null,get_config(key){return this.config?.[key]},init(key,config){this.config={...config,token:key}}};',
        'node_modules/@datadog/browser-rum/index.js': 'export const datadogRum={config:null,getInitConfiguration(){return this.config},init(config){this.config=config}};',
        'node_modules/@datadog/browser-logs/index.js': 'export const datadogLogs={config:null,getInitConfiguration(){return this.config},init(config){this.config=config}};',
    };
    for (const [name, source] of Object.entries(sources)) {
        const path = join(root, name);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, source);
    }
    for (const minify of [false, 'esbuild']) {
        const measured = releaseTelemetryPlugin(contract);
        const output = join(root, minify ? 'minified' : 'unminified');
        const options = { root, configFile: false, envFile: false, logLevel: 'silent',
            plugins: [measured.plugin],
            resolve: { alias: { '@': join(root, 'src'), ...Object.fromEntries(['posthog-js', '@datadog/browser-rum', '@datadog/browser-logs'].map((name) => [name, join(root, 'node_modules', name, 'index.js')])) } },
            build: { outDir: output, minify },
        };
        await vite.build(options);
        writeFileSync(join(output, 'version.json'), JSON.stringify(SYNTHETIC_RELEASE));
        assert.equal(Object.keys(measured.finish(output).sinks).length, 3);
        const { publicConfig: _inputs, ...expected } = contract;
        expected.manifest_sha256 = sha256(readFileSync(join(output, TELEMETRY_MANIFEST)));
        for (const environment of ['staging', 'production']) {
            execFileSync(process.execPath, ['apps/web/tools/release-telemetry.mjs', 'verify', output, JSON.stringify(expected), environment], { stdio: 'pipe' });
        }
        for (const replacement of ['sessionSampleRate:0,', 'env:"development",', 'version:"stale",']) {
            const field = replacement.split(':')[0];
            const badConfig = { name: 'negative-config-control', enforce: 'pre', transform(code, id) {
                if (id.endsWith('/src/lib/datadogRum.js')) return code.replaceAll(new RegExp(`\\n(\\s+)${field},`, 'g'), `\n$1${replacement}`);
            } };
            await assert.rejects(vite.build({ ...options, plugins: [badConfig, releaseTelemetryPlugin(contract).plugin] }), /SDK configuration contract failed/);
        }
    }
});
