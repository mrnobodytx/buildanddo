// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/classroom-recovery.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     apps/web/src/hooks/useOpenClasses.js, apps/web/src/hooks/useClassrooms.js, apps/web/src/lib/classrooms.js, apps/pocketbase/pb_hooks/classrooms.pb.js, tests/upgrade/classroom-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useOpenClasses.js; VALIDATES apps/web/src/hooks/useClassrooms.js; CONSUMES apps/web/src/lib/classrooms.js; VALIDATES apps/pocketbase/pb_hooks/classrooms.pb.js; CONSUMES tests/upgrade/classroom-fixture.mjs
// Intent:      Reproduce missing classes and stale session recovery through actual hook, client and route sources with explicit offline lifecycle and storage doubles.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createClassroomClient } from '../../apps/web/src/lib/classrooms.js';
import { classroomFixture } from './classroom-fixture.mjs';
import { plain, repoPath, source } from './admin-fixture.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

function fixture() {
    const routes = [];
    const backend = classroomFixture({ runtime: {
        routerAdd: (method, path, callback, ...guards) => routes.push({ method, path, callback, guards }),
        $apis: { requireAuth: (collection) => ({ auth: collection }), bodyLimit: (bytes) => ({ bytes }) },
    } });
    backend.load('classrooms.pb.js');
    const f = { backend, account: 'owner', workspace: 'ws1', epoch: 1, sessionValid: true, demo: false,
        workspaces: [{ id: 'ws1', name: 'Workshop' }], calls: [], headers: [] };
    f.pb = { authStore: { record: { id: f.account }, token: 'synthetic-session' }, send: async (...args) => f.send(...args) };
    f.route = (path, options) => {
        f.calls.push({ path, options: plain(options) });
        const parts = path.split('/');
        const pattern = '/api/buildanddo/workspaces/{workspace}/classrooms' + (parts[6] ? '/{id}' : '') + (parts[7] ? `/${parts[7]}` : '');
        const route = routes.find((entry) => entry.method === options.method && entry.path === pattern);
        assert.ok(route, `Registered classroom route: ${options.method} ${pattern}`);
        assert.equal(route.guards[0].auth, 'users');
        const event = backend.event(f.pb.authStore.record?.id || '', options.body || {}, { workspace: parts[4], id: parts[6], query: options.query });
        event.response = { header: () => ({ set: (key, value) => f.headers.push([key, value]) }) };
        event.json = (status, data) => { assert.equal(status, 200); return plain(data); };
        try { return route.callback(event); }
        catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
    };
    f.send = f.route;
    f.liveRoom = (title = 'Shared workshop') => {
        const room = backend.create({}, { title }); backend.command('room.start', { id: room.id }); return room.id;
    };
    return f;
}

// Hook scheduling is an explicit substitute, not a React/DOM or native backend
// acceptance claim. Imports alone are replaced; source positions stay intact.
function mount(t, f, name, initial = []) {
    const cells = [], effects = [], timers = new Map();
    let cursor = 0, timerId = 0, mounted = true, queued = false, args = initial, pending = [];
    const h = { value: null, timers };
    const schedule = () => {
        if (!mounted || queued) return;
        queued = true;
        queueMicrotask(() => { queued = false; if (mounted) h.render(); });
    };
    const hooks = {
        useState(initialValue) {
            const index = cursor++;
            cells[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
            return [cells[index].value, (next) => {
                const value = typeof next === 'function' ? next(cells[index].value) : next;
                if (!Object.is(value, cells[index].value)) { cells[index].value = value; schedule(); }
            }];
        },
        useRef(initialValue) { const index = cursor++; cells[index] ??= { current: initialValue }; return cells[index]; },
        useMemo(callback, dependencies) {
            const index = cursor++;
            if (!same(cells[index]?.dependencies, dependencies)) cells[index] = { value: callback(), dependencies };
            return cells[index].value;
        },
        useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
        useEffect(callback, dependencies) {
            const index = cursor++;
            if (!same(effects[index]?.dependencies, dependencies)) pending.push({ index, callback, dependencies });
        },
    };
    const path = `apps/web/src/hooks/${name}.js`;
    const code = source(path).replace(/^import\s[\s\S]*?;\s*$/gm, (value) => value.replace(/[^\n]/g, ' '))
        .replace(/^export /gm, '       ');
    const hook = vm.runInNewContext(`${code}\n${name};`, {
        ...hooks, createClassroomClient, pb: f.pb,
        useAuth: () => ({ user: { id: f.account }, isAuthed: Boolean(f.account), sessionEpoch: f.epoch,
            isSessionCurrent: (epoch) => f.sessionValid && f.epoch === epoch }),
        useWorkspace: () => ({ active: f.workspace ? { id: f.workspace } : null, workspaces: f.workspaces }),
        useDemoMode: () => ({ demo: f.demo }), observeMutation: (_name, _verb, operation) => operation(),
        setInterval: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
        clearInterval: (id) => timers.delete(id),
    }, { filename: repoPath(path) });
    h.render = (next = args) => {
        args = next; cursor = 0; pending = [];
        h.value = hook(...args);
        const changed = pending;
        for (const { index } of changed) effects[index]?.cleanup?.();
        for (const effect of changed) effects[effect.index] = { ...effect, cleanup: effect.callback() };
        return h.value;
    };
    h.fire = (delay) => [...timers.values()].filter((timer) => timer.delay === delay).map((timer) => timer.callback());
    h.replayEffects = () => {
        for (const effect of effects) effect?.cleanup?.();
        for (const effect of effects) if (effect) effect.cleanup = effect.callback();
    };
    h.unmount = () => { mounted = false; for (const effect of effects) effect?.cleanup?.(); };
    h.flush = async () => { await tick(); await tick(); return h.value; };
    t.after(h.unmount); h.render(); return h;
}

test('discovery finds an older live class behind twenty newer ended rooms', async (t) => {
    const f = fixture(), live = f.liveRoom();
    for (let i = 0; i < 21; i++) { const room = f.backend.create(); f.backend.command('room.end', { id: room.id }); }
    assert.equal(f.backend.list().items.some((room) => room.id === live), false);
    const h = mount(t, f, 'useOpenClasses'); await h.flush();
    assert.deepEqual(plain(h.value.items.map((entry) => entry.room.id)), [live]);
    assert.ok(f.calls.every((call) => ['live', 'scheduled'].includes(call.options.query.status)));
    assert.equal(h.value.unavailable.length, 0);
});

test('discovery follows every live and scheduled page and names a forbidden workspace', async (t) => {
    const f = fixture();
    for (let i = 0; i < 22; i++) { f.liveRoom(`Live ${i}`); f.backend.create({}, { title: `Scheduled ${i}` }); }
    f.workspaces.push({ id: 'ws2', name: 'Private workshop' });
    const h = mount(t, f, 'useOpenClasses'); await h.flush();
    assert.equal(h.value.items.length, 44);
    assert.equal(new Set(h.value.items.map((entry) => entry.room.id)).size, 44);
    assert.equal(h.value.items.slice(0, 22).every((entry) => entry.room.status === 'live'), true);
    assert.deepEqual(plain(h.value.unavailable), [{ id: 'ws2', name: 'Private workshop' }]);
});

test('a later page failure identifies incomplete discovery instead of showing a complete list', async (t) => {
    const f = fixture(); for (let i = 0; i < 21; i++) f.backend.create();
    f.send = (path, options) => { if (options.query?.page === 2) throw new Error('Offline page'); return f.route(path, options); };
    const h = mount(t, f, 'useOpenClasses'); await h.flush();
    assert.deepEqual(plain(h.value.unavailable), [{ id: 'ws1', name: 'Workshop' }]);
    assert.equal(h.value.items.length, 0);
});

test('discovery polls do not overlap an unfinished workspace read', async (t) => {
    const f = fixture(), held = deferred(); f.liveRoom();
    f.send = async (path, options) => { const result = f.route(path, options); await held.promise; return result; };
    const h = mount(t, f, 'useOpenClasses');
    const before = f.calls.length; h.fire(30000); await tick();
    assert.equal(f.calls.length, before);
    held.resolve(); await h.flush(); assert.equal(h.value.items.length, 1);
    h.unmount(); assert.equal(h.timers.size, 0);
});

test('returning to a workspace cannot revive its previous discovery response', async (t) => {
    const f = fixture(), room = f.liveRoom(), held = deferred();
    let first = true;
    f.send = async (path, options) => {
        const result = f.route(path, options);
        if (first) { first = false; await held.promise; }
        return result;
    };
    const h = mount(t, f, 'useOpenClasses');
    f.workspaces = [{ id: 'ws2', name: 'Private workshop' }]; h.render(); await h.flush();
    f.backend.data.classroom_rooms.find((row) => row.id === room).title = 'Current title';
    f.workspaces = [{ id: 'ws1', name: 'Workshop' }]; h.render(); await h.flush();
    held.resolve(); await h.flush();
    assert.equal(h.value.items[0].room.title, 'Current title');
});

test('a replacement native session hides room data and discards a late save for the same account', async (t) => {
    const f = fixture(), room = f.liveRoom(), held = deferred();
    const h = mount(t, f, 'useClassrooms', [room]); await h.flush();
    f.send = async (path, options) => { const result = f.route(path, options); if (options.method === 'POST') await held.promise; return result; };
    const saving = h.value.mutate('room.message', { id: room, body: 'Previous session' }, h.value.data.room.revision);
    await h.flush(); assert.equal(h.value.saving, true);
    f.epoch++; h.render();
    assert.equal(h.value.data === null, true); assert.equal(h.value.saving, false);
    await h.flush(); held.resolve();
    assert.equal((await saving).ok, false); await h.flush();
    assert.equal(h.value.saved, null); assert.equal(h.value.saving, false);
    assert.equal((await h.value.retry()).ok, false);
    assert.equal(f.backend.data.classroom_messages.length, 1);
});

test('leaving and returning to a room does not trap a new save behind an old request', async (t) => {
    const f = fixture(), room = f.liveRoom(), other = f.liveRoom('Another room'), held = deferred();
    const h = mount(t, f, 'useClassrooms', [room]); await h.flush();
    let first = true;
    f.send = async (path, options) => {
        const result = f.route(path, options);
        if (options.method === 'POST' && first) { first = false; await held.promise; }
        return result;
    };
    const old = h.value.mutate('room.message', { id: room, body: 'Earlier visit' }, h.value.data.room.revision);
    await h.flush(); h.render([other]); await h.flush(); h.render([room]); await h.flush();
    assert.equal(h.value.saving, false);
    const fresh = await h.value.mutate('room.message', { id: room, body: 'Current visit' }, h.value.data.room.revision);
    assert.equal(fresh.ok, true);
    held.resolve(); assert.equal((await old).ok, false); await h.flush();
    assert.equal(h.value.saved, fresh.result);
    assert.equal(f.backend.data.classroom_messages.length, 2);
});

test('session replacement fences old callbacks even before the next render', async (t) => {
    const f = fixture(), room = f.liveRoom(); const h = mount(t, f, 'useClassrooms', [room]); await h.flush();
    const before = f.calls.length, control = h.value;
    f.epoch++;
    const writing = control.mutate('room.message', { id: room, body: 'Must not send' }, control.data.room.revision);
    const record = control.readRecord(), refresh = control.refresh(); h.fire(20000);
    assert.equal(f.calls.length, before);
    assert.equal((await writing).ok, false); await record; await refresh; await h.flush();
    assert.ok(f.calls.slice(before).every((call) => call.options.method === 'GET'));
    assert.equal(f.backend.data.classroom_messages.length, 0);
});

test('native token refresh and list pagination preserve one uncertain save and its retry key', async (t) => {
    const f = fixture(), h = mount(t, f, 'useClassrooms'); await h.flush();
    let lost = true;
    f.send = (path, options) => {
        const result = f.route(path, options);
        if (options.method === 'POST' && lost) { lost = false; throw new Error('Reply lost after save'); }
        return result;
    };
    const result = await h.value.mutate('room.create', { title: 'Recover once', description: '', tutorial: f.backend.lessons[0].id, starts_at: '' }, 0);
    assert.equal(result.reason, 'uncertain'); await h.flush();
    f.pb.authStore.token = 'synthetic-refreshed-session'; h.render(['', 2, 'scheduled']); await h.flush();
    assert.equal(h.value.uncertain, true);
    const recovered = await h.value.retry(); await h.flush();
    assert.equal(recovered.ok, true); assert.equal(recovered.result.replayed, true);
    const writes = f.calls.filter((call) => call.options.method === 'POST');
    assert.equal(writes.length, 2); assert.equal(writes[0].options.body.request_key, writes[1].options.body.request_key);
    assert.equal(f.backend.data.classroom_rooms.length, 1);
});

test('actual detail route omits grading answers and still reaches the shared lesson', async (t) => {
    const f = fixture(), room = f.liveRoom(), h = mount(t, f, 'useClassrooms', [room]); await h.flush();
    assert.equal(h.value.connected, true); assert.equal(h.value.data.membership.active, true);
    assert.equal(h.value.data.lesson.lesson.check.answer, undefined);
    assert.ok(f.headers.length > 0); assert.ok(f.headers.every(([key, value]) => key === 'Cache-Control' && value === 'no-store'));
    h.replayEffects(); await h.flush(); assert.equal(h.value.connected, true);
    h.unmount(); assert.equal(h.timers.size, 0);
});

test('discovery follows has_more even when room permissions empty an intermediate page', async (t) => {
    const f = fixture(); for (let i = 0; i < 21; i++) f.backend.create();
    f.send = (path, options) => {
        const result = f.route(path, options);
        return options.query.status === 'scheduled' && options.query.page === 1 ? { ...result, items: [] } : result;
    };
    const h = mount(t, f, 'useOpenClasses'); await h.flush();
    assert.equal(h.value.items.length, 1); assert.equal(h.value.unavailable.length, 0);
    assert.ok(f.calls.some((call) => call.options.query.page === 2));
});

test('discovery bounds concurrent workspace requests while eventually reading every workspace', async (t) => {
    const f = fixture(), held = deferred(); let active = 0, peak = 0;
    for (let i = 0; i < 8; i++) {
        const workspace = { id: `workshop${i}`, name: `Workshop ${i}` };
        f.backend.seed('workspaces', { ...workspace, owner: f.account }); f.workspaces.push(workspace);
    }
    f.send = async (path, options) => {
        active++; peak = Math.max(peak, active);
        try { const result = f.route(path, options); await held.promise; return result; }
        finally { active--; }
    };
    const h = mount(t, f, 'useOpenClasses'); await tick();
    assert.ok(peak > 0 && peak <= 4); held.resolve(); await h.flush();
    assert.equal(h.value.loading, false); assert.equal(h.value.unavailable.length, 0);
    assert.equal(new Set(f.calls.map((call) => call.path)).size, f.workspaces.length);
});

test('unbounded pagination is reported as unavailable and stops issuing requests', async (t) => {
    const f = fixture();
    f.send = (path, options) => ({ ...f.route(path, options), has_more: true });
    const h = mount(t, f, 'useOpenClasses'); await h.flush();
    assert.equal(h.value.loading, false); assert.equal(h.value.items.length, 0);
    assert.deepEqual(plain(h.value.unavailable), [{ id: 'ws1', name: 'Workshop' }]);
    assert.ok(f.calls.length > 1 && f.calls.length <= 200);
});

test('discovery hides a replaced session immediately and rejects its late response', async (t) => {
    const f = fixture(), room = f.liveRoom(), held = deferred(); let first = true;
    f.send = async (path, options) => {
        const result = f.route(path, options);
        if (first) { first = false; await held.promise; }
        return result;
    };
    const h = mount(t, f, 'useOpenClasses');
    f.epoch++; f.backend.data.classroom_rooms.find((row) => row.id === room).title = 'New session';
    h.render(); assert.equal(h.value.items.length, 0); await h.flush();
    held.resolve(); await h.flush(); assert.equal(h.value.items[0].room.title, 'New session');
    f.sessionValid = false; h.render(); assert.equal(h.value.items.length, 0);
    const before = f.calls.length; h.fire(30000); await h.flush(); assert.equal(f.calls.length, before);
});

test('demo, signed-out and empty workspace views issue no classroom requests', async (t) => {
    for (const mode of ['demo', 'signed-out', 'no-workspace']) {
        const f = fixture();
        if (mode === 'demo') f.demo = true;
        if (mode === 'signed-out') { f.account = ''; f.pb.authStore.record = null; }
        if (mode === 'no-workspace') { f.workspace = ''; f.workspaces = []; }
        const discovery = mount(t, f, 'useOpenClasses'), room = mount(t, f, 'useClassrooms');
        await discovery.flush(); await room.flush();
        assert.equal(discovery.value.loading, false); assert.equal(discovery.value.items.length, 0);
        assert.equal(room.value.loading, false); assert.equal(room.value.connected, false); assert.ok(room.value.error);
        assert.equal((await room.value.mutate('room.start', { id: 'missing' }, 1)).ok, false);
        assert.equal(f.calls.length, 0);
    }
});

test('a manual refresh replaces an older read and quiet polling does not duplicate it', async (t) => {
    const f = fixture(), room = f.liveRoom(), held = deferred(); let first = true;
    f.send = async (path, options) => {
        const result = f.route(path, options);
        if (first) { first = false; await held.promise; }
        return result;
    };
    const h = mount(t, f, 'useClassrooms', [room]); h.fire(5000); assert.equal(f.calls.length, 1);
    f.backend.data.classroom_rooms.find((row) => row.id === room).title = 'Fresh read';
    await h.value.refresh(); await h.flush(); assert.equal(h.value.data.room.title, 'Fresh read');
    held.resolve(); await h.flush(); assert.equal(h.value.data.room.title, 'Fresh read');
});

test('transport failure keeps a disabled last view; malformed and forbidden reads hide it', async (t) => {
    const f = fixture(), room = f.liveRoom(), h = mount(t, f, 'useClassrooms', [room]); await h.flush();
    f.send = () => { throw new Error('Connection interrupted'); };
    assert.equal(await h.value.refresh(), false); await h.flush();
    assert.equal(h.value.data.room.id, room); assert.equal(h.value.connected, false);
    assert.ok(![...h.timers.values()].some((timer) => timer.delay === 20000));
    for (const send of [() => ({ malformed: true }), () => { throw { status: 403 }; }]) {
        f.send = f.route; await h.value.refresh(); await h.flush();
        f.send = send; await h.value.refresh(); await h.flush(); assert.equal(h.value.data, null);
    }
    f.send = f.route; await h.value.refresh(); await h.flush(); assert.equal(h.value.connected, true);
});

test('duplicate saves are refused while current attendance renews and expiry stops heartbeats', async (t) => {
    const f = fixture(), room = f.liveRoom(), held = deferred(), h = mount(t, f, 'useClassrooms', [room]); await h.flush();
    f.send = async (path, options) => {
        const result = f.route(path, options);
        if (options.body?.action === 'room.message') await held.promise;
        return result;
    };
    const save = h.value.mutate('room.message', { id: room, body: 'Only once' }, h.value.data.room.revision);
    assert.equal((await h.value.mutate('room.message', { id: room, body: 'Duplicate click' }, h.value.data.room.revision)).ok, false);
    await Promise.all(h.fire(20000)); await h.flush();
    assert.ok(f.calls.some((call) => call.path.endsWith('/presence')));
    held.resolve(); assert.equal((await save).ok, true); await h.flush();
    assert.equal(f.backend.data.classroom_messages.length, 1);
    f.backend.command('room.leave', { id: room, membership_revision: h.value.data.membership.revision });
    await Promise.all(h.fire(20000)); await h.flush();
    assert.equal(h.value.data.membership.active, false);
    assert.ok(![...h.timers.values()].some((timer) => timer.delay === 20000));
});

test('old room controls and unmounted callbacks cannot send after returning to the same room', async (t) => {
    const f = fixture(), room = f.liveRoom(), other = f.liveRoom('Other room');
    const h = mount(t, f, 'useClassrooms', [room]); await h.flush(); const old = h.value;
    h.render([other]); await h.flush(); h.render([room]); await h.flush();
    let before = f.calls.length;
    await old.refresh(); await old.readRecord(); await old.retry();
    assert.equal(f.calls.length, before); assert.equal(h.value.connected, true);
    const active = h.value, callbacks = [...h.timers.values()]; h.unmount(); before = f.calls.length;
    await active.refresh(); await active.readRecord(); await active.retry();
    await Promise.all(callbacks.map((timer) => timer.callback())); assert.equal(f.calls.length, before);
});

test('a save cannot report success to an old room while its follow-up refresh is delayed', async (t) => {
    const f = fixture(), room = f.liveRoom(), other = f.liveRoom('Other room'), held = deferred();
    const h = mount(t, f, 'useClassrooms', [room]); await h.flush();
    f.send = async (path, options) => {
        const result = f.route(path, options);
        if (options.method === 'GET' && path.endsWith(room)) await held.promise;
        return result;
    };
    const saving = h.value.mutate('room.message', { id: room, body: 'Saved before navigation' }, h.value.data.room.revision);
    await h.flush(); h.render([other]); await h.flush();
    held.resolve(); assert.equal((await saving).ok, false);
    assert.equal(h.value.data.room.id, other); assert.equal(h.value.saved, null);
});
