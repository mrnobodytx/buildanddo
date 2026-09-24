// --- CGRF Header ------------------------------------------------
// File:        apps/web/tools/release-telemetry.mjs
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/telemetry.js, apps/web/src/lib/datadogRum.js, apps/web/src/lib/observability/context.js, apps/web/src/lib/observability/config.js
// EnumType:    Adapter
// EnumEdges:   VALIDATES apps/web/src/lib/telemetry.js; VALIDATES apps/web/src/lib/datadogRum.js
// Intent:      Bind an offline SDK configuration check on the real bundler modules to fresh artifacts without interpreting JavaScript or claiming ingestion.
// ----------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';
import { resolveBuildRelease } from '../../../scripts/ci/release.mjs';

export const TELEMETRY_MANIFEST = 'telemetry-manifest.json';
export const TELEMETRY_SCHEMA = 'buildanddo.release-telemetry/v2';
const CONFIG_CHECK_SCHEMA = 'buildanddo.sdk-config-check/v1';
const TARGETS = { staging: ['staging'], production: ['production'], 'staging-production': ['staging', 'production'] };
const HOSTS = { staging: 'staging.buildanddo.com', production: 'buildanddo.com' };
const REQUIRED_KEYS = ['VITE_BUILDANDDO_PH', 'VITE_DD_APPLICATION_ID', 'VITE_DD_CLIENT_TOKEN'];
export const ADAPTER_MODULES = [
    'src/lib/telemetry.js', 'src/lib/datadogRum.js', 'src/lib/observability/context.js',
    'src/lib/observability/config.js', 'src/lib/navigationIntent.js',
];
const SINKS = {
    posthog: { adapter: '/src/lib/telemetry.js', init: 'initTelemetry', sdk: '/node_modules/posthog-js/' },
    datadog_rum: { adapter: '/src/lib/datadogRum.js', init: 'initDatadogRum', sdk: '/node_modules/@datadog/browser-rum/' },
    datadog_logs: { adapter: '/src/lib/datadogRum.js', init: 'initDatadogRum', sdk: '/node_modules/@datadog/browser-logs/' },
};

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const refuse = (code) => { throw new Error(`Release telemetry: ${code}`); };
const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort()) : item);
const hashConfig = (value) => digest(canonical(value));
const hashMap = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    canonical(Object.keys(value).sort()) === canonical([...keys].sort()) &&
    Object.values(value).every((hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash));

// This is a small SDK boundary contract, not a model of arbitrary JavaScript.
function expectedSdkConfig(input, environment) {
    const common = { clientToken: input.VITE_DD_CLIENT_TOKEN, env: environment, version: input.VITE_DD_VERSION,
        sessionSampleRate: Number(input.VITE_DD_SESSION_SAMPLE_RATE) };
    return {
        posthog: { key: input.VITE_BUILDANDDO_PH, api_host: 'https://us.i.posthog.com' },
        datadog_rum: { ...common, applicationId: input.VITE_DD_APPLICATION_ID,
            sessionReplaySampleRate: Number(input.VITE_DD_REPLAY_SAMPLE_RATE), traceSampleRate: Number(input.VITE_DD_TRACE_SAMPLE_RATE) },
        datadog_logs: { ...common, forwardErrorsToLogs: true },
    };
}

function publicDescriptor(contract) {
    const { publicConfig: _inputs, ...descriptor } = contract;
    return descriptor;
}

/** Select a release-only contract. An ordinary offline/dev build needs no keys. */
export function releaseTelemetryContract(environment, release) {
    const target = environment.BUILDANDDO_RELEASE_TARGET || '';
    if (!target) return null;
    if (!Object.hasOwn(TARGETS, target)) refuse('invalid target');
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(release.commit_sha) ||
        !/^[0-9]+(?:\.[0-9]+){0,2}(?:-[a-zA-Z0-9.-]+)?\+[a-f0-9]{7}$/.test(release.version) ||
        !release.version.endsWith('+' + release.commit_sha.slice(0, 7))) refuse('invalid release');
    const input = (key) => environment[key] ?? environment[key === 'VITE_BUILDANDDO_PH' ? 'BUILDANDDO_PH' : key.replace('VITE_', 'BUILDANDDO_')];
    const publicConfig = Object.fromEntries(REQUIRED_KEYS.map((key) => [key, input(key) || '']));
    for (const key of REQUIRED_KEYS) {
        if (!/^[\x21-\x7e]+$/.test(publicConfig[key])) refuse(`missing or invalid ${key}`);
    }
    publicConfig.VITE_DD_ENV = environment.VITE_DD_ENV || '';
    if (publicConfig.VITE_DD_ENV && (target === 'staging-production' || publicConfig.VITE_DD_ENV !== target)) refuse('environment mismatch');
    for (const [key, fallback] of Object.entries({
        VITE_DD_SESSION_SAMPLE_RATE: '100', VITE_DD_REPLAY_SAMPLE_RATE: '20', VITE_DD_TRACE_SAMPLE_RATE: '20',
    })) {
        const value = input(key) || fallback;
        if (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) > 100 ||
            (key === 'VITE_DD_SESSION_SAMPLE_RATE' && Number(value) === 0)) refuse(`invalid ${key}`);
        publicConfig[key] = value;
    }
    publicConfig.VITE_BUILD_SHA = release.commit_sha;
    publicConfig.VITE_DD_VERSION = release.version;
    const buildId = environment.BUILDANDDO_TELEMETRY_BUILD_ID || randomUUID();
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(buildId)) refuse('invalid build ID');
    return {
        schema: TELEMETRY_SCHEMA,
        build_id: buildId, target, commit_sha: release.commit_sha, version: release.version,
        config_sha256: hashConfig(publicConfig),
        public_input_sha256: Object.fromEntries(REQUIRED_KEYS.map((key) => [key, digest(publicConfig[key])])),
        sdk_config_sha256: Object.fromEntries(TARGETS[target].map((environment) => [environment,
            Object.fromEntries(Object.entries(expectedSdkConfig(publicConfig, environment)).map(([sink, options]) => [sink, hashConfig(options)])),
        ])),
        publicConfig,
    };
}

/** Execute only the real adapter/config modules with SDK doubles, never vendor packages.
 * A bounded startup contract test on trusted repository code, not a security sandbox
 * or a generic JavaScript verifier. Transformed sources must carry their own env.
 */
async function observeAdapterConfiguration(sources, contract) {
    for (const name of ADAPTER_MODULES) if (typeof sources[name] !== 'string') refuse('adapter source missing');
    const observedHashes = {};
    for (const environment of TARGETS[contract.target]) {
        let unexpectedEffect = false;
        const forbidden = () => { unexpectedEffect = true; throw new Error('unsupported configuration dependency'); };
        const closed = (object) => new Proxy(object, { get(target, key) { return Object.hasOwn(target, key) ? target[key] : forbidden(); } });
        const snapshots = {};
        const save = (sink, config) => {
            if (Object.hasOwn(snapshots, sink)) forbidden();
            snapshots[sink] = config;
        };
        const posthog = {
            config: null,
            get_config(key) { return this.config?.[key]; },
            init(key, options) { this.config = { ...options, token: key }; save('posthog', { ...options, key }); },
        };
        const vendor = (sink) => ({ config: null, getInitConfiguration() { return this.config; },
            init(config) { this.config = config; save(sink, config); } });
        const context = vm.createContext({ URL,
            window: closed({ location: new URL(`https://${HOSTS[environment]}/`) }),
            fetch: forbidden, XMLHttpRequest: forbidden, WebSocket: forbidden, setTimeout: forbidden, setInterval: forbidden,
            document: closed({}), navigator: closed({ webdriver: true, sendBeacon: forbidden }),
            console: closed({ log: forbidden, warn: forbidden, error: forbidden, info: forbidden }),
        });
        // Configuration may depend on the declared hostname and inputs, not clocks/randomness.
        context.__forbidden = forbidden;
        vm.runInContext('Math.random = __forbidden; Date = __forbidden;', context);
        const modules = new Map();
        const synthetic = (id, exports) => {
            const module = new vm.SyntheticModule(Object.keys(exports), function () {
                for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
            }, { context, identifier: id });
            modules.set(id, module);
        };
        synthetic('posthog-js', { default: posthog });
        synthetic('@datadog/browser-rum', { datadogRum: vendor('datadog_rum') });
        synthetic('@datadog/browser-logs', { datadogLogs: vendor('datadog_logs') });
        synthetic('src/lib/observability/network.js', { networkSummary: () => ({}) });
        synthetic('src/lib/observability/report.js', { enableReporting: () => {} });
        for (const name of ADAPTER_MODULES) modules.set(name, new vm.SourceTextModule(sources[name], { context, identifier: name }));
        const entry = new vm.SourceTextModule(
            'import { initTelemetry } from "./lib/telemetry.js"; import { initDatadogRum } from "./lib/datadogRum.js"; await initTelemetry(); await initDatadogRum();',
            { context, identifier: 'src/config-check.js' },
        );
        await entry.link((specifier, referencing) => {
            let id = specifier;
            if (specifier.startsWith('@/')) id = 'src/' + specifier.slice(2);
            else if (specifier.startsWith('.')) id = posix.normalize(posix.join(posix.dirname(referencing.identifier), specifier));
            if (!modules.has(id) && modules.has(id + '.js')) id += '.js';
            if (!modules.has(id)) refuse('unsupported configuration import');
            return modules.get(id);
        });
        await entry.evaluate({ timeout: 1000 });
        if (unexpectedEffect) refuse('ambiguous configuration dependency');
        const expected = expectedSdkConfig(contract.publicConfig, environment);
        observedHashes[environment] = {};
        for (const [sink, fields] of Object.entries(expected)) {
            if (!snapshots[sink]) refuse(`missing ${sink} initialization`);
            const actual = Object.fromEntries(Object.keys(fields).map((field) => [field, snapshots[sink][field]]));
            if (canonical(actual) !== canonical(fields)) refuse(`incorrect ${sink} configuration`);
            observedHashes[environment][sink] = hashConfig(actual);
        }
    }
    return { schema: CONFIG_CHECK_SCHEMA, scope: 'offline-sdk-stubs-not-ingestion', config_sha256: observedHashes,
        source_sha256: Object.fromEntries(ADAPTER_MODULES.map((name) => [name, digest(sources[name])])) };
}

/** Run the fixed module check in a bounded child; public values never enter argv or reports. */
export function checkAdapterConfiguration(sources, contract) {
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url), 'check-config'], {
        input: JSON.stringify({ sources, contract }), encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
    });
    if (result.status !== 0) refuse('SDK configuration contract failed');
    return JSON.parse(result.stdout);
}

/** Return a Vite plugin and a finalizer to run after the generated HTML/version files. */
export function releaseTelemetryPlugin(contract) {
    let measured;
    let appRoot;
    const plugin = {
        name: 'buildanddo-release-telemetry',
        apply: 'build',
        configResolved(config) {
            appRoot = resolve(config.root).replaceAll('\\', '/');
            for (const [key, expected] of Object.entries(contract.publicConfig)) {
                if (config.env[key] !== expected || Object.hasOwn(config.define || {}, `import.meta.env.${key}`) ||
                    Object.hasOwn(config.define || {}, 'import.meta.env')) refuse('resolved configuration mismatch');
            }
        },
        generateBundle: {
            order: 'post',
            handler(_options, bundle) {
                measured = null;
                const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
                for (const chunk of chunks) {
                    try { this.parse(chunk.code); }
                    catch { refuse('invalid emitted JavaScript'); }
                }
                const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
                const entries = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName).sort();
                const reachable = new Set();
                function follow(name) {
                    if (reachable.has(name)) return;
                    const chunk = byName.get(name);
                    if (!chunk) refuse('missing or external entry import');
                    reachable.add(name);
                    for (const dependency of chunk.imports) follow(dependency);
                }
                for (const entry of entries) follow(entry);
                if (!entries.length) refuse('no entry JavaScript');
                const sinks = {};
                for (const [name, sink] of Object.entries(SINKS)) {
                    const adapter = chunks.find((chunk) => reachable.has(chunk.fileName) && Object.entries(chunk.modules).some(([id, info]) =>
                        id.replaceAll('\\', '/') === appRoot + sink.adapter && info.renderedLength > 0 && info.renderedExports.includes(sink.init)));
                    const sdk = chunks.find((chunk) => reachable.has(chunk.fileName) && Object.entries(chunk.modules).some(([id, info]) =>
                        id.replaceAll('\\', '/').includes(sink.sdk) && info.renderedLength > 0));
                    if (!adapter || !sdk) refuse(`missing rendered ${name}`);
                    sinks[name] = { adapter: adapter.fileName, sdk: sdk.fileName };
                }
                const sources = Object.fromEntries(ADAPTER_MODULES.map((name) => {
                    const id = chunks.flatMap((chunk) => Object.keys(chunk.modules)).find((id) => id.replaceAll('\\', '/') === `${appRoot}/${name}`);
                    if (!id) refuse('shared configuration module missing from bundle');
                    return [name, this.getModuleInfo(id)?.code];
                }));
                const adapterContract = checkAdapterConfiguration(sources, contract);
                measured = {
                    entries, sinks, adapterContract,
                    javascript: Object.fromEntries(chunks.map((chunk) => [chunk.fileName, digest(chunk.code)])),
                };
            },
        },
    };
    function finish(output) {
        if (!measured) refuse('bundler evidence missing');
        const files = {};
        function collect(directory, prefix = '') {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                const name = prefix + entry.name;
                if (entry.isSymbolicLink()) refuse('symlink in artifact');
                if (entry.isDirectory()) collect(join(directory, entry.name), name + '/');
                else if (name.endsWith('.js') || name.endsWith('.html') || name === 'version.json') {
                    const bytes = readFileSync(join(directory, entry.name));
                    if (!bytes.length) refuse('empty artifact file');
                    files[name] = { size: bytes.length, sha256: digest(bytes) };
                }
            }
        }
        collect(output);
        for (const [name, hash] of Object.entries(measured.javascript)) {
            if (files[name]?.sha256 !== hash) refuse('rendered JavaScript changed or missing');
        }
        if (Object.keys(files).filter((name) => name.endsWith('.js')).some((name) => !Object.hasOwn(measured.javascript, name))) {
            refuse('unmeasured JavaScript');
        }
        const html = readFileSync(join(output, 'index.html'), 'utf8');
        const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1].replace(/^\//, ''));
        if (!scripts.length || scripts.some((name) => !measured.entries.includes(name)) ||
            measured.entries.some((name) => !scripts.includes(name))) refuse('HTML entry mismatch');
        const version = JSON.parse(readFileSync(join(output, 'version.json'), 'utf8'));
        if (version.commit_sha !== contract.commit_sha || version.version !== contract.version) refuse('release identity mismatch');
        const manifest = { ...publicDescriptor(contract), entries: measured.entries, sinks: measured.sinks,
            adapter_contract: measured.adapterContract, files };
        writeFileSync(join(output, TELEMETRY_MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
        verifyTelemetryArtifact(output, publicDescriptor(contract), TARGETS[contract.target][0]);
        return manifest;
    }
    return { plugin, finish };
}

/** Recheck the immutable build receipt and every served JS/HTML byte before any copy. */
export function verifyTelemetryArtifact(directory, expected, environment) {
    if (lstatSync(directory).isSymbolicLink() || lstatSync(join(directory, TELEMETRY_MANIFEST)).isSymbolicLink()) refuse('symlink artifact');
    const raw = readFileSync(join(directory, TELEMETRY_MANIFEST));
    const manifestHash = digest(raw);
    if (expected.manifest_sha256 && manifestHash !== expected.manifest_sha256) refuse('manifest changed after admission');
    const manifest = JSON.parse(raw);
    if (manifest.schema !== TELEMETRY_SCHEMA) refuse('unsupported manifest');
    if (typeof manifest.target !== 'string' || !Object.hasOwn(TARGETS, manifest.target) ||
        typeof manifest.build_id !== 'string' || typeof manifest.commit_sha !== 'string' || typeof manifest.config_sha256 !== 'string' ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(manifest.build_id) ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(manifest.commit_sha) ||
        typeof manifest.version !== 'string' || !manifest.version.endsWith('+' + manifest.commit_sha.slice(0, 7)) ||
        !/^[a-f0-9]{64}$/.test(manifest.config_sha256) ||
        !hashMap(manifest.public_input_sha256, REQUIRED_KEYS) ||
        canonical(Object.keys(manifest.sdk_config_sha256 || {}).sort()) !== canonical([...TARGETS[manifest.target]].sort()) ||
        Object.values(manifest.sdk_config_sha256).some((value) => !hashMap(value, Object.keys(SINKS)))) refuse('invalid build contract');
    for (const field of ['schema', 'build_id', 'target', 'commit_sha', 'version', 'config_sha256', 'public_input_sha256', 'sdk_config_sha256']) {
        if (!expected[field] || canonical(manifest[field]) !== canonical(expected[field])) refuse('build identity mismatch');
    }
    if (!TARGETS[manifest.target]?.includes(environment)) refuse('environment mismatch');
    const observed = [];
    function inspect(path, prefix = '') {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            const name = prefix + entry.name;
            if (entry.isSymbolicLink()) refuse('symlink artifact file');
            if (entry.isDirectory()) inspect(join(path, entry.name), name + '/');
            else if (name.endsWith('.js') || name.endsWith('.html') || name === 'version.json') {
                if (!/^[A-Za-z0-9_./-]+$/.test(name)) refuse('invalid artifact path');
                const bytes = readFileSync(join(path, entry.name));
                const info = manifest.files?.[name];
                if (!bytes.length || info?.size !== bytes.length || info?.sha256 !== digest(bytes)) refuse('artifact bytes mismatch');
                observed.push(name);
            }
        }
    }
    inspect(directory);
    if (observed.length !== Object.keys(manifest.files).length || !observed.includes('index.html') || !observed.includes('version.json')) refuse('artifact inventory mismatch');
    const entries = manifest.entries;
    if (!Array.isArray(entries) || !entries.length || new Set(entries).size !== entries.length ||
        entries.some((name) => !observed.includes(name) || !name.endsWith('.js'))) refuse('entry JavaScript missing');
    const html = readFileSync(join(directory, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1].replace(/^\//, ''));
    if (!scripts.length || scripts.some((name) => !entries.includes(name)) || entries.some((name) => !scripts.includes(name))) refuse('HTML entry mismatch');
    const version = JSON.parse(readFileSync(join(directory, 'version.json'), 'utf8'));
    if (version.commit_sha !== expected.commit_sha || version.version !== expected.version) refuse('artifact release mismatch');
    const check = manifest.adapter_contract;
    if (check?.schema !== CONFIG_CHECK_SCHEMA || check.scope !== 'offline-sdk-stubs-not-ingestion' ||
        canonical(check.config_sha256) !== canonical(expected.sdk_config_sha256) ||
        !hashMap(check.source_sha256, ADAPTER_MODULES)) refuse('SDK configuration evidence missing or mismatched');
    if (canonical(Object.keys(manifest.sinks).sort()) !== canonical(Object.keys(SINKS).sort())) refuse('sink evidence missing');
    for (const name of Object.keys(SINKS)) {
        const sink = manifest.sinks[name];
        if ([sink.adapter, sink.sdk].some((file) => !observed.includes(file) || !file.endsWith('.js'))) refuse('SDK artifact missing');
    }
    return { ok: true, manifest_sha256: manifestHash, build_id: manifest.build_id, environment, verified_files: observed.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv[2] === 'check-config') {
            let input = '';
            for await (const part of process.stdin) input += part;
            const { sources, contract } = JSON.parse(input);
            console.log(JSON.stringify(await observeAdapterConfiguration(sources, contract)));
        } else if (process.argv[2] === 'contract' && process.argv.length === 5) {
            const release = resolveBuildRelease({ root: process.argv[3], commitSha: process.argv[4] });
            const contract = releaseTelemetryContract(process.env, release);
            if (!contract) refuse('release target required');
            console.log(JSON.stringify(publicDescriptor(contract)));
        } else if (process.argv[2] === 'verify' && process.argv.length === 6) {
            console.log(JSON.stringify(verifyTelemetryArtifact(process.argv[3], JSON.parse(process.argv[4]), process.argv[5])));
        } else refuse('invalid verification arguments');
    } catch {
        // Module errors can quote source containing public inputs. Never forward those errors.
        console.error('Release telemetry: configuration or artifact verification failed');
        process.exitCode = 1;
    }
}
