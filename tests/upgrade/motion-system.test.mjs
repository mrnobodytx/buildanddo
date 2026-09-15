// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/motion-system.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/motion/preferences.js, apps/web/src/lib/motion/runtime.js, apps/web/src/lib/motion/catalog.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/lib/motion/preferences.js; DEPENDS_ON apps/web/src/lib/motion/runtime.js; DEPENDS_ON apps/web/src/lib/motion/catalog.js
// DAG Node:    none
// Intent:      Verify preference precedence, storage resilience, interruption and visibility cleanup before enabling motion.
// ───────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionStore, normalizeMotionPreferences, resolveMotion, readMotionEnvironment, MOTION_CATEGORIES, MOTION_STORAGE_KEY } from '../../apps/web/src/lib/motion/preferences.js';
import { animateElement, observeActivity, createFrameLoop, progressRatio, reorderItems, continuityFrames } from '../../apps/web/src/lib/motion/runtime.js';
import { MOTION_CATALOG, MOTION_PREVIEWS } from '../../apps/web/src/lib/motion/catalog.js';

function eventTarget() {
    const listeners = new Map();
    return {
        addEventListener(name, fn) { const group = listeners.get(name) || new Set(); group.add(fn); listeners.set(name, group); },
        removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
        emit(name, value) { listeners.get(name)?.forEach((fn) => fn(value)); },
        count(name) { return listeners.get(name)?.size || 0; },
    };
}
function browserFixture() {
    const values = new Map();
    return {
        ...eventTarget(), values,
        localStorage: { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
    };
}
const full = () => normalizeMotionPreferences({ version: 1, mode: 'full',
    categories: Object.fromEntries(Object.keys(MOTION_CATEGORIES).map((key) => [key, true])) });

test('motion defaults are editorial and optional costs are disabled', () => {
    const prefs = normalizeMotionPreferences(null);
    assert.equal(prefs.mode, 'system');
    assert.equal(prefs.categories.controls, true);
    for (const key of ['ambient', 'pointer', 'spatial']) assert.equal(prefs.categories[key], false);
    assert.equal(resolveMotion(prefs).duration.control, 160);
});

test('preference parser rejects old versions, invalid types and unknown keys', () => {
    for (const input of [undefined, null, [], 'full', { version: 2, mode: 'off' }]) {
        assert.deepEqual(normalizeMotionPreferences(input), normalizeMotionPreferences(null));
    }
    const prefs = normalizeMotionPreferences({ version: 1, mode: 'bad', paused: 'true', pace: -1,
        intensity: {}, categories: { controls: false, spatial: 'yes', unknown: true }, token: 'ignored' });
    assert.equal(prefs.mode, 'system');
    assert.equal(prefs.paused, false);
    assert.equal(prefs.categories.controls, false);
    assert.equal(prefs.categories.spatial, false);
    assert.equal('unknown' in prefs.categories, false);
    assert.equal('token' in prefs, false);
});

test('device reduction wins over every full-motion category and expressive choice', () => {
    const result = resolveMotion({ ...full(), intensity: 'expressive' }, { reduced: true });
    assert.equal(result.mode, 'reduced');
    assert.ok(Object.values(result.categories).every((value) => value === false));
    assert.ok(Object.values(result.duration).every((value) => value === 0));
    assert.equal(result.automatic, false);
});

test('off and reduced are immediate, while speed and distance remain bounded', () => {
    for (const mode of ['reduced', 'off']) {
        assert.ok(Object.values(resolveMotion({ ...full(), mode }).duration).every((n) => n === 0));
    }
    assert.equal(resolveMotion({ ...full(), mode: 'off' }, { reduced: true }).mode, 'off');
    const quick = resolveMotion({ ...full(), pace: 'quick', intensity: 'expressive' });
    const relaxed = resolveMotion({ ...full(), pace: 'relaxed' });
    assert.ok(quick.duration.panel < relaxed.duration.panel);
    assert.equal(quick.distance, 20);
    assert.equal(relaxed.distance, 8);
    assert.ok(relaxed.duration.reveal < 600);
});

test('hidden, paused and constrained devices suspend optional work without removing control feedback', () => {
    assert.equal(resolveMotion(full(), { hidden: true }).automatic, false);
    for (const environment of [{ coarse: true }, { saveData: true }]) {
        const result = resolveMotion(full(), environment);
        for (const key of ['ambient', 'pointer', 'spatial']) assert.equal(result.categories[key], false);
        assert.equal(result.categories.controls, true);
    }
    const paused = resolveMotion({ ...full(), paused: true });
    assert.equal(paused.automatic, false);
    assert.equal(paused.categories.learning, true);
    assert.equal(paused.categories.spatial, false);
});

test('browser environment reads have a server fallback and reflect live media flags', () => {
    assert.deepEqual(readMotionEnvironment(), { reduced: false, coarse: false, hidden: false, saveData: false });
    const result = readMotionEnvironment({ matchMedia: (query) => ({ matches: query.includes('reduce') }),
        document: { hidden: true }, navigator: { connection: { saveData: true } } });
    assert.equal(result.reduced, true);
    assert.equal(result.hidden, true);
    assert.equal(result.saveData, true);
});

test('storage updates merge only category patches and survive a reload', () => {
    const browser = browserFixture();
    const store = createMotionStore(browser);
    let notifications = 0;
    const stop = store.subscribe(() => notifications++);
    store.update({ pace: 'quick', categories: { data: false } });
    store.update({ categories: { media: false } });
    assert.equal(notifications, 2);
    assert.equal(store.getSnapshot().preferences.categories.data, false);
    assert.equal(store.getSnapshot().preferences.categories.controls, true);
    assert.equal(store.getSnapshot().persisted, true);
    assert.deepEqual(createMotionStore(browser).getSnapshot(), store.getSnapshot());
    assert.equal(JSON.parse(browser.values.get(MOTION_STORAGE_KEY)).pace, 'quick');
    stop();
    assert.equal(browser.count('storage'), 0);
});

test('an earlier disabled mission effect survives migration and the new preference becomes authoritative', () => {
    const browser = browserFixture();
    browser.values.set('buildanddo.mission-effects', 'off');
    const store = createMotionStore(browser);
    assert.equal(store.getSnapshot().preferences.categories.learning, false);
    assert.equal(store.getSnapshot().preferences.categories.controls, true);
    assert.equal(browser.values.has(MOTION_STORAGE_KEY), false);
    store.update({ categories: { learning: true } });
    assert.equal(createMotionStore(browser).getSnapshot().preferences.categories.learning, true);
    store.update({ categories: { learning: false } });
    browser.values.delete('buildanddo.mission-effects');
    assert.equal(createMotionStore(browser).getSnapshot().preferences.categories.learning, false);
});

test('storage failure keeps current choices in memory and reset restores defaults', () => {
    const browser = browserFixture();
    browser.localStorage.setItem = () => { throw new Error('storage denied'); };
    const store = createMotionStore(browser);
    store.update({ mode: 'off' });
    assert.equal(store.getSnapshot().preferences.mode, 'off');
    assert.equal(store.getSnapshot().persisted, false);
    store.reset();
    assert.deepEqual(store.getSnapshot().preferences, normalizeMotionPreferences(null));
    const unavailable = createMotionStore();
    unavailable.update({ mode: 'off' });
    assert.equal(unavailable.getSnapshot().persisted, false);
});

test('malformed stored data recovers and cross-tab removal resets subscribed views', () => {
    const browser = browserFixture();
    browser.values.set(MOTION_STORAGE_KEY, '{ broken');
    const store = createMotionStore(browser);
    assert.equal(store.getSnapshot().preferences.mode, 'system');
    let updates = 0;
    const stopA = store.subscribe(() => updates++);
    const stopB = store.subscribe(() => updates++);
    assert.equal(browser.count('storage'), 1);
    browser.values.set(MOTION_STORAGE_KEY, JSON.stringify({ ...full(), mode: 'off' }));
    browser.emit('storage', { key: 'unrelated' });
    assert.equal(updates, 0);
    browser.emit('storage', { key: MOTION_STORAGE_KEY });
    assert.equal(store.getSnapshot().preferences.mode, 'off');
    assert.equal(updates, 2);
    browser.values.delete(MOTION_STORAGE_KEY);
    browser.emit('storage', { key: null });
    assert.deepEqual(store.getSnapshot().preferences, normalizeMotionPreferences(null));
    stopA(); assert.equal(browser.count('storage'), 1);
    stopB(); assert.equal(browser.count('storage'), 0);
});

test('animation interruption cancels the previous effect and reduced mode starts none', () => {
    const animations = [];
    const element = { animate: (frames, options) => {
        const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; this.oncancel?.(); } };
        animations.push(animation); return animation;
    } };
    const first = animateElement(element, [{ opacity: 0.6 }, { opacity: 1 }], { duration: 200 });
    const second = animateElement(element, [{ opacity: 0.8 }, { opacity: 1 }], { duration: 100 });
    assert.equal(animations[0].cancelled, true);
    first();
    assert.equal(animations[1].cancelled, false);
    animateElement(element, [], { duration: 0 }, false);
    assert.equal(animations[1].cancelled, true);
    second();
    assert.equal(animations.length, 2);
    assert.equal(animations[0].options.fill, 'none');
});

test('finished and unsupported animations leave the content untouched', () => {
    assert.doesNotThrow(() => animateElement(null, [], { duration: 200 })());
    assert.doesNotThrow(() => animateElement({}, [], { duration: 200 })());
    assert.doesNotThrow(() => animateElement({ animate() { throw new Error('unsupported'); } }, [], { duration: 200 })());
    let cancelled = false;
    const animation = { cancel() { cancelled = true; } };
    const element = { animate: () => animation };
    animateElement(element, [], { duration: 200 });
    animation.onfinish();
    animateElement(element, [], { duration: 0 });
    assert.equal(cancelled, false);
});

test('activity observers suspend at document and viewport boundaries and remove listeners', () => {
    const doc = { ...eventTarget(), hidden: false };
    let observer;
    const browser = { document: doc, IntersectionObserver: class {
        constructor(callback) { this.callback = callback; observer = this; }
        observe(element) { this.element = element; }
        disconnect() { this.disconnected = true; }
    } };
    const states = [];
    const element = {};
    const stop = observeActivity(element, (value) => states.push(value), browser);
    assert.equal(observer.element, element);
    observer.callback([{ isIntersecting: true }]);
    doc.hidden = true; doc.emit('visibilitychange');
    doc.hidden = false; doc.emit('visibilitychange');
    observer.callback([{ isIntersecting: false }]);
    assert.deepEqual(states, [false, true, false, true, false]);
    stop();
    observer.callback([{ isIntersecting: true }]);
    assert.equal(states.length, 5);
    assert.equal(observer.disconnected, true);
    assert.equal(doc.count('visibilitychange'), 0);
});

test('missing observers fall back to visibility without hiding content', () => {
    const states = [];
    const doc = { ...eventTarget(), hidden: false };
    const stop = observeActivity({}, (value) => states.push(value), { document: doc });
    doc.hidden = true; doc.emit('visibilitychange');
    assert.deepEqual(states, [true, false]);
    stop();
    observeActivity({}, (value) => assert.equal(value, true), {})();
});

test('frame loop schedules one frame, stops immediately, resumes and cannot restart after disposal', () => {
    const queued = new Map();
    let nextId = 1;
    const browser = {
        requestAnimationFrame: (fn) => { const id = nextId++; queued.set(id, fn); return id; },
        cancelAnimationFrame: (id) => queued.delete(id),
    };
    const seen = [];
    const loop = createFrameLoop((time) => seen.push(time), browser);
    loop.setActive(true); loop.setActive(true);
    assert.equal(queued.size, 1);
    const [id, callback] = [...queued][0]; queued.delete(id); callback(20);
    assert.deepEqual(seen, [20]);
    assert.equal(queued.size, 1);
    loop.setActive(false); assert.equal(queued.size, 0);
    callback(30); assert.deepEqual(seen, [20]);
    loop.setActive(true); assert.equal(queued.size, 1);
    loop.dispose(); assert.equal(queued.size, 0);
    loop.setActive(true); assert.equal(queued.size, 0);
});

test('a finite frame effect can stop itself and tolerates an absent frame API', () => {
    let tick;
    const loop = createFrameLoop(() => loop.setActive(false), { requestAnimationFrame: (fn) => { tick = fn; return 1; }, cancelAnimationFrame() {} });
    loop.setActive(true); tick(0); loop.dispose();
    const absent = createFrameLoop(() => assert.fail('no frame API'), {});
    absent.setActive(true); absent.dispose();
});

test('measured progress and geometry remain finite and bounded', () => {
    assert.equal(progressRatio(2, 5), 0.4);
    for (const [value, total] of [[NaN, 2], [2, NaN], [1, 0], [1, -1], [Infinity, 5]]) assert.equal(progressRatio(value, total), 0);
    assert.equal(progressRatio(9, 5), 1);
    assert.equal(progressRatio(-3, 5), 0);
    const frames = continuityFrames({ left: 300, top: -800 }, { left: 0, top: 0 });
    assert.equal(frames[0].transform, 'translate(80px, -80px)');
    assert.equal(continuityFrames({ left: NaN }, {})[0].transform, 'translate(0px, 0px)');
    assert.deepEqual(continuityFrames(null, {}), [{ opacity: 1 }, { opacity: 1 }]);
});

test('reordering clamps bounds, preserves records and leaves invalid commands unchanged', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(reorderItems(items, 'a', 99).map((item) => item.id), ['b', 'c', 'a']);
    assert.equal(reorderItems(items, 'a', 2)[2], items[0]);
    assert.equal(reorderItems(items, 'missing', 1), items);
    assert.equal(reorderItems(items, 'a', -10), items);
    assert.equal(reorderItems(items, 'a', NaN), items);
    assert.equal(items[0].id, 'a');
});

test('all 50 requested areas map to actual categories and bounded preview collections', () => {
    assert.equal(MOTION_CATALOG.length, 50);
    assert.deepEqual(MOTION_CATALOG.map((entry) => entry.id), Array.from({ length: 50 }, (_, index) => index + 1));
    assert.equal(new Set(MOTION_CATALOG.map((entry) => entry.title)).size, 50);
    const previewIds = new Set(['system', ...MOTION_PREVIEWS.map((entry) => entry.id)]);
    for (const entry of MOTION_CATALOG) {
        assert.ok(MOTION_CATEGORIES[entry.category], entry.title);
        assert.ok(previewIds.has(entry.preview), entry.title);
        assert.ok(entry.usage.length > 40, entry.title);
    }
});
