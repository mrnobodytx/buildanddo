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
# BuildAndDo\n\nAn educational collaboration platform where people and AI learn by doing real work together, preserve evidence and share what they learned.\n\n## Community and store\n\n- [r/buildanddo on Reddit](https://www.reddit.com/r/buildanddo): the public community.\n- [Playbooks and courses on Gumroad](https://citadelnexus.gumroad.com): the Citadel Nexus store.\n\n## Public pages\n\n${PUBLIC_PAGES.map((page) => `- [${page.title}](${SITE_ORIGIN}${page.path}): ${page.description}`).join('\n')}\n`,
    );
}

/** Produce route-specific HTML heads for crawlers that do not run JavaScript. */
export function generatePageHeads(directory, release) {
    const source = readFileSync(resolve(directory, 'index.html'), 'utf8');
    const template = source
        .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
        .replace(
            /<meta\b(?=[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'])[^>]*>/gi,
            '',
        )
        .replace(/<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/gi, '');
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
                'og:image:alt': 'BuildAndDo — learn by doing, together',
            }).map(
                ([property, value]) => `<meta property="${property}" content="${escape(value)}">`,
            ),
            ...Object.entries({
                'twitter:card': 'summary_large_image',
                'twitter:title': page.title,
                'twitter:description': page.description,
                'twitter:image': `${SITE_ORIGIN}/social-card.png`,
                'twitter:image:alt': 'BuildAndDo — learn by doing, together',
            }).map(([name, value]) => `<meta name="${name}" content="${escape(value)}">`),
            `<script id="static-page-schema" type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`,
        ].join('\n');
        const destination = resolve(directory, `.${page.path}`);
        mkdirSync(destination, { recursive: true });
        writeFileSync(
            resolve(destination, 'index.html'),
            template.replace('</head>', `${tags}\n</head>`),
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
