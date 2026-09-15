// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/source-checker.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs, apps/web/src/components/workspace/WorkspaceLayout.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs; VALIDATES apps/web/src/components/workspace/WorkspaceLayout.jsx
// DAG Node:    none
// Intent:      Keep missing JSX imports from passing the offline diagnostic that previously missed a crash in every workspace route.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import checker from '../../.bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs';

test('the diagnostic detects missing JSX components and object roots as well as ordinary undefined names', () => {
    const errors = checker.inspectSource('export function Page() { return <div><MissingIcon /><unbound.Icon />{unknownValue}</div>; }', 'test.jsx');
    assert.equal(errors.length, 3);
    assert.ok(errors.some((error) => error.message.includes("'MissingIcon'")));
    assert.ok(errors.some((error) => error.message.includes("'unbound'")));
    assert.ok(errors.some((error) => error.ruleId === 'no-undef'));
});

test('the diagnostic respects imports, lexical component scope, intrinsic elements and fragments', () => {
    const errors = checker.inspectSource(`import { Plus } from 'lucide-react';
        export function Page({ Entry, item }) {
            const Inner = () => <Plus />;
            return <><div><Entry /><item.Icon /><Inner /><custom-element /></div></>;
        }`, 'test.jsx');
    assert.deepEqual(errors, []);
    assert.ok(checker.inspectSource('function First() { const Local = () => null; return <Local />; } function Second() { return <Local />; }', 'test.jsx')
        .some((error) => error.message.includes("'Local'")));
    assert.deepEqual(checker.inspectSource('class Page { render() { return <this.Item />; } }', 'test.jsx'), []);
});

test('the actual workspace layout passes and removing its icon import reproduces the runtime blocker', () => {
    const source = readFileSync(new URL('../../apps/web/src/components/workspace/WorkspaceLayout.jsx', import.meta.url), 'utf8');
    assert.deepEqual(checker.inspectSource(source, 'WorkspaceLayout.jsx'), []);
    const broken = source.replace(/^\s*Plus,\s*$/m, '');
    assert.ok(checker.inspectSource(broken, 'WorkspaceLayout.jsx').some((error) => error.message === "JSX component 'Plus' is not defined."));
});
