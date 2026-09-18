// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/editorial-frontpage.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/editorialContent.js, apps/web/src/lib/editorialReel.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/editorialContent.js; VALIDATES apps/web/src/lib/editorialReel.js
// DAG Node:    none
// Intent:      Check dated and scoped front-page selection plus independent reel timing without a live provider or workspace.
// ───────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyHighlights, editorialDate, PLATFORM_AREAS, RESEARCH_READING, researchReelItems } from '../../apps/web/src/lib/editorialContent.js';
import { advanceReel, reelWindow, scheduleReel } from '../../apps/web/src/lib/editorialReel.js';

const now = new Date('2026-09-18T12:00:00');
const today = '2026-09-18T09:00:00';
const tomorrow = '2026-09-19T09:00:00';
const yesterday = '2026-09-17T09:00:00';
const record = (overrides = {}) => ({ id: 'source1', workspace: 'workspace1', status: 'ready',
    title: 'A completed investigation', context: 'Inspect the recorded source.', processed_at: today, ...overrides });
const research = (items, overrides = {}) => ({ loading: false, error: '', demo: false,
    data: { workspace: 'workspace1', items, has_more: false }, ...overrides });
const source = (records, overrides = {}) => ({ records, loading: false, degraded: false, demo: false, ...overrides });
const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, title: id }));

test('public reading cites identifiable dated sources and platform choices use real local areas', () => {
    assert.ok(RESEARCH_READING.length >= 4);
    assert.equal(new Set(RESEARCH_READING.map((item) => item.id)).size, RESEARCH_READING.length);
    for (const item of RESEARCH_READING) {
        assert.match(item.href, /^https:\/\/(arxiv\.org\/abs\/|doi\.org\/)/);
        assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(Date.parse(item.date) < now.getTime());
        assert.ok(item.source && item.description && item.title);
    }
    assert.deepEqual(PLATFORM_AREAS.map((item) => item.href), [
        '/classrooms', '/app/missions', '/app/knowledge', '/app/evidence', '/practice',
    ]);
    for (const item of PLATFORM_AREAS) assert.equal('views' in item || 'rank' in item, false);
});

test('completed research stays scoped, preserves review state and links to its internal source desk', () => {
    const items = [
        record({ id: 'older', processed_at: yesterday, status: 'attached' }),
        record({ id: 'queued', status: 'queued' }),
        record({ id: 'foreign', workspace: 'workspace2' }),
        record({ id: 'newer', input: 'javascript:alert(1)', url: 'https://untrusted.invalid' }),
    ];
    const untouched = structuredClone(items);
    const result = researchReelItems(research(items), 'workspace1', now);
    assert.deepEqual(result.map((item) => item.id), ['newer', 'older']);
    assert.equal(result[0].kicker, 'Ready for review');
    assert.equal(result[1].kicker, 'Attached to evidence');
    assert.equal(result[0].href, '/app/research?source=newer');
    assert.equal(result[0].date, today);
    assert.deepEqual(items, untouched);
});

test('stale research is absent while a read fails, reloads, or switches to demonstration mode', () => {
    for (const flag of [{ loading: true }, { error: 'offline' }, { degraded: true }, { demo: true }]) {
        assert.deepEqual(researchReelItems(research([record()], flag), 'workspace1', now), []);
    }
    assert.deepEqual(researchReelItems(undefined, 'workspace1', now), []);
    assert.deepEqual(researchReelItems(research([record()]), 'workspace2', now), []);
    assert.deepEqual(researchReelItems(research([record()]), '', now), []);
    assert.deepEqual(researchReelItems({ data: null }, 'workspace1', now), []);
});

test('invalid, missing and future processing dates are never presented as completed news', () => {
    const values = ['', 'tomorrow', undefined, null, tomorrow];
    const result = researchReelItems(research(values.map((processed_at, i) => record({ id: 'source' + i, processed_at }))), 'workspace1', now);
    assert.deepEqual(result, []);
});

test('duplicate and invalid research IDs, blank titles and unfinished states are excluded', () => {
    const records = [
        record(), record(), record({ id: '../foreign' }), record({ id: 'empty', title: '  ' }),
        record({ id: 'failed', status: 'failed' }), record({ id: 'cancelled', status: 'cancelled' }),
        record({ id: 'badtitle', title: 42 }),
    ];
    assert.deepEqual(researchReelItems(research(records), 'workspace1', now).map((item) => item.id), ['source1']);
});

test('research excerpts are bounded plain text and date ties have deterministic order', () => {
    const result = researchReelItems(research([
        record({ id: 'b', title: '  A  title\nwith whitespace  ', context: '' }),
        record({ id: 'a', title: 'Long '.repeat(100), context: '<script>source text</script> '.repeat(50) }),
    ]), 'workspace1', now);
    assert.equal(result[0].id, 'a');
    assert.ok(result[0].title.length <= 120 && result[0].title.endsWith('…'));
    assert.ok(result[0].description.length <= 170);
    assert.ok(result[0].description.startsWith('<script>'));
    assert.equal(result[1].title, 'A title with whitespace');
    assert.match(result[1].description, /original source/);
    assert.equal(researchReelItems(research(Array.from({ length: 20 }, (_, i) => record({ id: 'item' + i }))), 'workspace1', now).length, 12);
});

test('daily highlights select today only and retain recorded verification distinctions', () => {
    const data = {
        editions: source([
            { id: 'draft', status: 'draft', title: 'Not published', created: today },
            { id: 'later', status: 'published', title: 'Tomorrow', created: tomorrow },
            { id: 'published', status: 'published', title: 'Today’s edition', created: today },
        ]),
        evidence: source([
            { id: 'old', type: 'verified', title: 'Yesterday', created: yesterday },
            { id: 'new', type: 'observed', title: 'An observation', created: today },
        ]),
        signals: source([{ id: 'signal', title: 'A new signal', created: today }]),
    };
    const untouched = structuredClone(data);
    assert.deepEqual(dailyHighlights(data, now).map((item) => [item.title, item.kicker]), [
        ['Today’s edition', 'Published edition'], ['An observation', 'Evidence recorded'], ['A new signal', 'Signal recorded'],
    ]);
    data.evidence.records[1].type = 'verified';
    assert.equal(dailyHighlights(data, now)[1].kicker, 'Evidence marked verified');
    data.evidence.records[1].type = 'observed';
    assert.deepEqual(data, untouched);
});

test('old editions and missing or future record times do not turn into today’s highlights', () => {
    assert.deepEqual(dailyHighlights({
        editions: source([{ id: 'old', title: 'Yesterday', status: 'published', created: yesterday }]),
        evidence: source([{ id: 'bad', title: 'Missing date' }, { id: 'future', title: 'Tomorrow', created: tomorrow }]),
        signals: source([{ id: 'invalid', title: 'Invalid', created: 'invalid' }, { id: 'blank', title: ' ', created: today }]),
    }, now), []);
    assert.deepEqual(dailyHighlights({}, now), []);
});

test('partial reads never expose cached unavailable highlights or suppress the readable desks', () => {
    for (const flag of [{ loading: true }, { degraded: true }, { demo: true }, { error: 'offline' }]) {
        const result = dailyHighlights({
            editions: source([{ id: 'one', status: 'published', title: 'Hidden stale title', created: today }], flag),
            evidence: source([{ id: 'two', title: 'Hidden evidence', created: today }], flag),
            signals: source([{ id: 'three', title: 'Current signal', created: today }]),
        }, now);
        assert.deepEqual(result.map((item) => item.title), ['Current signal']);
    }
});

test('the newest eligible records lead and publication dates remain local-calendar dates', () => {
    const result = dailyHighlights({ signals: source([
        { id: 'earlier', title: 'Earlier', created: today },
        { id: 'recent', title: 'Recent', created: '2026-09-18T11:00:00' },
    ]) }, now);
    assert.equal(result[0].title, 'Recent');
    assert.equal(editorialDate('2020-05-22'), 'May 22, 2020');
    assert.equal(editorialDate(today), 'Sep 18, 2026');
    for (const value of [undefined, null, '', 'invalid', 0]) assert.equal(editorialDate(value), 'Date not recorded');
});

test('reels wrap by stable ID and recover if the selected story disappears', () => {
    assert.equal(advanceReel(cards, 'e'), 'a');
    assert.equal(advanceReel(cards, 'a', -1), 'e');
    assert.equal(advanceReel(cards, 'missing'), 'b');
    assert.equal(advanceReel([], 'a'), null);
    assert.equal(advanceReel([cards[0]], 'a'), 'a');
    assert.equal(reelWindow(cards, 'removed', 3).index, 0);
});

test('empty and short reels contain no buffer duplicates or automatic rotation', () => {
    for (const size of [0, 1, 2, 3]) {
        const items = cards.slice(0, size);
        const view = reelWindow(items, null, 3);
        assert.equal(view.rotating, false);
        assert.equal(view.visibleCount, size);
        assert.equal(view.rows.length, size);
        assert.ok(view.rows.every((row) => !row.hidden));
    }
});

test('every rotated window exposes exactly its visible cards and hides both transition buffers', () => {
    for (let size = 2; size < 15; size++) {
        const items = Array.from({ length: size }, (_, id) => ({ id: String(id) }));
        for (let count = 1; count <= 3; count++) {
            for (const item of items) {
                const view = reelWindow(items, item.id, count);
                const visible = view.rows.filter((row) => !row.hidden);
                assert.equal(visible.length, Math.min(size, count));
                assert.equal(new Set(visible.map((row) => row.item.id)).size, visible.length);
                assert.equal(visible[0].item.id, view.rotating ? item.id : items[0].id);
                if (view.rotating) {
                    assert.equal(view.rows[0].hidden, true);
                    assert.equal(view.rows.at(-1).hidden, true);
                    assert.equal(view.rows.length, count + 2);
                }
            }
        }
    }
});

test('invalid or excessive visible counts cannot create unbounded story windows', () => {
    for (const count of [NaN, Infinity, -10, 0, '3']) assert.equal(reelWindow(cards, null, count).visibleCount, 1);
    assert.equal(reelWindow(cards, null, 1000).visibleCount, 3);
    assert.equal(reelWindow(cards, null, 2.9).visibleCount, 2);
});

function fakeClock() {
    const timers = new Map();
    const cleared = [];
    let serial = 0;
    return {
        timers, cleared,
        setInterval(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
        clearInterval(id) { cleared.push(id); timers.delete(id); },
    };
}

test('left and right clocks advance independently and stopping one leaves the other intact', () => {
    const clock = fakeClock();
    let left = 0, right = 0;
    const stopLeft = scheduleReel(() => left++, 9000, clock);
    const stopRight = scheduleReel(() => right++, 11200, clock);
    const [a, b] = [...clock.timers.values()];
    assert.equal(a.delay, 9000); assert.equal(b.delay, 11200);
    a.fn(); assert.deepEqual([left, right], [1, 0]);
    stopLeft(); a.fn(); b.fn();
    assert.deepEqual([left, right], [1, 1]);
    assert.equal(clock.timers.size, 1);
    stopRight(); b.fn(); stopRight();
    assert.equal(clock.timers.size, 0);
    assert.deepEqual([left, right], [1, 1]);
});

test('reel timing has a slow minimum and bounded fallback rather than a hot loop', () => {
    for (const [requested, expected] of [[1, 6000], [-1, 6000], [NaN, 9000], [Infinity, 9000], [undefined, 9000], [90000, 60000]]) {
        const clock = fakeClock();
        const stop = scheduleReel(() => {}, requested, clock);
        assert.equal([...clock.timers.values()][0].delay, expected);
        stop();
    }
});
