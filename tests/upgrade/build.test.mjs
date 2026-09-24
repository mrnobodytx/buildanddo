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
// Depends:     apps/web/tools/generate-seo.mjs
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/tools/generate-seo.mjs
// DAG Node:    none
// Intent:      Verify release identity and real generated crawler artifacts without network dependencies.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveBuildRelease } from '../../scripts/ci/release.mjs';
import { generatePublicAssets, generatePageHeads } from '../../apps/web/tools/generate-seo.mjs';
import { PUBLIC_PAGES, SITE_ORIGIN } from '../../apps/web/src/lib/publicPages.js';
import { COMMUNITY_LINKS, SAME_AS, STORE_LINK } from '../../apps/web/src/lib/communityLinks.js';
import { PERSONA_PAGES } from '../../apps/web/src/data/personas.js';

// The crawler resources cover the catalogue AND one profile per guildmaster.
const INDEXED = [...PUBLIC_PAGES, ...PERSONA_PAGES];

function temporary(t) {
    const root = mkdtempSync(join(tmpdir(), 'buildanddo-upgrade-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
}

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
