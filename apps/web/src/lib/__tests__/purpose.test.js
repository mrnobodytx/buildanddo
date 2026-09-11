// CGRF: SRS=SRS-BUILDANDDO-PURPOSE-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/purpose.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-PURPOSE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/lib/purpose.js, apps/web/index.html,
//              README.md, AGENTS.md
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/purpose.js;
//              VALIDATES apps/web/index.html;
//              VALIDATES apps/web/src/components/site;
//              VALIDATES apps/web/src/pages
// Intent:      Keep every public surface on the one purpose statement: the
//              static index.html must carry PURPOSE verbatim, and no site copy
//              may describe BuildAndDo as a small-business or provisioning
//              product again. The only "provisioned" allowed is the technical
//              OCN seat_not_provisioned wording in ocnLogin.js and its tests.
// ───────────────────────────────────────────────────────────────

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { PURPOSE, pageTitle } from '@/lib/purpose';

// Under jsdom `import.meta.url` is not a file: URL, so locate apps/web by
// walking up from the vitest working directory to the folder holding
// index.html next to a package.json.
function findWebRoot(start) {
    let dir = resolve(start);
    for (let i = 0; i < 6; i += 1) {
        if (existsSync(join(dir, 'index.html')) && existsSync(join(dir, 'package.json'))) return dir;
        dir = dirname(dir);
    }
    throw new Error(`apps/web root not found from ${start}`);
}

const WEB_ROOT = findWebRoot(process.cwd());
const REPO_ROOT = resolve(WEB_ROOT, '../..');

const FORBIDDEN = [
    { name: 'small business', re: /small[\s-]business/i },
    { name: 'SMB', re: /\bSMB\b/ },
    { name: 'provision', re: /provision/i },
];

// The OCN seat login reports the server's literal `seat_not_provisioned`
// code; that is a protocol string, not product framing.
const ALLOWLIST = [
    // this file names the forbidden terms in order to forbid them
    'src/lib/__tests__/purpose.test.js',
    'src/lib/ocnLogin.js',
    'src/lib/__tests__/ocnLogin.test.js',
    'src/components/auth/__tests__/LoginPage.ocn.test.jsx',
];

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (name === 'node_modules' || name === '__snapshots__') continue;
            walk(full, out);
        } else if (/\.(jsx?|html|md)$/.test(name)) {
            out.push(full);
        }
    }
    return out;
}

function offenders(files) {
    const hits = [];
    for (const file of files) {
        const rel = relative(WEB_ROOT, file).replace(/\\/g, '/');
        if (ALLOWLIST.includes(rel)) continue;
        const text = readFileSync(file, 'utf8');
        for (const { name, re } of FORBIDDEN) {
            if (re.test(text)) hits.push(`${rel}: ${name}`);
        }
    }
    return hits;
}

describe('PURPOSE', () => {
    it('describes an educational, collaborative platform and carries the honesty doctrine', () => {
        expect(PURPOSE.description).toMatch(/educational, collaborative platform/);
        expect(PURPOSE.description).toMatch(/Citadel Nexus guilds and agents/);
        expect(PURPOSE.description).toMatch(/Nothing here is invented/);
        expect(PURPOSE.audience).toMatch(/Learners/);
        expect(pageTitle()).toBe(`BuildAndDo — ${PURPOSE.headline}`);
        expect(pageTitle('Roadmap')).toBe('BuildAndDo — Roadmap');
    });

    it('is mirrored verbatim by the static index.html title, description and og tags', () => {
        const html = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
        expect(html).toContain(`<title>${pageTitle()}</title>`);
        expect(html).toContain(`content="${PURPOSE.description}"`);
        expect(html).toContain(`<meta property="og:title" content="${pageTitle()}" />`);
        expect(html).toContain(`content="${PURPOSE.subhead}"`);
        expect(html).toContain('<meta property="og:type" content="website" />');
    });

    it('is echoed by README.md and AGENTS.md', () => {
        const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
        const agents = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8');
        expect(readme).toMatch(/## What BuildAndDo is/);
        expect(readme).toMatch(/educational, collaborative platform/);
        expect(agents).toMatch(/educational, collaborative platform/);
    });
});

describe('site copy no longer describes a small-business provisioning product', () => {
    it('apps/web/src, index.html, README.md and AGENTS.md are clean outside the OCN allowlist', () => {
        const files = [
            ...walk(join(WEB_ROOT, 'src')),
            join(WEB_ROOT, 'index.html'),
            join(REPO_ROOT, 'README.md'),
            join(REPO_ROOT, 'AGENTS.md'),
        ];
        expect(offenders(files)).toEqual([]);
    });

    it('the allowlisted OCN files still carry only the technical wording', () => {
        const text = readFileSync(join(WEB_ROOT, 'src/lib/ocnLogin.js'), 'utf8');
        expect(text).toMatch(/seat_not_provisioned/);
        expect(text).not.toMatch(/small[\s-]business/i);
    });
});
