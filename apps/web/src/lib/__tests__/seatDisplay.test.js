// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/seatDisplay.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/seatDisplay.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/seatDisplay.js
// DAG Node:    none
// Intent:      Hold seat naming to its rule: personas by name, roles as written, never a login or a machine.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { seatName, withoutMachineNames, WITHHELD } from '@/lib/seatDisplay';

// Names that follow a machine family but that no machine carries, as in tests/upgrade/test_public_redaction.py.
const BOX = 'ray-xyz0-0';
const RIG = 'rig0';

describe('seat names', () => {
    it('names a guildmaster by persona, and shows a plain role or persona as written', () => {
        expect(seatName('gm-forge')).toBe('Forge');
        expect(seatName('gm:forge')).toBe('Forge');
        expect(seatName('gm-builder-forge')).toBe('Forge');
        expect(seatName('Scholar')).toBe('Scholar');
        expect(seatName('kestrel-verify')).toBe('kestrel-verify');
    });

    it('never shows a login or a name that follows a machine family, glued into a slug or not', () => {
        const hidden = [BOX, RIG, `${BOX}@ocn.buildanddo.invalid`, 'member@example.com', `gm-builder-${RIG}`,
            `codegen-${RIG}-broadcast`, `${RIG}-release`, 'gm-mesh-sample', `OCN seat: ${BOX}`, '', null, undefined];
        for (const seat of hidden) expect(seatName(seat)).toBe('Agent');
        expect(seatName(`${BOX}@ocn.buildanddo.invalid`, 'Guildmaster')).toBe('Guildmaster');
    });

    it('withholds machine names in text and leaves near misses alone', () => {
        expect(withoutMachineNames(`Rebuilt on ${RIG}, then on ${BOX}.`)).toBe(`Rebuilt on ${WITHHELD}, then on ${WITHHELD}.`);
        expect(withoutMachineNames(`Logs from codegen-${RIG}-build`)).toBe(`Logs from codegen-${WITHHELD}-build`);
        expect(withoutMachineNames('rigging, trig2, kvmx and mesh are words')).toBe('rigging, trig2, kvmx and mesh are words');
        expect(withoutMachineNames('capability-mesh-fallback')).toBe('capability-mesh-fallback');
        expect(withoutMachineNames('on mesh-sample today')).toBe(`on ${WITHHELD} today`);
        expect(withoutMachineNames(null)).toBe('');
    });
});
