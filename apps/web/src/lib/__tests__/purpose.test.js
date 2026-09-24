// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/purpose.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-PURPOSE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-PURPOSE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/purpose.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/purpose.js; VALIDATES apps/web/src/components/site/Faq.jsx
// DAG Node:    none
// Intent:      Fail if any public page describes BuildAndDo with the retired small-business framing, and keep
//              the pages that repeat the description in step with its one source.
// ───────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PURPOSE, RETIRED_PHRASES } from '@/lib/purpose';
import { SITE_ORIGIN } from '@/lib/publicPages';
import { FAQ_ITEMS } from '@/components/site/Faq';
import { HOSTINGER_CHALLENGE } from '@/data/hostingerChallenge';

// vitest runs from apps/web, and jsdom gives import.meta.url an http scheme, so paths start from the working
// directory, as src/lib/__tests__/communityLinks.test.jsx does.
const WEB = process.cwd();
const read = (relative) => readFileSync(join(WEB, relative), 'utf8');
const sourcesIn = (relative) => readdirSync(join(WEB, relative), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(jsx?|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name))
    .map((entry) => `${relative}/${entry.name}`);

// Everything a visitor or a crawler reads before signing in. The workspace is excluded on purpose: its
// business-domain model describes how the product works today (see the SRS non-goals).
const PUBLIC_SOURCES = [
    ...sourcesIn('src/components/site'),
    ...sourcesIn('src/components/editorial'),
    ...sourcesIn('src/components/auth'),
    ...sourcesIn('src/pages'),
    'src/components/Seo.jsx',
    'src/lib/publicPages.js',
    'index.html',
    'public/manifest.webmanifest',
    'public/social-card.svg',
    'public/llms.txt',
    'tools/generate-seo.mjs',
    // The Hostinger challenge entry and the judge bundle its compiler writes (reframed 2026-09-23).
    'src/data/hostingerChallenge.js',
    '../../scripts/ci/day21_submission.py',
];

// The compiler's default for one flag, read as text: it is Python, and a pattern would need escaping.
function compilerDefault(compiler, flag) {
    const marker = `parser.add_argument("--${flag}", default="`;
    const start = compiler.indexOf(marker);
    if (start < 0) return undefined;
    const from = start + marker.length;
    return compiler.slice(from, compiler.indexOf('")', from));
}

function retiredPhrasesIn(text) {
    const lower = text.toLowerCase();
    return RETIRED_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

describe('what BuildAndDo is, on every public page', () => {
    it('no public page uses the retired small-business framing', () => {
        const offences = PUBLIC_SOURCES.flatMap((file) => retiredPhrasesIn(read(file)).map((phrase) => `${file}: "${phrase}"`));
        expect(PUBLIC_SOURCES.length).toBeGreaterThan(20);
        expect(offences).toEqual([]);
    });

    it('catches a retired phrase when one is planted, in any capitalisation', () => {
        const planted = `${read('src/components/site/Faq.jsx')}\nBuildAndDo is early-stage Software for Small-Business Owners.`;
        expect(retiredPhrasesIn(planted)).toEqual(['software for small-business owners']);
    });

    it('the manifest, the first FAQ answer and the share-image description come from the one source', () => {
        expect(JSON.parse(read('public/manifest.webmanifest')).description).toBe(PURPOSE.summary);
        expect(FAQ_ITEMS[0].question).toBe('What is BuildAndDo?');
        expect(FAQ_ITEMS[0].answer.startsWith(PURPOSE.summary)).toBe(true);
        expect(read('src/components/Seo.jsx')).toContain('PURPOSE.shareImageAlt');
        expect(read('tools/generate-seo.mjs')).toContain('PURPOSE.shareImageAlt');
    });

    it('the judge bundle describes the product the challenge page does', () => {
        // day21_submission.py's checklist asks that problem, solution, pitch and audience match the public product.
        const compiler = read('../../scripts/ci/day21_submission.py');
        expect(HOSTINGER_CHALLENGE.promise).toBe(PURPOSE.summary);
        expect(compilerDefault(compiler, 'pitch')).toBe(HOSTINGER_CHALLENGE.promise);
        expect(compilerDefault(compiler, 'problem')).toBe(HOSTINGER_CHALLENGE.problem);
        expect(compilerDefault(compiler, 'solution')).toBe(HOSTINGER_CHALLENGE.solution);
        expect(compilerDefault(compiler, 'target-audience')).toBe(HOSTINGER_CHALLENGE.target);
    });

    it('the share image names the live domain, not one with no DNS record', () => {
        const host = new URL(SITE_ORIGIN).host.toUpperCase();
        const card = read('public/social-card.svg');
        expect(card).toContain(`>${host}<`);
        expect(card).not.toContain('BUILDANDDO.TECH');
    });

    it('the share image PNG was rendered from the SVG as it is now', () => {
        // Link previews show the PNG. It went stale once, while the SVG moved on for five days.
        const recorded = read('public/social-card.png.cgrf.yaml').match(/^source_sha256: ([0-9a-f]{64})$/m)?.[1];
        const current = createHash('sha256').update(readFileSync(join(WEB, 'public/social-card.svg'))).digest('hex');
        expect(recorded, 'social-card.png.cgrf.yaml records no source_sha256').toBeTruthy();
        expect(current, 're-render social-card.png from social-card.svg, then record the new source_sha256').toBe(recorded);
    });
});
