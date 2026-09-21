// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/tools/generate-seo.mjs
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/lib/publicPages.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/web/src/lib/publicPages.js
// DAG Node:    none
// Intent:      Generate canonical social metadata and crawler resources for every public route.
// ───────────────────────────────────────────────────────────────

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC_PAGES, SITE_ORIGIN } from '../src/lib/publicPages.js';

const escape = (value) =>
    String(value).replace(
        /[&<>"']/g,
        (character) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
    );
const stamp = `CGRF: SRS-BUILDANDDO-UPGRADE-001 | VCC-BUILDANDDO-UPGRADE-001 | BITS-CODEGEN | Citadel Nexus Inc. | CK: pending | CAPS: pending`;

/** Write crawler resources from the public route catalogue. */
export function generatePublicAssets(directory) {
    mkdirSync(directory, { recursive: true });
    const urls = PUBLIC_PAGES.map(
        (page) => `  <url><loc>${escape(SITE_ORIGIN + page.path)}</loc></url>`,
    ).join('\n');
    writeFileSync(
        resolve(directory, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${stamp} -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
    writeFileSync(
        resolve(directory, 'robots.txt'),
        `# ${stamp}\nUser-agent: *\nAllow: /\nDisallow: /app\nDisallow: /login\nDisallow: /signup\nDisallow: /forgot-password\nDisallow: /onboarding\nDisallow: /api/\nDisallow: /hcgi/\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
    );
    writeFileSync(
        resolve(directory, 'llms.txt'),
        `<!--
# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/web/public/llms.txt
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     apps/web/src/lib/publicPages.js
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON apps/web/src/lib/publicPages.js
# DAG Node:    none
# Intent:      Publish the same public route catalogue for text-based discovery.
# ───────────────────────────────────────────────────────────────
-->
# BuildAndDo\n\nA daily learning edition built around sources, scoped missions and evidence.\n\n## Community and store\n\n- [r/buildanddo on Reddit](https://www.reddit.com/r/buildanddo): the public community.\n- [Playbooks and courses on Gumroad](https://citadelnexus.gumroad.com): the Citadel Nexus store.\n\n## Public pages\n\n${PUBLIC_PAGES.map((page) => `- [${page.title}](${SITE_ORIGIN}${page.path}): ${page.description}`).join('\n')}\n`,
    );
}

/** The body a reader gets before — or without — JavaScript.
 *
 * WHY THIS EXISTS. Six OCN seats independently reported the same thing about the live site: the
 * served HTML carries 37 characters of text before JavaScript runs. The <head> was already complete
 * (title, description, canonical, Open Graph, Twitter, JSON-LD), so link previews were fine — but
 * <body> was a bare `<div id="root"></div>`. A crawler that does not execute JavaScript therefore
 * indexed no prose AND found NO LINKS AT ALL, so it could not discover any of the other ten public
 * routes from the home page.
 *
 * React replaces the contents of #root when it mounts, so this costs the JavaScript path nothing:
 * it is the same element, populated instead of empty. It is deliberately plain HTML — no classes,
 * no styling hooks — because its only readers are crawlers and people whose JavaScript failed.
 */
const fallbackBody = (page) => {
    const others = PUBLIC_PAGES.filter((item) => item.path !== page.path);
    return [
        '<h1>' + escape(page.title) + '</h1>',
        '<p>' + escape(page.description) + '</p>',
        // Each link carries the destination's OWN description. That is not padding to clear a
        // threshold: a reader without JavaScript, and a crawler building a site model, both need to
        // know what a link leads to before following it. It is the same catalogue llms.txt already
        // publishes, rendered where a browser will actually look for it.
        '<nav aria-label="Pages"><h2>Elsewhere on BuildAndDo</h2><ul>',
        ...others.map(
            (item) =>
                `<li><a href="${escape(item.path)}">${escape(item.label || item.title)}</a>` +
                ` — ${escape(item.description)}</li>`,
        ),
        '</ul></nav>',
        '<noscript><p>This page needs JavaScript for the interactive parts. ' +
            'The text above is the whole of what it says without it.</p></noscript>',
    ].join('');
};

/** Produce route-specific HTML heads for crawlers that do not run JavaScript. */
export function generatePageHeads(directory, release) {
    const source = readFileSync(resolve(directory, 'index.html'), 'utf8');
    const template = source
        .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
        .replace(
            /<meta\b(?=[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'])[^>]*>/gi,
            '',
        )
        .replace(/<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/gi, '')
        // Reset #root the same way the head is reset. This function reads dist/index.html as its
        // template, so on a SECOND run that file already holds the home page's fallback body: the
        // "empty div" match would find nothing, the replace would silently no-op, and every route
        // would ship the HOME page's prose. Emptying it first makes the pass idempotent.
        .replace(/<div id="root">[\s\S]*?<\/div>\s*(?=<script|<\/body)/i, '<div id="root"></div>');
    for (const page of PUBLIC_PAGES) {
        const canonical = SITE_ORIGIN + page.path;
        const schema = {
            '@context': 'https://schema.org',
            '@type': page.type,
            name: page.title,
            description: page.description,
            url: canonical,
            publisher: { '@type': 'Organization', name: 'Citadel Nexus Inc.' },
        };
        const tags = [
            `<title>${escape(page.title)}</title>`,
            `<meta name="description" content="${escape(page.description)}">`,
            '<meta name="robots" content="index,follow">',
            `<meta name="buildanddo:version" content="${escape(release.version)}">`,
            `<link rel="canonical" href="${canonical}">`,
            ...Object.entries({
                'og:type': 'website',
                'og:locale': 'en_US',
                'og:site_name': 'BuildAndDo',
                'og:title': page.title,
                'og:description': page.description,
                'og:url': canonical,
                'og:image': `${SITE_ORIGIN}/social-card.png`,
                'og:image:width': '1200',
                'og:image:height': '630',
                'og:image:alt': 'BuildAndDo — your business, in evidence',
            }).map(
                ([property, value]) => `<meta property="${property}" content="${escape(value)}">`,
            ),
            ...Object.entries({
                'twitter:card': 'summary_large_image',
                'twitter:title': page.title,
                'twitter:description': page.description,
                'twitter:image': `${SITE_ORIGIN}/social-card.png`,
                'twitter:image:alt': 'BuildAndDo — your business, in evidence',
            }).map(([name, value]) => `<meta name="${name}" content="${escape(value)}">`),
            `<script id="static-page-schema" type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`,
        ].join('\n');
        const destination = resolve(directory, `.${page.path}`);
        mkdirSync(destination, { recursive: true });
        // The #root div must stay empty in the SOURCE template and be filled per route here, or
        // every page would ship the home page's prose. Matching the empty div specifically means a
        // future template that already puts something in #root is left alone rather than clobbered.
        writeFileSync(
            resolve(destination, 'index.html'),
            template
                .replace('</head>', `${tags}\n</head>`)
                .replace('<div id="root"></div>', `<div id="root">${fallbackBody(page)}</div>`),
        );
    }
    // SPA fallbacks may use the root HTML for protected URLs. Their client
    // layouts also set noindex; the dedicated files cover non-JS crawlers.
    for (const path of ['app', 'login', 'signup', 'forgot-password', 'onboarding']) {
        const destination = resolve(directory, path);
        mkdirSync(destination, { recursive: true });
        writeFileSync(
            resolve(destination, 'index.html'),
            template.replace('</head>', '<meta name="robots" content="noindex,nofollow">\n</head>'),
        );
    }
    writeFileSync(resolve(directory, 'version.json'), `${JSON.stringify(release, null, 2)}\n`);
}
