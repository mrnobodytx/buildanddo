// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/career-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     libs/career_passport/cli.py, tests/upgrade/test_career_support.py, tests/upgrade/admin-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES libs/career_passport/cli.py; CONSUMES tests/upgrade/test_career_support.py; CONSUMES tests/upgrade/admin-fixture.mjs
// Intent:      Exercise the actual Python-to-browser career format with explicitly synthetic independent evidence and jobs.
// ───────────────────────────────────────────────────────────────

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { repoPath, pythonBin } from './admin-fixture.mjs';

let cached;
/** Compile the real format with synthetic data; never a personal or live-job claim. */
export function careerPacket() {
    if (!cached) {
        const source = `
import json, tempfile
from dataclasses import replace
from pathlib import Path
from libs.career_passport.cli import compile_run
from libs.semantic_twin.identity import SemanticId
from tests.upgrade.test_career_support import work, jobs, at
person = SemanticId('cni://person/pocketbase/editor')
bundle, policy = work(person=person)
bundle = replace(bundle, workspace='ws1', contributions=tuple(replace(c, workspace='ws1') for c in bundle.contributions), reviews=())
# The changed workspace needs new exact-subject receipts, not a reused review.
from tests.upgrade.test_career_support import CHECKS, ACTOR, VERIFIER, verification, AuthorityTier, ContentDigest, digest, ReviewPolicy
c = bundle.contributions[0]
receipt = verification(c.subject, tuple(map(str, c.artifact_ids)), when=at(4), checks=CHECKS, actor=ACTOR, tier=AuthorityTier.A0)
bundle = replace(bundle, reviews=(receipt,))
policy = ReviewPolicy(receipt.policy.policy_id, receipt.policy.policy_version, (VERIFIER,), (ContentDigest(digest(receipt)),))
with tempfile.TemporaryDirectory() as temp:
    packet = compile_run(bundle, jobs(100), person=person, workspace='ws1', at=at(10), policy=policy, output=Path(temp), display_name='Synthetic Candidate')
    print(json.dumps(packet))
`;
        const result = spawnSync(pythonBin(), ['-c', source], { cwd: repoPath('.'), encoding: 'utf8', maxBuffer: 6000000 });
        if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Synthetic career compiler failed');
        cached = JSON.parse(result.stdout);
    }
    return structuredClone(cached);
}

/** Reseal adversarial fixture bytes; integrity deliberately does not grant authenticity. */
export function sealCareer(packet) {
    delete packet.canonical_content; delete packet.content_sha256;
    const canonical = (value) => {
        if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
        if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
        return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
    };
    packet.canonical_content = canonical(packet);
    packet.content_sha256 = createHash('sha256').update(packet.canonical_content).digest('hex');
    return packet;
}
