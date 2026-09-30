// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/media-draft-import.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     apps/web/src/lib/contentMedia.js, scripts/publish/media_corpus.py, tests/upgrade/test_media_corpus.py
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/contentMedia.js; VALIDATES scripts/publish/media_corpus.py; CONSUMES tests/upgrade/test_media_corpus.py
// Intent:      Exercise compiler-to-editor interoperability and reject oversized, altered or authority-bearing draft imports.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseMediaDraft, readMediaDraft } from '../../apps/web/src/lib/contentMedia.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = (text) => createHash('sha256').update(text).digest('hex');
const draft = (patch = {}) => {
    const body = 'Synthetic source observation. No live generation was performed.';
    return { schema: 'buildanddo.content-draft/v1', asset_id: 'a'.repeat(64), source_digest: 'b'.repeat(64),
        language: 'en', title: 'Synthetic story', format: 'blog', audience: 'Test readers',
        brief: 'Review the cited synthetic source.', body, body_sha256: sha(body), channel: 'Daily Edition',
        call_to_action: 'Inspect the source.', ...patch };
};

test('media imports are unsaved editable copy without identity or approval', async () => {
    const result = await parseMediaDraft(JSON.stringify(draft()));
    assert.equal(result.body, draft().body);
    assert.equal(result.objective, '');
    assert.deepEqual(Object.keys(result).sort(), ['title', 'format', 'audience', 'brief', 'body', 'channel', 'call_to_action', 'objective'].sort());
});

test('media imports reject review, account, scope and publication fields', async () => {
    for (const patch of [{ status: 'approved' }, { owner: 'other-person' }, { workspace: 'foreign' },
        { id: 'existing-record' }, { reviewed_by: 'forged' }, { published_url: 'https://example.com/' }, { objective: 'foreign-objective' }]) {
        await assert.rejects(parseMediaDraft(JSON.stringify(draft(patch))), /no account, review or publication/);
    }
});

test('media imports reject altered bytes, invalid binding and unsupported shapes', async () => {
    await assert.rejects(parseMediaDraft(JSON.stringify(draft({ body: 'An invented successful deployment.' }))), /changed after export/);
    for (const patch of [{ asset_id: 'short' }, { source_digest: 1 }, { language: 'English' },
        { format: '__proto__' }, { schema: 'buildanddo.content-draft/v2' }, { body_sha256: 'abc' }]) {
        await assert.rejects(parseMediaDraft(JSON.stringify(draft(patch))));
    }
    for (const raw of ['', 'null', '[]', 'false', '{}', '{invalid', 7, 'x'.repeat(64001)]) {
        await assert.rejects(parseMediaDraft(raw));
    }
});

test('content editor limits are enforced in UTF-16 and invalid copy is not truncated', async () => {
    const unicode = String.fromCodePoint(0x1f600).repeat(2600);
    for (const patch of [{ title: 'x'.repeat(201) }, { body: 'x'.repeat(5001) }, { audience: '' },
        { brief: null }, { channel: 'x\u0000y' }, { body: unicode, body_sha256: sha(unicode) }]) {
        await assert.rejects(parseMediaDraft(JSON.stringify(draft(patch))), /limits|missing copy/);
    }
    const body = 'Source says ' + String.fromCodePoint(0x1f600) + '. This remains quoted data.';
    assert.equal((await parseMediaDraft(JSON.stringify(draft({ body, body_sha256: sha(body) })))).body, body);
});

test('selected files are bounded before reading and actual text size is rechecked', async () => {
    let reads = 0;
    await assert.rejects(readMediaDraft({ size: 64001, text: async () => { reads += 1; } }));
    assert.equal(reads, 0);
    for (const file of [null, {}, { size: 0 }, { size: -1 }, { size: true }, { size: 1 }]) await assert.rejects(readMediaDraft(file));
    await assert.rejects(readMediaDraft({ size: 1, text: async () => 'x'.repeat(64001) }));
    const raw = JSON.stringify(draft());
    assert.equal((await readMediaDraft({ size: raw.length, text: async () => raw })).title, 'Synthetic story');
});

test('hash verification fails closed without browser crypto', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try { await assert.rejects(parseMediaDraft(JSON.stringify(draft())), /secure browser context/); }
    finally { Object.defineProperty(globalThis, 'crypto', descriptor || { value: webcrypto, configurable: true }); }
});

test('actual Python compiler exports enter the existing JavaScript draft boundary', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'media-import-'));
    try {
        execFileSync('python', ['-c', [
            'import sys', 'from pathlib import Path',
            'from tests.upgrade.test_media_corpus import source, AT',
            'from scripts.publish.media_contracts import CorpusOptions, FORMATS',
            'from scripts.publish.media_corpus import compile_corpus, write_corpus',
            'root = Path(sys.argv[1])',
            'write_corpus(compile_corpus(source(root), CorpusOptions(formats=FORMATS), root, at=AT), root / "corpus")',
        ].join('\n'), temporary], { cwd: root, timeout: 30000, stdio: 'pipe' });
        const directory = join(temporary, 'corpus', 'drafts');
        const names = readdirSync(directory);
        assert.equal(names.length, 10);
        for (const name of names) {
            const fields = await parseMediaDraft(readFileSync(join(directory, name), 'utf8'));
            assert.ok(fields.body.includes('No provider call or deployment was performed.'));
            assert.ok(!Object.hasOwn(fields, 'reviewed_by'));
        }
    } finally { rmSync(temporary, { recursive: true, force: true }); }
});
