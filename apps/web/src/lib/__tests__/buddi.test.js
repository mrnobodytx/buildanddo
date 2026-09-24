// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/buddi.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/buddi.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/buddi.js
// DAG Node:    none
// Intent:      Prove Buddi restates ranked actions and earns nothing from client-writable or unread data.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { acknowledgeAchievements, buddiAchievements, buddiMood, readPreference, unseenAchievements, writePreference } from '@/lib/buddi';

const missions = (records, extra = {}) => ({ records, loading: false, degraded: false, ...extra });
const state = (list, id) => list.find((item) => item.id === id)?.state;

describe('buddiMood', () => {
    it('claims nothing while loading or when records cannot be read', () => {
        expect(buddiMood(null, { loading: true }).pose).toBe('think');
        expect(buddiMood({ state: 'unavailable', actions: [] })).toEqual({ pose: 'calm', line: expect.stringMatching(/will not guess/) });
        expect(buddiMood({ state: 'demo', actions: [] }).line).toMatch(/demo workspace/);
    });

    it('restates the first ranked action', () => {
        const view = (first) => ({ state: 'observed', actions: [first] });
        expect(buddiMood({ state: 'observed', actions: [] }).line).toBe('Nothing is waiting on you right now.');
        expect(buddiMood(view({ id: 'begin', priority: 6 })).pose).toBe('build');
        expect(buddiMood(view({ id: 'mission:a', priority: 1 })).pose).toBe('think');
        expect(buddiMood(view({ id: 'run:a', priority: 0 })).pose).toBe('think');
        expect(buddiMood(view({ id: 'signals', priority: 5 })).pose).toBe('hello');
        expect(buddiMood(view({ id: 'mission:a', priority: 4 })).pose).toBe('build');
        expect(buddiMood(view({ id: 'mission:a', priority: 7 })).pose).toBe('calm');
    });
});

describe('buddiAchievements', () => {
    it('earns mission achievements only from verified or failed status in this workspace', () => {
        const list = buddiAchievements({ workspace: 'w1', missions: missions([
            { id: 'a', workspace: 'w1', status: 'verified', progress: 100 },
            { id: 'b', workspace: 'w1', status: 'running', progress: 100 },
            { id: 'c', workspace: 'w2', status: 'failed' },
        ]) });
        expect(state(list, 'mission:first-verified')).toBe('earned');
        expect(state(list, 'mission:five-verified')).toBe('open');
        expect(state(list, 'mission:honest-close')).toBe('open');
    });

    it('reports unmeasured, never unearned, for loading, degraded or demo sources', () => {
        for (const extra of [{ loading: true }, { degraded: true }, { demo: true }]) {
            const list = buddiAchievements({ workspace: 'w1', missions: missions([{ id: 'a', workspace: 'w1', status: 'verified' }], extra) });
            expect(state(list, 'mission:first-verified')).toBe('unmeasured');
        }
        expect(state(buddiAchievements({ workspace: 'w1', missions: missions([]), learning: { data: null, loading: false } }), 'learning')).toBe('unmeasured');
    });

    it('uses the server learning milestones as they were returned', () => {
        const learning = { loading: false, data: { milestones: [{ id: 'first', title: 'First certificate', target: 1, earned: true }, { id: 'three', title: 'Three certificates', target: 3, earned: false }] } };
        const list = buddiAchievements({ workspace: 'w1', missions: missions([]), learning });
        expect(state(list, 'learning:first')).toBe('earned');
        expect(state(list, 'learning:three')).toBe('open');
    });
});

describe('celebration memory', () => {
    const earned = (id, source = 'missions') => ({ id, source, state: 'earned' });

    it('seeds a source silently the first time it is read, then reports new wins once', () => {
        const first = unseenAchievements([earned('mission:first-verified')], null);
        expect(first.fresh).toEqual([]);
        expect(first.next).toEqual({ missions: ['mission:first-verified'] });

        const later = unseenAchievements([earned('mission:first-verified'), earned('mission:honest-close')], first.next);
        expect(later.fresh.map((item) => item.id)).toEqual(['mission:honest-close']);
        expect(later.next).toBeNull();

        const shown = acknowledgeAchievements(first.next, later.fresh);
        expect(unseenAchievements([earned('mission:first-verified'), earned('mission:honest-close')], shown).fresh).toEqual([]);
    });

    it('seeds a source that was unreadable before instead of replaying its history', () => {
        const stored = { missions: [] };
        const result = unseenAchievements([earned('learning:first', 'learning')], stored);
        expect(result.fresh).toEqual([]);
        expect(result.next).toEqual({ missions: [], 'learning': ['learning:first'] });
    });

    it('survives blocked or corrupt storage', () => {
        const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
        expect(readPreference(broken, 'k')).toBeNull();
        expect(() => writePreference(broken, 'k', 1)).not.toThrow();
        expect(readPreference({ getItem: () => '{not json' }, 'k')).toBeNull();
    });
});
